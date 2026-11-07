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
    dataEncerramentoProposta: seed.dataEncerramentoProposta ?? seed.dataAbertura,
    dataPublicacaoPncp: seed.dataPublicacaoPncp,
    dataUltimaAtualizacao: seed.dataPublicacaoPncp,
    status: seed.status,
    parecerIA: seed.parecerIA,
    justificativaIA: seed.justificativaIA,
    tipoSistemaCodigo: seed.tipoSistemaCodigo,
    atestadosExigidos: (seed.atestadosExigidos ? [...seed.atestadosExigidos] : []) as any,
    motivoRecusa: null,
    quantidadeLotes: seed.quantidadeLotes,
    loteUnico: seed.loteUnico,
    precoPorLote: seed.precoPorLote,
    isPresencial: seed.isPresencial,
    distanciaGoianiaKm: seed.distanciaGoianiaKm,
    linkPncp: seed.linkPncp,
    linkSistemaOrigem: seed.linkSistemaOrigem ?? null,
    hashCritico: computeHashCritico(seed),
    valorArrematado: null,
    responsavelId: null,
    modalidadeCodigo: 6,
    numeroControlePNCP: seed.numeroControlePNCP ?? seed.idPncp,
    segmentoMacro: seed.segmentoMacro ?? null,
    subcategorias: (seed.subcategorias ? [...seed.subcategorias] : []) as any,
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
    status: (data as any).status || "PENDENTE",
    id: (data as any).id || `lic_${randomUUID()}`,
    createdAt: (data as any).createdAt || (data as any).criadoEm || agora,
    updatedAt: (data as any).updatedAt || (data as any).atualizadoEm || agora,
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
let impugnacoesStore: Map<string, any> = new Map();

export interface TenantLicitacaoRecord {
  id: string;
  tenantId: string;
  licitacaoId: string;
  statusKanban: string;
  tags?: string[];
  notas?: string | null;
  lanceMinimo?: number | null;
  valorProposta?: number | null;
  valorHomologado?: number | null;
  motivoRecusa?: string | null;
  dataDecisao?: Date | null;
  responsavelId?: string | null;
  membrosEquipeIds?: string[];
  calculadoraDados?: any;
}

const tenantLicitacoesStore = new Map<string, TenantLicitacaoRecord>();

export function getTenantLicitacaoKey(tenantId: string, licitacaoId: string): string {
  return `${tenantId}__${licitacaoId}`;
}

export function getInMemoryTenantLicitacao(tenantId: string, licitacaoId: string): TenantLicitacaoRecord | null {
  return tenantLicitacoesStore.get(getTenantLicitacaoKey(tenantId, licitacaoId)) || null;
}

export function setInMemoryTenantLicitacao(
  tenantId: string,
  licitacaoId: string,
  data: Partial<TenantLicitacaoRecord>,
): TenantLicitacaoRecord {
  const key = getTenantLicitacaoKey(tenantId, licitacaoId);
  const existing = tenantLicitacoesStore.get(key);
  const record: TenantLicitacaoRecord = {
    id: existing?.id || `tl_${randomUUID()}`,
    tenantId,
    licitacaoId,
    statusKanban: data.statusKanban || existing?.statusKanban || "PENDENTE",
    tags: data.tags ?? existing?.tags ?? [],
    notas: data.notas ?? existing?.notas ?? null,
    lanceMinimo: data.lanceMinimo ?? existing?.lanceMinimo ?? null,
    valorProposta: data.valorProposta ?? existing?.valorProposta ?? null,
    valorHomologado: data.valorHomologado ?? existing?.valorHomologado ?? null,
    motivoRecusa: data.motivoRecusa ?? existing?.motivoRecusa ?? null,
    dataDecisao: data.dataDecisao ?? existing?.dataDecisao ?? new Date(),
    responsavelId: data.responsavelId ?? existing?.responsavelId ?? null,
    membrosEquipeIds: data.membrosEquipeIds ?? existing?.membrosEquipeIds ?? [],
    calculadoraDados: data.calculadoraDados !== undefined ? data.calculadoraDados : (existing?.calculadoraDados ?? null),
  };
  tenantLicitacoesStore.set(key, record);
  return record;
}

