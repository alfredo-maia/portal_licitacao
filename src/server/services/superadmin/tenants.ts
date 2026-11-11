import { randomUUID } from "node:crypto";
import { PlanoAssinatura, Role, TenantBillingStatus, TenantRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInMemoryAuthUserByEmail, upsertInMemoryAuthUser } from "@/server/auth";
import { cleanCnpj } from "@/lib/validations/cnpj";
import {
  AdminUpdateContaPrincipalSchema,
  AdminUpdateCotasClienteSchema,
  AdminUpsertEmpresaClienteSchema,
  AdminUpsertUsuarioClienteSchema,
  type AdminUpdateContaPrincipalInput,
  type AdminUpdateCotasClienteInput,
  type AdminUpsertEmpresaClienteInput,
  type AdminUpsertUsuarioClienteInput,
} from "@/server/schemas/superadmin.schema";
import { PLAN_LIMITS } from "@/server/schemas/tenant.schema";
import {
  inMemoryCnpjDisputes,
  inMemoryTenants,
  inMemoryTenantUsers,
} from "@/server/services/tenant.service";
import {
  resetarLimiteSilenciosoLicitacao,
  setMemoryTenantExtraAiQuota,
} from "@/server/services/analise-ia-participacao.service";
import {
  listInMemoryLicitacoes,
  updateInMemoryConfiguracaoEmpresa,
} from "@/server/services/licitacoes-store";
import {
  agregarIaPorTenant,
  aplicarPatchTenant,
  carregarPatrimonio,
  carregarRawTenant,
  carregarUsuario,
  construirItemTenant,
  datasPorStatus,
  dbTry,
  empresaPublica,
  getPrismaErrorCode,
  licitacaoResumo,
  listarAfiliadoNomesMap,
  memDisputes,
  memLicitacoesExcluidas,
  memTenantExtras,
  memUsers,
  memoryTenantExtraQuota,
  onboardingDeRaw,
  registrarAuditoriaAdm,
  statusEfetivo,
  tenantIdsDoUsuario,
  typedError,
  usuarioPublico,
  verificarCnpjDuplicado,
  type MemDispute,
  type MemUser,
  type RawTenant,
  type TenantPatchPayload,
  type UsuarioPublico,
} from "./shared";

/* =========================================================================
   Disputas de CNPJ
========================================================================= */

export async function listarDisputasCnpjSuperAdmin() {
  const out = new Map<string, MemDispute>();
  const rows = await dbTry(() =>
    prisma.cnpjDispute.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
  );
  if (Array.isArray(rows)) for (const r of rows) out.set(r.id, r);
  for (const [id, r] of memDisputes) if (!out.has(id)) out.set(id, r);
  for (const [id, r] of inMemoryCnpjDisputes) if (!out.has(id)) out.set(id, r);
  return Array.from(out.values()).sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
  );
}

export async function resolverDisputaCnpjSuperAdmin(
  id: string,
  status: "APROVADA" | "REJEITADA",
  decididoPorNome: string,
) {
  const decididoEm = new Date();
  const existenteDb = await dbTry(() =>
    prisma.cnpjDispute.findUnique({ where: { id } }),
  );
  const mem = memDisputes.get(id) ?? inMemoryCnpjDisputes.get(id);
  const dispute: MemDispute | undefined = existenteDb ?? mem;
  if (!dispute) throw typedError("Disputa de CNPJ não encontrada.", 404);

  await dbTry(() =>
    prisma.cnpjDispute.update({
      where: { id },
      data: { status, decididoPorNome, decididoEm },
    }),
  );
  const atualizado: MemDispute = {
    ...dispute,
    requerenteUserId: dispute.requerenteUserId ?? null,
    status,
    decididoPorNome,
    decididoEm,
  };
  if (memDisputes.has(id)) memDisputes.set(id, atualizado);
  if (inMemoryCnpjDisputes.has(id)) inMemoryCnpjDisputes.set(id, atualizado);

  let targetTenantId: string | null = dispute.tenantAtualId ?? null;
  if (!targetTenantId && dispute.cnpj) {
    const digitos = cleanCnpj(String(dispute.cnpj));
    const memT = Array.from(inMemoryTenants.values()).find(
      (t) => cleanCnpj(t.cnpj) === digitos,
    );
    if (memT) {
      targetTenantId = memT.id;
    } else {
      const dbT = await dbTry(() =>
        prisma.tenant.findFirst({
          where: { cnpj: { in: Array.from(new Set([String(dispute.cnpj), digitos])) } },
          select: { id: true },
        }),
      );
      targetTenantId = dbT?.id ?? null;
    }
  }

  let titularTransferidoParaUserId: string | null = null;
  if (status === "APROVADA" && targetTenantId && dispute.requerenteUserId) {
    const tenantDestinoId = targetTenantId;
    const novoTitularUserId = String(dispute.requerenteUserId);
    titularTransferidoParaUserId = novoTitularUserId;

    for (const m of inMemoryTenantUsers) {
      if (
        m.tenantId === tenantDestinoId &&
        m.role === "TITULAR" &&
        m.userId !== novoTitularUserId
      ) {
        m.role = "MEMBRO";
      }
    }
    const existenteMem = inMemoryTenantUsers.find(
      (m) => m.tenantId === tenantDestinoId && m.userId === novoTitularUserId,
    );
    if (existenteMem) {
      existenteMem.role = "TITULAR";
      existenteMem.ativo = true;
    } else {
      inMemoryTenantUsers.push({
        id: `tu_${randomUUID()}`,
        tenantId: tenantDestinoId,
        userId: novoTitularUserId,
        userEmail: String(dispute.requerenteEmail || ""),
        userName: String(dispute.requerenteNome || "Titular"),
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      });
    }

    await dbTry(async () => {
      await prisma.tenantUser.updateMany({
        where: {
          tenantId: tenantDestinoId,
          role: "TITULAR",
          NOT: { userId: novoTitularUserId },
        },
        data: { role: "MEMBRO" },
      });
      await prisma.tenantUser.upsert({
        where: {
          tenantId_userId: {
            tenantId: tenantDestinoId,
            userId: novoTitularUserId,
          },
        },
        create: {
          tenantId: tenantDestinoId,
          userId: novoTitularUserId,
          role: "TITULAR",
          ativo: true,
        },
        update: {
          role: "TITULAR",
          ativo: true,
        },
      });
    });
  }

  await registrarAuditoriaAdm(
    "RESOLVER_DISPUTA_CNPJ",
    "CNPJ_DISPUTE",
    id,
    { status, decididoPorNome, titularTransferidoParaUserId },
    targetTenantId,
  );
  return { ok: true, id, status, titularTransferidoParaUserId };
}

