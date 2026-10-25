import { randomUUID } from "node:crypto";
import type { Licitacao } from "@prisma/client";
import {
  buildLicitacoesSeed,
  type LicitacaoSeedItem,
} from "@/config/licitacoes-seed";
import { computeHashCritico } from "./hash-critico";

/**
 * Fallback resiliente em memória para licitações (PRD §7 / sprint-1-spec §2.3):
 * espelha o modelo `Licitacao` do Prisma para que os serviços de ingestão e
 * oportunidades operem de forma idêntica com PostgreSQL ativo ou indisponível
 * (ex.: execução isolada de testes unitários em CI).
 *
 * O store é inicializado preguiçosamente com o conjunto seed realista de
 * `src/config/licitacoes-seed.ts` (4 certames cobrindo GO/AVALIAR/NO_GO).
 */
export type LicitacaoRecord = Licitacao;

export type NovaLicitacaoData = Omit<
  LicitacaoRecord,
  "id" | "createdAt" | "updatedAt"
>;

let storeById: Map<string, LicitacaoRecord> | null = null;
let storeIdByIdPncp: Map<string, string> | null = null;

function seedToRecord(seed: LicitacaoSeedItem): LicitacaoRecord {
  const agora = new Date();
  return {
    id: `seed_${randomUUID()}`,
    idPncp: seed.idPncp,
    numeroEdital: seed.numeroEdital,
    orgaoNome: seed.orgaoNome,
    orgaoCnpj: seed.orgaoCnpj,
    uf: seed.uf,
    municipio: seed.municipio,
    esfera: seed.esfera,
    poder: seed.poder,
    modalidade: seed.modalidade,
    portalDisputa: seed.portalDisputa,
    miniResumo: seed.miniResumo,
    resumo: seed.resumo,
    valorEstimado: seed.valorEstimado,
    dataAbertura: seed.dataAbertura,
    dataPublicacaoPncp: seed.dataPublicacaoPncp,
    dataUltimaAtualizacao: seed.dataPublicacaoPncp,
    status: seed.status,
    parecerIA: seed.parecerIA,
    justificativaIA: seed.justificativaIA,
    tipoSistemaCodigo: seed.tipoSistemaCodigo,
    atestadosExigidos: [],
    motivoRecusa: null,
    quantidadeLotes: seed.quantidadeLotes,
    loteUnico: seed.loteUnico,
    precoPorLote: seed.precoPorLote,
    isPresencial: seed.isPresencial,
    distanciaGoianiaKm: seed.distanciaGoianiaKm,
    linkPncp: seed.linkPncp,
    linkSistemaOrigem: null,
    hashCritico: computeHashCritico(seed),
    responsavelId: null,
    createdAt: agora,
    updatedAt: agora,
  };
}

function ensureStore(): {
  byId: Map<string, LicitacaoRecord>;
  idByIdPncp: Map<string, string>;
} {
  if (!storeById || !storeIdByIdPncp) {
    storeById = new Map();
    storeIdByIdPncp = new Map();
    for (const seed of buildLicitacoesSeed()) {
      const record = seedToRecord(seed);
      storeById.set(record.id, record);
      storeIdByIdPncp.set(record.idPncp, record.id);
    }
  }
  return { byId: storeById, idByIdPncp: storeIdByIdPncp };
}

export function listInMemoryLicitacoes(): LicitacaoRecord[] {
  const { byId } = ensureStore();
  return [...byId.values()];
}

export function getInMemoryLicitacaoById(id: string): LicitacaoRecord | null {
  const { byId, idByIdPncp } = ensureStore();
  const direct = byId.get(id);
  if (direct) return direct;
  const byPncpId = idByIdPncp.get(id);
  if (byPncpId) return byId.get(byPncpId) ?? null;
  return null;
}

export function getInMemoryLicitacaoByIdPncp(
  idPncp: string,
): LicitacaoRecord | null {
  const { byId, idByIdPncp } = ensureStore();
  const id = idByIdPncp.get(idPncp);
  return id ? (byId.get(id) ?? null) : null;
}

export function insertInMemoryLicitacao(
  data: NovaLicitacaoData,
): LicitacaoRecord {
  const { byId, idByIdPncp } = ensureStore();
  const agora = new Date();
  const record: LicitacaoRecord = {
    ...data,
    id: `lic_${randomUUID()}`,
    createdAt: agora,
    updatedAt: agora,
  };
  byId.set(record.id, record);
  idByIdPncp.set(record.idPncp, record.id);
  return record;
}

export function updateInMemoryLicitacao(
  id: string,
  patch: Partial<NovaLicitacaoData>,
): LicitacaoRecord | null {
  const { byId } = ensureStore();
  const existing = byId.get(id);
  if (!existing) {
    return null;
  }
  const updated: LicitacaoRecord = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: new Date(),
  };
  byId.set(id, updated);
  return updated;
}

/** Restaura o store ao estado seed inicial (uso exclusivo de testes). */
export function resetInMemoryLicitacoes(): void {
  storeById = null;
  storeIdByIdPncp = null;
}
