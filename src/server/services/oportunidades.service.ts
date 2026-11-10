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
import {
  disputaItemRegraSchema,
  validarRegrasDisputa,
} from "@/server/schemas/proposta-calculadora.schema";
import { computeHashCritico } from "./hash-critico";
import {
  clearInMemoryLicitacoes,
  deleteInMemoryLicitacaoArquivo,
  deleteInMemoryLicitacaoRepositorio,
  getInMemoryLicitacaoById,
  getInMemoryLicitacaoEquipe,
  getInMemoryTenantLicitacao,
  getInMemoryUsuario,
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoAnaliseIA,
  insertInMemoryLicitacaoArquivo,
  insertInMemoryLicitacaoRepositorio,
  type LicitacaoRecord,
  listInMemoryLicitacaoAnalisesIA,
  listInMemoryLicitacaoArquivos,
  listInMemoryLicitacaoNotas,
  listInMemoryLicitacaoRepositorios,
  listInMemoryLicitacoes,
  listInMemoryTenantLicitacoes,
  type NovaLicitacaoData,
  setInMemoryLicitacaoEquipe,
  setInMemoryTenantLicitacao,
  updateInMemoryLicitacao,
} from "./licitacoes-store";
import { notificarMovimentacaoLicitacao } from "./notificacoes.service";
import { normalizarModalidade } from "@/server/schemas/modalidades.schema";
import { classificarLicitacaoPorTexto } from "./classificador-segmentos.service";
import {
  CATALOGO_MACRO_SEGMENTOS,
  MACRO_POR_SUBCATEGORIA,
  type MacroSegmento,
} from "@/server/schemas/segmentos.schema";
import { inMemoryTenants } from "@/server/services/tenant.service";

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
  tenantId?: string | null;
}

export interface DeliberarOportunidadeInput {
  id: string;
  decisao: DecisaoOportunidadeInput["decisao"];
  motivoRecusa?: string;
  user: RbacUser | null | undefined;
  actorContext?: OportunidadesActorContext;
  tenantId?: string | null;
}

const LIMITE_ATE_500K = 500_000;
const LIMITE_2M = 2_000_000;

type ParsedFilters = OportunidadesFilterInput;

function mesCorrente(agora: Date = new Date()): { inicio: Date; fim: Date } {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  return { inicio, fim };
}