export function listInMemoryTenantLicitacoes(tenantId: string): TenantLicitacaoRecord[] {
  return Array.from(tenantLicitacoesStore.values()).filter((tl) => tl.tenantId === tenantId);
}
let licitacaoEquipeStore: Map<string, { responsavelId: string | null; atribuidoIds: string[] }> = new Map();
let licitacaoArquivosStore: Map<string, any[]> = new Map();
let licitacaoRepositoriosStore: Map<string, any[]> = new Map();
let licitacaoAnalisesIAStore: Map<string, any[]> = new Map();
let licitacaoNotasStore: Map<string, any[]> = new Map();

export function setInMemoryLicitacaoEquipe(
  licitacaoId: string,
  data: { responsavelId: string | null; atribuidoIds: string[] },
  tenantId?: string | null,
): void {
  const payload = {
    responsavelId: data.responsavelId ?? null,
    atribuidoIds: Array.from(new Set(data.atribuidoIds || [])),
  };
  if (tenantId) {
    licitacaoEquipeStore.set(`${tenantId}__${licitacaoId}`, payload);
  }
  licitacaoEquipeStore.set(licitacaoId, payload);
  updateInMemoryLicitacao(licitacaoId, { responsavelId: data.responsavelId ?? null });
}

export function getInMemoryLicitacaoEquipe(
  licitacaoId: string,
  tenantId?: string | null,
): { responsavelId: string | null; atribuidoIds: string[] } | null {
  if (tenantId) {
    const key = `${tenantId}__${licitacaoId}`;
    if (licitacaoEquipeStore.has(key)) {
      return licitacaoEquipeStore.get(key) || null;
    }
    return null;
  }
  return licitacaoEquipeStore.get(licitacaoId) || null;
}

export function insertInMemoryLicitacaoArquivo(licitacaoId: string, data: any): any {
  const atual = licitacaoArquivosStore.get(licitacaoId) || [];
  const record = {
    ...data,
    id: data.id || `arq_${randomUUID()}`,
    licitacaoId,
    criadoEm: data.criadoEm ? new Date(data.criadoEm) : new Date(),
  };
  const filtrados = atual.filter((a) => a.id !== record.id);
  licitacaoArquivosStore.set(licitacaoId, [record, ...filtrados]);
  return record;
}

export function listInMemoryLicitacaoArquivos(licitacaoId: string): any[] {
  return [...(licitacaoArquivosStore.get(licitacaoId) || [])];
}

export function deleteInMemoryLicitacaoArquivo(licitacaoId: string, arquivoId: string): boolean {
  const atual = licitacaoArquivosStore.get(licitacaoId) || [];
  const next = atual.filter((a) => a.id !== arquivoId);
  licitacaoArquivosStore.set(licitacaoId, next);
  return next.length !== atual.length;
}

export function insertInMemoryLicitacaoRepositorio(licitacaoId: string, data: any): any {
  const atual = licitacaoRepositoriosStore.get(licitacaoId) || [];
  const record = {
    ...data,
    id: data.id || `rep_${randomUUID()}`,
    licitacaoId,
    criadoEm: data.criadoEm ? new Date(data.criadoEm) : new Date(),
  };
  const filtrados = atual.filter((r) => r.id !== record.id);
  licitacaoRepositoriosStore.set(licitacaoId, [record, ...filtrados]);
  return record;
}

export function listInMemoryLicitacaoRepositorios(licitacaoId: string): any[] {
  return [...(licitacaoRepositoriosStore.get(licitacaoId) || [])];
}

