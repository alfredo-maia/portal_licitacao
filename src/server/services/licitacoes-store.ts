import { randomUUID } from "node:crypto";
import type { Licitacao, LicitacaoStatus, NotificacaoTipo, NotificacaoSeveridade } from "@prisma/client";
import {
  buildLicitacoesSeed,
  type LicitacaoSeedItem,
} from "@/config/licitacoes-seed";
import { computeHashCritico } from "./hash-critico";

/**
 * Fallback resiliente em memória para licitações (PRD §7 / sprint-1-spec §2.3 / sprint-3-spec §4):
 * espelha os modelos `Licitacao`, `LicitacaoStatusHistorico`, `Notificacao` e `NotificacaoDestinatario`
 * do Prisma para que os serviços de ingestão, oportunidades, dashboard, calendário e notificações
 * operem de forma idêntica com PostgreSQL ativo ou indisponível (ex.: execução isolada de testes em CI).
 */
export type LicitacaoRecord = Licitacao;

export type NovaLicitacaoData = Omit<
  LicitacaoRecord,
  "id" | "createdAt" | "updatedAt"
>;

export interface StatusHistoricoRecord {
  id: string;
  licitacaoId: string;
  statusAnterior: LicitacaoStatus | null;
  statusNovo: LicitacaoStatus;
  motivo: string | null;
  usuarioId: string | null;
  ocorridoEm: Date;
}

export interface NotificacaoRecord {
  id: string;
  tipo: NotificacaoTipo;
  titulo: string;
  descricao: string;
  severidade: NotificacaoSeveridade;
  linkDestino: string | null;
  licitacaoId: string | null;
  chaveIdempotencia: string;
  criadaEm: Date;
}

export interface NotificacaoDestinatarioRecord {
  id: string;
  notificacaoId: string;
  usuarioId: string;
  lidaEm: Date | null;
  criadoEm: Date;
}

let storeById: Map<string, LicitacaoRecord> | null = null;
let storeIdByIdPncp: Map<string, string> | null = null;
let statusHistoricoStore: StatusHistoricoRecord[] = [];
let notificacoesStore: Map<string, NotificacaoRecord> = new Map();
let notificacaoPorChaveStore: Map<string, string> = new Map();
let destinatariosStore: Map<string, NotificacaoDestinatarioRecord> = new Map();

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
    valorArrematado: null,
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

      // Backfill do histórico para o seed
      statusHistoricoStore.push({
        id: `hist_${randomUUID()}`,
        licitacaoId: record.id,
        statusAnterior: null,
        statusNovo: record.status,
        motivo: "Seed Inicial",
        usuarioId: null,
        ocorridoEm: record.createdAt,
      });
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

  // Registra histórico inicial
  insertInMemoryStatusHistorico({
    licitacaoId: record.id,
    statusAnterior: null,
    statusNovo: record.status,
    motivo: "Criação de Licitação",
    usuarioId: null,
    ocorridoEm: agora,
  });

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

/* =========================================================================
   Histórico de Status em Memória
========================================================================= */

export function insertInMemoryStatusHistorico(
  item: Omit<StatusHistoricoRecord, "id">,
): StatusHistoricoRecord {
  ensureStore();
  const record: StatusHistoricoRecord = {
    ...item,
    id: `hist_${randomUUID()}`,
    ocorridoEm: item.ocorridoEm ?? new Date(),
  };
  statusHistoricoStore.push(record);
  return record;
}

export function listInMemoryStatusHistorico(
  licitacaoId?: string,
): StatusHistoricoRecord[] {
  ensureStore();
  if (licitacaoId) {
    return statusHistoricoStore.filter((h) => h.licitacaoId === licitacaoId);
  }
  return [...statusHistoricoStore];
}

/* =========================================================================
   Notificações em Memória
========================================================================= */

export function insertInMemoryNotificacao(
  notif: Omit<NotificacaoRecord, "id" | "criadaEm">,
  destinatarioIds: string[],
): { notificacao: NotificacaoRecord; criada: boolean } {
  const existingId = notificacaoPorChaveStore.get(notif.chaveIdempotencia);
  if (existingId) {
    const existing = notificacoesStore.get(existingId);
    if (existing) {
      return { notificacao: existing, criada: false };
    }
  }

  const agora = new Date();
  const record: NotificacaoRecord = {
    ...notif,
    id: `notif_${randomUUID()}`,
    criadaEm: agora,
  };

  notificacoesStore.set(record.id, record);
  notificacaoPorChaveStore.set(record.chaveIdempotencia, record.id);

  for (const uid of destinatarioIds) {
    const destKey = `${record.id}:${uid}`;
    destinatariosStore.set(destKey, {
      id: `dest_${randomUUID()}`,
      notificacaoId: record.id,
      usuarioId: uid,
      lidaEm: null,
      criadoEm: agora,
    });
  }

  return { notificacao: record, criada: true };
}

