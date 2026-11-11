import { randomUUID } from "node:crypto";
import { LicitacaoStatus, ParecerIA, Role, type Licitacao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditActorContext, getInMemoryAuditLogs } from "@/server/audit";
import { getInMemoryAuthUserByEmail, upsertInMemoryAuthUser } from "@/server/auth";
import {
  AdminInjetarLicitacaoKanbanSchema,
  AdminUpsertAdminUserSchema,
  AdminUpsertLicitacaoSchema,
  type AdminUpsertAdminUserInput,
  type AdminUpsertLicitacaoInput,
} from "@/server/schemas/superadmin.schema";
import {
  getInMemoryLicitacaoById,
  insertInMemoryLicitacao,
  listInMemoryLicitacoes,
  setInMemoryTenantLicitacao,
  updateInMemoryLicitacao,
  type NovaLicitacaoData,
} from "@/server/services/licitacoes-store";
import { normalizarModalidade } from "@/server/schemas/modalidades.schema";
import { detectarPortalDisputaPorTextoEUrl } from "@/lib/regras-disputa-edital";
import { listarExecucoesIngestaoPncp } from "@/server/services/pncp-ingestao-diaria.service";
import { buscarESincronizarArquivosEditalPncp } from "@/server/services/oportunidades.service";
import {
  MASTER_EMAIL,
  carregarRawTenant,
  dbTry,
  getPrismaErrorCode,
  licitacaoResumo,
  memAdminUsers,
  memLicitacoesExcluidas,
  registrarAuditoriaAdm,
  typedError,
  usuarioPublico,
  type LicitacaoResumoInput,
  type MemUser,
  type UsuarioPublico,
} from "./shared";

/* =========================================================================
   Catálogo Global de Licitações & Injeção Manual (/admin/licitacoes)
========================================================================= */

