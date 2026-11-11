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
  tenantIdsDoUsuario,
  typedError,
  usuarioPublico,
  verificarCnpjDuplicado,
  type MemDispute,
  type MemUser,
  type RawTenant,
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
    const tids = await tenantIdsDoUsuario(tenantIdOrUserId);
    if (tids[0]) carregado = await carregarRawTenant(tids[0]);
  }
  if (!carregado) throw typedError("Cliente não encontrado.", 404);

  const raw = carregado.raw;
  const titularMembro = raw.users.find((u) => u.role === "TITULAR") || raw.users[0];
  const titularId = titularMembro?.userId ?? null;

  // Todos os CNPJs (tenants) pertencentes ao mesmo titular
  const empresasRaw: RawTenant[] = [raw];
  if (titularId) {
    const tids = await tenantIdsDoUsuario(titularId);
    for (const tid of tids) {
      if (tid === raw.id) continue;
      const outro = await carregarRawTenant(tid);
      if (outro) empresasRaw.push(outro.raw);
    }
  }
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

  const [patrimonio, ia, affiliateNomes, todasDisputas] = await Promise.all([
    carregarPatrimonio(tenantIds, nomes),
    agregarIaPorTenant(),
    listarAfiliadoNomesMap(),
    listarDisputasCnpjSuperAdmin(),
  ]);

  const usosIa = tenantIds.reduce((a, id) => a + (ia.get(id)?.usadas || 0), 0);
  const item = construirItemTenant(
    raw,
    ia.get(raw.id) || { usadas: 0, gastoDia: 0, gastoMes: 0 },
    affiliateNomes,
  );

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
    cotas: {
      maxCnpjs: raw.maxCnpjs,
      maxUsers: raw.maxUsers,
      storageBaseMb: item.cotaBaseMb,
      storageExtraQuotaMb: item.cotaExtraMb,
      storageTotalMb: item.cotaTotalMb,
      storageUsadoMb: item.espacoUsadoMb,
      aiExtraQuotaMes: raw.aiExtraQuotaMes,
      aiUsadasMes: usosIa,
    },
    financeiro: {
      plano: raw.plano,
      billingStatus: item.billingStatus,
      valorMensalidade: item.valorMensalidade,
      trialFim: raw.trialFim ?? null,
      vencimentoAssinatura: raw.vencimentoAssinatura ?? null,
      ultimoPagamentoEm: raw.ultimoPagamentoEm ?? null,
      cupomCodigo: raw.cupomCodigo ?? null,
      affiliateId: raw.affiliateId ?? null,
    },
    notasInternasAdm: raw.notasInternasAdm ?? null,
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

  // Ativação/inativação do cliente: replica nos tenants dos quais ele é TITULAR
  const tenantsAfetados = await tenantIdsDoUsuario(input.userId, true);
  if (input.ativo !== undefined) {
    for (const tid of tenantsAfetados) {
      await aplicarPatchTenant(tid, { ativo: input.ativo }).catch(() => undefined);
    }
  }
  if (input.notasInternasAdm !== undefined && tenantsAfetados[0]) {
    await aplicarPatchTenant(tenantsAfetados[0], {
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
    },
    tenantsAfetados[0] ?? null,
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

  if (tenantId) {
    const { raw } = await aplicarPatchTenant(tenantId, {
      ...patch,
      cnpj: input.cnpj,
    });
    cnpjNormalizado = raw.cnpj;
  } else {
    criada = true;
    cnpjNormalizado = await verificarCnpjDuplicado(input.cnpj);
    const owner = input.ownerUserId ? await carregarUsuario(input.ownerUserId) : null;
    const datas = datasPorStatus(input.billingStatus ?? "TRIAL");
    const planoFinal = (input.plano ?? "BASICO") as PlanoAssinatura;
    const statusFinal = (input.billingStatus ?? "TRIAL") as TenantBillingStatus;

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
            trialFim: datas.trialFim,
            vencimentoAssinatura: datas.vencimentoAssinatura,
            ultimoPagamentoEm: datas.ultimoPagamentoEm ?? null,
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
        trialFim: datas.trialFim,
        vencimentoAssinatura: datas.vencimentoAssinatura,
        ultimoPagamentoEm: datas.ultimoPagamentoEm ?? null,
        segmentos: input.segmentos ?? [],
        ufs: input.ufs ?? [],
        brasilInteiro: input.brasilInteiro ?? true,
        maxCnpjs: 1,
        maxUsers: 1,
        ativo: input.ativo ?? true,
        criadoEm: agora,
        updatedAt: agora,
      });
      if (input.telefone) memTenantExtras.set(tenantId, { telefone: input.telefone });
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
    { cnpj: cnpjNormalizado, razaoSocial: input.razaoSocial },
    tenantId,
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

  let travaIaResetada = false;
  if (input.resetarTravaIaLicitacaoId) {
    resetarLimiteSilenciosoLicitacao(input.resetarTravaIaLicitacaoId);
    travaIaResetada = true;
  }

  await registrarAuditoriaAdm(
    "ATUALIZAR_COTAS_CLIENTE",
    "TENANT",
    input.tenantId,
    { maxCnpjs, maxUsers, storageExtraQuotaMb, aiExtraQuotaMes, travaIaResetada },
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
  const filtradas = todas.filter((l) => {
    const matchUf = raw.brasilInteiro || raw.ufs.length === 0 || raw.ufs.includes(l.uf);
    const matchSeg =
      raw.segmentos.length === 0 ||
      !l.segmentoMacro ||
      raw.segmentos.includes(l.segmentoMacro);
    return matchUf && matchSeg;
  });
  const oportunidadesCatalogo = (filtradas.length > 0 ? filtradas : todas).slice(0, 50);

  return {
    ok: true,
    tenantId,
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