export function listInMemoryNotificacoesUsuario(
  usuarioId: string,
  apenasNaoLidas?: boolean,
): { notificacao: NotificacaoRecord; lida: boolean; lidaEm: Date | null }[] {
  const resultado: {
    notificacao: NotificacaoRecord;
    lida: boolean;
    lidaEm: Date | null;
  }[] = [];

  for (const dest of destinatariosStore.values()) {
    if (dest.usuarioId === usuarioId) {
      const notif = notificacoesStore.get(dest.notificacaoId);
      if (notif) {
        const isLida = dest.lidaEm !== null;
        if (apenasNaoLidas && isLida) {
          continue;
        }
        resultado.push({
          notificacao: notif,
          lida: isLida,
          lidaEm: dest.lidaEm,
        });
      }
    }
  }

  resultado.sort(
    (a, b) =>
      b.notificacao.criadaEm.getTime() - a.notificacao.criadaEm.getTime(),
  );
  return resultado;
}

export function marcarInMemoryNotificacaoLida(
  usuarioId: string,
  notificacaoId: string,
): boolean {
  const destKey = `${notificacaoId}:${usuarioId}`;
  const dest = destinatariosStore.get(destKey);
  if (dest) {
    dest.lidaEm = new Date();
    return true;
  }
  return false;
}

export function marcarTodasInMemoryNotificacoesLidas(usuarioId: string): number {
  let count = 0;
  for (const dest of destinatariosStore.values()) {
    if (dest.usuarioId === usuarioId && dest.lidaEm === null) {
      dest.lidaEm = new Date();
      count++;
    }
  }
  return count;
}

let portaisStore: Map<string, any> = new Map();
let documentosStore: Map<string, any> = new Map();

export function insertInMemoryPortal(data: any): any {
  const id = data.id || `portal_${randomUUID()}`;
  const now = new Date();
  const portal = {
    ...data,
    id,
    login: data.login ?? null,
    email: data.email ?? null,
    cnpj: data.cnpj ?? null,
    usuario: data.usuario ?? null,
    valorAssinatura: data.valorAssinatura ?? null,
    dataVencimento: data.dataVencimento ? new Date(data.dataVencimento) : null,
    suporteContato: data.suporteContato ?? null,
    observacoes: data.observacoes ?? null,
    criadoEm: data.criadoEm || now,
    atualizadoEm: now,
  };
  portaisStore.set(id, portal);
  return portal;
}

export function updateInMemoryPortal(id: string, data: any): any | null {
  const existing = portaisStore.get(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...data,
    dataVencimento: data.dataVencimento !== undefined ? (data.dataVencimento ? new Date(data.dataVencimento) : null) : existing.dataVencimento,
    atualizadoEm: new Date(),
  };
  portaisStore.set(id, updated);
  return updated;
}

export function getInMemoryPortal(id: string): any | null {
  return portaisStore.get(id) || null;
}

export function listInMemoryPortais(): any[] {
  return Array.from(portaisStore.values());
}

export function deleteInMemoryPortal(id: string): boolean {
  return portaisStore.delete(id);
}

export function insertInMemoryDocumento(data: any): any {
  const id = data.id || `doc_${randomUUID()}`;
  const now = new Date();
  const doc = {
    ...data,
    id,
    tipo: data.tipo ?? null,
    orgaoEmissor: data.orgaoEmissor ?? null,
    semValidade: Boolean(data.semValidade),
    dataEmissao: data.dataEmissao ? new Date(data.dataEmissao) : null,
    dataVencimento: data.dataVencimento ? new Date(data.dataVencimento) : null,
    arquivoUrl: data.arquivoUrl ?? null,
    arquivoNome: data.arquivoNome ?? null,
    arquivoTamanho: data.arquivoTamanho ?? null,
    mimeType: data.mimeType ?? null,
    versao: data.versao || 1,
    documentoPaiId: data.documentoPaiId ?? null,
    status: data.status || "ATIVO",
    criadoPorId: data.criadoPorId ?? null,
    criadoEm: data.criadoEm || now,
    atualizadoEm: now,
  };
  documentosStore.set(id, doc);
  return doc;
}

export function updateInMemoryDocumento(id: string, data: any): any | null {
  const existing = documentosStore.get(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...data,
    atualizadoEm: new Date(),
  };
  documentosStore.set(id, updated);
  return updated;
}

export function getInMemoryDocumento(id: string): any | null {
  return documentosStore.get(id) || null;
}

export function listInMemoryDocumentos(): any[] {
  return Array.from(documentosStore.values());
}

export function deleteInMemoryDocumento(id: string): boolean {
  return documentosStore.delete(id);
}

/** Restaura todos os stores ao estado seed inicial (uso exclusivo de testes). */
export function resetInMemoryLicitacoes(): void {
  storeById = null;
  storeIdByIdPncp = null;
  statusHistoricoStore = [];
  notificacoesStore.clear();
  notificacaoPorChaveStore.clear();
  destinatariosStore.clear();
  portaisStore.clear();
  documentosStore.clear();
}