export async function listarLicitacoesGlobaisSuperAdmin(busca?: string) {
  const termo = busca?.trim().toLowerCase();
  const out = new Map<string, Licitacao | LicitacaoResumoInput>();
  const rows = await dbTry(() =>
    prisma.licitacao.findMany({
      where: termo
        ? {
            OR: [
              { numeroEdital: { contains: termo, mode: "insensitive" } },
              { orgaoNome: { contains: termo, mode: "insensitive" } },
              { miniResumo: { contains: termo, mode: "insensitive" } },
              { idPncp: { contains: termo, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  );
  if (Array.isArray(rows)) for (const r of rows) out.set(r.id, r);
  for (const l of listInMemoryLicitacoes()) {
    if (memLicitacoesExcluidas.has(l.id) || out.has(l.id)) continue;
    if (
      termo &&
      !`${l.numeroEdital} ${l.orgaoNome} ${l.miniResumo} ${l.idPncp}`
        .toLowerCase()
        .includes(termo)
    ) {
      continue;
    }
    out.set(l.id, l);
  }
  return Array.from(out.values()).slice(0, 500).map(licitacaoResumo);
}

interface PncpCoordsParsed {
  cnpj: string;
  ano: string;
  seq: string;
  paddedIdPncp: string;
  shortIdPncp: string;
  linkWeb: string;
}

function extrairReferenciasLicitacaoInput(rawRef: string): {
  rawKey: string;
  internalIdCandidate: string | null;
  coords: PncpCoordsParsed | null;
  pncpCandidates: string[];
} {
  const rawKey = rawRef.trim();
  const oppMatch = rawKey.match(/\/oportunidades\/([^/?#]+)/i);
  const internalIdCandidate = oppMatch ? decodeURIComponent(oppMatch[1]) : null;

  let cnpj: string | null = null;
  let ano: string | null = null;
  let seqNum: number | null = null;

  const urlMatch = rawKey.match(
    /(?:editais|orgaos)\/(\d{14})\/(?:compras\/)?(\d{4})\/(\d+)/i,
  );
  if (urlMatch) {
    cnpj = urlMatch[1];
    ano = urlMatch[2];
    seqNum = parseInt(urlMatch[3], 10);
  } else {
    const codeMatch = rawKey.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
    if (codeMatch) {
      cnpj = codeMatch[1];
      seqNum = parseInt(codeMatch[3], 10);
      ano = codeMatch[4];
    }
  }

  let coords: PncpCoordsParsed | null = null;
  const pncpCandidates = new Set<string>([rawKey]);
  if (internalIdCandidate) pncpCandidates.add(internalIdCandidate);

  if (cnpj && ano && seqNum !== null && Number.isFinite(seqNum) && seqNum > 0) {
    const seq = String(seqNum);
    const padded = seq.padStart(6, "0");
    const paddedIdPncp = `${cnpj}-1-${padded}/${ano}`;
    const shortIdPncp = `${cnpj}-1-${seq}/${ano}`;
    const linkWeb = `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
    coords = { cnpj, ano, seq, paddedIdPncp, shortIdPncp, linkWeb };
    pncpCandidates.add(paddedIdPncp);
    pncpCandidates.add(shortIdPncp);
    pncpCandidates.add(linkWeb);
  }

  return {
    rawKey,
    internalIdCandidate,
    coords,
    pncpCandidates: Array.from(pncpCandidates),
  };
}

interface PncpApiCompraPayload {
  numeroControlePNCP?: string | null;
  numeroCompra?: string | number | null;
  anoCompra?: number | null;
  modalidadeId?: number | null;
  modalidadeNome?: string | null;
  objetoCompra?: string | null;
  informacaoComplementar?: string | null;
  valorTotalEstimado?: number | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataPublicacaoPncp?: string | null;
  dataAtualizacao?: string | null;
  srp?: boolean | null;
  linkSistemaOrigem?: string | null;
  linkProcessoEletronico?: string | null;
  usuarioNome?: string | null;
  orgaoEntidade?: {
    cnpj?: string | null;
    razaoSocial?: string | null;
    esferaId?: string | null;
    poderId?: string | null;
  } | null;
  unidadeOrgao?: {
    ufSigla?: string | null;
    municipioNome?: string | null;
    nomeUnidade?: string | null;
  } | null;
}

async function consultarCompraPncpPorCoordenadas(
  coords: PncpCoordsParsed,
): Promise<PncpApiCompraPayload | null> {
  const urls = [
    `https://pncp.gov.br/api/consulta/v1/orgaos/${coords.cnpj}/compras/${coords.ano}/${coords.seq}`,
    `https://pncp.gov.br/pncp-api/v1/orgaos/${coords.cnpj}/compras/${coords.ano}/${coords.seq}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as PncpApiCompraPayload | null;
      if (json && typeof json === "object" && (json.objetoCompra || json.numeroControlePNCP || json.orgaoEntidade)) {
        return json;
      }
    } catch {
      // tenta próximo endpoint oficial
    }
  }
  return null;
}

export async function injetarLicitacaoNoKanbanClienteSuperAdmin(rawInput: {
  licitacaoId: string;
  tenantId: string;
  statusKanban?: string;
  notas?: string;
}) {
  const input = AdminInjetarLicitacaoKanbanSchema.parse(rawInput);
  const tenant = await carregarRawTenant(input.tenantId);
  if (!tenant) throw typedError("Cliente (Tenant) não encontrado.", 404);

  const refs = extrairReferenciasLicitacaoInput(input.licitacaoId);
  if (
    memLicitacoesExcluidas.has(refs.rawKey) ||
    (refs.internalIdCandidate && memLicitacoesExcluidas.has(refs.internalIdCandidate))
  ) {
    throw typedError("Licitação não encontrada.", 404);
  }

  const orConditions = [
    { id: refs.rawKey },
    ...(refs.internalIdCandidate ? [{ id: refs.internalIdCandidate }] : []),
    { idPncp: { in: refs.pncpCandidates } },
    { numeroControlePNCP: { in: refs.pncpCandidates } },
    ...(refs.coords ? [{ linkPncp: refs.coords.linkWeb }] : []),
  ];

  const licitacaoDb = await dbTry(() =>
    prisma.licitacao.findFirst({
      where: { OR: orConditions },
      select: { id: true },
    }),
  );

  let licitacaoMem =
    getInMemoryLicitacaoById(refs.rawKey) ||
    (refs.internalIdCandidate ? getInMemoryLicitacaoById(refs.internalIdCandidate) : null) ||
    listInMemoryLicitacoes().find(
      (l) =>
        refs.pncpCandidates.includes(l.id) ||
        refs.pncpCandidates.includes(l.idPncp) ||
        (l.numeroControlePNCP ? refs.pncpCandidates.includes(l.numeroControlePNCP) : false) ||
        (l.linkPncp ? refs.pncpCandidates.includes(l.linkPncp) : false),
    ) ||
    null;

  let resolvedLicitacaoId = licitacaoDb?.id ?? licitacaoMem?.id ?? null;
  if (resolvedLicitacaoId && memLicitacoesExcluidas.has(resolvedLicitacaoId)) {
    throw typedError("Licitação não encontrada.", 404);
  }

  let hidratadaPncp = false;
  if (!resolvedLicitacaoId && refs.coords) {
    const payload = await consultarCompraPncpPorCoordenadas(refs.coords);
    if (!payload) {
      throw typedError(
        "Licitação não encontrada no catálogo local nem na API oficial do PNCP.",
        404,
      );
    }

    const numeroControle =
      payload.numeroControlePNCP?.trim() || refs.coords.paddedIdPncp;
    const anoCompra = payload.anoCompra ?? Number(refs.coords.ano);
    const numCompra = payload.numeroCompra
      ? String(payload.numeroCompra)
      : refs.coords.seq;
    const numeroEdital = `${numCompra}/${anoCompra}`;
    const normMod = normalizarModalidade(
      payload.modalidadeId ?? payload.modalidadeNome ?? 6,
    );
    const resumoCompleto =
      (payload.objetoCompra || payload.informacaoComplementar || "").trim() ||
      `Contratação PNCP ${numeroEdital}`;
    const miniResumo =
      resumoCompleto.length > 140
        ? `${resumoCompleto.slice(0, 137).trim()}...`
        : resumoCompleto;

    const parseDt = (v?: string | null, fb?: Date) => {
      if (v) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return fb ?? new Date(Date.now() + 7 * 86400000);
    };
    const dataPub = payload.dataPublicacaoPncp
      ? parseDt(payload.dataPublicacaoPncp)
      : new Date();
    const dataEnc = payload.dataEncerramentoProposta
      ? parseDt(payload.dataEncerramentoProposta)
      : null;
    const dataAbertura = parseDt(
      payload.dataAberturaProposta || payload.dataEncerramentoProposta || payload.dataPublicacaoPncp,
    );
    const portalDetectado =
      detectarPortalDisputaPorTextoEUrl({
        linkSistemaOrigem: payload.linkSistemaOrigem ?? null,
        linkProcessoEletronico: payload.linkProcessoEletronico ?? null,
        usuarioNome: payload.usuarioNome ?? null,
        portalAtual: null,
      }).portal || "PNCP";

    const orgaoCnpj =
      (payload.orgaoEntidade?.cnpj || refs.coords.cnpj).replace(/\D/g, "") ||
      refs.coords.cnpj;
    const orgaoNome =
      payload.orgaoEntidade?.razaoSocial?.trim() ||
      payload.unidadeOrgao?.nomeUnidade?.trim() ||
      `Órgão CNPJ ${orgaoCnpj}`;
    const uf =
      (payload.unidadeOrgao?.ufSigla || "GO").trim().toUpperCase().slice(0, 2) ||
      "GO";
    const isPresencial =
      normMod.codigo === 4 ||
      normMod.codigo === 7 ||
      /presencial/i.test(`${payload.modalidadeNome || ""} ${resumoCompleto}`);

    const dadosCriacao = {
      idPncp: numeroControle,
      numeroEdital,
      orgaoNome,
      orgaoCnpj,
      uf: uf.length === 2 ? uf : "GO",
      municipio: payload.unidadeOrgao?.municipioNome ?? null,
      esfera: payload.orgaoEntidade?.esferaId ?? null,
      poder: payload.orgaoEntidade?.poderId ?? null,
      modalidade: normMod.nome,
      modalidadeCodigo: normMod.codigo,
      numeroControlePNCP: numeroControle,
      portalDisputa: portalDetectado,
      miniResumo,
      resumo: resumoCompleto,
      valorEstimado: Math.max(0, Number(payload.valorTotalEstimado ?? 0)),
      dataAbertura,
      dataEncerramentoProposta: dataEnc ?? dataAbertura,
      dataPublicacaoPncp: dataPub,
      dataUltimaAtualizacao: payload.dataAtualizacao
        ? parseDt(payload.dataAtualizacao)
        : new Date(),
      loteUnico: payload.srp !== true,
      precoPorLote: payload.srp === true,
      isPresencial,
      linkPncp: refs.coords.linkWeb,
      linkSistemaOrigem:
        payload.linkSistemaOrigem || payload.linkProcessoEletronico || null,
      parecerIA: ParecerIA.AVALIAR,
      status: LicitacaoStatus.PENDENTE,
    };

    let criadaDb: { id: string } | null = null;
    try {
      criadaDb = await prisma.licitacao.create({
        data: dadosCriacao,
        select: { id: true },
      });
    } catch (err: unknown) {
      if (getPrismaErrorCode(err) === "P2002") {
        const existente = await prisma.licitacao
          .findFirst({
            where: {
              OR: [
                { idPncp: numeroControle },
                { numeroControlePNCP: numeroControle },
                { linkPncp: refs.coords.linkWeb },
              ],
            },
            select: { id: true },
          })
          .catch(() => null);
        if (existente) {
          criadaDb = existente;
        } else {
          throw typedError("Conflito de unicidade ao registrar licitação do PNCP.", 409);
        }
      } else {
        // Fallback offline para testes/modo sem Postgres
        criadaDb = null;
      }
    }
    if (criadaDb) {
      resolvedLicitacaoId = criadaDb.id;
    } else {
      const memCriada = insertInMemoryLicitacao({
        ...dadosCriacao,
        segmentoMacro: null,
        subcategorias: null,
        justificativaIA: null,
        tipoSistemaCodigo: null,
        atestadosExigidos: null,
        motivoRecusa: null,
        quantidadeLotes: 1,
        distanciaGoianiaKm: null,
        hashCritico: null,
        valorArrematado: null,
        responsavelId: null,
      });
      resolvedLicitacaoId = memCriada.id;
      licitacaoMem = memCriada;
    }
    hidratadaPncp = true;
  }

  if (!resolvedLicitacaoId) {
    throw typedError("Licitação não encontrada.", 404);
  }

  // Hidrata anexos/arquivos do PNCP com fallback seguro caso o endpoint de anexos oscile
  if (hidratadaPncp || refs.coords) {
    await buscarESincronizarArquivosEditalPncp(resolvedLicitacaoId).catch(() => undefined);
  }

  const validStatuses = Object.values(LicitacaoStatus) as string[];
  const status: LicitacaoStatus = validStatuses.includes(input.statusKanban)
    ? (input.statusKanban as LicitacaoStatus)
    : LicitacaoStatus.PENDENTE;

  const salvo = await dbTry(() =>
    prisma.tenantLicitacao.upsert({
      where: {
        tenantId_licitacaoId: {
          tenantId: input.tenantId,
          licitacaoId: resolvedLicitacaoId!,
        },
      },
      update: { statusKanban: status, notas: input.notas ?? null },
      create: {
        tenantId: input.tenantId,
        licitacaoId: resolvedLicitacaoId!,
        statusKanban: status,
        notas: input.notas ?? null,
      },
    }),
  );
  if (!salvo) {
    setInMemoryTenantLicitacao(input.tenantId, resolvedLicitacaoId, {
      statusKanban: status,
      notas: input.notas ?? null,
    });
  }

  await registrarAuditoriaAdm(
    "INJETAR_LICITACAO_KANBAN",
    "TENANT_LICITACAO",
    `${input.tenantId}__${resolvedLicitacaoId}`,
    {
      statusKanban: status,
      hidratadaPncp,
      referenciaOriginal: refs.rawKey,
    },
    input.tenantId,
  );
  return {
    ok: true,
    tenantId: input.tenantId,
    licitacaoId: resolvedLicitacaoId,
    statusKanban: status,
    hidratadaPncp,
  };
}

export async function salvarLicitacaoManualSuperAdmin(
  rawInput: AdminUpsertLicitacaoInput,
) {
  const input = AdminUpsertLicitacaoSchema.parse(rawInput);
  const idPncp = input.idPncp || `MANUAL-${randomUUID().slice(0, 12).toUpperCase()}`;
  const abertura = new Date(input.dataAbertura);
  if (Number.isNaN(abertura.getTime())) throw typedError("Data de abertura inválida.", 400);
  const encerramento = input.dataEncerramentoProposta
    ? new Date(input.dataEncerramentoProposta)
    : null;
  if (encerramento && Number.isNaN(encerramento.getTime())) {
    throw typedError("Data de encerramento inválida.", 400);
  }

  const dados = {
    idPncp,
    numeroEdital: input.numeroEdital,
    orgaoNome: input.orgaoNome,
    orgaoCnpj: input.orgaoCnpj,
    uf: input.uf.toUpperCase(),
    municipio: input.municipio ?? null,
    modalidade: input.modalidade,
    segmentoMacro: input.segmentoMacro ?? null,
    portalDisputa: input.portalDisputa ?? null,
    miniResumo: input.miniResumo,
    resumo: input.resumo,
    valorEstimado: input.valorEstimado,
    dataAbertura: abertura,
    dataEncerramentoProposta: encerramento,
    linkPncp: input.linkPncp ?? null,
    linkSistemaOrigem: input.linkSistemaOrigem ?? null,
    parecerIA: input.parecerIA as ParecerIA,
    dataPublicacaoPncp: new Date(),
  };

  let licitacao: Licitacao | null = null;
  try {
    licitacao = input.id
      ? await prisma.licitacao.update({ where: { id: input.id }, data: dados })
      : await prisma.licitacao.create({ data: dados });
  } catch (err: unknown) {
    if (getPrismaErrorCode(err) === "P2002") {
      throw typedError("Já existe uma licitação com este identificador PNCP.", 400);
    }
    licitacao = null;
  }

  if (!licitacao) {
    const memPayload: NovaLicitacaoData = {
      ...dados,
      esfera: null,
      poder: null,
      justificativaIA: null,
      tipoSistemaCodigo: null,
      atestadosExigidos: null,
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      hashCritico: null,
      valorArrematado: null,
      responsavelId: null,
      modalidadeCodigo: null,
      numeroControlePNCP: null,
      subcategorias: null,
      dataUltimaAtualizacao: new Date(),
      status: LicitacaoStatus.PENDENTE,
    };
    const atualizada =
      input.id && updateInMemoryLicitacao(input.id, memPayload)
        ? getInMemoryLicitacaoById(input.id)
        : insertInMemoryLicitacao(memPayload);
    if (!atualizada) throw typedError("Falha ao salvar licitação manual.", 500);
    licitacao = atualizada;
  }

  let injetada = false;
  if (input.injetarParaTenantId) {
    await injetarLicitacaoNoKanbanClienteSuperAdmin({
      licitacaoId: licitacao.id,
      tenantId: input.injetarParaTenantId,
      statusKanban: input.statusKanbanInicial,
      notas: "Licitação inserida manualmente pela equipe ADM.",
    });
    injetada = true;
  }

  await registrarAuditoriaAdm(
    input.id ? "EDITAR_LICITACAO_MANUAL" : "CRIAR_LICITACAO_MANUAL",
    "LICITACAO",
    licitacao.id,
    {
      numeroEdital: input.numeroEdital,
      injetarParaTenantId: input.injetarParaTenantId ?? null,
    },
  );

  return { ok: true, licitacao: licitacaoResumo(licitacao), injetada };
}

export async function excluirLicitacaoGlobalSuperAdmin(id: string) {
  const memExiste = Boolean(getInMemoryLicitacaoById(id)) && !memLicitacoesExcluidas.has(id);
  const removida = await dbTry(() => prisma.licitacao.delete({ where: { id } }));
  if (!removida && !memExiste) {
    throw typedError("Licitação não encontrada.", 404);
  }
  memLicitacoesExcluidas.add(id);
  await registrarAuditoriaAdm("EXCLUIR_LICITACAO_GLOBAL", "LICITACAO", id);
  return { ok: true, id, removidaDoBanco: Boolean(removida) };
}

export async function listarExecucoesPncpSuperAdmin(limite = 15) {
  return listarExecucoesIngestaoPncp(limite);
}

/* =========================================================================
   Equipe ADM & Logs Administrativos (/admin/sistema)
========================================================================= */

export async function listarUsuariosAdminSuperAdmin(): Promise<UsuarioPublico[]> {
  const out = new Map<string, UsuarioPublico>();
  const rows = await dbTry(() =>
    prisma.user.findMany({
      where: { OR: [{ isSuperAdmin: true }, { role: "SUPERADMIN" }] },
      orderBy: { createdAt: "asc" },
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
  if (Array.isArray(rows)) for (const r of rows) out.set(r.email, usuarioPublico(r));
  for (const m of memAdminUsers.values()) {
    if (!out.has(m.email)) out.set(m.email, usuarioPublico(m));
  }
  if (!out.has(MASTER_EMAIL)) {
    out.set(
      MASTER_EMAIL,
      usuarioPublico({
        id: "usr_admin_master",
        name: "Vitor Henrique",
        email: MASTER_EMAIL,
        role: "SUPERADMIN",
        ativo: true,
        isSuperAdmin: true,
        adminRole: "SUPERADMIN_MASTER",
        sessionVersion: 1,
      }),
    );
  }
  return Array.from(out.values());
}

export async function salvarUsuarioAdminSuperAdmin(rawInput: AdminUpsertAdminUserInput) {
  const input = AdminUpsertAdminUserSchema.parse(rawInput);
  const email = input.email.trim().toLowerCase();
  const actor = getAuditActorContext();

  if (actor?.usuarioId && input.id === actor.usuarioId && input.ativo === false) {
    throw typedError("Você não pode desativar sua própria conta administrativa.", 400);
  }

  const dados = {
    name: input.name,
    email,
    ...(input.telefone !== undefined ? { telefone: input.telefone || null } : {}),
    role: Role.SUPERADMIN,
    isSuperAdmin: true,
    adminRole: input.adminRole,
    ativo: input.ativo,
  };

  let usuarioDb: UsuarioPublico | null = null;
  let criado = false;
  let passwordHashGerado: string | null = null;

  try {
    const { default: bcrypt } = await import("bcryptjs");
    if (input.password) {
      passwordHashGerado = await bcrypt.hash(input.password, 10);
    }

    if (input.id) {
      const existenteDb = await prisma.user.findUnique({ where: { id: input.id } });
      if (existenteDb) {
        if (!existenteDb.isSuperAdmin && existenteDb.role !== Role.SUPERADMIN) {
          throw typedError("Usuário informado não pertence à equipe administrativa.", 400);
        }
        if (existenteDb.email.toLowerCase() !== email) {
          const dup = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (dup && dup.id !== input.id) {
            throw typedError("Já existe um usuário cadastrado com este e-mail.", 400);
          }
        }
        const upd = await prisma.user.update({
          where: { id: input.id },
          data: {
            ...dados,
            ...(passwordHashGerado ? { passwordHash: passwordHashGerado } : {}),
            ...(input.ativo === false ? { sessionVersion: { increment: 1 } } : {}),
          },
        });
        usuarioDb = usuarioPublico(upd);
      } else if (!memAdminUsers.has(input.id)) {
        // Caso o Postgres esteja ativo, o ID precisa existir (no modo memória, cai abaixo)
        const anyDbUser = await prisma.user.findFirst({ select: { id: true } }).catch(() => null);
        if (anyDbUser) {
          throw typedError("Administrador não encontrado.", 404);
        }
      }
    } else {
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        if (!existingByEmail.isSuperAdmin && existingByEmail.role !== Role.SUPERADMIN) {
          throw typedError(
            "Já existe uma conta de cliente com este e-mail. Use outro e-mail para a equipe ADM.",
            400,
          );
        }
        const upd = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            ...dados,
            ...(passwordHashGerado ? { passwordHash: passwordHashGerado } : {}),
            ...(input.ativo === false ? { sessionVersion: { increment: 1 } } : {}),
          },
        });
        usuarioDb = usuarioPublico(upd);
      } else {
        criado = true;
        const hash =
          passwordHashGerado || (await bcrypt.hash(`${randomUUID()}${randomUUID()}`, 10));
        passwordHashGerado = hash;
        const created = await prisma.user.create({
          data: { ...dados, passwordHash: hash },
        });
        usuarioDb = usuarioPublico(created);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && "statusCode" in err) throw err;
    if (getPrismaErrorCode(err) === "P2002") {
      throw typedError("Já existe um usuário cadastrado com este e-mail.", 400);
    }
    usuarioDb = null;
  }

  let usuarioFinal: UsuarioPublico;
  if (usuarioDb) {
    usuarioFinal = usuarioDb;
  } else {
    if (input.id) {
      const byId = memAdminUsers.get(input.id);
      if (!byId) throw typedError("Administrador não encontrado.", 404);
      if (!byId.isSuperAdmin && byId.role !== "SUPERADMIN") {
        throw typedError("Usuário informado não pertence à equipe administrativa.", 400);
      }
      const dupMem = Array.from(memAdminUsers.values()).find(
        (u) => u.id !== input.id && u.email.toLowerCase() === email,
      );
      if (dupMem) {
        throw typedError("Já existe um usuário cadastrado com este e-mail.", 400);
      }
      const next: MemUser = {
        ...byId,
        ...dados,
        role: "SUPERADMIN",
        sessionVersion: input.ativo === false ? byId.sessionVersion + 1 : byId.sessionVersion,
      };
      memAdminUsers.set(next.id, next);
      usuarioFinal = usuarioPublico(next);
    } else {
      const anterior = Array.from(memAdminUsers.values()).find(
        (u) => u.email.toLowerCase() === email,
      );
      if (!anterior) criado = true;
      const next: MemUser = {
        id: anterior?.id || `adm_${randomUUID()}`,
        sessionVersion:
          input.ativo === false
            ? (anterior?.sessionVersion || 1) + 1
            : anterior?.sessionVersion || 1,
        criadoEm: anterior?.criadoEm || new Date(),
        ...dados,
        role: "SUPERADMIN",
      };
      memAdminUsers.set(next.id, next);
      usuarioFinal = usuarioPublico(next);
    }
  }

  // Sincroniza cache de autenticação em memória quando relevante
  const authMem = getInMemoryAuthUserByEmail(email);
  if (authMem || passwordHashGerado || input.telefone !== undefined) {
    upsertInMemoryAuthUser({
      id: usuarioFinal.id,
      name: usuarioFinal.name,
      email: usuarioFinal.email,
      role: "SUPERADMIN",
      ativo: usuarioFinal.ativo,
      isSuperAdmin: true,
      adminRole: (usuarioFinal.adminRole ?? "ADMIN_OPERACIONAL") as
        | "SUPERADMIN_MASTER"
        | "ADMIN_OPERACIONAL"
        | "SUPORTE_N1",
      sessionVersion: usuarioFinal.sessionVersion,
      passwordHash: passwordHashGerado ?? authMem?.passwordHash ?? "",
      telefone: usuarioFinal.telefone ?? null,
      activeTenantId: null,
      cnpj: null,
      plano: null,
      tenantRole: null,
    });
  }

  // Se criou novo administrador sem definir senha inicial, dispara convite de definição de senha
  if (criado && !input.password) {
    await import("@/server/services/esqueci-senha.service")
      .then((m) =>
        m.solicitarRecuperacaoSenha(usuarioFinal.email, "admin-portal", {
          bypassRateLimit: true,
        }),
      )
      .catch(() => undefined);
  }

  await registrarAuditoriaAdm(
    input.id ? "EDITAR_USUARIO_ADMIN" : "CRIAR_USUARIO_ADMIN",
    "USER",
    usuarioFinal.id,
    { email, adminRole: input.adminRole, ativo: input.ativo },
  );
  return { ok: true, usuario: usuarioFinal };
}

export interface AdminAuditLogRow {
  id: string;
  ocorridoEm: Date;
  usuarioNome: string | null;
  acao: string;
  entidadeTipo: string;
  entidadeId: string;
  tenantId: string | null;
  antes: unknown;
  depois: unknown;
}

export async function listarLogsAdministrativosSuperAdmin(
  limite = 100,
): Promise<AdminAuditLogRow[]> {
  const out: AdminAuditLogRow[] = [];
  const rows = await dbTry(() =>
    prisma.auditLog.findMany({
      where: { acao: { startsWith: "ADMIN_" } },
      orderBy: { ocorridoEm: "desc" },
      take: limite,
    }),
  );
  if (Array.isArray(rows)) out.push(...rows);
  const ids = new Set(out.map((o) => o.id));
  for (const l of getInMemoryAuditLogs()) {
    if (String(l.acao).startsWith("ADMIN_") && !ids.has(l.id)) {
      out.push({
        id: l.id,
        ocorridoEm: l.ocorridoEm,
        usuarioNome: l.usuarioNome ?? null,
        acao: l.acao,
        entidadeTipo: l.entidadeTipo,
        entidadeId: l.entidadeId,
        tenantId: l.tenantId ?? null,
        antes: l.antes ?? null,
        depois: l.depois ?? null,
      });
    }
  }
  return out
    .sort((a, b) => new Date(b.ocorridoEm).getTime() - new Date(a.ocorridoEm).getTime())
    .slice(0, limite);
}

