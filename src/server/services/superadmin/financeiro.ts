import { randomUUID } from "node:crypto";
import { PlanoAssinatura, TenantBillingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import {
  AdminFinanceiroActionSchema,
  AdminPagarComissaoSchema,
  AdminUpsertAffiliateSchema,
  AdminUpsertCouponSchema,
  AdminVincularAffiliateSchema,
  type AdminFinanceiroActionInput,
  type AdminUpsertAffiliateInput,
  type AdminUpsertCouponInput,
} from "@/server/schemas/superadmin.schema";
import { PLAN_LIMITS } from "@/server/schemas/tenant.schema";
import { inMemoryTenants } from "@/server/services/tenant.service";
import {
  DIA_MS,
  VALOR_PLANO,
  aplicarPatchTenant,
  carregarRawTenant,
  datasPorStatus,
  dbTry,
  getPrismaErrorCode,
  memAffiliates,
  memCommissions,
  memCoupons,
  memTenantExtras,
  registrarAuditoriaAdm,
  statusEfetivo,
  tenantIdsDoUsuario,
  typedError,
  type MemAffiliate,
  type MemAffiliateCommission,
  type MemCoupon,
  type RawTenant,
  type TenantPatchPayload,
} from "./shared";

/* =========================================================================
   Cupons Promocionais (Consumo Atômico & Gestão)
========================================================================= */

export function consumirCupomMemoriaSuperAdmin(codigo: string): boolean {
  const cod = codigo.trim().toUpperCase();
  const mem = memCoupons.get(cod);
  if (!mem || !mem.ativo) return false;
  const agora = Date.now();
  if (mem.expiraEm && new Date(mem.expiraEm).getTime() < agora) return false;
  if (
    mem.maxUsos !== null &&
    mem.maxUsos !== undefined &&
    mem.usosAtuais >= mem.maxUsos
  ) {
    return false;
  }
  memCoupons.set(cod, { ...mem, usosAtuais: mem.usosAtuais + 1 });
  return true;
}

export async function listarCuponsSuperAdmin(): Promise<MemCoupon[]> {
  const out = new Map<string, MemCoupon>();
  const rows = await dbTry(() =>
    prisma.coupon.findMany({ orderBy: { criadoEm: "desc" } }),
  );
  if (Array.isArray(rows)) for (const r of rows) out.set(r.codigo, r);
  for (const [k, v] of memCoupons) if (!out.has(k)) out.set(k, v);
  return Array.from(out.values());
}

export async function salvarCupomSuperAdmin(rawInput: AdminUpsertCouponInput) {
  const input = AdminUpsertCouponSchema.parse(rawInput);
  const dados = {
    codigo: input.codigo,
    descricao: input.descricao ?? null,
    descontoPercentual: input.descontoPercentual,
    diasExtrasTrial: input.diasExtrasTrial,
    affiliateId: input.affiliateId ?? null,
    maxUsos: input.maxUsos ?? null,
    ativo: input.ativo,
    expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
  };

  const salvoDb = await dbTry(() =>
    prisma.coupon.upsert({
      where: { codigo: input.codigo },
      update: dados,
      create: dados,
    }),
  );
  let cupom: MemCoupon;
  if (salvoDb) {
    cupom = salvoDb;
  } else {
    const anterior = memCoupons.get(input.codigo);
    cupom = {
      id: anterior?.id || input.id || `cpn_${randomUUID()}`,
      usosAtuais: anterior?.usosAtuais || 0,
      criadoEm: anterior?.criadoEm || new Date(),
      ...dados,
    };
    memCoupons.set(input.codigo, cupom);
  }
  await registrarAuditoriaAdm("SALVAR_CUPOM", "COUPON", cupom.id, {
    codigo: input.codigo,
  });
  return { ok: true, cupom };
}

/* =========================================================================
   Afiliados & Comissões
========================================================================= */

async function carregarAfiliado(id: string): Promise<MemAffiliate | null> {
  const db1 = await dbTry(() =>
    prisma.affiliate.findUnique({ where: { id } }),
  );
  return db1 || memAffiliates.get(id) || null;
}

export async function salvarAfiliadoSuperAdmin(rawInput: AdminUpsertAffiliateInput) {
  const input = AdminUpsertAffiliateSchema.parse(rawInput);
  const dados = {
    nome: input.nome,
    documento: input.documento ?? null,
    email: input.email.trim().toLowerCase(),
    telefone: input.telefone ?? null,
    chavePix: input.chavePix ?? null,
    codigo: input.codigo,
    percentualComissao: input.percentualComissao,
    tipoComissao: input.tipoComissao,
    descontoIndicadosPct: input.descontoIndicadosPct,
    diasExtrasTrial: input.diasExtrasTrial,
    ativo: input.ativo,
    observacoes: input.observacoes ?? null,
  };

  let afiliado: MemAffiliate | undefined;
  try {
    afiliado = input.id
      ? await prisma.affiliate.update({ where: { id: input.id }, data: dados })
      : await prisma.affiliate.create({ data: dados });
  } catch (err: unknown) {
    if (getPrismaErrorCode(err) === "P2002") {
      throw typedError("Este código de indicação já está em uso.", 400);
    }
    afiliado = undefined;
  }

  if (!afiliado) {
    const duplicado = Array.from(memAffiliates.values()).find(
      (a) => a.codigo === input.codigo && a.id !== input.id,
    );
    if (duplicado) throw typedError("Este código de indicação já está em uso.", 400);
    const id = input.id || `aff_${randomUUID()}`;
    afiliado = {
      id,
      criadoEm: memAffiliates.get(id)?.criadoEm || new Date(),
      atualizadoEm: new Date(),
      ...dados,
    };
    memAffiliates.set(id, afiliado);
  }

  await registrarAuditoriaAdm("SALVAR_AFILIADO", "AFFILIATE", afiliado.id, {
    codigo: dados.codigo,
    percentualComissao: dados.percentualComissao,
  });
  return { ok: true, afiliado };
}

export async function vincularClienteAfiliadoSuperAdmin(rawInput: {
  tenantId: string;
  affiliateId: string | null;
}) {
  const input = AdminVincularAffiliateSchema.parse(rawInput);
  if (input.affiliateId) {
    const af = await carregarAfiliado(input.affiliateId);
    if (!af) throw typedError("Afiliado não encontrado.", 404);
  }
  await aplicarPatchTenant(input.tenantId, { affiliateId: input.affiliateId });
  await registrarAuditoriaAdm(
    "VINCULAR_AFILIADO",
    "TENANT",
    input.tenantId,
    { affiliateId: input.affiliateId },
    input.tenantId,
  );
  return { ok: true, tenantId: input.tenantId, affiliateId: input.affiliateId };
}

export async function listarAfiliadosSuperAdmin() {
  const afs = new Map<string, MemAffiliate>();
  const rows = await dbTry(() =>
    prisma.affiliate.findMany({ orderBy: { criadoEm: "desc" } }),
  );
  if (Array.isArray(rows)) for (const r of rows) afs.set(r.id, r);
  for (const [id, a] of memAffiliates) if (!afs.has(id)) afs.set(id, a);

  const comMap = new Map<string, MemAffiliateCommission>();
  const comRows = await dbTry(() =>
    prisma.affiliateCommission.findMany({ orderBy: { criadoEm: "desc" }, take: 500 }),
  );
  if (Array.isArray(comRows)) for (const r of comRows) comMap.set(r.id, r);
  for (const [id, c] of memCommissions) if (!comMap.has(id)) comMap.set(id, c);
  const comissoes = Array.from(comMap.values());

  // Indicados por afiliado
  const indicados = new Map<string, Array<{ id: string; nome: string }>>();
  const pushInd = (affId: string, id: string, nome: string) => {
    const arr = indicados.get(affId) || [];
    if (!arr.some((x) => x.id === id)) arr.push({ id, nome });
    indicados.set(affId, arr);
  };
  const tRows = await dbTry(() =>
    prisma.tenant.findMany({
      where: { affiliateId: { not: null } },
      select: { id: true, razaoSocial: true, affiliateId: true },
    }),
  );
  if (Array.isArray(tRows)) {
    for (const t of tRows) {
      if (t.affiliateId) pushInd(t.affiliateId, t.id, t.razaoSocial);
    }
  }
  for (const t of inMemoryTenants.values()) {
    const aff = memTenantExtras.get(t.id)?.affiliateId ?? t.affiliateId ?? null;
    if (aff) pushInd(aff, t.id, t.razaoSocial);
  }

  const afiliados = Array.from(afs.values()).map((a) => {
    const minhas = comissoes.filter((c) => c.affiliateId === a.id);
    return {
      ...a,
      linkIndicacao: `/cadastro?ref=${a.codigo}`,
      totalIndicados: indicados.get(a.id)?.length || 0,
      indicados: indicados.get(a.id) || [],
      comissaoPendenteBrl: minhas
        .filter((c) => c.status === "PENDENTE")
        .reduce((s, c) => s + c.valorComissao, 0),
      comissaoPagaBrl: minhas
        .filter((c) => c.status === "PAGO")
        .reduce((s, c) => s + c.valorComissao, 0),
    };
  });

  return { afiliados, comissoes };
}

async function gerarComissaoAfiliado(raw: RawTenant): Promise<void> {
  if (!raw.affiliateId) return;
  const af = await carregarAfiliado(raw.affiliateId);
  if (!af || !af.ativo) return;
  const competencia = new Date()
    .toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    })
    .slice(0, 7);

  const existentes = (await listarAfiliadosSuperAdmin()).comissoes.filter(
    (c) => c.affiliateId === af.id && c.tenantId === raw.id,
  );
  if (existentes.some((c) => c.competenciaMes === competencia)) return;
  if (af.tipoComissao === "PRIMEIRA_MENSALIDADE" && existentes.length > 0) return;

  const valorBase = VALOR_PLANO[raw.plano] ?? ASAAS_PLAN_PRICES_BRL.PRO;
  const valorComissao = Math.round(valorBase * (af.percentualComissao / 100) * 100) / 100;
  const dados = {
    affiliateId: af.id,
    tenantId: raw.id,
    tenantNome: raw.nomeFantasia || raw.razaoSocial,
    competenciaMes: competencia,
    valorBasePlano: valorBase,
    percentualAplicado: af.percentualComissao,
    valorComissao,
    status: "PENDENTE",
  };
  const criada = await dbTry(() => prisma.affiliateCommission.create({ data: dados }));
  if (!criada) {
    const id = `com_${randomUUID()}`;
    memCommissions.set(id, {
      id,
      ...dados,
      pagoEm: null,
      comprovanteObs: null,
      criadoEm: new Date(),
    });
  }
}

