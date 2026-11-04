import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import {
  type AtualizarNotaInput,
  type CriarNotaInput,
  type LicitacaoNotaItem,
  type NotasListQuery,
  atualizarNotaSchema,
  criarNotaSchema,
  notasListQuerySchema,
} from "@/server/schemas/licitacao-nota.schema";
import {
  deleteInMemoryLicitacaoNota,
  getInMemoryLicitacaoNota,
  getInMemoryUsuario,
  insertInMemoryLicitacaoNota,
  listInMemoryLicitacaoNotas,
  listInMemoryUsuarios,
  updateInMemoryLicitacaoNota,
} from "./licitacoes-store";
import { notificarMencaoNota } from "./notificacoes.service";
import {
  getOportunidadeById,
  type OportunidadesActorContext,
} from "./oportunidades.service";

export class LicitacaoNotasError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "LicitacaoNotasError";
    this.code = code;
    this.status = status;
  }
}

function mapRecordToNotaItem(
  raw: any,
  viewer?: RbacUser | null,
): LicitacaoNotaItem & {
  mencoesIds: string[];
  mencoesNomes: string[];
  editadoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
} {
  const autorId = String(raw.autorId);
  const mencionadosIds = Array.isArray(raw.mencionadosIds)
    ? raw.mencionadosIds.map((id: unknown) => String(id))
    : Array.isArray(raw.mencoesIds)
      ? raw.mencoesIds.map((id: unknown) => String(id))
      : [];
  const mencoesNomes = Array.isArray(raw.mencoesNomes)
    ? raw.mencoesNomes.map((n: unknown) => String(n))
    : [];
  const editadoEm = raw.editadoEm ? new Date(raw.editadoEm) : null;
  const criadaEm = raw.criadaEm
    ? new Date(raw.criadaEm)
    : raw.criadoEm
      ? new Date(raw.criadoEm)
      : new Date();
  const atualizadaEm = raw.atualizadaEm
    ? new Date(raw.atualizadaEm)
    : raw.atualizadoEm
      ? new Date(raw.atualizadoEm)
      : criadaEm;

  const viewerRole = String(viewer?.role || "").toUpperCase();
  const podeEditar = Boolean(viewer?.id && viewer.id === autorId);
  const podeExcluir = Boolean(
    viewer?.id && (viewerRole === "DIRETORIA" || viewerRole === "SUPERADMIN"),
  );

  return {
    id: String(raw.id),
    licitacaoId: String(raw.licitacaoId),
    tenantId: raw.tenantId ?? null,
    autorId,
    autorNome: String(raw.autorNome || "Colaborador"),
    autorCargo: String(raw.autorCargo || "ANALISTA_COMERCIAL"),
    texto: String(raw.texto ?? ""),
    mencionadosIds,
    mencoesIds: mencionadosIds,
    mencoesNomes,
    editada: Boolean(raw.editada ?? editadoEm !== null),
    editadoEm,
    criadaEm,
    criadoEm: criadaEm,
    atualizadaEm,
    atualizadoEm: atualizadaEm,
    podeEditar,
    podeExcluir,
  };
}

async function ensureLicitacaoNotaTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "licitacao_nota" (
        "id" TEXT NOT NULL,
        "licitacaoId" TEXT NOT NULL,
        "tenantId" TEXT,
        "texto" TEXT NOT NULL,
        "mencoesIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "mencoesNomes" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "autorId" TEXT NOT NULL,
        "autorNome" TEXT NOT NULL,
        "autorEmail" TEXT,
        "autorCargo" TEXT,
        "editadoEm" TIMESTAMP(3),
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "licitacao_nota_pkey" PRIMARY KEY ("id")
      );
    `);
  } catch {
    // Silencioso se offline
  }
}

/**
 * Valida menções contra os membros ativos da equipe do Tenant e garante que
 * o nome (`@Nome Completo` ou `@PrimeiroNome`) apareça no texto da nota.
 */
async function resolverMencoesDaEquipe(
  texto: string,
  candidatosIds: string[],
  autorId: string,
  tenantId?: string | null,
): Promise<{ mencoesIds: string[]; mencoesNomes: string[] }> {
  const usuariosEquipe: Array<{ id: string; name: string }> = [];

  for (const u of listInMemoryUsuarios(tenantId)) {
    if (u && u.id && u.ativo !== false) {
      usuariosEquipe.push({
        id: String(u.id),
        name: String(u.name || "Colaborador"),
      });
    }
  }

  try {
    const dbUsers = await prisma.user.findMany({
      where: {
        ativo: true,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, name: true },
    });
    for (const u of dbUsers) {
      if (!usuariosEquipe.some((existing) => existing.id === u.id)) {
        usuariosEquipe.push({
          id: u.id,
          name: u.name || "Colaborador",
        });
      }
    }
  } catch {
    // Fallback em memória já populado
  }

  const textoLower = texto.toLowerCase();
  const mencoesValidasIds = new Set<string>();
  const mencoesNomes: string[] = [];

  const usuarioMencionadoNoTexto = (nomeUsuario: string): boolean => {
    const nomeLimpo = nomeUsuario.trim();
    if (!nomeLimpo) return false;
    const arrobaCompleto = `@${nomeLimpo.toLowerCase()}`;
    if (textoLower.includes(arrobaCompleto)) return true;

    const primeiroNome = nomeLimpo.split(/\s+/)[0]?.toLowerCase() || "";
    if (primeiroNome.length >= 2) {
      const regex = new RegExp(
        `(^|\\s)@${primeiroNome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|\\s|[.,!?;:]|$)`,
        "i",
      );
      if (regex.test(texto)) return true;
    }
    return false;
  };

  // 1. Valida IDs candidatos explícitos contra equipe do tenant + presença no texto
  for (const rawId of candidatosIds || []) {
    const uid = String(rawId || "").trim();
    if (!uid || uid === autorId) continue;
    const membro = usuariosEquipe.find((u) => u.id === uid);
    if (!membro) continue;
    if (usuarioMencionadoNoTexto(membro.name)) {
      mencoesValidasIds.add(membro.id);
      if (!mencoesNomes.includes(membro.name)) {
        mencoesNomes.push(membro.name);
      }
    }
  }

  // 2. Detecta menções @Nome diretamente no texto mesmo se não vieram em candidatosIds
  for (const membro of usuariosEquipe) {
    if (membro.id === autorId || mencoesValidasIds.has(membro.id)) continue;
    if (usuarioMencionadoNoTexto(membro.name)) {
      mencoesValidasIds.add(membro.id);
      if (!mencoesNomes.includes(membro.name)) {
        mencoesNomes.push(membro.name);
      }
    }
  }

  return {
    mencoesIds: Array.from(mencoesValidasIds),
    mencoesNomes,
  };
}

export interface ListarNotasParams {
  licitacaoId: string;
  tenantId?: string | null;
  user?: RbacUser | null;
  filtros?: Partial<NotasListQuery> & { criadoPorId?: string };
}

export async function listarNotas(
  params: ListarNotasParams,
): Promise<LicitacaoNotaItem[]> {
  const { licitacaoId, tenantId, user, filtros } = params;
  const query = notasListQuerySchema.parse({
    autorId: filtros?.autorId ?? filtros?.criadoPorId,
    busca: filtros?.busca,
  });

  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);
  const realId = oportunidade.id;

  const memNotas = listInMemoryLicitacaoNotas(realId);
  let dbNotas: any[] = [];
  try {
    dbNotas = await prisma.licitacaoNota.findMany({
      where: {
        licitacaoId: realId,
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: { criadaEm: "desc" },
    });
  } catch {
    // Fallback em memória
  }

  const mergedMap = new Map<string, LicitacaoNotaItem>();
  for (const n of [...memNotas, ...dbNotas]) {
    if (!n || !n.id || mergedMap.has(n.id)) continue;
    if (tenantId && n.tenantId !== tenantId) continue;
    mergedMap.set(n.id, mapRecordToNotaItem(n, user));
  }

  let lista = Array.from(mergedMap.values()).sort(
    (a, b) => b.criadaEm.getTime() - a.criadaEm.getTime(),
  );

  if (query.autorId) {
    lista = lista.filter((n) => n.autorId === query.autorId);
  }
  if (query.busca) {
    const termo = query.busca.toLowerCase();
    lista = lista.filter(
      (n) =>
        n.texto.toLowerCase().includes(termo) ||
        n.autorNome.toLowerCase().includes(termo),
    );
  }

  return lista;
}

export interface CriarNotaParams {
  licitacaoId: string;
  tenantId?: string | null;
  user: RbacUser | null | undefined;
  input: CriarNotaInput | { texto: string; mencionadosIds?: string[]; mencoesIds?: string[] };
  actorContext?: OportunidadesActorContext;
}

export async function criarNota(
  params: CriarNotaParams,
): Promise<LicitacaoNotaItem> {
  const { licitacaoId, tenantId, user, input: rawInput, actorContext } = params;

  if (!user?.id) {
    throw new LicitacaoNotasError(
      "UNAUTHORIZED",
      "É necessário estar autenticado para publicar uma nota.",
      401,
    );
  }

  const rawObj = (rawInput ?? {}) as any;
  const input = criarNotaSchema.parse({
    texto: rawObj.texto,
    mencionadosIds: rawObj.mencionadosIds ?? rawObj.mencoesIds ?? [],
  });

  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);
  const realId = oportunidade.id;

  const { mencoesIds, mencoesNomes } = await resolverMencoesDaEquipe(
    input.texto,
    input.mencionadosIds,
    user.id,
    tenantId,
  );

  const autorNome =
    user.name?.trim() ||
    actorContext?.usuarioNome?.trim() ||
    getInMemoryUsuario(user.id)?.name ||
    "Colaborador";
  const autorEmail =
    (user as any).email ?? getInMemoryUsuario(user.id)?.email ?? null;
  const autorCargo = user.role ? String(user.role) : "ANALISTA_COMERCIAL";

  const agora = new Date();
  let criadaRaw: any;

  try {
    await ensureLicitacaoNotaTable();
    criadaRaw = await prisma.licitacaoNota.create({
      data: {
        licitacaoId: realId,
        tenantId: tenantId ?? null,
        texto: input.texto,
        mencionadosIds: mencoesIds,
        autorId: user.id,
        autorNome,
        autorCargo,
      },
    });
  } catch {
    criadaRaw = {
      id: `nota_${randomUUID()}`,
      licitacaoId: realId,
      tenantId: tenantId ?? null,
      texto: input.texto,
      mencoesIds,
      mencoesNomes,
      autorId: user.id,
      autorNome,
      autorEmail,
      autorCargo,
      editadoEm: null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
  }

  insertInMemoryLicitacaoNota(realId, criadaRaw);
  const item = mapRecordToNotaItem(criadaRaw, user);

  await recordAuditLog({
    acao: "NOTA_CRIADA",
    entidadeTipo: "LICITACAO_NOTA",
    entidadeId: item.id,
    tenantId: tenantId ?? null,
    antes: null,
    depois: {
      licitacaoId: realId,
      autorId: item.autorId,
      mencionadosIds: item.mencionadosIds,
    },
    usuarioId: user.id,
    usuarioNome: autorNome,
    ip: actorContext?.ip ?? null,
  });

  if (mencoesIds.length > 0) {
    await notificarMencaoNota({
      licitacaoId: realId,
      notaId: item.id,
      numeroEdital: oportunidade.numeroEdital,
      autorNome: item.autorNome,
      textoNota: item.texto,
      mencoesIds,
      sufixoIdempotencia: "criacao",
    }).catch(() => undefined);
  }

  return item;
}

async function buscarNotaExistente(
  licitacaoId: string,
  notaId: string,
  viewer?: RbacUser | null,
): Promise<(LicitacaoNotaItem & { mencoesNomes: string[] }) | null> {
  const mem = getInMemoryLicitacaoNota(licitacaoId, notaId);
  if (mem) {
    return mapRecordToNotaItem(mem, viewer);
  }
  try {
    const db = await prisma.licitacaoNota.findFirst({
      where: { id: notaId, licitacaoId },
    });
    if (db) {
      return mapRecordToNotaItem(db, viewer);
    }
  } catch {
    // ignore
  }
  return null;
}

export interface AtualizarNotaParams {
  licitacaoId: string;
  notaId: string;
  tenantId?: string | null;
  user: RbacUser | null | undefined;
  input: AtualizarNotaInput | { texto: string; mencionadosIds?: string[]; mencoesIds?: string[] };
  actorContext?: OportunidadesActorContext;
}

/**
 * Edita uma nota existente.
 * REGRA DE NEGÓCIO ESTRITA: Apenas o próprio usuário que criou a nota (`nota.autorId === user.id`)
 * pode editá-la. Qualquer outro usuário (inclusive Diretoria) recebe 403 Forbidden.
 */
export async function atualizarNota(
  params: AtualizarNotaParams,
): Promise<LicitacaoNotaItem> {
  const { licitacaoId, notaId, tenantId, user, input: rawInput, actorContext } = params;

  if (!user?.id) {
    throw new LicitacaoNotasError(
      "UNAUTHORIZED",
      "É necessário estar autenticado para editar uma nota.",
      401,
    );
  }

  const rawObj = (rawInput ?? {}) as any;
  const input = atualizarNotaSchema.parse({
    texto: rawObj.texto,
    mencionadosIds: rawObj.mencionadosIds ?? rawObj.mencoesIds ?? [],
  });

  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);
  const realId = oportunidade.id;

  const existente = await buscarNotaExistente(realId, notaId, user);
  if (!existente) {
    throw new LicitacaoNotasError(
      "NOTA_NAO_ENCONTRADA",
      `Nota '${notaId}' não encontrada nesta licitação.`,
      404,
    );
  }

  if (existente.autorId !== user.id) {
    throw new LicitacaoNotasError(
      "NOTA_EDICAO_RESTRITA_AO_AUTOR",
      "Apenas o próprio usuário que criou a nota tem permissão para editá-la.",
      403,
    );
  }

  const { mencoesIds, mencoesNomes } = await resolverMencoesDaEquipe(
    input.texto,
    input.mencionadosIds,
    user.id,
    tenantId,
  );

  const editadoEm = new Date();
  let atualizadaRaw: any;

  try {
    atualizadaRaw = await prisma.licitacaoNota.update({
      where: { id: notaId },
      data: {
        texto: input.texto,
        mencionadosIds: mencoesIds,
        editada: true,
      },
    });
  } catch {
    atualizadaRaw = null;
  }

  const memUpdated = updateInMemoryLicitacaoNota(realId, notaId, {
    texto: input.texto,
    mencoesIds,
    mencoesNomes,
    editadoEm,
  });

  const item = mapRecordToNotaItem(
    atualizadaRaw ??
      memUpdated ?? {
        ...existente,
        texto: input.texto,
        mencoesIds,
        mencoesNomes,
        editadoEm,
        atualizadoEm: editadoEm,
      },
    user,
  );

  await recordAuditLog({
    acao: "NOTA_EDITADA",
    entidadeTipo: "LICITACAO_NOTA",
    entidadeId: item.id,
    tenantId: tenantId ?? null,
    antes: { texto: existente.texto, mencionadosIds: existente.mencionadosIds },
    depois: { texto: item.texto, mencionadosIds: item.mencionadosIds },
    usuarioId: user.id,
    usuarioNome: user.name ?? actorContext?.usuarioNome ?? item.autorNome,
    ip: actorContext?.ip ?? null,
  });

  // Notifica apenas novos usuários mencionados na edição
  const novasMencoes = mencoesIds.filter(
    (uid) => !existente.mencionadosIds.includes(uid),
  );
  if (novasMencoes.length > 0) {
    await notificarMencaoNota({
      licitacaoId: realId,
      notaId: item.id,
      numeroEdital: oportunidade.numeroEdital,
      autorNome: item.autorNome,
      textoNota: item.texto,
      mencoesIds: novasMencoes,
      sufixoIdempotencia: `edicao_${editadoEm.getTime()}`,
    }).catch(() => undefined);
  }

  return item;
}

export interface ExcluirNotaParams {
  licitacaoId: string;
  notaId: string;
  tenantId?: string | null;
  user: RbacUser | null | undefined;
  actorContext?: OportunidadesActorContext;
}

/**
 * Exclui uma nota existente.
 * REGRA DE NEGÓCIO ESTRITA: Apenas usuários com cargo `DIRETORIA` (ou `SUPERADMIN`)
 * podem excluir notas.
 */
export async function excluirNota(
  params: ExcluirNotaParams,
): Promise<{ ok: true; id: string }> {
  const { licitacaoId, notaId, tenantId, user, actorContext } = params;

  if (!user?.id) {
    throw new LicitacaoNotasError(
      "UNAUTHORIZED",
      "É necessário estar autenticado para excluir uma nota.",
      401,
    );
  }

  const role = String(user.role || "").toUpperCase();
  if (role !== "DIRETORIA" && role !== "SUPERADMIN") {
    throw new LicitacaoNotasError(
      "NOTA_EXCLUSAO_RESTRITA_DIRETORIA",
      "Apenas usuários com cargo Diretoria podem excluir notas.",
      403,
    );
  }

  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);
  const realId = oportunidade.id;

  const existente = await buscarNotaExistente(realId, notaId, user);
  if (!existente) {
    throw new LicitacaoNotasError(
      "NOTA_NAO_ENCONTRADA",
      `Nota '${notaId}' não encontrada nesta licitação.`,
      404,
    );
  }

  deleteInMemoryLicitacaoNota(realId, notaId);
  try {
    await prisma.licitacaoNota.delete({ where: { id: notaId } });
  } catch {
    // Fallback em memória já removeu
  }

  await recordAuditLog({
    acao: "NOTA_EXCLUIDA",
    entidadeTipo: "LICITACAO_NOTA",
    entidadeId: notaId,
    tenantId: tenantId ?? null,
    antes: {
      texto: existente.texto,
      autorId: existente.autorId,
      autorNome: existente.autorNome,
    },
    depois: null,
    usuarioId: user.id,
    usuarioNome: user.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return { ok: true, id: notaId };
}