export function deleteInMemoryLicitacaoRepositorio(licitacaoId: string, repId: string): boolean {
  const atual = licitacaoRepositoriosStore.get(licitacaoId) || [];
  const next = atual.filter((r) => r.id !== repId);
  licitacaoRepositoriosStore.set(licitacaoId, next);
  return next.length !== atual.length;
}

export function insertInMemoryLicitacaoAnaliseIA(licitacaoId: string, data: any): any {
  const atual = licitacaoAnalisesIAStore.get(licitacaoId) || [];
  const record = {
    ...data,
    id: data.id || `ia_${randomUUID()}`,
    licitacaoId,
    tenantId: data.tenantId ?? null,
    status: data.status || "CONCLUIDO",
    origem: data.origem || "IA_HIBRIDA",
    parecer: data.parecer ?? (data.podeParticipar === false ? "INAPTO" : "APTO"),
    relatorioJson: data.relatorioJson ?? null,
    pdfBase64: data.pdfBase64 ?? null,
    pdfNome: data.pdfNome ?? null,
    erroMensagem: data.erroMensagem ?? null,
    concluidoEm: data.concluidoEm ? new Date(data.concluidoEm) : (data.status === "PROCESSANDO" ? null : new Date()),
    criadoEm: data.criadoEm ? new Date(data.criadoEm) : new Date(),
  };
  const filtrados = atual.filter((a) => a.id !== record.id);
  licitacaoAnalisesIAStore.set(licitacaoId, [record, ...filtrados]);
  return record;
}

export function updateInMemoryLicitacaoAnaliseIA(
  licitacaoId: string,
  analiseId: string,
  patch: any,
): any | null {
  const atual = licitacaoAnalisesIAStore.get(licitacaoId) || [];
  const idx = atual.findIndex((a) => a.id === analiseId);
  if (idx === -1) return null;
  const updated = {
    ...atual[idx],
    ...patch,
    id: atual[idx].id,
    licitacaoId,
  };
  const next = [...atual];
  next[idx] = updated;
  licitacaoAnalisesIAStore.set(licitacaoId, next);
  return updated;
}

export function getInMemoryLicitacaoAnaliseIA(
  licitacaoId: string,
  analiseId: string,
): any | null {
  const atual = licitacaoAnalisesIAStore.get(licitacaoId) || [];
  return atual.find((a) => a.id === analiseId) || null;
}

export function listInMemoryLicitacaoAnalisesIA(
  licitacaoId: string,
  tenantId?: string | null,
): any[] {
  const lista = [...(licitacaoAnalisesIAStore.get(licitacaoId) || [])];
  if (tenantId) {
    return lista.filter((a) => !a.tenantId || a.tenantId === tenantId);
  }
  return lista;
}

export function listAllInMemoryAnalisesIA(tenantId?: string | null): any[] {
  const todas: any[] = [];
  for (const lista of licitacaoAnalisesIAStore.values()) {
    for (const item of lista) {
      if (tenantId) {
        if (item.tenantId === tenantId) {
          todas.push(item);
        }
      } else {
        todas.push(item);
      }
    }
  }
  return todas;
}

export function insertInMemoryLicitacaoNota(licitacaoId: string, data: any): any {
  const atual = licitacaoNotasStore.get(licitacaoId) || [];
  const agora = new Date();
  const record = {
    ...data,
    id: data.id || `nota_${randomUUID()}`,
    licitacaoId,
    tenantId: data.tenantId ?? null,
    texto: data.texto,
    mencoesIds: Array.isArray(data.mencoesIds) ? [...data.mencoesIds] : [],
    mencoesNomes: Array.isArray(data.mencoesNomes) ? [...data.mencoesNomes] : [],
    autorId: data.autorId,
    autorNome: data.autorNome,
    autorEmail: data.autorEmail ?? null,
    autorCargo: data.autorCargo ?? null,
    editadoEm: data.editadoEm ? new Date(data.editadoEm) : null,
    criadoEm: data.criadoEm ? new Date(data.criadoEm) : agora,
    atualizadoEm: data.atualizadoEm ? new Date(data.atualizadoEm) : agora,
  };
  const filtrados = atual.filter((n) => n.id !== record.id);
  licitacaoNotasStore.set(licitacaoId, [record, ...filtrados]);
  return record;
}

