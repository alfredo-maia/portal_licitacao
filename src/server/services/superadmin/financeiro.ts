import { randomUUID } from "node:crypto";
import { PlanoAssinatura, TenantBillingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditActorContext } from "@/server/audit";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import {
  AdminFinanceiroActionSchema,
  AdminPagarComissaoSchema,
  AdminRegistrarPagamentoAfiliadoSchema,
  AdminUpsertAffiliateSchema,
  AdminUpsertCouponSchema,
  AdminVincularAffiliateSchema,
  TenantInvoiceRecordSchema,
  type AdminFinanceiroActionInput,
  type AdminRegistrarPagamentoAfiliadoInput,
  type AdminUpsertAffiliateInput,
  type AdminUpsertCouponInput,
  type TenantInvoiceRecord,
} from "@/server/schemas/superadmin.schema";
import { PLAN_LIMITS } from "@/server/schemas/tenant.schema";
import { inMemoryTenants } from "@/server/services/tenant.service";
import { criarNotificacaoAdmin } from "./notificacoes";
import {
  DIA_MS,
  VALOR_PLANO,
  aplicarPatchTenant,
  carregarRawTenant,
  datasPorStatus,
  dbTry,
  getPrismaErrorCode,
  gravarSetting,
  lerSetting,
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

export interface IndicadoRelatorioItem {
  id: string;
  nome: string;
  cnpj?: string;
  plano?: string;
  billingStatus?: string;
  valorBasePlano?: number;
  valorComissao?: number;
  criadoEm?: string;
}

export interface ComissaoDetalheExtra {
  commissionId: string;
  affiliateId: string;
  competenciaMes: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  quantidadeIndicados: number;
  clientesRelatorio: IndicadoRelatorioItem[];
  comprovanteDataUrl?: string | null;
  comprovanteNome?: string | null;
  comprovanteMimeType?: string | null;
}

const ADMIN_COMISSOES_DETALHES_KEY = "admin_afiliados_comissoes_detalhes";
const memComissoesDetalhes = new Map<string, ComissaoDetalheExtra>();

async function carregarComissoesDetalhesMap(): Promise<Map<string, ComissaoDetalheExtra>> {
  const out = new Map<string, ComissaoDetalheExtra>();
  const persistidos = await lerSetting<ComissaoDetalheExtra[]>(ADMIN_COMISSOES_DETALHES_KEY, []);
  if (Array.isArray(persistidos)) {
    for (const item of persistidos) {
      if (item && typeof item.commissionId === "string") {
        out.set(item.commissionId, item);
      }
    }
  }
  for (const [k, v] of memComissoesDetalhes) {
    out.set(k, v);
  }
  return out;
}

async function salvarComissaoDetalheExtra(detalhe: ComissaoDetalheExtra): Promise<void> {
  memComissoesDetalhes.set(detalhe.commissionId, detalhe);
  const mapa = await carregarComissoesDetalhesMap();
  mapa.set(detalhe.commissionId, detalhe);
  await gravarSetting(ADMIN_COMISSOES_DETALHES_KEY, Array.from(mapa.values()).slice(0, 300));
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
    prisma.affiliateCommission.findMany({ orderBy: { criadoEm: "desc" }, take: 100 }),
  );
  if (Array.isArray(comRows)) for (const r of comRows) comMap.set(r.id, r);
  for (const [id, c] of memCommissions) if (!comMap.has(id)) comMap.set(id, c);
  const comissoesRaw = Array.from(comMap.values());

  // Indicados por afiliado com metadados financeiros
  const indicados = new Map<string, IndicadoRelatorioItem[]>();
  const pushInd = (
    affId: string,
    info: {
      id: string;
      nome: string;
      cnpj?: string;
      plano?: string;
      billingStatus?: string;
      criadoEm?: Date | string;
    },
  ) => {
    const af = afs.get(affId);
    const pct = af?.percentualComissao ?? 20;
    const planoKey = (info.plano || "PRO") as PlanoAssinatura;
    const valorBase = VALOR_PLANO[planoKey] ?? ASAAS_PLAN_PRICES_BRL.PRO;
    const valorComissao = Math.round(valorBase * (pct / 100) * 100) / 100;
    const arr = indicados.get(affId) || [];
    if (!arr.some((x) => x.id === info.id)) {
      arr.push({
        id: info.id,
        nome: info.nome,
        cnpj: info.cnpj,
        plano: info.plano || "PRO",
        billingStatus: info.billingStatus || "ATIVO",
        valorBasePlano: valorBase,
        valorComissao,
        criadoEm: info.criadoEm ? new Date(info.criadoEm).toISOString() : new Date().toISOString(),
      });
    }
    indicados.set(affId, arr);
  };
  const tRows = await dbTry(() =>
    prisma.tenant.findMany({
      where: { affiliateId: { not: null } },
      select: {
        id: true,
        razaoSocial: true,
        nomeFantasia: true,
        cnpj: true,
        plano: true,
        billingStatus: true,
        criadoEm: true,
        affiliateId: true,
      },
    }),
  );
  if (Array.isArray(tRows)) {
    for (const t of tRows) {
      if (t.affiliateId) {
        pushInd(t.affiliateId, {
          id: t.id,
          nome: t.nomeFantasia || t.razaoSocial,
          cnpj: t.cnpj,
          plano: t.plano,
          billingStatus: t.billingStatus,
          criadoEm: t.criadoEm,
        });
      }
    }
  }
  for (const t of inMemoryTenants.values()) {
    const ext = memTenantExtras.get(t.id);
    const aff = ext?.affiliateId ?? t.affiliateId ?? null;
    if (aff) {
      pushInd(aff, {
        id: t.id,
        nome: t.nomeFantasia || t.razaoSocial,
        cnpj: t.cnpj,
        plano: t.plano,
        billingStatus: t.billingStatus,
        criadoEm: t.criadoEm,
      });
    }
  }

  const detalhesMap = await carregarComissoesDetalhesMap();

  const comissoes = comissoesRaw.map((c) => {
    const det = detalhesMap.get(c.id);
    const indAfiliado = indicados.get(c.affiliateId) || [];
    const clientesRelatorio: IndicadoRelatorioItem[] =
      det?.clientesRelatorio && det.clientesRelatorio.length > 0
        ? det.clientesRelatorio
        : c.tenantId
          ? indAfiliado.filter((i) => i.id === c.tenantId).length > 0
            ? indAfiliado.filter((i) => i.id === c.tenantId)
            : [
                {
                  id: c.tenantId,
                  nome: c.tenantNome || c.tenantId,
                  valorBasePlano: c.valorBasePlano,
                  valorComissao: c.valorComissao,
                },
              ]
          : indAfiliado;
    const quantidadeIndicados =
      det?.quantidadeIndicados ?? (clientesRelatorio.length > 0 ? clientesRelatorio.length : 1);

    return {
      ...c,
      quantidadeIndicados,
      clientesRelatorio,
      dataInicio: det?.dataInicio ?? null,
      dataFim: det?.dataFim ?? null,
      comprovanteDataUrl: det?.comprovanteDataUrl ?? null,
      comprovanteNome: det?.comprovanteNome ?? null,
      comprovanteMimeType: det?.comprovanteMimeType ?? null,
    };
  });

  const afiliados = Array.from(afs.values()).map((a) => {
    const minhas = comissoes.filter((c) => c.affiliateId === a.id);
    const meusIndicados = indicados.get(a.id) || [];
    return {
      ...a,
      linkIndicacao: `/cadastro?ref=${a.codigo}`,
      totalIndicados: meusIndicados.length,
      indicados: meusIndicados,
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
  comprovanteDataUrl?: string | null;
  comprovanteNome?: string | null;
  comprovanteMimeType?: string | null;
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

  if (input.comprovanteDataUrl || input.comprovanteNome) {
    const dets = await carregarComissoesDetalhesMap();
    const prev = dets.get(input.commissionId);
    await salvarComissaoDetalheExtra({
      commissionId: input.commissionId,
      affiliateId: comissao.affiliateId,
      competenciaMes: comissao.competenciaMes,
      quantidadeIndicados: prev?.quantidadeIndicados ?? 1,
      clientesRelatorio: prev?.clientesRelatorio ?? [],
      comprovanteDataUrl: input.comprovanteDataUrl ?? prev?.comprovanteDataUrl ?? null,
      comprovanteNome: input.comprovanteNome ?? prev?.comprovanteNome ?? null,
      comprovanteMimeType: input.comprovanteMimeType ?? prev?.comprovanteMimeType ?? null,
    });
  }

  await registrarAuditoriaAdm(
    `COMISSAO_AFILIADO_${input.status}`,
    "AFFILIATE_COMMISSION",
    input.commissionId,
    { ...dados, comprovanteNome: input.comprovanteNome ?? null },
  );
  return { ok: true, comissao };
}

export async function registrarPagamentoAfiliadoSuperAdmin(
  rawInput: AdminRegistrarPagamentoAfiliadoInput,
) {
  const input = AdminRegistrarPagamentoAfiliadoSchema.parse(rawInput);
  const af = await carregarAfiliado(input.affiliateId);
  if (!af) throw typedError("Afiliado não encontrado.", 404);

  const snapshot = await listarAfiliadosSuperAdmin();
  const afView = snapshot.afiliados.find((a) => a.id === af.id);
  const todosIndicados = afView?.indicados || [];

  const dtIni = input.dataInicio ? new Date(`${input.dataInicio}T00:00:00.000Z`).getTime() : null;
  const dtFim = input.dataFim ? new Date(`${input.dataFim}T23:59:59.999Z`).getTime() : null;

  const indicadosPeriodo = todosIndicados.filter((ind) => {
    if (!dtIni && !dtFim) return true;
    const ts = ind.criadoEm ? new Date(ind.criadoEm).getTime() : Date.now();
    if (dtIni && !Number.isNaN(dtIni) && ts < dtIni) return false;
    if (dtFim && !Number.isNaN(dtFim) && ts > dtFim) return false;
    return true;
  });

  const clientesRelatorio =
    indicadosPeriodo.length > 0 ? indicadosPeriodo : todosIndicados;

  const competencia =
    input.competenciaMes ||
    (input.dataInicio && /^\d{4}-\d{2}/.test(input.dataInicio)
      ? input.dataInicio.slice(0, 7)
      : new Date()
          .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
          .slice(0, 7));

  const valorBaseTotal =
    clientesRelatorio.length > 0
      ? clientesRelatorio.reduce(
          (acc, item) => acc + (item.valorBasePlano ?? ASAAS_PLAN_PRICES_BRL.PRO),
          0,
        )
      : ASAAS_PLAN_PRICES_BRL.PRO;

  const valorCalculado =
    Math.round(valorBaseTotal * (af.percentualComissao / 100) * 100) / 100;
  const valorComissaoFinal =
    input.valorPago !== undefined && input.valorPago > 0
      ? input.valorPago
      : valorCalculado;

  const pagoEm = new Date();
  const resumoNomes =
    clientesRelatorio.length > 0
      ? clientesRelatorio.map((c) => c.nome).join(", ")
      : "Repasse consolidado do período";

  const dados = {
    affiliateId: af.id,
    tenantId: clientesRelatorio[0]?.id ?? null,
    tenantNome: resumoNomes.slice(0, 180),
    competenciaMes: competencia,
    valorBasePlano: Math.round(valorBaseTotal * 100) / 100,
    percentualAplicado: af.percentualComissao,
    valorComissao: valorComissaoFinal,
    status: "PAGO",
    pagoEm,
    comprovanteObs:
      input.comprovanteObs ||
      (input.comprovanteNome
        ? `Comprovante anexado: ${input.comprovanteNome}`
        : "Pagamento registrado via Portal ADM"),
  };

  let criada = await dbTry(() => prisma.affiliateCommission.create({ data: dados }));
  if (!criada) {
    const id = `com_${randomUUID()}`;
    criada = {
      id,
      ...dados,
      criadoEm: pagoEm,
    };
    memCommissions.set(id, criada);
  } else {
    memCommissions.set(criada.id, criada);
  }

  await salvarComissaoDetalheExtra({
    commissionId: criada.id,
    affiliateId: af.id,
    competenciaMes: competencia,
    dataInicio: input.dataInicio ?? null,
    dataFim: input.dataFim ?? null,
    quantidadeIndicados: clientesRelatorio.length,
    clientesRelatorio,
    comprovanteDataUrl: input.comprovanteDataUrl ?? null,
    comprovanteNome: input.comprovanteNome ?? null,
    comprovanteMimeType: input.comprovanteMimeType ?? null,
  });

  await registrarAuditoriaAdm(
    "REGISTRAR_PAGAMENTO_AFILIADO",
    "AFFILIATE_COMMISSION",
    criada.id,
    {
      affiliateId: af.id,
      competenciaMes: competencia,
      quantidadeIndicados: clientesRelatorio.length,
      valorComissao: valorComissaoFinal,
      comprovanteNome: input.comprovanteNome ?? null,
    },
  );

  return {
    ok: true,
    comissao: {
      ...criada,
      quantidadeIndicados: clientesRelatorio.length,
      clientesRelatorio,
      comprovanteDataUrl: input.comprovanteDataUrl ?? null,
      comprovanteNome: input.comprovanteNome ?? null,
      comprovanteMimeType: input.comprovanteMimeType ?? null,
    },
  };
}

/* =========================================================================
   Ações Financeiras em Clientes & Histórico de Faturas / Controle de Fraude
========================================================================= */

const ADMIN_FATURAS_SETTING_KEY = "admin_faturas_historico";
const MAX_FATURAS_RETIDAS = 250;
let faturasWriteQueue: Promise<unknown> = Promise.resolve();

function withFaturasWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const exec = faturasWriteQueue.catch(() => undefined).then(fn);
  faturasWriteQueue = exec;
  return exec;
}

export async function listarHistoricoFaturasClienteSuperAdmin(
  tenantId: string,
  extraTenantIds?: string[],
): Promise<TenantInvoiceRecord[]> {
  const bruto = await lerSetting<TenantInvoiceRecord[]>(ADMIN_FATURAS_SETTING_KEY, []);
  const todas = Array.isArray(bruto) ? bruto : [];

  const contaIds = new Set<string>([tenantId, ...(extraTenantIds ?? [])]);
  const loaded = await carregarRawTenant(tenantId);
  if (loaded) {
    const titular = loaded.raw.users.find((u) => u.role === "TITULAR" && u.ativo !== false);
    if (titular?.userId) {
      const sibs = await tenantIdsDoUsuario(titular.userId, true);
      for (const s of sibs) contaIds.add(s);
    }
  }

  return todas
    .filter((f) => contaIds.has(f.tenantId))
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
}

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
        primaryRaw.trialFim ? new Date(primaryRaw.trialFim).getTime() : 0,
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
  const actor = getAuditActorContext();
  const operadorNome = actor?.usuarioNome || "SuperAdmin Backoffice";
  const empresaRotulo = primaryRaw.nomeFantasia || primaryRaw.razaoSocial;
  const valorPadrao = VALOR_PLANO[raw.plano] ?? ASAAS_PLAN_PRICES_BRL.PRO;

  const faturaRegistrada = TenantInvoiceRecordSchema.parse({
    id: `fat_${randomUUID()}`,
    tenantId: primaryRaw.id,
    empresaNome: empresaRotulo,
    acao: input.action,
    plano: raw.plano,
    statusAnterior,
    statusNovo: calc.status,
    valorPago:
      input.action === "DAR_BAIXA_MANUAL"
        ? (input.valorPago ?? valorPadrao)
        : (input.valorPago ?? null),
    metodoPagamento:
      input.metodoPagamento ??
      (input.action === "DAR_BAIXA_MANUAL" ? "PIX" : null),
    comprovanteDataUrl: input.comprovanteDataUrl ?? null,
    comprovanteNome: input.comprovanteNome ?? null,
    comprovanteMimeType: input.comprovanteMimeType ?? null,
    diasExtrasTrial:
      input.action === "PRORROGAR_TRIAL" ? (input.diasExtrasTrial ?? 7) : null,
    cupomCodigo: input.cupomCodigo?.trim().toUpperCase() || null,
    observacao: input.observacao?.trim() || null,
    operadorId: actor?.usuarioId ?? null,
    operadorNome,
    criadoEm: new Date().toISOString(),
  });

  await withFaturasWriteLock(async () => {
    const histAtual = await lerSetting<TenantInvoiceRecord[]>(ADMIN_FATURAS_SETTING_KEY, []);
    const histProximo = [
      faturaRegistrada,
      ...(Array.isArray(histAtual) ? histAtual : []),
    ].slice(0, MAX_FATURAS_RETIDAS);
    await gravarSetting(ADMIN_FATURAS_SETTING_KEY, histProximo);
  });

  const resumoAcao: Record<string, string> = {
    DAR_BAIXA_MANUAL: `Baixa manual (${faturaRegistrada.metodoPagamento || "PIX"} · R$ ${(faturaRegistrada.valorPago ?? 0).toFixed(2)})`,
    PRORROGAR_TRIAL: `Prorrogação de Trial (+${faturaRegistrada.diasExtrasTrial ?? 7} dias)`,
    ALTERAR_PLANO: `Alteração de plano para ${raw.plano}`,
    ALTERAR_STATUS: `Alteração manual de status (${statusAnterior} → ${calc.status})`,
    APLICAR_CUPOM: `Aplicação manual de cupom ${faturaRegistrada.cupomCodigo || ""}`,
  };

  await criarNotificacaoAdmin({
    categoria: "ACAO_FATURAMENTO_ADM",
    somenteMaster: true,
    severidade:
      input.action === "DAR_BAIXA_MANUAL" || input.action === "ALTERAR_STATUS"
        ? "CRITICA"
        : "ATENCAO",
    titulo: `Auditoria Financeira ADM: ${empresaRotulo} — ${resumoAcao[input.action] || input.action}`,
    descricao: `${operadorNome} executou ${resumoAcao[input.action] || input.action} em ${empresaRotulo}.${faturaRegistrada.observacao ? ` Obs: ${faturaRegistrada.observacao}` : ""}`,
    tenantId: primaryRaw.id,
    linkDestino: "/admin/financeiro",
    atorNome: operadorNome,
    metadados: {
      faturaId: faturaRegistrada.id,
      acao: input.action,
      metodoPagamento: faturaRegistrada.metodoPagamento,
      valorPago: faturaRegistrada.valorPago,
      statusAnterior,
      statusNovo: calc.status,
    },
  }).catch(() => undefined);

  await registrarAuditoriaAdm(
    `FINANCEIRO_${input.action}`,
    "TENANT",
    input.tenantId,
    {
      ...patch,
      faturaId: faturaRegistrada.id,
      metodoPagamento: faturaRegistrada.metodoPagamento,
      valorPago: faturaRegistrada.valorPago,
      observacao: input.observacao,
      tenantsSincronizados: updatedSiblings.map((s) => s.id),
    },
    input.tenantId,
    antes,
  );

  return {
    ok: true,
    fatura: faturaRegistrada,
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
