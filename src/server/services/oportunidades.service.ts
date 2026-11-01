import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type RbacUser } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import { recordStatusHistorico } from "./status-historico.service";
import {
  type DecisaoOportunidadeInput,
  type OportunidadesFilterInput,
  criarLicitacaoManualSchema,
  decisaoOportunidadeSchema,
  oportunidadesFilterSchema,
} from "@/server/schemas/oportunidades.schema";
import {
  kanbanStatusUpdateSchema,
  type KanbanStatusUpdateInput,
} from "@/server/schemas/kanban.schema";
import {
  equipeUpdateSchema,
  type EquipeUpdateInput,
} from "@/server/schemas/equipe.schema";
import {
  criarRepositorioSchema,
  type CriarRepositorioInput,
} from "@/server/schemas/repositorio.schema";
import {
  salvarAnaliseIASchema,
  type SalvarAnaliseIAInput,
} from "@/server/schemas/analise-ia.schema";
import { computeHashCritico } from "./hash-critico";
import {
  clearInMemoryLicitacoes,
  deleteInMemoryLicitacaoArquivo,
  deleteInMemoryLicitacaoRepositorio,
  getInMemoryLicitacaoById,
  getInMemoryLicitacaoEquipe,
  getInMemoryUsuario,
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoAnaliseIA,
  insertInMemoryLicitacaoArquivo,
  insertInMemoryLicitacaoRepositorio,
  type LicitacaoRecord,
  listInMemoryLicitacaoAnalisesIA,
  listInMemoryLicitacaoArquivos,
  listInMemoryLicitacaoRepositorios,
  listInMemoryLicitacoes,
  type NovaLicitacaoData,
  setInMemoryLicitacaoEquipe,
  updateInMemoryLicitacao,
} from "./licitacoes-store";
import { normalizarModalidade } from "@/server/schemas/modalidades.schema";
import { classificarLicitacaoPorTexto } from "./classificador-segmentos.service";
import { CATALOGO_MACRO_SEGMENTOS } from "@/server/schemas/segmentos.schema";

export function obterPalavrasChaveSubsegmento(subsegmento: string): string[] {
  const norm = subsegmento.toLowerCase().trim();
  for (const macro of Object.values(CATALOGO_MACRO_SEGMENTOS)) {
    for (const sub of macro.subcategorias) {
      if (
        sub.codigo.toLowerCase() === norm ||
        sub.nome.toLowerCase() === norm ||
        norm.includes(sub.codigo.toLowerCase()) ||
        norm.includes(sub.nome.toLowerCase())
      ) {
        return sub.palavrasChave;
      }
    }
  }
  return [subsegmento];
}

/** Erro tipado de serviço: as rotas HTTP mapeiam `status` para a resposta. */
export class OportunidadesServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "OportunidadesServiceError";
    this.code = code;
    this.status = status;
  }
}

export interface OportunidadesActorContext {
  usuarioId?: string | null;
  usuarioNome?: string | null;
  ip?: string | null;
}

export interface DeliberarOportunidadeInput {
  id: string;
  decisao: DecisaoOportunidadeInput["decisao"];
  motivoRecusa?: string;
  user: RbacUser | null | undefined;
  actorContext?: OportunidadesActorContext;
}

const LIMITE_ATE_500K = 500_000;
const LIMITE_2M = 2_000_000;

type ParsedFilters = OportunidadesFilterInput;

function mesCorrente(agora: Date = new Date()): { inicio: Date; fim: Date } {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  return { inicio, fim };
}