export function listInMemoryLicitacaoNotas(
  licitacaoId: string,
  tenantId?: string | null,
): any[] {
  const lista = [...(licitacaoNotasStore.get(licitacaoId) || [])];
  if (tenantId) {
    return lista.filter((n) => !n.tenantId || n.tenantId === tenantId);
  }
  return lista;
}

export function getInMemoryLicitacaoNota(
  licitacaoId: string,
  notaId: string,
): any | null {
  const lista = licitacaoNotasStore.get(licitacaoId) || [];
  return lista.find((n) => n.id === notaId) || null;
}

export function updateInMemoryLicitacaoNota(
  licitacaoId: string,
  notaId: string,
  patch: any,
): any | null {
  const lista = licitacaoNotasStore.get(licitacaoId) || [];
  const idx = lista.findIndex((n) => n.id === notaId);
  if (idx === -1) return null;
  const agora = new Date();
  const updated = {
    ...lista[idx],
    ...patch,
    id: lista[idx].id,
    licitacaoId,
    editadoEm: patch.editadoEm !== undefined ? patch.editadoEm : agora,
    atualizadoEm: agora,
  };
  const next = [...lista];
  next[idx] = updated;
  licitacaoNotasStore.set(licitacaoId, next);
  return updated;
}

export function deleteInMemoryLicitacaoNota(
  licitacaoId: string,
  notaId: string,
): boolean {
  const lista = licitacaoNotasStore.get(licitacaoId) || [];
  const next = lista.filter((n) => n.id !== notaId);
  licitacaoNotasStore.set(licitacaoId, next);
  return next.length !== lista.length;
}

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

export function insertInMemoryImpugnacao(data: any): any {
  const id = data.id || `imp_${randomUUID()}`;
  const now = new Date();
  const record = {
    ...data,
    id,
    licitacaoId: data.licitacaoId ?? null,
    tenantId: data.tenantId ?? null,
    numeroEdital: data.numeroEdital,
    orgaoNome: data.orgaoNome,
    objeto: data.objeto ?? null,
    status: data.status || "RASCUNHO",
    motivoLegal: data.motivoLegal,
    dataAberturaSessao: data.dataAberturaSessao instanceof Date ? data.dataAberturaSessao : new Date(data.dataAberturaSessao),
    prazoFatal: data.prazoFatal instanceof Date ? data.prazoFatal : new Date(data.prazoFatal),
    fundamentacao: data.fundamentacao,
    pedidos: data.pedidos,
    numeroProtocolo: data.numeroProtocolo ?? null,
    dataProtocolo: data.dataProtocolo ? (data.dataProtocolo instanceof Date ? data.dataProtocolo : new Date(data.dataProtocolo)) : null,
    dataResposta: data.dataResposta ? (data.dataResposta instanceof Date ? data.dataResposta : new Date(data.dataResposta)) : null,
    decisaoJulgamento: data.decisaoJulgamento ?? null,
    criadoPorId: data.criadoPorId ?? null,
    criadoEm: data.criadoEm || now,
    atualizadoEm: now,
  };
  impugnacoesStore.set(id, record);
  return record;
}

export function updateInMemoryImpugnacao(id: string, data: any): any | null {
  const existing = impugnacoesStore.get(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...data,
    dataProtocolo: data.dataProtocolo !== undefined ? (data.dataProtocolo ? new Date(data.dataProtocolo) : null) : existing.dataProtocolo,
    dataResposta: data.dataResposta !== undefined ? (data.dataResposta ? new Date(data.dataResposta) : null) : existing.dataResposta,
    atualizadoEm: new Date(),
  };
  impugnacoesStore.set(id, updated);
  return updated;
}

