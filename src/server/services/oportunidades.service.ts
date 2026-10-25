import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type RbacUser } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import {
  type DecisaoOportunidadeInput,
  type OportunidadesFilterInput,
  criarLicitacaoManualSchema,
  decisaoOportunidadeSchema,
  oportunidadesFilterSchema,
} from "@/server/schemas/oportunidades.schema";
import { computeHashCritico } from "./hash-critico";
import {
  getInMemoryLicitacaoById,
  insertInMemoryLicitacao,
  type LicitacaoRecord,
  listInMemoryLicitacoes,
  type NovaLicitacaoData,
  updateInMemoryLicitacao,
} from "./licitacoes-store";

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
  if (filters.uf) {
    and.push({ uf: filters.uf });
  }
  if (filters.status) {
    and.push({ status: filters.status });
  }
  if (filters.parecerIA) {
    and.push({ parecerIA: filters.parecerIA });
  }

  const valorCondition: Prisma.FloatFilter = {};
  if (filters.faixaValor === "ATE_500K") {
    valorCondition.lte = LIMITE_ATE_500K;
  } else if (filters.faixaValor === "500K_A_2M") {
    valorCondition.gt = LIMITE_ATE_500K;
    valorCondition.lte = LIMITE_2M;
  } else if (filters.faixaValor === "ACIMA_2M") {
    valorCondition.gt = LIMITE_2M;
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

function matchesFilters(record: LicitacaoRecord, filters: ParsedFilters): boolean {
  if (filters.tipoSistema && record.tipoSistemaCodigo !== filters.tipoSistema) {
    return false;
  }
  if (filters.uf && record.uf !== filters.uf) {
    return false;
  }
  if (filters.status && record.status !== filters.status) {
    return false;
  }
  if (filters.parecerIA && record.parecerIA !== filters.parecerIA) {
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
  if (filters.faixaValor === "ACIMA_2M" && record.valorEstimado <= LIMITE_2M) {
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
    const alvo = [record.orgaoNome, record.miniResumo, record.resumo, record.numeroEdital]
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
  const diff = a.dataAbertura.getTime() - b.dataAbertura.getTime();
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

  for (const record of listInMemoryLicitacoes()) {
    if (matchesFilters(record, filters)) {
      mergedByIdPncp.set(record.idPncp, record);
    }
  }

  try {
    const dbRecords = await prisma.licitacao.findMany({
      where: buildPrismaWhere(filters),
      orderBy: { dataAbertura: "asc" },
    });
    for (const record of dbRecords) {
      mergedByIdPncp.set(record.idPncp, record);
    }
  } catch {
    // PostgreSQL indisponível: resposta servida pelo fallback em memória
  }

  return [...mergedByIdPncp.values()].sort(compareByDataAberturaAsc);
}

/**
 * Busca uma oportunidade pelo identificador interno (`id`).
 * Lança `OportunidadesServiceError` com `status: 404` quando não encontrada.
 */
export async function getOportunidadeById(
  id: string,
): Promise<LicitacaoRecord> {
  try {
    const found = await prisma.licitacao.findUnique({ where: { id } });
    if (found) {
      return found;
    }
  } catch {
    // PostgreSQL indisponível: tenta o fallback em memória
  }

  const inMemory = getInMemoryLicitacaoById(id);
  if (inMemory) {
    return inMemory;
  }

  throw new OportunidadesServiceError(
    "OPORTUNIDADE_NAO_ENCONTRADA",
    `Licitação '${id}' não encontrada`,
    404,
  );
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
  } catch {
    // PostgreSQL indisponível ou registro fora do banco: fallback em memória
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
    valorEstimado: input.valorEstimado,
    resumo: input.resumo,
    modalidade: input.modalidade,
    numeroEdital: input.numeroEdital,
    orgaoCnpj: input.orgaoCnpj,
  });

  const data: NovaLicitacaoData = {
    idPncp: pncpId,
    numeroEdital: input.numeroEdital,
    orgaoNome: input.orgaoNome,
    orgaoCnpj: input.orgaoCnpj,
    uf: input.uf.toUpperCase(),
    municipio: input.municipio ?? null,
    esfera: null,
    poder: null,
    modalidade: input.modalidade,
    portalDisputa: null,
    miniResumo: input.miniResumo,
    resumo: input.resumo,
    valorEstimado: input.valorEstimado,
    dataAbertura: input.dataAbertura,
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
    responsavelId: null,
  };

  let criado: LicitacaoRecord;
  try {
    criado = await prisma.licitacao.create({
      data: data as Prisma.LicitacaoUncheckedCreateInput,
    });
  } catch {
    // PostgreSQL indisponível: fallback resiliente em memória (CI/testes)
    criado = insertInMemoryLicitacao(data);
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