/* =========================================================================
   Clientes 360º — Dossiê, Conta Principal, Empresas, Equipe, Cotas & Espelho
========================================================================= */

/**
 * Dossiê 360º do cliente: conta principal, todos os CNPJs, equipe (sem senhas),
 * patrimônio operacional (Kanban, Cofre R2, portais, impugnações, preços) e termômetro de trial.
 */
export async function obterDossieCliente360SuperAdmin(tenantIdOrUserId: string) {
  let carregado = await carregarRawTenant(tenantIdOrUserId);
  if (!carregado) {
    let tids = await tenantIdsDoUsuario(tenantIdOrUserId, true);
    if (tids.length === 0) {
      tids = await tenantIdsDoUsuario(tenantIdOrUserId, false);
    }
    const candidates: Array<{ raw: RawTenant; origem: "db" | "mem" }> = [];
    for (const tid of tids) {
      const c = await carregarRawTenant(tid);
      if (c) candidates.push(c);
    }
    candidates.sort((a, b) => {
      const diff = new Date(a.raw.criadoEm).getTime() - new Date(b.raw.criadoEm).getTime();
      return diff !== 0 ? diff : a.raw.id.localeCompare(b.raw.id);
    });
    if (candidates[0]) carregado = candidates[0];
  }
  if (!carregado) throw typedError("Cliente não encontrado.", 404);

  const raw = carregado.raw;
  const titularMembro =
    raw.users.find((u) => u.role === "TITULAR" && u.ativo !== false) ?? null;
  const titularId = titularMembro?.userId ?? null;

  // Apenas os CNPJs (tenants) pertencentes ao mesmo titular ativo (estrito apenasTitular = true)
  const empresasRaw: RawTenant[] = [raw];
  if (titularId) {
    const tids = await tenantIdsDoUsuario(titularId, true);
    for (const tid of tids) {
      if (tid === raw.id) continue;
      const outro = await carregarRawTenant(tid);
      if (outro) empresasRaw.push(outro.raw);
    }
  }
  empresasRaw.sort((a, b) => {
    const diff = new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  const primaryRaw = empresasRaw[0] ?? raw;
  const tenantIds = empresasRaw.map((e) => e.id);
  const nomes = new Map(empresasRaw.map((e) => [e.id, e.nomeFantasia || e.razaoSocial]));

  // Equipe unificada (sem senhas)
  const usuariosMap = new Map<
    string,
    UsuarioPublico & { tenantRole: string; tenants: string[] }
  >();
  for (const e of empresasRaw) {
    for (const u of e.users) {
      const existente = usuariosMap.get(u.userId);
      if (existente) {
        existente.tenants.push(e.id);
        continue;
      }
      const full = await carregarUsuario(u.userId);
      const base = full
        ? usuarioPublico(full.user)
        : usuarioPublico({
            id: u.userId,
            name: u.name,
            email: u.email,
            role: u.userRole || "OPERADOR",
            ativo: u.ativo,
            telefone: u.telefone,
          });
      usuariosMap.set(u.userId, { ...base, tenantRole: u.role, tenants: [e.id] });
    }
  }
  const usuarios = Array.from(usuariosMap.values());
  const titular = titularId ? usuariosMap.get(titularId) || null : null;

  const [patrimonio, porEmpEntries, ia, affiliateNomes, todasDisputas] = await Promise.all([
    carregarPatrimonio(tenantIds, nomes),
    Promise.all(
      empresasRaw.map(async (emp) => [
        emp.id,
        { patrimonioOperacional: await carregarPatrimonio([emp.id], nomes) },
      ] as const),
    ),
    agregarIaPorTenant(),
    listarAfiliadoNomesMap(),
    listarDisputasCnpjSuperAdmin(),
  ]);
  const porEmpresa = Object.fromEntries(porEmpEntries);

  const usosIa = tenantIds.reduce((a, id) => a + (ia.get(id)?.usadas || 0), 0);
  const item = construirItemTenant(
    raw,
    ia.get(raw.id) || { usadas: 0, gastoDia: 0, gastoMes: 0 },
    affiliateNomes,
  );
  const primaryItem =
    primaryRaw.id === raw.id
      ? item
      : construirItemTenant(
          primaryRaw,
          ia.get(primaryRaw.id) || { usadas: 0, gastoDia: 0, gastoMes: 0 },
          affiliateNomes,
        );

  const cotasPorEmpresa: Record<
    string,
    {
      maxCnpjs: number;
      maxUsers: number;
      storageBaseMb: number;
      storageExtraQuotaMb: number;
      storageTotalMb: number;
      storageUsadoMb: number;
      aiExtraQuotaMes: number;
      aiUsadasMes: number;
    }
  > = {};
  for (const emp of empresasRaw) {
    const empAi = ia.get(emp.id) || { usadas: 0, gastoDia: 0, gastoMes: 0 };
    const empItem = construirItemTenant(emp, empAi, affiliateNomes);
    cotasPorEmpresa[emp.id] = {
      maxCnpjs: emp.maxCnpjs,
      maxUsers: emp.maxUsers,
      storageBaseMb: empItem.cotaBaseMb,
      storageExtraQuotaMb: empItem.cotaExtraMb,
      storageTotalMb: empItem.cotaTotalMb,
      storageUsadoMb: empItem.espacoUsadoMb,
      aiExtraQuotaMes: emp.aiExtraQuotaMes,
      aiUsadasMes: empAi.usadas,
    };
  }
  const cotasArr = Object.values(cotasPorEmpresa);
  const contaGlobal = {
    valorMensalidade: primaryItem.valorMensalidade,
    diasRestantesTrial: primaryItem.diasRestantesTrial,
    storageUsadoMb:
      Math.round(cotasArr.reduce((acc, c) => acc + c.storageUsadoMb, 0) * 10) / 10,
    storageTotalMb: cotasArr.reduce((acc, c) => acc + c.storageTotalMb, 0),
    aiUsadasMes: usosIa,
    aiExtraQuotaMes: cotasArr.reduce((acc, c) => acc + c.aiExtraQuotaMes, 0),
    totalLicitacoes: patrimonio.licitacoes.length,
    totalDocumentos: patrimonio.documentos.total,
    totalPortais: patrimonio.portais,
  };

  const onboarding = onboardingDeRaw(
    {
      ...raw,
      docCount: patrimonio.documentos.total,
      kanbanStatuses: patrimonio.licitacoes.map((l) => l.statusKanban),
      segmentos: empresasRaw.flatMap((e) => e.segmentos),
      ufs: empresasRaw.flatMap((e) => e.ufs),
      brasilInteiro: empresasRaw.every((e) => e.brasilInteiro),
      preferenciasUpdatedAt:
        empresasRaw.find((e) => e.preferenciasUpdatedAt)?.preferenciasUpdatedAt ?? null,
      configPreferenciasUpdatedAt:
        empresasRaw.find((e) => e.configPreferenciasUpdatedAt)?.configPreferenciasUpdatedAt ??
        null,
      hasConfig: empresasRaw.some((e) => e.hasConfig),
      hasCalculadoraOrPrecos:
        empresasRaw.some((e) => e.hasCalculadoraOrPrecos) || patrimonio.precosSalvos > 0,
    },
    usosIa,
  );

  const cnpjsLimpos = new Set(empresasRaw.map((e) => cleanCnpj(e.cnpj)));
  const disputas = todasDisputas.filter(
    (d) =>
      tenantIds.includes(d.tenantAtualId || "") ||
      cnpjsLimpos.has(cleanCnpj(d.cnpj)),
  );

  return {
    ok: true,
    tenantId: raw.id,
    tenant: item,
    titular,
    onboarding,
    empresas: empresasRaw.map(empresaPublica),
    usuarios,
    patrimonioOperacional: patrimonio,
    porEmpresa,
    cotasPorEmpresa,
    contaGlobal,
    cotas: {
      maxCnpjs: Math.max(...empresasRaw.map((e) => e.maxCnpjs), raw.maxCnpjs),
      maxUsers: Math.max(...empresasRaw.map((e) => e.maxUsers), raw.maxUsers),
      storageBaseMb: item.cotaBaseMb,
      storageExtraQuotaMb: item.cotaExtraMb,
      storageTotalMb: item.cotaTotalMb,
      storageUsadoMb: item.espacoUsadoMb,
      aiExtraQuotaMes: raw.aiExtraQuotaMes,
      aiUsadasMes: usosIa,
    },
    financeiro: {
      plano: primaryRaw.plano,
      billingStatus: primaryItem.billingStatus,
      valorMensalidade: primaryItem.valorMensalidade,
      trialFim: primaryRaw.trialFim ?? null,
      vencimentoAssinatura: primaryRaw.vencimentoAssinatura ?? null,
      ultimoPagamentoEm: primaryRaw.ultimoPagamentoEm ?? null,
      cupomCodigo: primaryRaw.cupomCodigo ?? null,
      affiliateId: primaryRaw.affiliateId ?? null,
    },
    notasInternasAdm: primaryRaw.notasInternasAdm ?? null,
    disputas,
  };
}

export async function atualizarContaPrincipalSuperAdmin(
  rawInput: AdminUpdateContaPrincipalInput,
): Promise<{
  ok: boolean;
  usuario: UsuarioPublico;
  resetSenhaDisparado: boolean;
  tenantsAfetados: string[];
}> {
  const input = AdminUpdateContaPrincipalSchema.parse(rawInput);
  const found = await carregarUsuario(input.userId);
  if (!found) throw typedError("Usuário (conta principal) não encontrado.", 404);

  if (found.user.isSuperAdmin || String(found.user.role) === "SUPERADMIN") {
    throw typedError("Não é permitido alterar uma conta administrativa por esta rota.", 400);
  }

  const antesUsuario = usuarioPublico(found.user);
  const emailAnterior = found.user.email.trim().toLowerCase();
  const emailNovo = input.email ? input.email.trim().toLowerCase() : undefined;

  if (emailNovo && emailNovo !== emailAnterior) {
    const dbDup = await dbTry(() =>
      prisma.user.findUnique({ where: { email: emailNovo }, select: { id: true } }),
    );
    const memDup = Array.from(memUsers.values()).find(
      (u) => u.id !== input.userId && u.email.toLowerCase() === emailNovo,
    );
    if ((dbDup && dbDup.id !== input.userId) || memDup) {
      throw typedError("Já existe um usuário com este e-mail.", 400);
    }
  }

  const patchData: {
    name?: string;
    email?: string;
    cpf?: string | null;
    telefone?: string | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    ativo?: boolean;
  } = {};
  if (input.name !== undefined) patchData.name = input.name;
  if (emailNovo !== undefined) patchData.email = emailNovo;
  if (input.cpf !== undefined) patchData.cpf = input.cpf;
  if (input.telefone !== undefined) patchData.telefone = input.telefone;
  if (input.cep !== undefined) patchData.cep = input.cep;
  if (input.logradouro !== undefined) patchData.logradouro = input.logradouro;
  if (input.numero !== undefined) patchData.numero = input.numero;
  if (input.bairro !== undefined) patchData.bairro = input.bairro;
  if (input.cidade !== undefined) patchData.cidade = input.cidade;
  if (input.uf !== undefined) patchData.uf = input.uf;
  if (input.ativo !== undefined) patchData.ativo = input.ativo;

  const bump = Boolean(input.forcarLogout) || input.ativo === false;
  let usuario: UsuarioPublico;

  if (found.origem === "db") {
    try {
      const updated = await prisma.user.update({
        where: { id: input.userId },
        data: { ...patchData, ...(bump ? { sessionVersion: { increment: 1 } } : {}) },
      });
      usuario = usuarioPublico(updated);
    } catch (err: unknown) {
      if (getPrismaErrorCode(err) === "P2002") {
        throw typedError("Já existe um usuário com este e-mail.", 400);
      }
      throw err;
    }
  } else {
    const m = memUsers.get(input.userId)!;
    Object.assign(m, patchData);
    if (bump) m.sessionVersion = (m.sessionVersion || 1) + 1;
    memUsers.set(m.id, m);
    usuario = usuarioPublico(m);
  }

  // Sincroniza cache de autenticação em memória para respeitar killswitch (`sessionVersion` / `ativo`)
  const authMem = getInMemoryAuthUserByEmail(emailAnterior);
  if (authMem) {
    upsertInMemoryAuthUser({
      ...authMem,
      name: usuario.name,
      email: usuario.email,
      ativo: usuario.ativo,
      sessionVersion: usuario.sessionVersion,
    });
  }

  // Ativação/inativação do cliente: replica nos tenants dos quais ele é TITULAR (ordenados deterministicamente pelo CNPJ primário)
  const tenantsAfetadosRaw = await tenantIdsDoUsuario(input.userId, true);
  const tenantsLoaded: RawTenant[] = [];
  for (const tid of tenantsAfetadosRaw) {
    const loaded = await carregarRawTenant(tid);
    if (loaded) tenantsLoaded.push(loaded.raw);
  }
  tenantsLoaded.sort((a, b) => {
    const diff = new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  const tenantsAfetados =
    tenantsLoaded.length > 0 ? tenantsLoaded.map((t) => t.id) : tenantsAfetadosRaw;
  const primaryTenantBefore = tenantsLoaded[0] ?? null;
  const primaryTenantId = tenantsAfetados[0] ?? null;

  if (input.ativo !== undefined) {
    for (const tid of tenantsAfetados) {
      await aplicarPatchTenant(tid, { ativo: input.ativo }).catch(() => undefined);
    }
  }
  if (input.notasInternasAdm !== undefined && primaryTenantId) {
    await aplicarPatchTenant(primaryTenantId, {
      notasInternasAdm: input.notasInternasAdm,
    }).catch(() => undefined);
  }

  let resetSenhaDisparado = false;
  if (input.dispararResetSenha) {
    try {
      const { solicitarRecuperacaoSenha } = await import(
        "@/server/services/esqueci-senha.service"
      );
      const resReset = await solicitarRecuperacaoSenha(usuario.email, "admin-portal", {
        bypassRateLimit: true,
      });
      resetSenhaDisparado = resReset.ok === true;
    } catch {
      resetSenhaDisparado = false;
    }
  }

  await registrarAuditoriaAdm(
    input.ativo === false
      ? "INATIVAR_CLIENTE"
      : input.ativo === true
        ? "ATIVAR_CLIENTE"
        : "EDITAR_CONTA_PRINCIPAL",
    "USER",
    input.userId,
    {
      campos: Object.keys(patchData),
      forcarLogout: Boolean(input.forcarLogout),
      resetSenhaDisparado,
      ...(input.notasInternasAdm !== undefined
        ? { notasInternasAdm: input.notasInternasAdm }
        : {}),
      ...(input.ativo !== undefined ? { ativo: usuario.ativo } : {}),
    },
    primaryTenantId,
    {
      name: antesUsuario.name,
      email: antesUsuario.email,
      ativo: antesUsuario.ativo,
      cpf: antesUsuario.cpf,
      telefone: antesUsuario.telefone,
      notasInternasAdm: primaryTenantBefore?.notasInternasAdm ?? null,
    },
  );

  return { ok: true, usuario, resetSenhaDisparado, tenantsAfetados };
}

export async function salvarEmpresaClienteSuperAdmin(
  rawInput: AdminUpsertEmpresaClienteInput,
): Promise<{
  ok: boolean;
  empresa: ReturnType<typeof empresaPublica>;
  criada: boolean;
}> {
  const input = AdminUpsertEmpresaClienteSchema.parse(rawInput);

  const patch: {
    razaoSocial?: string;
    nomeFantasia?: string | null;
    cnaePrincipal?: string | null;
    cnaesSecundarios?: string[];
    endereco?: string | null;
    cidade?: string | null;
    uf?: string | null;
    telefone?: string | null;
    segmentos?: string[];
    ufs?: string[];
    brasilInteiro?: boolean;
    plano?: PlanoAssinatura;
    billingStatus?: TenantBillingStatus;
    ativo?: boolean;
    trialFim?: Date | null;
    vencimentoAssinatura?: Date | null;
    ultimoPagamentoEm?: Date | null;
  } = {
    razaoSocial: input.razaoSocial,
  };
  if (input.nomeFantasia !== undefined) patch.nomeFantasia = input.nomeFantasia;
  if (input.cnaePrincipal !== undefined) patch.cnaePrincipal = input.cnaePrincipal;
  if (input.cnaesSecundarios !== undefined) patch.cnaesSecundarios = input.cnaesSecundarios;
  if (input.endereco !== undefined) patch.endereco = input.endereco;
  if (input.cidade !== undefined) patch.cidade = input.cidade;
  if (input.uf !== undefined) patch.uf = input.uf;
  if (input.telefone !== undefined) patch.telefone = input.telefone;
  if (input.segmentos !== undefined) patch.segmentos = input.segmentos;
  if (input.ufs !== undefined) patch.ufs = input.ufs;
  if (input.brasilInteiro !== undefined) patch.brasilInteiro = input.brasilInteiro;
  if (input.plano !== undefined) patch.plano = input.plano as PlanoAssinatura;
  if (input.ativo !== undefined) patch.ativo = input.ativo;
  if (input.billingStatus) {
    const datas = datasPorStatus(input.billingStatus);
    patch.billingStatus = input.billingStatus as TenantBillingStatus;
    patch.trialFim = datas.trialFim;
    patch.vencimentoAssinatura = datas.vencimentoAssinatura;
    if (datas.ultimoPagamentoEm !== undefined) {
      patch.ultimoPagamentoEm = datas.ultimoPagamentoEm;
    }
  }

  const configPatch: {
    inscricaoEstadual?: string | null;
    inscricaoMunicipal?: string | null;
    representanteNome?: string;
    representanteCpf?: string;
    representanteRg?: string | null;
    representanteCargo?: string;
    bancoNome?: string | null;
    agencia?: string | null;
    contaCorrente?: string | null;
    chavePix?: string | null;
  } = {};
  if (input.inscricaoEstadual !== undefined) {
    configPatch.inscricaoEstadual = input.inscricaoEstadual;
  }
  if (input.inscricaoMunicipal !== undefined) {
    configPatch.inscricaoMunicipal = input.inscricaoMunicipal;
  }
  if (input.representanteNome) configPatch.representanteNome = input.representanteNome;
  if (input.representanteCpf) configPatch.representanteCpf = input.representanteCpf;
  if (input.representanteRg !== undefined) configPatch.representanteRg = input.representanteRg;
  if (input.representanteCargo) configPatch.representanteCargo = input.representanteCargo;
  if (input.bancoNome !== undefined) configPatch.bancoNome = input.bancoNome;
  if (input.agencia !== undefined) configPatch.agencia = input.agencia;
  if (input.contaCorrente !== undefined) configPatch.contaCorrente = input.contaCorrente;
  if (input.chavePix !== undefined) configPatch.chavePix = input.chavePix;

  let tenantId = input.tenantId;
  let criada = false;
  let cnpjNormalizado = input.cnpj.trim();
  let antesEmpresa: Record<string, unknown> | undefined;

  if (tenantId) {
    const atual = await carregarRawTenant(tenantId);
    if (!atual) throw typedError("Cliente (Tenant) não encontrado.", 404);

    const statusAnterior = statusEfetivo(atual.raw).status;
    antesEmpresa = {
      cnpj: atual.raw.cnpj,
      razaoSocial: atual.raw.razaoSocial,
      nomeFantasia: atual.raw.nomeFantasia ?? null,
      plano: atual.raw.plano,
      billingStatus: statusAnterior,
      ativo: atual.raw.ativo,
    };

    const {
      plano: planoReq,
      billingStatus: statusReq,
      trialFim: _tFim,
      vencimentoAssinatura: _vAssin,
      ultimoPagamentoEm: _uPag,
      ...cadastralPatch
    } = patch;

    const planoChanged = Boolean(planoReq && planoReq !== atual.raw.plano);
    const statusChanged = Boolean(statusReq && statusReq !== statusAnterior);

    const financialPatch: TenantPatchPayload = {};
    let planLimitsPatch: { maxCnpjs: number; maxUsers: number } | null = null;
    if (planoChanged && planoReq) {
      const lim = PLAN_LIMITS[planoReq];
      planLimitsPatch = { maxCnpjs: lim.maxCnpjs, maxUsers: lim.maxUsers };
      financialPatch.plano = planoReq;
      financialPatch.maxCnpjs = Math.max(atual.raw.maxCnpjs, lim.maxCnpjs);
      financialPatch.maxUsers = Math.max(atual.raw.maxUsers, lim.maxUsers);
    }
    if (statusChanged && statusReq) {
      const datas = datasPorStatus(statusReq);
      financialPatch.billingStatus = statusReq;
      financialPatch.trialFim = datas.trialFim;
      financialPatch.vencimentoAssinatura = datas.vencimentoAssinatura;
      if (datas.ultimoPagamentoEm !== undefined) {
        financialPatch.ultimoPagamentoEm = datas.ultimoPagamentoEm;
      }
    }

    const { raw } = await aplicarPatchTenant(tenantId, {
      ...cadastralPatch,
      ...financialPatch,
      cnpj: input.cnpj,
    });
    cnpjNormalizado = raw.cnpj;

    if (planoChanged || statusChanged) {
      const titularMembro = raw.users.find((u) => u.role === "TITULAR" && u.ativo !== false);
      if (titularMembro?.userId) {
        const siblingTids = await tenantIdsDoUsuario(titularMembro.userId, true);
        for (const sibId of siblingTids) {
          if (sibId === tenantId) continue;
          const sibLoaded = await carregarRawTenant(sibId);
          if (!sibLoaded) continue;
          const sibPatch: TenantPatchPayload = { ...financialPatch };
          if (planLimitsPatch) {
            sibPatch.maxCnpjs = Math.max(sibLoaded.raw.maxCnpjs, planLimitsPatch.maxCnpjs);
            sibPatch.maxUsers = Math.max(sibLoaded.raw.maxUsers, planLimitsPatch.maxUsers);
          }
          await aplicarPatchTenant(sibId, sibPatch).catch(() => undefined);
        }
      }
    }
  } else {
    criada = true;
    cnpjNormalizado = await verificarCnpjDuplicado(input.cnpj);
    const owner = input.ownerUserId ? await carregarUsuario(input.ownerUserId) : null;

    let oldestOwnerRaw: RawTenant | null = null;
    if (input.ownerUserId) {
      const ownerTids = await tenantIdsDoUsuario(input.ownerUserId, true);
      const ownerLoaded: RawTenant[] = [];
      for (const tid of ownerTids) {
        const resRaw = await carregarRawTenant(tid);
        if (resRaw) ownerLoaded.push(resRaw.raw);
      }
      ownerLoaded.sort((a, b) => {
        const diff = new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });
      oldestOwnerRaw = ownerLoaded[0] ?? null;
    }

    const datas = datasPorStatus(input.billingStatus ?? "TRIAL");
    const calcOwner = oldestOwnerRaw ? statusEfetivo(oldestOwnerRaw) : null;
    const planoFinal = (
      oldestOwnerRaw ? oldestOwnerRaw.plano : (input.plano ?? "BASICO")
    ) as PlanoAssinatura;
    const statusFinal = (
      calcOwner ? calcOwner.status : (input.billingStatus ?? "TRIAL")
    ) as TenantBillingStatus;
    const trialFimFinal = oldestOwnerRaw
      ? (oldestOwnerRaw.trialFim ?? null)
      : datas.trialFim;
    const vencimentoFinal = oldestOwnerRaw
      ? (oldestOwnerRaw.vencimentoAssinatura ?? null)
      : datas.vencimentoAssinatura;
    const ultimoPagamentoFinal = oldestOwnerRaw
      ? (oldestOwnerRaw.ultimoPagamentoEm ?? null)
      : (datas.ultimoPagamentoEm ?? null);
    const maxCnpjsFinal = oldestOwnerRaw
      ? oldestOwnerRaw.maxCnpjs
      : PLAN_LIMITS[planoFinal].maxCnpjs;
    const maxUsersFinal = oldestOwnerRaw
      ? oldestOwnerRaw.maxUsers
      : PLAN_LIMITS[planoFinal].maxUsers;
    const cupomCodigoFinal = oldestOwnerRaw ? (oldestOwnerRaw.cupomCodigo ?? null) : null;
    const affiliateIdFinal = oldestOwnerRaw ? (oldestOwnerRaw.affiliateId ?? null) : null;

    let criadoDbId: string | null = null;
    if (!input.ownerUserId || owner?.origem === "db") {
      try {
        const criado = await prisma.tenant.create({
          data: {
            ...patch,
            cnpj: cnpjNormalizado,
            razaoSocial: input.razaoSocial,
            plano: planoFinal,
            billingStatus: statusFinal,
            trialFim: trialFimFinal,
            vencimentoAssinatura: vencimentoFinal,
            ultimoPagamentoEm: ultimoPagamentoFinal,
            maxCnpjs: maxCnpjsFinal,
            maxUsers: maxUsersFinal,
            cupomCodigo: cupomCodigoFinal,
            affiliateId: affiliateIdFinal,
          },
          select: { id: true },
        });
        criadoDbId = criado.id;
        if (owner?.origem === "db" && input.ownerUserId) {
          await prisma.tenantUser.create({
            data: {
              tenantId: criado.id,
              userId: input.ownerUserId,
              role: "TITULAR",
            },
          });
        }
      } catch (err: unknown) {
        if (getPrismaErrorCode(err) === "P2002") {
          throw typedError("Já existe um cliente cadastrado com este CNPJ.", 400);
        }
        criadoDbId = null;
      }
    }

    if (criadoDbId) {
      tenantId = criadoDbId;
    } else {
      tenantId = `tnt_${randomUUID()}`;
      const agora = new Date();
      inMemoryTenants.set(tenantId, {
        id: tenantId,
        cnpj: cnpjNormalizado,
        razaoSocial: input.razaoSocial,
        nomeFantasia: input.nomeFantasia ?? null,
        cnaePrincipal: input.cnaePrincipal ?? null,
        cnaesSecundarios: input.cnaesSecundarios ?? [],
        endereco: input.endereco ?? null,
        cidade: input.cidade ?? null,
        uf: input.uf ?? null,
        plano: planoFinal,
        billingStatus: statusFinal,
        trialFim: trialFimFinal,
        vencimentoAssinatura: vencimentoFinal,
        ultimoPagamentoEm: ultimoPagamentoFinal,
        cupomCodigo: cupomCodigoFinal,
        affiliateId: affiliateIdFinal,
        segmentos: input.segmentos ?? [],
        ufs: input.ufs ?? [],
        brasilInteiro: input.brasilInteiro ?? true,
        maxCnpjs: maxCnpjsFinal,
        maxUsers: maxUsersFinal,
        ativo: input.ativo ?? true,
        criadoEm: agora,
        updatedAt: agora,
      });
      memTenantExtras.set(tenantId, {
        ...(input.telefone ? { telefone: input.telefone } : {}),
        billingStatus: statusFinal,
        cupomCodigo: cupomCodigoFinal,
        affiliateId: affiliateIdFinal,
      });
      if (owner) {
        inMemoryTenantUsers.push({
          id: `tu_${randomUUID()}`,
          tenantId,
          userId: owner.user.id,
          userEmail: owner.user.email,
          userName: owner.user.name,
          role: "TITULAR",
          ativo: true,
          criadoEm: agora,
        });
      }
    }
  }

  if (Object.keys(configPatch).length > 0 || criada) {
    const cfgUpdate = {
      ...configPatch,
      razaoSocial: input.razaoSocial,
      nomeFantasia: input.nomeFantasia ?? undefined,
      cnpj: cnpjNormalizado,
      cidade: input.cidade ?? undefined,
      uf: input.uf ?? undefined,
    };
    const ok = await dbTry(() =>
      prisma.configuracaoEmpresa.upsert({
        where: { tenantId: tenantId! },
        update: cfgUpdate,
        create: {
          ...cfgUpdate,
          id: `cfg_${tenantId!}`,
          tenantId: tenantId!,
        },
      }),
    );
    if (!ok) updateInMemoryConfiguracaoEmpresa(cfgUpdate, tenantId);
  }

  const final = await carregarRawTenant(tenantId!);
  if (!final) throw typedError("Falha ao carregar a empresa salva.", 500);

  await registrarAuditoriaAdm(
    criada ? "CRIAR_EMPRESA_CLIENTE" : "EDITAR_EMPRESA_CLIENTE",
    "TENANT",
    tenantId!,
    {
      cnpj: cnpjNormalizado,
      razaoSocial: input.razaoSocial,
      plano: final.raw.plano,
      billingStatus: statusEfetivo(final.raw).status,
      ativo: final.raw.ativo,
    },
    tenantId,
    antesEmpresa,
  );

  return { ok: true, empresa: empresaPublica(final.raw), criada };
}

export async function salvarUsuarioClienteSuperAdmin(
  rawInput: AdminUpsertUsuarioClienteInput,
): Promise<{
  ok: boolean;
  usuario: UsuarioPublico & { tenantRole: string };
  criado: boolean;
}> {
  const input = AdminUpsertUsuarioClienteSchema.parse(rawInput);
  const tenant = await carregarRawTenant(input.tenantId);
  if (!tenant) throw typedError("Empresa (Tenant) não encontrada.", 404);

  const email = input.email.trim().toLowerCase();
  let existente:
    | Awaited<ReturnType<typeof carregarUsuario>>
    | null = null;

  if (input.userId) {
    existente = await carregarUsuario(input.userId);
    if (!existente) throw typedError("Usuário não encontrado.", 404);
    if (
      existente.user.isSuperAdmin ||
      String(existente.user.role) === "SUPERADMIN"
    ) {
      throw typedError(
        "Não é permitido alterar uma conta administrativa por esta rota.",
        400,
      );
    }
    if (email !== existente.user.email.trim().toLowerCase()) {
      const dbDup = await dbTry(() =>
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
      );
      const memDup = Array.from(memUsers.values()).find(
        (u) => u.id !== existente!.user.id && u.email.toLowerCase() === email,
      );
      if ((dbDup && dbDup.id !== existente.user.id) || memDup) {
        throw typedError("Já existe um usuário com este e-mail.", 400);
      }
    }
  } else {
    const byEmail = await dbTry(() =>
      prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          ativo: true,
          sessionVersion: true,
          cpf: true,
          telefone: true,
          cep: true,
          logradouro: true,
          numero: true,
          bairro: true,
          cidade: true,
          uf: true,
          ultimoLoginEm: true,
          isSuperAdmin: true,
          adminRole: true,
        },
      }),
    );
    if (byEmail) {
      if (byEmail.isSuperAdmin || String(byEmail.role) === "SUPERADMIN") {
        throw typedError(
          "Não é permitido vincular ou alterar uma conta administrativa por esta rota.",
          400,
        );
      }
      existente = { origem: "db", user: byEmail };
    } else {
      const m = Array.from(memUsers.values()).find(
        (u) => u.email.toLowerCase() === email,
      );
      if (m) {
        if (m.isSuperAdmin || m.role === "SUPERADMIN") {
          throw typedError(
            "Não é permitido vincular ou alterar uma conta administrativa por esta rota.",
            400,
          );
        }
        existente = { origem: "mem", user: m };
      }
    }
  }

  const dados = {
    name: input.name,
    email,
    cpf: input.cpf ?? null,
    telefone: input.telefone ?? null,
    role: input.role as Role,
    ativo: input.ativo,
  };
  const vinculoAnterior = existente
    ? tenant.raw.users.find((u) => u.userId === existente!.user.id)
    : undefined;
  const antesUsuario = existente
    ? {
        name: existente.user.name,
        email: existente.user.email,
        role: String(existente.user.role),
        ativo: existente.user.ativo !== false,
        tenantRole: vinculoAnterior?.role ?? null,
      }
    : undefined;
  let usuario: UsuarioPublico;
  let criado = false;

  if (existente?.origem === "db") {
    try {
      const updated = await prisma.user.update({
        where: { id: existente.user.id },
        data: dados,
      });
      usuario = usuarioPublico(updated);
    } catch (err: unknown) {
      if (getPrismaErrorCode(err) === "P2002") {
        throw typedError("Já existe um usuário com este e-mail.", 400);
      }
      throw err;
    }
  } else if (existente?.origem === "mem") {
    const m = memUsers.get(existente.user.id)!;
    Object.assign(m, dados);
    usuario = usuarioPublico(m);
  } else {
    criado = true;
    let criadoDbId: UsuarioPublico | null = null;
    if (tenant.origem === "db") {
      try {
        const { default: bcrypt } = await import("bcryptjs");
        const senhaTemp = `${randomUUID()}${randomUUID()}`;
        const created = await prisma.user.create({
          data: { ...dados, passwordHash: await bcrypt.hash(senhaTemp, 10) },
        });
        criadoDbId = usuarioPublico(created);
      } catch (err: unknown) {
        if (getPrismaErrorCode(err) === "P2002") {
          throw typedError("Já existe um usuário com este e-mail.", 400);
        }
        criadoDbId = null;
      }
    }
    if (criadoDbId) {
      usuario = criadoDbId;
    } else {
      const m: MemUser = {
        id: `usr_${randomUUID()}`,
        ...dados,
        sessionVersion: 1,
        criadoEm: new Date(),
      };
      memUsers.set(m.id, m);
      usuario = usuarioPublico(m);
    }
  }

  const authMem = getInMemoryAuthUserByEmail(email);
  if (authMem) {
    upsertInMemoryAuthUser({
      ...authMem,
      name: usuario.name,
      email: usuario.email,
      role: input.role,
      ativo: usuario.ativo,
      tenantRole: input.tenantRole,
    });
  }

  // Vínculo com o tenant
  const tenantRoleEnum = input.tenantRole as TenantRole;
  const vinculoDb =
    tenant.origem === "db"
      ? await dbTry(() =>
          prisma.tenantUser.upsert({
            where: {
              tenantId_userId: { tenantId: input.tenantId, userId: usuario.id },
            },
            update: { role: tenantRoleEnum, ativo: input.ativo },
            create: {
              tenantId: input.tenantId,
              userId: usuario.id,
              role: tenantRoleEnum,
              ativo: input.ativo,
            },
          }),
        )
      : undefined;
  if (!vinculoDb) {
    const mem = inMemoryTenantUsers.find(
      (m) => m.tenantId === input.tenantId && m.userId === usuario.id,
    );
    if (mem) {
      mem.role = input.tenantRole;
      mem.ativo = input.ativo;
      mem.userName = usuario.name;
      mem.userEmail = usuario.email;
    } else {
      inMemoryTenantUsers.push({
        id: `tu_${randomUUID()}`,
        tenantId: input.tenantId,
        userId: usuario.id,
        userEmail: usuario.email,
        userName: usuario.name,
        role: input.tenantRole,
        ativo: input.ativo,
        criadoEm: new Date(),
      });
    }
  }

  if (input.dispararResetSenha || criado) {
    await import("@/server/services/esqueci-senha.service")
      .then((m) =>
        m.solicitarRecuperacaoSenha(usuario.email, "admin-portal", {
          bypassRateLimit: true,
        }),
      )
      .catch(() => undefined);
  }

  await registrarAuditoriaAdm(
    criado ? "CRIAR_USUARIO_CLIENTE" : "EDITAR_USUARIO_CLIENTE",
    "USER",
    usuario.id,
    {
      tenantId: input.tenantId,
      role: input.role,
      tenantRole: input.tenantRole,
      ativo: input.ativo,
    },
    input.tenantId,
    antesUsuario,
  );

  return { ok: true, usuario: { ...usuario, tenantRole: input.tenantRole }, criado };
}

export async function atualizarCotasClienteSuperAdmin(
  rawInput: AdminUpdateCotasClienteInput,
): Promise<{
  ok: boolean;
  tenantId: string;
  maxCnpjs: number;
  maxUsers: number;
  storageExtraQuotaMb: number;
  aiExtraQuotaMes: number;
  travaIaResetada: boolean;
}> {
  const input = AdminUpdateCotasClienteSchema.parse(rawInput);
  const atual = await carregarRawTenant(input.tenantId);
  if (!atual) throw typedError("Cliente (Tenant) não encontrado.", 404);
  const raw = atual.raw;

  const maxCnpjs = input.maxCnpjs ?? raw.maxCnpjs;
  const maxUsers = input.maxUsers ?? raw.maxUsers;
  const storageExtraQuotaMb = Math.max(
    0,
    input.storageExtraQuotaMb ?? raw.storageExtraQuotaMb + (input.adicionarStorageMb ?? 0),
  );
  const aiExtraQuotaMes = Math.max(
    0,
    input.aiExtraQuotaMes ?? raw.aiExtraQuotaMes + (input.adicionarAiQuota ?? 0),
  );

  await aplicarPatchTenant(input.tenantId, {
    maxCnpjs,
    maxUsers,
    storageExtraQuotaMb,
    aiExtraQuotaMes,
  });

  memoryTenantExtraQuota.set(input.tenantId, storageExtraQuotaMb);
  setMemoryTenantExtraAiQuota(input.tenantId, aiExtraQuotaMes);
  const memT = inMemoryTenants.get(input.tenantId);
  if (memT) {
    memT.maxCnpjs = maxCnpjs;
    memT.maxUsers = maxUsers;
  }

  // Sincroniza cotas globais de conta (maxCnpjs / maxUsers) nos demais CNPJs do mesmo TITULAR
  const titularMembro = raw.users.find((u) => u.role === "TITULAR" && u.ativo !== false);
  const tenantsSincronizados: string[] = [input.tenantId];
  if (titularMembro?.userId && (input.maxCnpjs !== undefined || input.maxUsers !== undefined)) {
    const siblingTids = await tenantIdsDoUsuario(titularMembro.userId, true);
    for (const sibId of siblingTids) {
      if (sibId === input.tenantId) continue;
      await aplicarPatchTenant(sibId, { maxCnpjs, maxUsers }).catch(() => undefined);
      const memSib = inMemoryTenants.get(sibId);
      if (memSib) {
        memSib.maxCnpjs = maxCnpjs;
        memSib.maxUsers = maxUsers;
      }
      tenantsSincronizados.push(sibId);
    }
  }

  let travaIaResetada = false;
  if (input.resetarTravaIaLicitacaoId) {
    resetarLimiteSilenciosoLicitacao(input.resetarTravaIaLicitacaoId);
    travaIaResetada = true;
  }

  await registrarAuditoriaAdm(
    "ATUALIZAR_COTAS_CLIENTE",
    "TENANT",
    input.tenantId,
    {
      maxCnpjs,
      maxUsers,
      storageExtraQuotaMb,
      aiExtraQuotaMes,
      travaIaResetada,
      tenantsSincronizados,
    },
    input.tenantId,
    {
      maxCnpjs: raw.maxCnpjs,
      maxUsers: raw.maxUsers,
      storageExtraQuotaMb: raw.storageExtraQuotaMb,
      aiExtraQuotaMes: raw.aiExtraQuotaMes,
    },
  );

  return {
    ok: true,
    tenantId: input.tenantId,
    maxCnpjs,
    maxUsers,
    storageExtraQuotaMb,
    aiExtraQuotaMes,
    travaIaResetada,
  };
}

/** Espelha a visão do cliente (somente leitura): Kanban, oportunidades, documentos e perfil do CNPJ. */
export async function obterEspelhamentoClienteSuperAdmin(tenantId: string) {
  const carregado = await carregarRawTenant(tenantId);
  if (!carregado) throw typedError("Cliente (Tenant) não encontrado.", 404);
  const raw = carregado.raw;
  const patrimonio = await carregarPatrimonio([tenantId], new Map([[tenantId, raw.razaoSocial]]));

  // Carrega catálogo de oportunidades elegíveis para espelhar exatamente o que o cliente vê
  const catalogoMap = new Map<string, ReturnType<typeof licitacaoResumo>>();
  const dbLics = await dbTry(() =>
    prisma.licitacao.findMany({
      orderBy: { dataAbertura: "asc" },
      take: 100,
    }),
  );
  if (Array.isArray(dbLics)) {
    for (const l of dbLics) {
      if (!memLicitacoesExcluidas.has(l.id)) catalogoMap.set(l.id, licitacaoResumo(l));
    }
  }
  for (const l of listInMemoryLicitacoes()) {
    if (!memLicitacoesExcluidas.has(l.id) && !catalogoMap.has(l.id)) {
      catalogoMap.set(l.id, licitacaoResumo(l));
    }
  }

  const todas = Array.from(catalogoMap.values());
  const configuracaoPendente = !raw.segmentos || raw.segmentos.length === 0;
  const filtradas = configuracaoPendente
    ? []
    : todas.filter((l) => {
        const matchUf = raw.brasilInteiro || raw.ufs.length === 0 || raw.ufs.includes(l.uf);
        const matchSeg = !l.segmentoMacro || raw.segmentos.includes(l.segmentoMacro);
        return matchUf && matchSeg;
      });
  const oportunidadesCatalogo = filtradas.slice(0, 50);

  return {
    ok: true,
    tenantId,
    configuracaoPendente,
    empresa: empresaPublica(raw),
    licitacoesKanban: patrimonio.licitacoes,
    oportunidadesCatalogo,
    kanbanPorColuna: patrimonio.kanbanPorColuna,
    documentos: patrimonio.documentos,
    portais: patrimonio.portais,
    impugnacoes: patrimonio.impugnacoes,
    precosSalvos: patrimonio.precosSalvos,
    somenteLeitura: true,
  };
}