export function getInMemoryImpugnacao(id: string): any | null {
  return impugnacoesStore.get(id) || null;
}

export function listInMemoryImpugnacoes(tenantId?: string | null): any[] {
  const all = Array.from(impugnacoesStore.values());
  if (tenantId) {
    return all.filter((i) => !i.tenantId || i.tenantId === tenantId);
  }
  return all;
}

export function deleteInMemoryImpugnacao(id: string): boolean {
  return impugnacoesStore.delete(id);
}

/* =========================================================================
   Configurações Corporativas e Equipe em Memória (Sprint 6)
========================================================================= */

let configuracaoEmpresaStore: any = {
  id: "default",
  razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
  cnpj: "12.345.678/0001-90",
  inscricaoEstadual: "10.123.456-7",
  cnae: "62.01-5-01 - Desenvolvimento de programas de computador sob encomenda",
  endereco: "Av. República do Líbano, 1200, Setor Oeste",
  cidade: "Goiânia",
  uf: "GO",
  cep: "74115-030",
  representanteNome: "Vítor Henrique de Souza",
  representanteCpf: "123.456.789-00",
  representanteRg: "5432109-SSP/GO",
  representanteCargo: "Sócio-Administrador",
  bancoNome: "Banco do Brasil",
  agencia: "1234-5",
  contaCorrente: "98765-4",
  chavePix: "12.345.678/0001-90",
  logoUrl: null,
  papelTimbradoUrl: null,
  atualizadoEm: new Date(),
};

