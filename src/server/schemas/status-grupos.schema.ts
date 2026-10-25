import { z } from "zod";
import { licitacaoStatusSchema } from "./licitacao.schema";
import { STATUS_PERDA } from "./kanban.schema";

/**
 * Agrupamentos canônicos de `LicitacaoStatus` compartilhados por Dashboard,
 * Calendário e Notificações (PRD §4.1, §4.2 e §6.2). Fonte única da verdade:
 * nenhum serviço deve redefinir estas listas.
 */

/** Pipeline ativo: certames aceitos e ainda em andamento (sem desfecho final). */
export const STATUS_PIPELINE_ATIVO = [
  "ACEITA",
  "ANALISE_TECNICA",
  "ANALISE_FINANCEIRA",
  "REVISAO_PROPOSTA",
  "ENVIADA",
  "EM_DISPUTA",
  "AGUARDANDO_RESULTADO",
  "IMPUGNADA",
] as const;

/** Card "Em Precificação (GO)" do Dashboard (PRD §4.1, card 3). */
export const STATUS_EM_PRECIFICACAO = [
  "ACEITA",
  "ANALISE_TECNICA",
  "ANALISE_FINANCEIRA",
  "REVISAO_PROPOSTA",
] as const;

/** Chips exibidos com estilo normal no Calendário (PRD §4.2). */
export const STATUS_CALENDARIO_NORMAL = [
  ...STATUS_PIPELINE_ATIVO,
  "CONTEMPLADA",
] as const;

/** Chips exibidos com 40% de opacidade no Calendário (PRD §4.2). */
export const STATUS_CALENDARIO_OPACO = STATUS_PERDA;

/** Perdas competitivas que compõem o denominador da Taxa de Conversão. */
export const STATUS_PERDA_COMPETITIVA = [
  "NAO_CONTEMPLADA_PRECO",
  "NAO_CONTEMPLADA_DOCUMENTACAO",
] as const;

/** Statuses que nunca aparecem no Calendário (PRD §4.2). */
export const STATUS_FORA_DO_CALENDARIO = ["PENDENTE", "RECUSADA"] as const;

/** Opacidade (0–1) aplicada aos chips de certames encerrados sem prosseguimento. */
export const CALENDARIO_OPACIDADE_ENCERRADO = 0.4;

export const OPERACAO_TIMEZONE = "America/Sao_Paulo" as const;

/**
 * Registro de uma transição de status (`licitacao_status_historico`).
 * Gravado por TODA mutação de status: deliberação GO/No-GO, Kanban e ingestão.
 */
export const statusHistoricoInputSchema = z.object({
  licitacaoId: z.string().min(1),
  statusAnterior: licitacaoStatusSchema.nullable().optional(),
  statusNovo: licitacaoStatusSchema,
  motivo: z.string().trim().max(1000).nullable().optional(),
  usuarioId: z.string().nullable().optional(),
  ocorridoEm: z.coerce.date().optional(),
});

export type StatusHistoricoInput = z.infer<typeof statusHistoricoInputSchema>;