function buildPrismaWhere(filters: ParsedFilters): Prisma.LicitacaoWhereInput {
  const and: Prisma.LicitacaoWhereInput[] = [];

  if (filters.tipoSistema) {
    and.push({ tipoSistemaCodigo: filters.tipoSistema });
  }
  if (filters.segmento) {
    const selectedSegments = filters.segmento
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectedSegments.length === 1) {
      and.push({
        OR: [
          { segmentoMacro: selectedSegments[0] },
          { tipoSistemaCodigo: selectedSegments[0] as any },
        ],
      });
    } else if (selectedSegments.length > 1) {
      and.push({
        OR: [
          { segmentoMacro: { in: selectedSegments } },
          { tipoSistemaCodigo: { in: selectedSegments as any } },
        ],
      });
    }
  } else if (
    filters.segmentosTenantAtivo &&
    filters.segmentosTenantAtivo.length > 0
  ) {
    and.push({
      OR: [
        { segmentoMacro: { in: filters.segmentosTenantAtivo } },
        { tipoSistemaCodigo: { in: filters.segmentosTenantAtivo as any } },
      ],
    });
  }
  if (filters.uf) {
    const ufs = filters.uf
      .split(",")
      .map((u) => u.trim().toUpperCase())
      .filter(Boolean);
    if (ufs.length === 1) {
      and.push({ uf: ufs[0] });
    } else if (ufs.length > 1) {
      and.push({ uf: { in: ufs } });
    }
  }
  if (filters.status === "MINHAS") {
    and.push({
      status: {
        notIn: ["PENDENTE", "RECUSADA"],
      },
    });
  } else if (filters.status && filters.status !== "TODOS" && (filters.status as string) !== "TODAS") {
    and.push({ status: filters.status as any });
  } else if (!filters.status) {
    // Por padrão na Central de Oportunidades, apenas certames PENDENTES são exibidos.
    // Certames aceitos vão para Minhas Licitações e Calendário; certames recusados são arquivados.
    and.push({ status: "PENDENTE" });
  }
  if (filters.parecerIA) {
    and.push({ parecerIA: filters.parecerIA });
  }

  const valorCondition: Prisma.FloatFilter = {};
  if (filters.faixaValor === "ATE_100K") {
    valorCondition.lte = 100000;
  } else if (filters.faixaValor === "100K_A_200K") {
    valorCondition.gt = 100000;
    valorCondition.lte = 200000;
  } else if (filters.faixaValor === "200K_A_500K") {
    valorCondition.gt = 200000;
    valorCondition.lte = 500000;
  } else if (filters.faixaValor === "500K_A_1M") {
    valorCondition.gt = 500000;
    valorCondition.lte = 1000000;
  } else if (filters.faixaValor === "1M_A_2M") {
    valorCondition.gt = 1000000;
    valorCondition.lte = 2000000;
  } else if (filters.faixaValor === "ACIMA_2M") {
    valorCondition.gt = 2000000;
  } else if (filters.faixaValor === "ATE_500K") {
    valorCondition.lte = LIMITE_ATE_500K;
  } else if (filters.faixaValor === "500K_A_2M") {
    valorCondition.gt = LIMITE_ATE_500K;
    valorCondition.lte = LIMITE_2M;
  }
  if (filters.valorMin !== undefined) {
    valorCondition.gte = filters.valorMin;
  }
  if (filters.valorMax !== undefined) {
    valorCondition.lte = filters.valorMax;
  }
  if (Object.keys(valorCondition).length > 0) {
    and.push({ valorEstimado: valorCondition });
  }

  if (filters.periodo === "mes") {
    const { inicio, fim } = mesCorrente();
    and.push({
      OR: [
        { dataAbertura: { gte: inicio, lt: fim } },
        { createdAt: { gte: inicio, lt: fim } },
      ],
    });
  }

  if (filters.busca) {
    const busca = filters.busca;
    and.push({
      OR: [
        { orgaoNome: { contains: busca, mode: "insensitive" } },
        { miniResumo: { contains: busca, mode: "insensitive" } },
        { resumo: { contains: busca, mode: "insensitive" } },
        { numeroEdital: { contains: busca, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function enrichRecordSegment(record: LicitacaoRecord): LicitacaoRecord {
  const storedMacro = (record as any).segmentoMacro;
  const storedSubs = Array.isArray((record as any).subcategorias)
    ? (record as any).subcategorias
    : [];

  // Otimização de Performance: se já possui segmentoMacro e subcategorias válidos, não reprocessar NLP
  if (storedMacro && storedSubs.length > 0 && storedMacro !== "TECNOLOGIA_TELECOM") {
    return record;
  }

  const classif = classificarLicitacaoPorTexto(
    record.resumo || (record as any).objeto || "",
    record.miniResumo || "",
  );
  const effectiveMacro =
    !storedMacro || (storedMacro === "TECNOLOGIA_TELECOM" && classif.macro !== "TECNOLOGIA_TELECOM")
      ? classif.macro
      : storedMacro;
  const effectiveSubs = Array.from(new Set([...storedSubs, ...classif.subcategorias]));
  return {
    ...record,
    segmentoMacro: effectiveMacro,
    subcategorias: effectiveSubs,
  } as LicitacaoRecord;
}

function matchesFilters(record: LicitacaoRecord, filters: ParsedFilters): boolean {
  const enriched = record.segmentoMacro ? record : enrichRecordSegment(record);

  if (filters.tipoSistema && enriched.tipoSistemaCodigo !== filters.tipoSistema) {
    return false;
  }
  if (filters.segmento) {
    const selectedSegments = filters.segmento
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectedSegments.length > 0) {
      const macro = (enriched as any).segmentoMacro;
      const tipo = enriched.tipoSistemaCodigo;
      const matchesAny =
        (macro && selectedSegments.includes(macro)) ||
        (tipo ? selectedSegments.includes(tipo) : false);
      if (!matchesAny) {
        return false;
      }
    }
  } else if (
    filters.segmentosTenantAtivo &&
    filters.segmentosTenantAtivo.length > 0
  ) {
    const macro = (enriched as any).segmentoMacro;
    const tipo = enriched.tipoSistemaCodigo;
    const matchesTenant =
      (macro && filters.segmentosTenantAtivo.includes(macro)) ||
      (tipo ? filters.segmentosTenantAtivo.includes(tipo) : false);
    if (!matchesTenant) {
      return false;
    }
  }
  if (filters.subsegmento) {
    const subs: string[] = Array.isArray((enriched as any).subcategorias)
      ? (enriched as any).subcategorias
      : [];
    const text = `${enriched.resumo || ""} ${enriched.miniResumo || ""}`.toLowerCase();
    const palavras = obterPalavrasChaveSubsegmento(filters.subsegmento);
    const match =
      subs.includes(filters.subsegmento) ||
      palavras.some((p) => text.includes(p.toLowerCase()));
    if (!match) {
      return false;
    }
  }
  if (filters.uf) {
    const ufs = filters.uf
      .split(",")
      .map((u) => u.trim().toUpperCase())
      .filter(Boolean);
    if (ufs.length > 0 && !ufs.includes(enriched.uf.toUpperCase())) {
      return false;
    }
  }
  if (filters.status === "MINHAS") {
    if (record.status === "PENDENTE" || record.status === "RECUSADA") {
      return false;
    }
  } else if (filters.status && filters.status !== "TODOS" && (filters.status as string) !== "TODAS") {
    if (record.status !== filters.status) {
      return false;
    }
  } else if (!filters.status) {
    if (record.status !== "PENDENTE") {
      return false;
    }
  }
  if (filters.parecerIA && record.parecerIA !== filters.parecerIA) {
    return false;
  }

  if (filters.faixaValor === "ATE_100K" && record.valorEstimado > 100000) {
    return false;
  }
  if (
    filters.faixaValor === "100K_A_200K" &&
    (record.valorEstimado <= 100000 || record.valorEstimado > 200000)
  ) {
    return false;
  }
  if (
    filters.faixaValor === "200K_A_500K" &&
    (record.valorEstimado <= 200000 || record.valorEstimado > 500000)
  ) {
    return false;
  }
  if (
    filters.faixaValor === "500K_A_1M" &&
    (record.valorEstimado <= 500000 || record.valorEstimado > 1000000)
  ) {
    return false;
  }
  if (
    filters.faixaValor === "1M_A_2M" &&
    (record.valorEstimado <= 1000000 || record.valorEstimado > 2000000)
  ) {
    return false;
  }
  if (filters.faixaValor === "ACIMA_2M" && record.valorEstimado <= 2000000) {
    return false;
  }
  if (filters.faixaValor === "ATE_500K" && record.valorEstimado > LIMITE_ATE_500K) {
    return false;
  }
  if (
    filters.faixaValor === "500K_A_2M" &&
    (record.valorEstimado <= LIMITE_ATE_500K || record.valorEstimado > LIMITE_2M)
  ) {
    return false;
  }
  if (filters.valorMin !== undefined && record.valorEstimado < filters.valorMin) {
    return false;
  }
  if (filters.valorMax !== undefined && record.valorEstimado > filters.valorMax) {
    return false;
  }

  if (filters.periodo === "mes") {
    const { inicio, fim } = mesCorrente();
    const aberturaNoMes =
      record.dataAbertura >= inicio && record.dataAbertura < fim;
    const criadoNoMes = record.createdAt >= inicio && record.createdAt < fim;
    if (!aberturaNoMes && !criadoNoMes) {
      return false;
    }
  }

  if (filters.busca) {
    const busca = filters.busca.toLowerCase();
    const alvo = [
      record.orgaoNome,
      record.miniResumo,
      record.resumo,
      record.numeroEdital,
      (record as any).objeto,
      (record as any).objetoPrincipal,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    if (!alvo.includes(busca)) {
      return false;
    }
  }

  return true;
}

function compareByDataAberturaAsc(
  a: LicitacaoRecord,
  b: LicitacaoRecord,
): number {
  const dateA = a.dataEncerramentoProposta ? new Date(a.dataEncerramentoProposta).getTime() : a.dataAbertura.getTime();
  const dateB = b.dataEncerramentoProposta ? new Date(b.dataEncerramentoProposta).getTime() : b.dataAbertura.getTime();
  const diff = dateA - dateB;
  if (diff !== 0) {
    return diff;
  }
  return a.idPncp.localeCompare(b.idPncp);
}

/**
 * Listagem da Central de Oportunidades (PRD §4.4 / sprint-1-spec §2.3):
 * sempre ordenada por `dataAbertura ASC` (mais próxima primeiro) e com todos
 * os filtros operacionais (`tipoSistema`, `uf`, `faixaValor`, `valorMin/Max`,
 * `status`, `parecerIA`, `periodo`, `busca`). Lê o PostgreSQL e mescla com o
 * fallback em memória (deduplicado por `idPncp`, banco prevalece), garantindo
 * dados ricos mesmo sem banco acessível.
 */
export async function listOportunidades(
  rawFilters: unknown = {},
): Promise<LicitacaoRecord[]> {
  const filters = oportunidadesFilterSchema.parse(rawFilters ?? {});

  const mergedByIdPncp = new Map<string, LicitacaoRecord>();

  for (const rawRecord of listInMemoryLicitacoes()) {
    const record = enrichRecordSegment(rawRecord);
    if (matchesFilters(record, filters)) {
      mergedByIdPncp.set(record.idPncp, record);
    }
  }

  try {
    const dbRecords = await prisma.licitacao.findMany({
      where: buildPrismaWhere(filters),
      orderBy: [{ dataEncerramentoProposta: "asc" }, { dataAbertura: "asc" }],
    });
    for (const rawRecord of dbRecords) {
      const record = enrichRecordSegment(rawRecord);
      if (matchesFilters(record, filters)) {
        mergedByIdPncp.set(record.idPncp, record);
      }
    }
  } catch (err: unknown) {
    console.error("[listOportunidades] Erro ao buscar no banco:", err);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      const retryRecords = await prisma.licitacao.findMany({
        where: buildPrismaWhere(filters),
        orderBy: [{ dataEncerramentoProposta: "asc" }, { dataAbertura: "asc" }],
      });
      for (const rawRecord of retryRecords) {
        const record = enrichRecordSegment(rawRecord);
        if (matchesFilters(record, filters)) {
          mergedByIdPncp.set(record.idPncp, record);
        }
      }
    } catch (healErr) {
      console.warn("[listOportunidades] Auto-healing falhou:", healErr);
    }
  }

  return [...mergedByIdPncp.values()].sort(compareByDataAberturaAsc);
}

export interface PaginatedOportunidadesResult {
  oportunidades: LicitacaoRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Listagem paginada da Central de Oportunidades com suporte aos parâmetros
 * `page` e `pageSize` (PRD §10 e sprint-2-spec §2.2).
 */
export async function listOportunidadesPaginadas(
  rawFilters: unknown = {},
): Promise<PaginatedOportunidadesResult> {
  const filters = oportunidadesFilterSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;

  const all = await listOportunidades(rawFilters);
  const total = all.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginated = all.slice(startIndex, startIndex + pageSize);

  return {
    oportunidades: paginated,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Busca uma oportunidade pelo identificador interno (`id`).
 * Inclui relações de responsáveis, arquivos, repositórios e análises de IA.
 * Lança `OportunidadesServiceError` com `status: 404` quando não encontrada.
 */
async function resolveUserSummary(userId: string | null | undefined): Promise<{
  id: string;
  name: string;
  email: string;
  role: string;
} | null> {
  if (!userId) return null;
  const mem = getInMemoryUsuario(userId);
  if (mem) {
    return {
      id: mem.id,
      name: mem.name,
      email: mem.email,
      role: mem.role || "ANALISTA_COMERCIAL",
    };
  }
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (dbUser) {
      return {
        id: dbUser.id,
        name: dbUser.name || "Colaborador",
        email: dbUser.email || "",
        role: String(dbUser.role),
      };
    }
  } catch {
    // ignore
  }
  return {
    id: userId,
    name: "Colaborador",
    email: "",
    role: "ANALISTA_COMERCIAL",
  };
}

async function hydrateDossieRelations(base: any, tenantId?: string | null): Promise<any> {
  const realId = base.id;
  const memEquipe = getInMemoryLicitacaoEquipe(realId);

  const responsavelId =
    memEquipe !== null ? memEquipe.responsavelId : (base.responsavelId ?? null);
  const responsavel =
    base.responsavel && base.responsavel.id === responsavelId
      ? base.responsavel
      : await resolveUserSummary(responsavelId);

  let atribuidos: any[] = Array.isArray(base.atribuidos) ? [...base.atribuidos] : [];
  if (memEquipe !== null) {
    const resolvedAtribuidos: any[] = [];
    for (const uid of memEquipe.atribuidoIds) {
      const existing = atribuidos.find((a) => a.usuarioId === uid);
      if (existing) {
        resolvedAtribuidos.push(existing);
      } else {
        const u = await resolveUserSummary(uid);
        resolvedAtribuidos.push({
          id: `atrib_${realId}_${uid}`,
          licitacaoId: realId,
          usuarioId: uid,
          usuario: u,
          criadoEm: new Date(),
        });
      }
    }
    atribuidos = resolvedAtribuidos;
  }

  const dbArquivos: any[] = Array.isArray(base.arquivos) ? base.arquivos : [];
  const memArquivos = listInMemoryLicitacaoArquivos(realId);
  const arquivosMap = new Map<string, any>();
  for (const a of [...memArquivos, ...dbArquivos]) {
    if (a && a.id && !arquivosMap.has(a.id)) {
      arquivosMap.set(a.id, a);
    }
  }

  const arquivosFiltrados = Array.from(arquivosMap.values()).filter((arq: any) => {
    if (!arq.tenantId) return true;
    return tenantId ? arq.tenantId === tenantId : false;
  });

  const dbRepos: any[] = Array.isArray(base.repositoriosSimilares) ? base.repositoriosSimilares : [];
  const memRepos = listInMemoryLicitacaoRepositorios(realId);
  const reposMap = new Map<string, any>();
  for (const r of [...memRepos, ...dbRepos]) {
    if (r && r.id && !reposMap.has(r.id)) {
      reposMap.set(r.id, r);
    }
  }

  const dbAnalises: any[] = Array.isArray(base.analisesIA) ? base.analisesIA : [];
  const memAnalises = listInMemoryLicitacaoAnalisesIA(realId);
  const analisesMap = new Map<string, any>();
  for (const an of [...memAnalises, ...dbAnalises]) {
    if (an && an.id && !analisesMap.has(an.id)) {
      analisesMap.set(an.id, an);
    }
  }

  return {
    ...base,
    responsavelId,
    responsavel,
    atribuidos,
    arquivos: arquivosFiltrados,
    repositoriosSimilares: Array.from(reposMap.values()),
    analisesIA: Array.from(analisesMap.values()),
  };
}

export async function getOportunidadeById(
  id: string,
  tenantId?: string | null,
): Promise<any> {
  try {
    const found = await prisma.licitacao.findFirst({
      where: {
        OR: [{ id }, { idPncp: id }],
      },
      include: {
        responsavel: { select: { id: true, name: true, email: true, role: true } },
        atribuidos: {
          include: {
            usuario: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        repositoriosSimilares: { orderBy: { criadoEm: "desc" } },
        arquivos: { orderBy: { criadoEm: "desc" } },
        analisesIA: { orderBy: { criadoEm: "desc" } },
      },
    });
    if (found) {
      return hydrateDossieRelations(found, tenantId);
    }
  } catch (err) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      const retryFound = await prisma.licitacao.findFirst({
        where: {
          OR: [{ id }, { idPncp: id }],
        },
        include: {
          responsavel: { select: { id: true, name: true, email: true, role: true } },
          atribuidos: {
            include: {
              usuario: { select: { id: true, name: true, email: true, role: true } },
            },
          },
          repositoriosSimilares: { orderBy: { criadoEm: "desc" } },
          arquivos: { orderBy: { criadoEm: "desc" } },
          analisesIA: { orderBy: { criadoEm: "desc" } },
        },
      });
      if (retryFound) {
        return hydrateDossieRelations(retryFound, tenantId);
      }
    } catch {}

    // Se a consulta completa falhar por ausência de tabelas relacionais ou erro de junção,
    // realiza a busca direta da licitação básica no PostgreSQL sem as relações opcionais.
    try {
      const basic = await prisma.licitacao.findFirst({
        where: {
          OR: [{ id }, { idPncp: id }],
        },
      });
      if (basic) {
        const [arquivos, repositoriosSimilares, analisesIA, atribuidos] = await Promise.all([
          prisma.arquivo.findMany({ where: { licitacaoId: basic.id }, orderBy: { criadoEm: "desc" } }).catch(() => []),
          prisma.repositorioSimilar.findMany({ where: { licitacaoId: basic.id }, orderBy: { criadoEm: "desc" } }).catch(() => []),
          prisma.analiseStatusParticipacao.findMany({ where: { licitacaoId: basic.id }, orderBy: { criadoEm: "desc" } }).catch(() => []),
          prisma.licitacaoAtribuido
            .findMany({
              where: { licitacaoId: basic.id },
              include: { usuario: { select: { id: true, name: true, email: true, role: true } } },
            })
            .catch(() => []),
        ]);
        return hydrateDossieRelations({
          ...basic,
          responsavel: null,
          atribuidos,
          repositoriosSimilares,
          arquivos,
          analisesIA,
        }, tenantId);
      }
    } catch {
      // PostgreSQL indisponível: fallback em memória
    }
  }

  const inMemory = getInMemoryLicitacaoById(id);
  if (inMemory) {
    return hydrateDossieRelations({
      ...inMemory,
      responsavel: null,
      atribuidos: [],
      repositoriosSimilares: [],
      arquivos: [],
      analisesIA: [],
    }, tenantId);
  }

  throw new OportunidadesServiceError(
    "OPORTUNIDADE_NAO_ENCONTRADA",
    `Licitação '${id}' não encontrada`,
    404,
  );
}

/**
 * Atualiza o status do funil Kanban com validação estrita de motivo de perda (PRD §4.3).
 */
export async function atualizarKanbanStatus(
  id: string,
  rawInput: unknown,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const input = kanbanStatusUpdateSchema.parse(rawInput);
  const oportunidade = await getOportunidadeById(id);

  let atualizado: any;
  try {
    atualizado = await prisma.licitacao.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
        ...(input.valorArrematado !== undefined ? { valorArrematado: input.valorArrematado } : {}),
      },
    });
  } catch {
    atualizado = updateInMemoryLicitacao(id, {
      status: input.status,
      ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
      ...(input.valorArrematado !== undefined ? { valorArrematado: input.valorArrematado } : {}),
    });
  }

  await recordAuditLog({
    acao: "KANBAN_STATUS_UPDATE",
    entidadeTipo: "LICITACAO",
    entidadeId: id,
    antes: { status: oportunidade.status },
    depois: { status: atualizado.status, motivoRecusa: atualizado.motivoRecusa },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  await recordStatusHistorico({
    licitacaoId: id,
    statusAnterior: oportunidade.status,
    statusNovo: input.status,
    motivo: input.motivoPerda ?? null,
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
  });

  return atualizado;
}

/**
 * Atualiza a equipe responsável e atribuídos da licitação (PRD §4.4.1 B).
 */
export async function atualizarEquipe(
  id: string,
  rawInput: unknown,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const input = equipeUpdateSchema.parse(rawInput);
  const oportunidade = await getOportunidadeById(id);
  const realId = oportunidade.id;

  setInMemoryLicitacaoEquipe(realId, {
    responsavelId: input.responsavelId ?? null,
    atribuidoIds: input.atribuidoIds ?? [],
  });

  try {
    await prisma.licitacao
      .update({
        where: { id: realId },
        data: { responsavelId: input.responsavelId },
      })
      .catch(() => undefined);

    await prisma.licitacaoAtribuido.deleteMany({ where: { licitacaoId: realId } });
    if (input.atribuidoIds.length > 0) {
      await prisma.licitacaoAtribuido.createMany({
        data: input.atribuidoIds.map((uid) => ({
          licitacaoId: realId,
          usuarioId: uid,
        })),
        skipDuplicates: true,
      });
    }
  } catch {
    // In-memory fallback already persisted above
  }

  await recordAuditLog({
    acao: "EQUIPE_UPDATE",
    entidadeTipo: "LICITACAO",
    entidadeId: realId,
    antes: { responsavelId: oportunidade.responsavelId },
    depois: { responsavelId: input.responsavelId, atribuidoIds: input.atribuidoIds },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return getOportunidadeById(realId);
}

/**
 * Adiciona um repositório similar com limite de até 5 links (PRD §4.4.1 E).
 */
export async function adicionarRepositorioSimilar(
  licitacaoId: string,
  rawInput: unknown,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const input = criarRepositorioSchema.parse(rawInput);
  const oportunidade = await getOportunidadeById(licitacaoId);
  const realId = oportunidade.id;

  if ((oportunidade.repositoriosSimilares || []).length >= 5) {
    throw new OportunidadesServiceError(
      "LIMITE_REPOSITORIOS",
      "Limite máximo de 5 repositórios de benchmarking atingido",
      400,
    );
  }

  let criado: any;
  try {
    criado = await prisma.repositorioSimilar.create({
      data: {
        licitacaoId: realId,
        nome: input.nome,
        url: input.url,
      },
    });
  } catch {
    criado = {
      id: `rep_${randomUUID()}`,
      licitacaoId: realId,
      nome: input.nome,
      url: input.url,
      criadoEm: new Date(),
    };
  }

  insertInMemoryLicitacaoRepositorio(realId, criado);

  await recordAuditLog({
    acao: "REPOSITORIO_ADICIONAR",
    entidadeTipo: "REPOSITORIO_SIMILAR",
    entidadeId: criado.id,
    antes: null,
    depois: { nome: criado.nome, url: criado.url, licitacaoId: realId },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return criado;
}

/**
 * Remove um repositório similar (PRD §4.4.1 E).
 */
export async function removerRepositorioSimilar(
  licitacaoId: string,
  repId: string,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const oportunidade = await getOportunidadeById(licitacaoId).catch(() => null);
  const realId = oportunidade?.id || licitacaoId;
  deleteInMemoryLicitacaoRepositorio(realId, repId);
  try {
    await prisma.repositorioSimilar.delete({ where: { id: repId } });
  } catch {
    // fallback
  }

  await recordAuditLog({
    acao: "REPOSITORIO_REMOVER",
    entidadeTipo: "REPOSITORIO_SIMILAR",
    entidadeId: repId,
    antes: null,
    depois: null,
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return { ok: true };
}

/**
 * Salva o relatório e parecer gerado pela ferramenta IA (PRD §4.4.1 F).
 */
export async function salvarAnaliseIA(
  licitacaoId: string,
  rawInput: unknown,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const input = salvarAnaliseIASchema.parse(rawInput);
  const oportunidade = await getOportunidadeById(licitacaoId);
  const realId = oportunidade.id;

  let criada: any;
  try {
    criada = await prisma.analiseStatusParticipacao.create({
      data: {
        licitacaoId: realId,
        scriptPrompt: input.scriptPrompt,
        relatorioTexto: input.relatorioTexto,
        impedimentos: input.impedimentos ?? undefined,
        viabilidade: input.viabilidade ?? undefined,
        custos: input.custos ?? undefined,
        precoSugerido: input.precoSugerido ?? undefined,
        executadoPorId: user?.id ?? actorContext?.usuarioId ?? null,
      },
    });
  } catch {
    criada = {
      id: `analise_${randomUUID()}`,
      licitacaoId: realId,
      scriptPrompt: input.scriptPrompt,
      relatorioTexto: input.relatorioTexto,
      impedimentos: input.impedimentos,
      viabilidade: input.viabilidade,
      custos: input.custos,
      precoSugerido: input.precoSugerido,
      criadoEm: new Date(),
    };
  }

  insertInMemoryLicitacaoAnaliseIA(realId, criada);

  await recordAuditLog({
    acao: "ANALISE_IA_SALVAR",
    entidadeTipo: "ANALISE_STATUS_PARTICIPACAO",
    entidadeId: criada.id,
    antes: null,
    depois: { licitacaoId: realId, executadoPorId: user?.id ?? null },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return criada;
}

/**
 * Adiciona anexo de edital (PRD §4.4.1 D).
 */
export async function adicionarArquivoEdital(
  licitacaoId: string,
  dadosArquivo: {
    nome: string;
    tamanho: number;
    mimeType: string;
    caminho: string;
    r2Key?: string | null;
    r2Url?: string | null;
    cachedAt?: Date | null;
    tenantId?: string | null;
  },
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const oportunidade = await getOportunidadeById(licitacaoId, dadosArquivo.tenantId);
  const realId = oportunidade.id;

  let criado: any;
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "arquivo" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`).catch(() => undefined);
    criado = await prisma.arquivo.create({
      data: {
        licitacaoId: realId,
        tenantId: dadosArquivo.tenantId ?? null,
        nome: dadosArquivo.nome,
        tamanho: dadosArquivo.tamanho,
        mimeType: dadosArquivo.mimeType,
        caminho: dadosArquivo.caminho,
        r2Key: dadosArquivo.r2Key ?? null,
        r2Url: dadosArquivo.r2Url ?? null,
        cachedAt: dadosArquivo.cachedAt ?? null,
      },
    });
  } catch {
    criado = {
      id: `arq_${randomUUID()}`,
      licitacaoId: realId,
      ...dadosArquivo,
      criadoEm: new Date(),
    };
  }

  insertInMemoryLicitacaoArquivo(realId, criado);

  await recordAuditLog({
    acao: "ARQUIVO_UPLOAD",
    entidadeTipo: "ARQUIVO",
    entidadeId: criado.id,
    antes: null,
    depois: { nome: criado.nome, tamanho: criado.tamanho, licitacaoId: realId },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return criado;
}

/**
 * Remove anexo de edital (PRD §4.4.1 D).
 */
export async function removerArquivoEdital(
  licitacaoId: string,
  arquivoId: string,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const oportunidade = await getOportunidadeById(licitacaoId).catch(() => null);
  const realId = oportunidade?.id || licitacaoId;
  deleteInMemoryLicitacaoArquivo(realId, arquivoId);
  try {
    await prisma.arquivo.delete({ where: { id: arquivoId } });
  } catch {
    // fallback
  }

  await recordAuditLog({
    acao: "ARQUIVO_REMOVER",
    entidadeTipo: "ARQUIVO",
    entidadeId: arquivoId,
    antes: null,
    depois: null,
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return { ok: true };
}

async function persistDeliberacao(
  id: string,
  patch: Partial<NovaLicitacaoData>,
): Promise<LicitacaoRecord> {
  try {
    return await prisma.licitacao.update({
      where: { id },
      data: patch as Prisma.LicitacaoUncheckedUpdateInput,
    });
  } catch (err) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      return await prisma.licitacao.update({
        where: { id },
        data: patch as Prisma.LicitacaoUncheckedUpdateInput,
      });
    } catch {
      // PostgreSQL indisponível ou registro fora do banco: fallback em memória
    }
  }
  const updated = updateInMemoryLicitacao(id, patch);
  if (!updated) {
    throw new OportunidadesServiceError(
      "OPORTUNIDADE_NAO_ENCONTRADA",
      `Licitação '${id}' não encontrada`,
      404,
    );
  }
  return updated;
}

/**
 * Deliberação rápida GO / No-GO (PRD §4.4 / sprint-1-spec §2.3):
 * exige `can(user, "licitacao:decide", "licitacao")` (DIRETORIA e
 * ANALISTA_COMERCIAL; OPERADOR recebe erro 403). `GO` move o status para
 * `ACEITA`; `NO_GO` (ou a grafia legada `"NO-GO"`) move para `RECUSADA` com
 * `motivoRecusa` opcional. Grava `DECISAO_GO` / `DECISAO_NO_GO` em
 * `audit_log` com o status anterior e o posterior.
 */
export async function deliberarOportunidade(
  input: DeliberarOportunidadeInput,
): Promise<LicitacaoRecord> {
  const parsed = decisaoOportunidadeSchema.parse({
    decisao: input.decisao,
    motivoRecusa: input.motivoRecusa,
  });

  if (!can(input.user, "licitacao:decide", "licitacao")) {
    throw new OportunidadesServiceError(
      "FORBIDDEN",
      "Usuário sem permissão para deliberar licitações (licitacao:decide)",
      403,
    );
  }

  const existente = await getOportunidadeById(input.id);
  const statusAnterior = existente.status;
  const novoStatus = parsed.decisao === "GO" ? "ACEITA" : "RECUSADA";
  const motivoRecusa =
    parsed.decisao === "NO_GO" ? (parsed.motivoRecusa ?? null) : null;

  const atualizado = await persistDeliberacao(existente.id, {
    status: novoStatus,
    motivoRecusa,
  });

  await recordAuditLog({
    acao: parsed.decisao === "GO" ? "DECISAO_GO" : "DECISAO_NO_GO",
    entidadeTipo: "LICITACAO",
    entidadeId: existente.id,
    antes: { status: statusAnterior },
    depois:
      parsed.decisao === "GO"
        ? { status: "ACEITA" }
        : { status: "RECUSADA", motivoRecusa },
    usuarioId: input.user?.id ?? null,
    usuarioNome: input.user?.name ?? null,
    ip: input.actorContext?.ip ?? null,
  });

  await recordStatusHistorico({
    licitacaoId: existente.id,
    statusAnterior,
    statusNovo: novoStatus,
    motivo: motivoRecusa,
    usuarioId: input.user?.id ?? null,
  });

  return atualizado;
}

/**
 * Cadastro manual de licitação (`+ Adicionar Licitação Manualmente`) para
 * certames capturados fora da esteira automática (sprint-1-spec §2.3):
 * valida com `criarLicitacaoManualSchema`, exige `licitacao:create` quando o
 * usuário é informado, gera `pncpId` `MANUAL-${timestamp}-${random}` se
 * omitido, calcula o `hashCritico`, persiste com `status: "PENDENTE"` e grava
 * `CADASTRO_MANUAL_LICITACAO` em `audit_log`.
 */
export async function criarOportunidadeManual(
  rawInput: unknown,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<LicitacaoRecord> {
  const input = criarLicitacaoManualSchema.parse(rawInput);

  if (user !== undefined && !can(user, "licitacao:create", "licitacao")) {
    throw new OportunidadesServiceError(
      "FORBIDDEN",
      "Usuário sem permissão para cadastrar licitações manualmente (licitacao:create)",
      403,
    );
  }

  const pncpId =
    input.pncpId ?? `MANUAL-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const hashCritico = computeHashCritico({
    dataAbertura: input.dataAbertura,
    dataEncerramentoProposta: input.dataEncerramentoProposta ?? input.dataAbertura,
    valorEstimado: input.valorEstimado,
    resumo: input.resumo,
    modalidade: input.modalidade,
    numeroEdital: input.numeroEdital,
    orgaoCnpj: input.orgaoCnpj,
  });

  const normModalidade = normalizarModalidade(input.modalidade);
  const classif = classificarLicitacaoPorTexto(input.resumo, input.miniResumo);

  const data: NovaLicitacaoData = {
    idPncp: pncpId,
    numeroControlePNCP: pncpId,
    numeroEdital: input.numeroEdital,
    orgaoNome: input.orgaoNome,
    orgaoCnpj: input.orgaoCnpj,
    uf: input.uf.toUpperCase(),
    municipio: input.municipio ?? null,
    esfera: null,
    poder: null,
    modalidade: normModalidade.nome,
    modalidadeCodigo: normModalidade.codigo,
    segmentoMacro: input.segmentoMacro || classif.macro,
    subcategorias: input.subsegmento
      ? Array.from(new Set([input.subsegmento, ...classif.subcategorias]))
      : classif.subcategorias,
    portalDisputa: null,
    miniResumo: input.miniResumo,
    resumo: input.resumo,
    valorEstimado: input.valorEstimado,
    dataAbertura: input.dataAbertura,
    dataEncerramentoProposta: input.dataEncerramentoProposta ?? input.dataAbertura,
    dataPublicacaoPncp: null,
    dataUltimaAtualizacao: null,
    status: "PENDENTE",
    parecerIA: input.parecerIA,
    justificativaIA: null,
    tipoSistemaCodigo: input.tipoSistemaCodigo,
    atestadosExigidos: [],
    motivoRecusa: null,
    quantidadeLotes: 1,
    loteUnico: true,
    precoPorLote: false,
    isPresencial: input.isPresencial,
    distanciaGoianiaKm: null,
    linkPncp: null,
    linkSistemaOrigem: null,
    hashCritico,
    valorArrematado: null,
    responsavelId: null,
  };

  let criado: LicitacaoRecord;
  try {
    criado = await prisma.licitacao.create({
      data: data as Prisma.LicitacaoUncheckedCreateInput,
    });
  } catch (err) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      criado = await prisma.licitacao.create({
        data: data as Prisma.LicitacaoUncheckedCreateInput,
      });
    } catch {
      // PostgreSQL indisponível: fallback resiliente em memória (CI/testes)
      criado = insertInMemoryLicitacao(data);
    }
  }

  await recordAuditLog({
    acao: "CADASTRO_MANUAL_LICITACAO",
    entidadeTipo: "LICITACAO",
    entidadeId: criado.id,
    antes: null,
    depois: {
      idPncp: criado.idPncp,
      numeroEdital: criado.numeroEdital,
      orgaoNome: criado.orgaoNome,
      status: criado.status,
      hashCritico,
    },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return criado;
}

export async function atualizarLicitacao(
  id: string,
  patch: Partial<LicitacaoRecord>,
  user?: RbacUser,
  actorContext?: OportunidadesActorContext,
): Promise<any> {
  const antes = await getOportunidadeById(id);
  await persistDeliberacao(id, patch);

  await recordAuditLog({
    acao: "LICITACAO_UPDATE",
    entidadeTipo: "LICITACAO",
    entidadeId: id,
    antes: {
      tipoSistemaCodigo: antes.tipoSistemaCodigo,
      isPresencial: antes.isPresencial,
    },
    depois: {
      tipoSistemaCodigo: patch.tipoSistemaCodigo ?? antes.tipoSistemaCodigo,
      isPresencial: patch.isPresencial ?? antes.isPresencial,
    },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return getOportunidadeById(id);
}

/**
 * Consulta a API oficial do PNCP para sincronizar anexos e arquivos do edital (Sprint 6).
 */
export async function buscarESincronizarArquivosEditalPncp(
  licitacaoId: string,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
): Promise<{ ok: boolean; sincronizados: number; arquivos: any[]; erroConexao?: boolean; mensagem?: string }> {
  const oportunidade = await getOportunidadeById(licitacaoId);
  const idPncp = oportunidade.idPncp || "";

  // Formato PNCP padrão: CNPJ-1-SEQ/ANO ou similar
  const partes = idPncp.split("-");
  const cnpj = partes[0] ? partes[0].replace(/\D/g, "") : oportunidade.orgaoCnpj.replace(/\D/g, "");
  let ano = new Date().getFullYear();
  let sequencial = "1";

  if (partes[2]) {
    const sub = partes[2].split("/");
    sequencial = sub[0] || "1";
    ano = parseInt(sub[1], 10) || ano;
  }

  let arquivosEncontrados: Array<{ nome: string; url: string; tamanho?: number }> = [];
  let erroConexao = false;

  try {
    const pncpUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
    const res = await fetch(pncpUrl, {
      headers: { accept: "*/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        arquivosEncontrados = data.map((item: any) => ({
          nome: item.titulo || item.nome || `Edital_${sequencial}.pdf`,
          url: item.url || item.uri || `https://pncp.gov.br/app/editais/${idPncp}`,
          tamanho: item.tamanho || 1048576,
        }));
      }
    }
  } catch (err) {
    erroConexao = true;
    console.warn("[buscarESincronizarArquivosEditalPncp] Falha ao consultar API PNCP:", err);
  }

  const sincronizados: any[] = [];
  for (const arq of arquivosEncontrados) {
    const criado = await adicionarArquivoEdital(
      licitacaoId,
      {
        nome: arq.nome,
        tamanho: arq.tamanho || 1048576,
        mimeType: "application/pdf",
        caminho: arq.url,
        r2Key: `pncp/${idPncp}/${arq.nome}`,
        r2Url: arq.url,
        cachedAt: new Date(),
      },
      user,
      actorContext,
    );
    sincronizados.push(criado);
  }

  await recordAuditLog({
    acao: "EDITAL_PNCP_SYNC",
    entidadeTipo: "LICITACAO",
    entidadeId: licitacaoId,
    antes: null,
    depois: {
      sincronizados: sincronizados.length,
      idPncp,
    },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  let mensagem: string;
  if (erroConexao) {
    mensagem = "Não foi possível conectar ao portal do PNCP no momento.";
  } else if (sincronizados.length > 0) {
    mensagem = `${sincronizados.length} arquivo(s) oficial(is) sincronizado(s) com sucesso!`;
  } else {
    mensagem = "Nenhum arquivo disponibilizado pelo órgão no PNCP para esta contratação.";
  }

  return {
    ok: !erroConexao,
    erroConexao,
    sincronizados: sincronizados.length,
    arquivos: sincronizados,
    mensagem,
  };
}

/**
 * Remove todas as oportunidades testes do banco de dados e limpa a store em memória.
 */
export async function limparTodasOportunidadesTestes(): Promise<{ count: number }> {
  let count = 0;
  try {
    const deleted = await prisma.$transaction([
      prisma.licitacaoAtribuido.deleteMany(),
      prisma.arquivo.deleteMany(),
      prisma.repositorioSimilar.deleteMany(),
      prisma.analiseStatusParticipacao.deleteMany(),
      prisma.licitacaoStatusHistorico.deleteMany(),
      prisma.impugnacao.deleteMany({ where: { licitacaoId: { not: null } } }),
      prisma.notificacao.deleteMany({ where: { licitacaoId: { not: null } } }),
      prisma.licitacao.deleteMany(),
    ]);
    count = deleted[7]?.count ?? 0;
  } catch (error) {
    console.warn("[limparTodasOportunidadesTestes] Erro ao deletar no Prisma, limpando store em memória:", error);
  }
  clearInMemoryLicitacoes();
  return { count };
}