function buildPrismaWhere(
  filters: ParsedFilters,
  options?: { targetIds?: string[]; excludedIds?: string[]; tenantCriadoEm?: Date | null },
): Prisma.LicitacaoWhereInput {
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
      and.push({ segmentoMacro: selectedSegments[0] });
    } else if (selectedSegments.length > 1) {
      and.push({ segmentoMacro: { in: selectedSegments } });
    }
  } else if (
    filters.segmentosTenantAtivo &&
    filters.segmentosTenantAtivo.length > 0
  ) {
    and.push({ segmentoMacro: { in: filters.segmentosTenantAtivo } });
  }
  if (filters.subsegmento) {
    and.push({ subcategorias: { array_contains: [filters.subsegmento] } });
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

  if (options?.targetIds !== undefined) {
    and.push({ id: { in: options.targetIds } });
  } else {
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
  }

  if (options?.excludedIds && options.excludedIds.length > 0) {
    and.push({ id: { notIn: options.excludedIds } });
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

  const dataIniStr = filters.dataLimiteInicio || filters.dataInicio;
  const dataFimStr = filters.dataLimiteFim || filters.dataFim;
  if (dataIniStr || dataFimStr) {
    const range: any = {};
    if (dataIniStr) {
      const d = new Date(dataIniStr);
      d.setHours(0, 0, 0, 0);
      range.gte = d;
    }
    if (dataFimStr) {
      const d = new Date(dataFimStr);
      d.setHours(23, 59, 59, 999);
      range.lte = d;
    }
    and.push({
      OR: [
        { dataEncerramentoProposta: range },
        {
          AND: [
            { dataEncerramentoProposta: null },
            { dataAbertura: range },
          ],
        },
      ],
    });
  }

  if (options?.tenantCriadoEm) {
    const trintaDiasAtras = new Date(options.tenantCriadoEm.getTime() - 30 * 24 * 60 * 60 * 1000);
    and.push({
      OR: [
        { createdAt: { gte: trintaDiasAtras } },
        { dataEncerramentoProposta: { gte: options.tenantCriadoEm } },
        {
          AND: [
            { dataEncerramentoProposta: null },
            { dataAbertura: { gte: options.tenantCriadoEm } },
          ],
        },
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
  const storedMacro = (record as any).segmentoMacro as string | null | undefined;
  const storedSubs: string[] = Array.isArray((record as any).subcategorias)
    ? (record as any).subcategorias
    : [];
  const macroValida = !!storedMacro && storedMacro in CATALOGO_MACRO_SEGMENTOS;
  const subsValidas = storedSubs.filter(
    (codigo) => MACRO_POR_SUBCATEGORIA[codigo] === storedMacro,
  );

  // Otimização de Performance: se já possui segmentoMacro e subcategorias válidos
  // na taxonomia oficial (40 x 188), não reprocessar o classificador.
  if (macroValida && subsValidas.length > 0) {
    return record;
  }

  const classif = classificarLicitacaoPorTexto(
    record.resumo || (record as any).objeto || "",
    record.miniResumo || "",
  );
  const effectiveMacro = macroValida ? (storedMacro as string) : classif.macro;
  const effectiveSubs =
    effectiveMacro === classif.macro ? classif.subcategorias : subsValidas;
  return {
    ...record,
    segmentoMacro: effectiveMacro,
    subcategorias: effectiveSubs,
  } as LicitacaoRecord;
}

/**
 * Escopo de subatividades do tenant: quando o cliente selecionou subatividades de
 * uma macro-categoria, só passam certames com ao menos uma delas. Macro-categorias
 * em que o cliente não restringiu subatividades permanecem liberadas.
 */
function passaSubsegmentosTenant(
  macro: string | null | undefined,
  subs: string[],
  subsegmentosTenant?: string[],
): boolean {
  if (!subsegmentosTenant || subsegmentosTenant.length === 0) return true;
  const def = macro ? CATALOGO_MACRO_SEGMENTOS[macro as MacroSegmento] : undefined;
  if (!def) return true;
  const restringiu = def.subcategorias.some((s) => subsegmentosTenant.includes(s.codigo));
  if (!restringiu || subs.length === 0) return true;
  return subs.some((codigo) => subsegmentosTenant.includes(codigo));
}

function matchesFilters(
  record: LicitacaoRecord,
  filters: ParsedFilters,
  hasTenantContext: boolean = false,
  tenantCriadoEm?: Date | null,
): boolean {
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
      if (!macro || !selectedSegments.includes(macro)) {
        return false;
      }
    }
  } else if (
    filters.segmentosTenantAtivo &&
    filters.segmentosTenantAtivo.length > 0
  ) {
    const macro = (enriched as any).segmentoMacro;
    if (!macro || !filters.segmentosTenantAtivo.includes(macro)) {
      return false;
    }
  }
  const subsDoRegistro: string[] = Array.isArray((enriched as any).subcategorias)
    ? (enriched as any).subcategorias
    : [];
  if (filters.subsegmento) {
    if (!subsDoRegistro.includes(filters.subsegmento)) {
      return false;
    }
  } else if (
    !passaSubsegmentosTenant(
      (enriched as any).segmentoMacro,
      subsDoRegistro,
      filters.subsegmentosTenantAtivo,
    )
  ) {
    return false;
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
  if (
    filters.status === "MINHAS" ||
    (hasTenantContext && (filters.status === "TODOS" || (filters.status as string) === "TODAS"))
  ) {
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

  const dataIniStr = filters.dataLimiteInicio || filters.dataInicio;
  const dataFimStr = filters.dataLimiteFim || filters.dataFim;
  if (dataIniStr || dataFimStr) {
    const dataLimite = record.dataEncerramentoProposta
      ? new Date(record.dataEncerramentoProposta)
      : new Date(record.dataAbertura);
    if (dataIniStr) {
      const ini = new Date(dataIniStr);
      ini.setHours(0, 0, 0, 0);
      if (dataLimite.getTime() < ini.getTime()) {
        return false;
      }
    }
    if (dataFimStr) {
      const fim = new Date(dataFimStr);
      fim.setHours(23, 59, 59, 999);
      if (dataLimite.getTime() > fim.getTime()) {
        return false;
      }
    }
  }

  if (tenantCriadoEm) {
    const trintaDiasAtras = new Date(tenantCriadoEm.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recCreatedAt = record.createdAt ? new Date(record.createdAt) : new Date();
    const dentroJanela30d = recCreatedAt.getTime() >= trintaDiasAtras.getTime();

    const dataLimite = record.dataEncerramentoProposta
      ? new Date(record.dataEncerramentoProposta)
      : new Date(record.dataAbertura);
    const vigenteNoCadastro = dataLimite.getTime() >= tenantCriadoEm.getTime();

    if (!dentroJanela30d && !vigenteNoCadastro) {
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

function compareByDataLimiteDesc(
  a: LicitacaoRecord,
  b: LicitacaoRecord,
): number {
  const dateA = a.dataEncerramentoProposta ? new Date(a.dataEncerramentoProposta).getTime() : a.dataAbertura.getTime();
  const dateB = b.dataEncerramentoProposta ? new Date(b.dataEncerramentoProposta).getTime() : b.dataAbertura.getTime();
  const diff = dateB - dateA;
  if (diff !== 0) {
    return diff;
  }
  return a.idPncp.localeCompare(b.idPncp);
}

function sortOportunidades(
  a: LicitacaoRecord,
  b: LicitacaoRecord,
  ordenacao?: "dataLimiteDesc" | "dataAberturaAsc",
): number {
  if (ordenacao === "dataLimiteDesc") {
    return compareByDataLimiteDesc(a, b);
  }
  return compareByDataAberturaAsc(a, b);
}

/**
 * Listagem da Central de Oportunidades (PRD §4.4 / sprint-1-spec §2.3 / Semana 02):
 * sempre ordenada por Data Limite DESC (mais distante primeiro) e com todos
 * os filtros operacionais (`tipoSistema`, `uf`, `faixaValor`, `valorMin/Max`,
 * `status`, `parecerIA`, `periodo`, `dataLimiteInicio`, `dataLimiteFim`, `busca`).
 * Lê o PostgreSQL e mescla com o fallback em memória (deduplicado por `idPncp`,
 * banco prevalece), garantindo dados ricos mesmo sem banco acessível.
 */
export async function listOportunidades(
  rawFilters: unknown = {},
  tenantId?: string | null,
): Promise<LicitacaoRecord[]> {
  const filters = oportunidadesFilterSchema.parse(rawFilters ?? {});

  let tenantCriadoEm: Date | null = null;
  const tenantStatusMap = new Map<string, { statusKanban: string; motivoRecusa?: string | null }>();
  if (tenantId) {
    const memTenant = inMemoryTenants.get(tenantId);
    if (memTenant) {
      tenantCriadoEm = (memTenant as any).criadoEm ? new Date((memTenant as any).criadoEm) : null;
    } else {
      try {
        const dbTenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { criadoEm: true },
        });
        if (dbTenant?.criadoEm) {
          tenantCriadoEm = dbTenant.criadoEm;
        }
      } catch {}
    }

    try {
      const dbTenantRecords = await prisma.tenantLicitacao.findMany({
        where: { tenantId },
      });
      for (const r of dbTenantRecords) {
        tenantStatusMap.set(r.licitacaoId, {
          statusKanban: r.statusKanban,
          motivoRecusa: r.motivoRecusa,
        });
      }
    } catch {}

    for (const r of listInMemoryTenantLicitacoes(tenantId)) {
      tenantStatusMap.set(r.licitacaoId, {
        statusKanban: r.statusKanban,
        motivoRecusa: r.motivoRecusa,
      });
    }
  }

  const isKanbanFetch =
    filters.status === "MINHAS" ||
    filters.status === "TODOS" ||
    (filters.status as string) === "TODAS";

  if (isKanbanFetch) {
    if (!tenantId) {
      return [];
    }
    const activeIds = Array.from(tenantStatusMap.entries())
      .filter(([_, v]) => v.statusKanban !== "PENDENTE" && v.statusKanban !== "RECUSADA")
      .map(([id]) => id);
    if (activeIds.length === 0) {
      return [];
    }
  }

  if (filters.status && filters.status !== "PENDENTE" && !isKanbanFetch) {
    if (!tenantId) {
      return [];
    }
    const matchingIds = Array.from(tenantStatusMap.entries())
      .filter(([_, v]) => v.statusKanban === filters.status)
      .map(([id]) => id);
    if (matchingIds.length === 0) {
      return [];
    }
  }

  const applyTenantOverride = (rec: LicitacaoRecord): LicitacaoRecord => {
    if (!tenantId) return rec;
    const tInfo = tenantStatusMap.get(rec.id);
    return {
      ...rec,
      status: (tInfo?.statusKanban || "PENDENTE") as any,
      motivoRecusa: tInfo?.motivoRecusa ?? (tInfo ? null : rec.motivoRecusa),
    };
  };

  const mergedByIdPncp = new Map<string, LicitacaoRecord>();

  for (const rawRecord of listInMemoryLicitacoes()) {
    const record = applyTenantOverride(enrichRecordSegment(rawRecord));
    if (matchesFilters(record, filters, !!tenantId, tenantCriadoEm)) {
      mergedByIdPncp.set(record.idPncp, record);
    }
  }

  let prismaOptions: { targetIds?: string[]; excludedIds?: string[]; tenantCriadoEm?: Date | null } | undefined;
  if (tenantId) {
    prismaOptions = { tenantCriadoEm };
    if (isKanbanFetch) {
      const activeIds = Array.from(tenantStatusMap.entries())
        .filter(([_, v]) => v.statusKanban !== "PENDENTE" && v.statusKanban !== "RECUSADA")
        .map(([id]) => id);
      prismaOptions.targetIds = activeIds;
    } else if (filters.status && filters.status !== "PENDENTE") {
      const matchingIds = Array.from(tenantStatusMap.entries())
        .filter(([_, v]) => v.statusKanban === filters.status)
        .map(([id]) => id);
      prismaOptions.targetIds = matchingIds;
    } else if (!filters.status || filters.status === "PENDENTE") {
      const deliberatedIds = Array.from(tenantStatusMap.entries())
        .filter(([_, v]) => v.statusKanban !== "PENDENTE")
        .map(([id]) => id);
      if (deliberatedIds.length > 0) {
        prismaOptions.excludedIds = deliberatedIds;
      }
    }
  }

  try {
    const dbRecords = await prisma.licitacao.findMany({
      where: buildPrismaWhere(filters, prismaOptions),
      orderBy: [{ dataEncerramentoProposta: "desc" }, { dataAbertura: "desc" }],
    });
    for (const rawRecord of dbRecords) {
      const record = applyTenantOverride(enrichRecordSegment(rawRecord));
      if (matchesFilters(record, filters, !!tenantId, tenantCriadoEm)) {
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
        where: buildPrismaWhere(filters, prismaOptions),
        orderBy: [{ dataEncerramentoProposta: "desc" }, { dataAbertura: "desc" }],
      });
      for (const rawRecord of retryRecords) {
        const record = applyTenantOverride(enrichRecordSegment(rawRecord));
        if (matchesFilters(record, filters, !!tenantId, tenantCriadoEm)) {
          mergedByIdPncp.set(record.idPncp, record);
        }
      }
    } catch (healErr) {
      console.warn("[listOportunidades] Auto-healing falhou:", healErr);
    }
  }

  return [...mergedByIdPncp.values()].sort((a, b) => sortOportunidades(a, b, filters.ordenacao));
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
  tenantId?: string | null,
): Promise<PaginatedOportunidadesResult> {
  const filters = oportunidadesFilterSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;

  const all = await listOportunidades(rawFilters, tenantId);
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

  let statusKanban = base.status || "PENDENTE";
  let motivoRecusa = base.motivoRecusa ?? null;
  let tenantLic = tenantId ? getInMemoryTenantLicitacao(tenantId, realId) : null;
  if (tenantId && !tenantLic) {
    try {
      const dbTenantLic = await prisma.tenantLicitacao.findUnique({
        where: {
          tenantId_licitacaoId: { tenantId, licitacaoId: realId },
        },
      });
      if (dbTenantLic) {
        tenantLic = {
          id: dbTenantLic.id,
          tenantId: dbTenantLic.tenantId,
          licitacaoId: dbTenantLic.licitacaoId,
          statusKanban: dbTenantLic.statusKanban,
          motivoRecusa: dbTenantLic.motivoRecusa,
          responsavelId: dbTenantLic.responsavelId,
          membrosEquipeIds: Array.isArray((dbTenantLic as any).membrosEquipeIds)
            ? (dbTenantLic as any).membrosEquipeIds
            : [],
          lanceMinimo: dbTenantLic.lanceMinimo,
          valorProposta: (dbTenantLic as any).valorProposta ?? null,
          valorHomologado: (dbTenantLic as any).valorHomologado ?? null,
          calculadoraDados: (dbTenantLic as any).calculadoraDados ?? null,
        };
      }
    } catch {}
  }

  if (tenantId) {
    if (tenantLic) {
      statusKanban = tenantLic.statusKanban;
      motivoRecusa = tenantLic.motivoRecusa;
    } else {
      statusKanban = "PENDENTE";
      motivoRecusa = null;
    }
  }

  const memEquipe = getInMemoryLicitacaoEquipe(realId, tenantId);

  let responsavelId: string | null = null;
  if (tenantId) {
    if (memEquipe !== null) {
      responsavelId = memEquipe.responsavelId;
    } else if (tenantLic) {
      responsavelId = tenantLic.responsavelId ?? null;
    } else {
      responsavelId = null;
    }
  } else {
    responsavelId = memEquipe !== null ? memEquipe.responsavelId : (base.responsavelId ?? null);
  }

  const responsavel =
    base.responsavel && base.responsavel.id === responsavelId
      ? base.responsavel
      : await resolveUserSummary(responsavelId);

  let atribuidos: any[] = [];
  if (tenantId) {
    if (memEquipe !== null) {
      const resolvedAtribuidos: any[] = [];
      for (const uid of memEquipe.atribuidoIds) {
        const u = await resolveUserSummary(uid);
        resolvedAtribuidos.push({
          id: `atrib_${realId}_${uid}`,
          licitacaoId: realId,
          usuarioId: uid,
          usuario: u,
          criadoEm: new Date(),
        });
      }
      atribuidos = resolvedAtribuidos;
    } else if (tenantLic && (tenantLic as any).membrosEquipeIds && (tenantLic as any).membrosEquipeIds.length > 0) {
      const resolvedAtribuidos: any[] = [];
      for (const uid of (tenantLic as any).membrosEquipeIds) {
        const u = await resolveUserSummary(uid);
        resolvedAtribuidos.push({
          id: `atrib_${realId}_${uid}`,
          licitacaoId: realId,
          usuarioId: uid,
          usuario: u,
          criadoEm: new Date(),
        });
      }
      atribuidos = resolvedAtribuidos;
    } else {
      atribuidos = [];
    }
  } else {
    atribuidos = Array.isArray(base.atribuidos) ? [...base.atribuidos] : [];
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
  const memAnalises = listInMemoryLicitacaoAnalisesIA(realId, tenantId);
  const analisesMap = new Map<string, any>();
  for (const an of [...memAnalises, ...dbAnalises]) {
    if (an && an.id && !analisesMap.has(an.id)) {
      if (!tenantId || !an.tenantId || an.tenantId === tenantId) {
        analisesMap.set(an.id, an);
      }
    }
  }

  const dbNotas: any[] = Array.isArray(base.notas) ? base.notas : [];
  const memNotas = listInMemoryLicitacaoNotas(realId, tenantId);
  const notasMap = new Map<string, any>();
  for (const n of [...memNotas, ...dbNotas]) {
    if (n && n.id && !notasMap.has(n.id)) {
      if (!tenantId || !n.tenantId || n.tenantId === tenantId) {
        notasMap.set(n.id, n);
      }
    }
  }

  return {
    ...base,
    status: statusKanban,
    motivoRecusa,
    lanceMinimo: tenantLic?.lanceMinimo ?? base.lanceMinimo ?? null,
    valorProposta: tenantLic?.valorProposta ?? (base as any).valorProposta ?? null,
    valorHomologado: tenantLic?.valorHomologado ?? (base as any).valorHomologado ?? base.valorArrematado ?? null,
    calculadoraDados: tenantLic?.calculadoraDados ?? (base as any).calculadoraDados ?? null,
    responsavelId,
    responsavel,
    atribuidos,
    arquivos: arquivosFiltrados,
    repositoriosSimilares: Array.from(reposMap.values()),
    analisesIA: Array.from(analisesMap.values()),
    notas: Array.from(notasMap.values()),
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
  tenantId?: string | null,
): Promise<any> {
  const input = kanbanStatusUpdateSchema.parse(rawInput);
  const oportunidade = await getOportunidadeById(id, tenantId);

  const finalLanceMinimo = input.lanceMinimo ?? input.valorMinimo ?? input.valorArrematado ?? (oportunidade as any).lanceMinimo ?? null;
  const finalValorProposta = input.valorProposta ?? (oportunidade as any).valorProposta ?? null;
  const finalValorHomologado = input.valorHomologado ?? input.valorArrematado ?? (oportunidade as any).valorHomologado ?? null;
  const finalCalculadoraDados = input.calculadoraDados !== undefined ? input.calculadoraDados : ((oportunidade as any).calculadoraDados ?? null);

  const regrasDisputaRaw = (finalCalculadoraDados as any)?.disputaConfig?.regrasItens;
  if (
    input.calculadoraDados !== undefined &&
    Array.isArray(regrasDisputaRaw) &&
    regrasDisputaRaw.length > 0
  ) {
    const origemDisputa =
      (finalCalculadoraDados as any)?.disputaConfig?.origemPrecos === "MANUAL"
        ? "MANUAL"
        : "CALCULADORA";
    const regrasParsed = regrasDisputaRaw.flatMap((r: unknown) => {
      const p = disputaItemRegraSchema.safeParse(r);
      return p.success ? [p.data] : [];
    });
    const validacaoDisputa = validarRegrasDisputa(regrasParsed, origemDisputa);
    if (validacaoDisputa.itensPisoMaiorIds.length > 0) {
      throw new OportunidadesServiceError(
        "VALOR_MINIMO_MAIOR_QUE_PROPOSTA",
        validacaoDisputa.erros[0] ||
          "Valor Mínimo (Piso Seguro) não pode ser maior que a Proposta Inicial.",
        400,
      );
    }
    const tentandoDisputaAtiva =
      input.status === "EM_DISPUTA" ||
      (finalCalculadoraDados as any)?.disputaConfig?.statusGeral === "EM_DISPUTA";
    if (tentandoDisputaAtiva && validacaoDisputa.itensSemValorIds.length > 0) {
      throw new OportunidadesServiceError(
        "PRECOS_DISPUTA_INVALIDOS",
        validacaoDisputa.erros[0] ||
          "No modo Manual, informe Proposta Inicial e Valor Mínimo maiores que R$ 0,00 para iniciar a disputa.",
        400,
      );
    }
  }

  let atualizado: any;
  if (tenantId) {
    const respPreservado = oportunidade.responsavelId ?? user?.id ?? null;
    setInMemoryTenantLicitacao(tenantId, oportunidade.id, {
      tenantId,
      licitacaoId: oportunidade.id,
      statusKanban: input.status,
      motivoRecusa: input.motivoPerda ?? null,
      lanceMinimo: finalLanceMinimo,
      valorProposta: finalValorProposta,
      valorHomologado: finalValorHomologado,
      calculadoraDados: finalCalculadoraDados,
      dataDecisao: new Date(),
      responsavelId: respPreservado,
    });

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "tenant_licitacao" ADD COLUMN IF NOT EXISTS "valorProposta" DOUBLE PRECISION;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "tenant_licitacao" ADD COLUMN IF NOT EXISTS "valorHomologado" DOUBLE PRECISION;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "tenant_licitacao" ADD COLUMN IF NOT EXISTS "calculadoraDados" JSONB;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "TenantLicitacao" ADD COLUMN IF NOT EXISTS "valorProposta" DOUBLE PRECISION;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "TenantLicitacao" ADD COLUMN IF NOT EXISTS "valorHomologado" DOUBLE PRECISION;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "TenantLicitacao" ADD COLUMN IF NOT EXISTS "calculadoraDados" JSONB;`).catch(() => undefined);

      await prisma.tenantLicitacao.upsert({
        where: {
          tenantId_licitacaoId: {
            tenantId,
            licitacaoId: oportunidade.id,
          },
        },
        update: {
          statusKanban: input.status,
          ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
          ...(finalLanceMinimo !== null ? { lanceMinimo: finalLanceMinimo } : {}),
          ...(finalValorProposta !== null ? { valorProposta: finalValorProposta } : {}),
          ...(finalValorHomologado !== null ? { valorHomologado: finalValorHomologado } : {}),
          ...(finalCalculadoraDados !== undefined ? { calculadoraDados: finalCalculadoraDados } : {}),
          dataDecisao: new Date(),
          ...(respPreservado ? { responsavelId: respPreservado } : {}),
        },
        create: {
          tenantId,
          licitacaoId: oportunidade.id,
          statusKanban: input.status,
          ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
          ...(finalLanceMinimo !== null ? { lanceMinimo: finalLanceMinimo } : {}),
          ...(finalValorProposta !== null ? { valorProposta: finalValorProposta } : {}),
          ...(finalValorHomologado !== null ? { valorHomologado: finalValorHomologado } : {}),
          ...(finalCalculadoraDados !== undefined ? { calculadoraDados: finalCalculadoraDados } : {}),
          dataDecisao: new Date(),
          responsavelId: respPreservado,
        },
      });
    } catch {}

    atualizado = {
      ...oportunidade,
      status: input.status,
      lanceMinimo: finalLanceMinimo,
      valorProposta: finalValorProposta,
      valorHomologado: finalValorHomologado,
      calculadoraDados: finalCalculadoraDados,
      ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
      ...(input.valorArrematado !== undefined ? { valorArrematado: input.valorArrematado } : {}),
    };
  } else {
    try {
      atualizado = await prisma.licitacao.update({
        where: { id: oportunidade.id },
        data: {
          status: input.status,
          ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
          ...(input.valorArrematado !== undefined ? { valorArrematado: input.valorArrematado } : {}),
        },
      });
    } catch {
      atualizado = updateInMemoryLicitacao(oportunidade.id, {
        status: input.status,
        ...(input.motivoPerda ? { motivoRecusa: input.motivoPerda } : {}),
        ...(input.valorArrematado !== undefined ? { valorArrematado: input.valorArrematado } : {}),
      });
    }
    atualizado = {
      ...atualizado,
      lanceMinimo: finalLanceMinimo,
      valorProposta: finalValorProposta,
      valorHomologado: finalValorHomologado,
      calculadoraDados: finalCalculadoraDados,
    };
  }

  await recordAuditLog({
    acao: "KANBAN_STATUS_UPDATE",
    entidadeTipo: "LICITACAO",
    entidadeId: oportunidade.id,
    antes: { status: oportunidade.status },
    depois: { status: atualizado.status, motivoRecusa: atualizado.motivoRecusa },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  await recordStatusHistorico({
    licitacaoId: oportunidade.id,
    statusAnterior: oportunidade.status,
    statusNovo: input.status,
    motivo: input.motivoPerda ?? null,
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
  });

  if (oportunidade.status !== input.status) {
    await notificarMovimentacaoLicitacao({
      licitacaoId: oportunidade.id,
      numeroEdital: oportunidade.numeroEdital,
      orgaoNome: oportunidade.orgaoNome,
      tipoEvento: "STATUS",
      resumoMudanca: `O status do certame foi alterado de ${oportunidade.status} para ${input.status}`,
      tenantId,
      chaveSufixo: `${oportunidade.status}_para_${input.status}_${Date.now()}`,
    }).catch(() => undefined);
  }

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
  tenantId?: string | null,
): Promise<any> {
  const input = equipeUpdateSchema.parse(rawInput);
  const oportunidade = await getOportunidadeById(id, tenantId);
  const realId = oportunidade.id;

  setInMemoryLicitacaoEquipe(
    realId,
    {
      responsavelId: input.responsavelId ?? null,
      atribuidoIds: input.atribuidoIds ?? [],
    },
    tenantId,
  );

  if (tenantId) {
    setInMemoryTenantLicitacao(tenantId, realId, {
      responsavelId: input.responsavelId ?? null,
      membrosEquipeIds: input.atribuidoIds ?? [],
    });
    try {
      await prisma.tenantLicitacao.upsert({
        where: {
          tenantId_licitacaoId: { tenantId, licitacaoId: realId },
        },
        update: {
          responsavelId: input.responsavelId ?? null,
        },
        create: {
          tenantId,
          licitacaoId: realId,
          statusKanban: "PENDENTE",
          responsavelId: input.responsavelId ?? null,
        },
      });
    } catch {}
  } else {
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
  }

  await recordAuditLog({
    acao: "EQUIPE_UPDATE",
    entidadeTipo: "LICITACAO",
    entidadeId: realId,
    tenantId: tenantId ?? null,
    antes: { responsavelId: oportunidade.responsavelId },
    depois: { responsavelId: input.responsavelId, atribuidoIds: input.atribuidoIds },
    usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
    usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  return getOportunidadeById(realId, tenantId);
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

  await notificarMovimentacaoLicitacao({
    licitacaoId: realId,
    numeroEdital: oportunidade.numeroEdital,
    orgaoNome: oportunidade.orgaoNome,
    tipoEvento: "ARQUIVOS",
    resumoMudanca: `Novo documento anexado ao edital: "${criado.nome}"`,
    tenantId: dadosArquivo.tenantId,
    chaveSufixo: `upload_${criado.id}`,
  }).catch(() => undefined);

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
  const tenantId =
    actorContext?.tenantId ?? (user as any)?.activeTenantId ?? null;
  const oportunidade = await getOportunidadeById(licitacaoId, tenantId).catch(
    () => null,
  );
  const realId = oportunidade?.id || licitacaoId;

  // Verifica isolamento multi-tenant do arquivo antes da exclusão
  let arquivoAlvo: any = listInMemoryLicitacaoArquivos(realId).find(
    (a) => a.id === arquivoId,
  );
  if (!arquivoAlvo) {
    try {
      arquivoAlvo = await prisma.arquivo.findFirst({
        where: { id: arquivoId, licitacaoId: realId },
        select: { id: true, tenantId: true },
      });
    } catch {}
  }
  if (arquivoAlvo?.tenantId && tenantId && arquivoAlvo.tenantId !== tenantId) {
    throw new OportunidadesServiceError(
      "FORBIDDEN",
      "Acesso restrito. Este arquivo pertence a outra empresa.",
      403,
    );
  }

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
    tenantId,
  });

  if (oportunidade) {
    await notificarMovimentacaoLicitacao({
      licitacaoId: realId,
      numeroEdital: oportunidade.numeroEdital,
      orgaoNome: oportunidade.orgaoNome,
      tipoEvento: "ARQUIVOS",
      resumoMudanca: `Um arquivo anexado foi removido do dossiê do edital ${oportunidade.numeroEdital}`,
      tenantId,
      chaveSufixo: `remocao_${arquivoId}`,
    }).catch(() => undefined);
  }

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

  const existente = await getOportunidadeById(input.id, input.tenantId);
  const statusAnterior = existente.status;
  const novoStatus = parsed.decisao === "GO" ? "ACEITA" : "RECUSADA";
  const motivoRecusa =
    parsed.decisao === "NO_GO" ? (parsed.motivoRecusa ?? null) : null;

  let atualizado: LicitacaoRecord;

  if (input.tenantId) {
    setInMemoryTenantLicitacao(input.tenantId, existente.id, {
      tenantId: input.tenantId,
      licitacaoId: existente.id,
      statusKanban: novoStatus,
      motivoRecusa,
      dataDecisao: new Date(),
      responsavelId: input.user?.id ?? null,
    });

    try {
      await prisma.tenantLicitacao.upsert({
        where: {
          tenantId_licitacaoId: {
            tenantId: input.tenantId,
            licitacaoId: existente.id,
          },
        },
        update: {
          statusKanban: novoStatus,
          motivoRecusa,
          dataDecisao: new Date(),
          responsavelId: input.user?.id ?? null,
        },
        create: {
          tenantId: input.tenantId,
          licitacaoId: existente.id,
          statusKanban: novoStatus,
          motivoRecusa,
          dataDecisao: new Date(),
          responsavelId: input.user?.id ?? null,
        },
      });
    } catch {}

    atualizado = {
      ...existente,
      status: novoStatus,
      motivoRecusa,
    };
  } else {
    atualizado = await persistDeliberacao(existente.id, {
      status: novoStatus,
      motivoRecusa,
    });
  }

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

  if (statusAnterior !== novoStatus) {
    await notificarMovimentacaoLicitacao({
      licitacaoId: existente.id,
      numeroEdital: existente.numeroEdital,
      orgaoNome: existente.orgaoNome,
      tipoEvento: "STATUS",
      resumoMudanca: `Deliberação registrada: status alterado de ${statusAnterior} para ${novoStatus}`,
      tenantId: input.tenantId,
      chaveSufixo: `${statusAnterior}_para_${novoStatus}_${Date.now()}`,
    }).catch(() => undefined);
  }

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

  const mudouAbertura =
    patch.dataAbertura &&
    new Date(patch.dataAbertura).getTime() !== new Date(antes.dataAbertura).getTime();
  const mudouEncerramento =
    patch.dataEncerramentoProposta &&
    new Date(patch.dataEncerramentoProposta).getTime() !==
      new Date(antes.dataEncerramentoProposta ?? antes.dataAbertura).getTime();

  if (mudouAbertura || mudouEncerramento) {
    const novaDataRef = new Date(
      (patch.dataEncerramentoProposta ?? patch.dataAbertura ?? antes.dataAbertura) as Date,
    ).toLocaleString("pt-BR");
    await notificarMovimentacaoLicitacao({
      licitacaoId: antes.id,
      numeroEdital: antes.numeroEdital,
      orgaoNome: antes.orgaoNome,
      tipoEvento: "DATAS",
      resumoMudanca: `As datas do certame ${antes.numeroEdital} foram atualizadas (novo prazo/abertura: ${novaDataRef})`,
      chaveSufixo: `datas_${Date.now()}`,
    }).catch(() => undefined);
  }

  if (patch.status && patch.status !== antes.status) {
    await notificarMovimentacaoLicitacao({
      licitacaoId: antes.id,
      numeroEdital: antes.numeroEdital,
      orgaoNome: antes.orgaoNome,
      tipoEvento: "STATUS",
      resumoMudanca: `O status do certame foi alterado de ${antes.status} para ${patch.status}`,
      chaveSufixo: `status_${patch.status}_${Date.now()}`,
    }).catch(() => undefined);
  }

  return getOportunidadeById(id);
}

function inferirMimeTypeArquivo(
  nome?: string | null,
  url?: string | null,
  explicitMime?: string | null,
): string {
  if (explicitMime && explicitMime !== "application/octet-stream") {
    return explicitMime;
  }
  const ref = `${nome || ""} ${url || ""}`.toLowerCase();
  if (ref.includes(".zip")) return "application/zip";
  if (ref.includes(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ref.includes(".xls")) return "application/vnd.ms-excel";
  if (ref.includes(".csv")) return "text/csv";
  if (ref.includes(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ref.includes(".doc")) return "application/msword";
  if (ref.includes(".png")) return "image/png";
  if (ref.includes(".jpg") || ref.includes(".jpeg")) return "image/jpeg";
  if (ref.includes(".webp")) return "image/webp";
  if (ref.includes(".txt")) return "text/plain";
  return "application/pdf";
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
    const parsedSeq = parseInt(sub[0], 10);
    sequencial = isNaN(parsedSeq) ? "1" : parsedSeq.toString();
    ano = parseInt(sub[1], 10) || ano;
  }

  let arquivosEncontrados: Array<{ nome: string; url: string; tamanho?: number; mimeType?: string }> = [];
  let erroConexao = false;

  try {
    const pncpUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`;
    const res = await fetch(pncpUrl, {
      headers: { accept: "*/*" },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json();
      let list: any[] = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (Array.isArray(data?.documentos)) {
        list = data.documentos;
      } else if (Array.isArray(data?.data)) {
        list = data.data;
      }
      arquivosEncontrados = list
        .filter((item: any) => item?.statusAtivo !== false)
        .map((item: any, idx: number) => {
          const seqDoc = item.sequencialDocumento ?? item.sequencial ?? idx + 1;
          const url =
            item.url ||
            item.uri ||
            (cnpj && ano && sequencial && item.sequencialDocumento != null
              ? `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos/${seqDoc}`
              : `https://pncp.gov.br/app/editais/${idPncp}`);
          const nome = item.titulo || item.nome || item.tipoDocumentoNome || `Documento_${seqDoc}.pdf`;
          return {
            nome,
            url,
            tamanho: item.tamanho || item.tamanhoArquivo || 1048576,
            mimeType: inferirMimeTypeArquivo(nome, url, item.mimeType || item.contentType),
          };
        });
    }
  } catch (err) {
    erroConexao = true;
    console.warn("[buscarESincronizarArquivosEditalPncp] Falha ao consultar API PNCP:", err);
  }

  const existentesUrls = new Set(
    (oportunidade.arquivos || [])
      .map((a: any) => String(a.r2Url || a.caminho || "").trim())
      .filter(Boolean),
  );

  const sincronizados: any[] = [];
  for (const arq of arquivosEncontrados) {
    if (arq.url && existentesUrls.has(arq.url.trim())) {
      continue;
    }
    const criado = await adicionarArquivoEdital(
      licitacaoId,
      {
        nome: arq.nome,
        tamanho: arq.tamanho || 1048576,
        mimeType: arq.mimeType || "application/pdf",
        caminho: arq.url,
        r2Key: `pncp/${idPncp}/${arq.nome}`,
        r2Url: arq.url,
        cachedAt: new Date(),
      },
      user,
      actorContext,
    );
    if (arq.url) existentesUrls.add(arq.url.trim());
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