let usuariosStore: Map<string, any> = new Map([
  [
    "usr_dir_1",
    {
      id: "usr_dir_1",
      name: "Vítor Henrique",
      email: "vitorhenrique018@gmail.com",
      role: "DIRETORIA",
      ativo: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  [
    "usr_dir_2",
    {
      id: "usr_dir_2",
      name: "Alfredo Maia",
      email: "alfredosouza100@gmail.com",
      role: "DIRETORIA",
      ativo: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  [
    "usr_com_1",
    {
      id: "usr_com_1",
      name: "Mariana Souza",
      email: "mariana.comercial@aponta.cloud",
      role: "ANALISTA_COMERCIAL",
      ativo: true,
      createdAt: new Date("2026-02-15T00:00:00.000Z"),
      updatedAt: new Date("2026-02-15T00:00:00.000Z"),
    },
  ],
  [
    "usr_tec_1",
    {
      id: "usr_tec_1",
      name: "Lucas Ribeiro",
      email: "lucas.tecnico@aponta.cloud",
      role: "OPERADOR_TECNICO",
      ativo: true,
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T00:00:00.000Z"),
    },
  ],
]);

const configuracaoEmpresaPorTenant = new Map<string, any>();

export function getInMemoryConfiguracaoEmpresa(tenantId?: string | null): any {
  if (tenantId) {
    if (configuracaoEmpresaPorTenant.has(tenantId)) {
      return { ...configuracaoEmpresaPorTenant.get(tenantId) };
    }
    return {
      id: `cfg_${tenantId}`,
      tenantId,
      razaoSocial: "",
      nomeFantasia: "",
      cnpj: "",
      cnae: "",
      inscricaoEstadual: "",
      inscricaoMunicipal: "",
      endereco: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      uf: "GO",
      cep: "",
      representanteNome: "",
      representanteCpf: "",
      representanteRg: "",
      representanteCargo: "",
      segmentos: [],
      subsegmentos: [],
      ufs: ["GO"],
      brasilInteiro: true,
      logoUrl: null,
      papelTimbradoUrl: null,
      atualizadoEm: new Date(),
    };
  }
  return { ...configuracaoEmpresaStore };
}

export function updateInMemoryConfiguracaoEmpresa(patch: any, tenantId?: string | null): any {
  const current = tenantId && configuracaoEmpresaPorTenant.has(tenantId)
    ? configuracaoEmpresaPorTenant.get(tenantId)
    : configuracaoEmpresaStore;

  const updated = {
    ...current,
    ...patch,
    id: tenantId ? `cfg_${tenantId}` : "default",
    tenantId: tenantId || null,
    atualizadoEm: new Date(),
  };

  if (tenantId) {
    configuracaoEmpresaPorTenant.set(tenantId, updated);
  } else {
    configuracaoEmpresaStore = updated;
  }
  return updated;
}

export function listInMemoryUsuarios(tenantId?: string | null): any[] {
  const all = Array.from(usuariosStore.values());
  if (tenantId) {
    return all.filter((u) => u.tenantId === tenantId);
  }
  return all;
}

export function getInMemoryUsuario(
  id: string,
  tenantId?: string | null,
  email?: string | null,
): any | null {
  let user = usuariosStore.get(id) || null;
  if (!user && email) {
    const normalizedEmail = email.trim().toLowerCase();
    for (const u of usuariosStore.values()) {
      if (u.email && u.email.trim().toLowerCase() === normalizedEmail) {
        user = u;
        break;
      }
    }
  }
  if (!user) return null;
  if (tenantId && user.tenantId && user.tenantId !== tenantId) {
    return null;
  }
  return user;
}

export function insertInMemoryUsuario(data: any): any {
  const id = data.id || `usr_${randomUUID()}`;
  const now = new Date();
  const record = {
    id,
    name: data.name,
    email: data.email,
    role: data.role || "ANALISTA_COMERCIAL",
    ativo: data.ativo !== undefined ? Boolean(data.ativo) : true,
    tenantId: data.tenantId || null,
    cpf: data.cpf ?? null,
    telefone: data.telefone ?? null,
    cep: data.cep ?? null,
    logradouro: data.logradouro ?? null,
    numero: data.numero ?? null,
    complemento: data.complemento ?? null,
    bairro: data.bairro ?? null,
    cidade: data.cidade ?? null,
    uf: data.uf ?? null,
    createdAt: now,
    updatedAt: now,
  };
  usuariosStore.set(id, record);
  return record;
}

export function updateInMemoryUsuario(id: string, patch: any): any | null {
  let existing = usuariosStore.get(id);
  if (!existing && patch?.email) {
    const normalizedEmail = String(patch.email).trim().toLowerCase();
    for (const u of usuariosStore.values()) {
      if (u.email && u.email.trim().toLowerCase() === normalizedEmail) {
        existing = u;
        break;
      }
    }
  }
  const now = new Date();
  const updated = {
    ...(existing || {
      id,
      name: patch.name || "Usuário",
      email: patch.email || "usuario@empresa.com.br",
      role: patch.role || "DIRETORIA",
      ativo: true,
      createdAt: now,
    }),
    ...patch,
    id: existing?.id || id,
    updatedAt: now,
  };
  usuariosStore.set(id, updated);
  if (existing && existing.id !== id) {
    usuariosStore.set(existing.id, updated);
  }
  return updated;
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
  impugnacoesStore.clear();
  licitacaoEquipeStore.clear();
  licitacaoArquivosStore.clear();
  licitacaoRepositoriosStore.clear();
  licitacaoAnalisesIAStore.clear();
  licitacaoNotasStore.clear();
  tenantLicitacoesStore.clear();
}

/** Limpa completamente todas as licitações em memória (sem recriar seeds). */
export function clearInMemoryLicitacoes(): void {
  storeById = new Map();
  storeIdByIdPncp = new Map();
  statusHistoricoStore = [];
  licitacaoEquipeStore.clear();
  licitacaoArquivosStore.clear();
  licitacaoRepositoriosStore.clear();
  licitacaoAnalisesIAStore.clear();
  licitacaoNotasStore.clear();
  tenantLicitacoesStore.clear();
}