export async function atualizarStatusComissaoAfiliadoSuperAdmin(rawInput: {
  commissionId: string;
  status?: "PAGO" | "PENDENTE" | "CANCELADO";
  comprovanteObs?: string;
}) {
  const input = AdminPagarComissaoSchema.parse(rawInput);
  const pagoEm = input.status === "PAGO" ? new Date() : null;
  const dados = {
    status: input.status,
    pagoEm,
    comprovanteObs: input.comprovanteObs ?? null,
  };

  let comissao = await dbTry(() =>
    prisma.affiliateCommission.update({
      where: { id: input.commissionId },
      data: dados,
    }),
  );
  const mem = memCommissions.get(input.commissionId);
  if (mem) {
    comissao = { ...mem, ...dados };
    memCommissions.set(input.commissionId, comissao);
  }
  if (!comissao) throw typedError("Comissão não encontrada.", 404);

  await registrarAuditoriaAdm(
    `COMISSAO_AFILIADO_${input.status}`,
    "AFFILIATE_COMMISSION",
    input.commissionId,
    { ...dados },
  );
  return { ok: true, comissao };
}

/* =========================================================================
   Ações Financeiras em Clientes
========================================================================= */

export async function executarAcaoFinanceiraSuperAdmin(
  rawInput: AdminFinanceiroActionInput,
) {
  const input = AdminFinanceiroActionSchema.parse(rawInput);
  const atual = await carregarRawTenant(input.tenantId);
  if (!atual) throw typedError("Cliente (Tenant) não encontrado.", 404);

  const titular = atual.raw.users.find((u) => u.role === "TITULAR" && u.ativo !== false);
  const siblingIdSet = new Set<string>([input.tenantId]);
  if (titular?.userId) {
    const ownerTids = await tenantIdsDoUsuario(titular.userId, true);
    for (const tid of ownerTids) siblingIdSet.add(tid);
  }
  const siblings: Array<{ raw: RawTenant; origem: "db" | "mem" }> = [];
  for (const tid of siblingIdSet) {
    const loaded = await carregarRawTenant(tid);
    if (loaded) siblings.push(loaded);
  }
  siblings.sort((a, b) => {
    const diff = new Date(a.raw.criadoEm).getTime() - new Date(b.raw.criadoEm).getTime();
    return diff !== 0 ? diff : a.raw.id.localeCompare(b.raw.id);
  });
  const primaryRaw = siblings[0]?.raw ?? atual.raw;

  const statusAnterior = statusEfetivo(atual.raw).status;
  const antes = {
    plano: atual.raw.plano,
    billingStatus: statusAnterior,
  };
  const agora = Date.now();
  let patch: TenantPatchPayload = {};
  let planLimitsPatch: { maxCnpjs: number; maxUsers: number } | null = null;

  switch (input.action) {
    case "ALTERAR_PLANO": {
      if (!input.plano) throw typedError("Informe o novo plano.", 400);
      const lim = PLAN_LIMITS[input.plano];
      planLimitsPatch = { maxCnpjs: lim.maxCnpjs, maxUsers: lim.maxUsers };
      patch = {
        plano: input.plano as PlanoAssinatura,
        maxCnpjs: Math.max(atual.raw.maxCnpjs, lim.maxCnpjs),
        maxUsers: Math.max(atual.raw.maxUsers, lim.maxUsers),
      };
      break;
    }
    case "ALTERAR_STATUS": {
      if (!input.billingStatus) throw typedError("Informe o novo status financeiro.", 400);
      const datas = datasPorStatus(input.billingStatus);
      patch = {
        billingStatus: input.billingStatus as TenantBillingStatus,
        trialFim: datas.trialFim,
        vencimentoAssinatura: datas.vencimentoAssinatura,
        ...(datas.ultimoPagamentoEm !== undefined
          ? { ultimoPagamentoEm: datas.ultimoPagamentoEm }
          : {}),
      };
      break;
    }
    case "DAR_BAIXA_MANUAL": {
      const venc = input.novoVencimento ? new Date(input.novoVencimento) : null;
      patch = {
        billingStatus: "ATIVO",
        trialFim: null,
        vencimentoAssinatura:
          venc && !Number.isNaN(venc.getTime()) ? venc : new Date(agora + 30 * DIA_MS),
        ultimoPagamentoEm: new Date(agora),
      };
      break;
    }
    case "PRORROGAR_TRIAL": {
      const dias = input.diasExtrasTrial ?? 7;
      const base = Math.max(
        agora,
        atual.raw.trialFim ? new Date(atual.raw.trialFim).getTime() : 0,
      );
      patch = { billingStatus: "TRIAL", trialFim: new Date(base + dias * DIA_MS) };
      break;
    }
    case "APLICAR_CUPOM": {
      const codigo = (input.cupomCodigo || "").trim().toUpperCase();
      if (!codigo) throw typedError("Informe o código do cupom.", 400);
      const cupom = (await listarCuponsSuperAdmin()).find((c) => c.codigo === codigo);
      if (!cupom || !cupom.ativo) throw typedError("Cupom inválido ou inativo.", 400);
      if (cupom.expiraEm && new Date(cupom.expiraEm).getTime() < agora) {
        throw typedError("Este cupom está expirado.", 400);
      }
      if (
        cupom.maxUsos !== null &&
        cupom.maxUsos !== undefined &&
        cupom.usosAtuais >= cupom.maxUsos
      ) {
        throw typedError("Este cupom atingiu o limite máximo de utilizações.", 400);
      }

      const memExiste = memCoupons.has(codigo);
      if (memExiste) {
        if (!consumirCupomMemoriaSuperAdmin(codigo)) {
          throw typedError("Cupom inválido, expirado ou esgotado.", 400);
        }
      } else {
        const resUpdate = await dbTry(() =>
          prisma.coupon.updateMany({
            where: {
              codigo,
              ativo: true,
              OR: [{ expiraEm: null }, { expiraEm: { gte: new Date(agora) } }],
              ...(cupom.maxUsos !== null && cupom.maxUsos !== undefined
                ? { usosAtuais: { lt: cupom.maxUsos } }
                : {}),
            },
            data: { usosAtuais: { increment: 1 } },
          }),
        );
        if (!resUpdate || resUpdate.count === 0) {
          throw typedError("Cupom inválido, expirado ou esgotado.", 400);
        }
      }

      patch = { cupomCodigo: codigo };
      // Preserva clientes já pagantes (`ATIVO`): só concede/prorroga trial se ainda não estiver `ATIVO`
      if (cupom.diasExtrasTrial > 0 && statusAnterior !== "ATIVO") {
        const base = Math.max(
          agora,
          atual.raw.trialFim ? new Date(atual.raw.trialFim).getTime() : 0,
        );
        patch.trialFim = new Date(base + cupom.diasExtrasTrial * DIA_MS);
        patch.billingStatus = "TRIAL";
      }
      break;
    }
  }

  let updatedPrimaryOrTarget: RawTenant | null = null;
  const updatedSiblings: RawTenant[] = [];
  for (const sib of siblings) {
    const siblingPatch: TenantPatchPayload = planLimitsPatch
      ? {
          ...patch,
          maxCnpjs: Math.max(sib.raw.maxCnpjs, planLimitsPatch.maxCnpjs),
          maxUsers: Math.max(sib.raw.maxUsers, planLimitsPatch.maxUsers),
        }
      : patch;
    const patched = await aplicarPatchTenant(sib.raw.id, siblingPatch);
    updatedSiblings.push(patched.raw);
    if (sib.raw.id === input.tenantId) {
      updatedPrimaryOrTarget = patched.raw;
    }
  }
  const raw = updatedPrimaryOrTarget ?? updatedSiblings[0] ?? atual.raw;

  if (input.action === "DAR_BAIXA_MANUAL") {
    const rawComAfiliado =
      updatedSiblings.find((s) => s.affiliateId) ??
      (primaryRaw.affiliateId ? { ...raw, affiliateId: primaryRaw.affiliateId } : null);
    if (rawComAfiliado) {
      await gerarComissaoAfiliado(rawComAfiliado).catch(() => undefined);
    }
  }

  const calc = statusEfetivo(raw);
  await registrarAuditoriaAdm(
    `FINANCEIRO_${input.action}`,
    "TENANT",
    input.tenantId,
    {
      ...patch,
      observacao: input.observacao,
      tenantsSincronizados: updatedSiblings.map((s) => s.id),
    },
    input.tenantId,
    antes,
  );

  return {
    ok: true,
    tenant: {
      id: raw.id,
      razaoSocial: raw.razaoSocial,
      plano: raw.plano,
      billingStatus: calc.status,
      trialFim: raw.trialFim ?? null,
      vencimentoAssinatura: raw.vencimentoAssinatura ?? null,
      cupomCodigo: raw.cupomCodigo ?? null,
    },
  };
}
