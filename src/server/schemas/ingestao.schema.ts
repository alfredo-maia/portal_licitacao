import { z } from "zod";
import { tipoSistemaCodigoNormalizadoSchema } from "./tipos-sistema.schema";

/**
 * Contrato de Ingestão de Dados v2 (`licitacoes_portal.json`) gerado pela
 * esteira de IA do Paperclip para o endpoint `POST /api/ingestao`
 * (PRD §8 / sprint-1-spec §2.2).
 */

/**
 * Parecer da esteira de IA na ingestão. Aceita as grafias `"NO-GO"` (legada)
 * e `"NO_GO"` (canônica do enum `ParecerIA` no Prisma), normalizando sempre
 * para `"NO_GO"` na saída do parse.
 */
export const parecerGoNoGoIngestaoSchema = z
  .enum(["GO", "AVALIAR", "NO-GO", "NO_GO"])
  .transform((value) => (value === "NO-GO" ? "NO_GO" : value));

export const ingestaoOrgaoSchema = z.object({
  cnpj: z.string(),
  nome: z.string(),
  esfera: z.string().optional(),
  poder: z.string().optional(),
  uf: z.string().length(2),
  municipio: z.string().optional(),
});

export const ingestaoLicitacaoItemSchema = z.object({
  pncpId: z.string().min(1),
  numeroEdital: z.string().min(1),
  orgao: ingestaoOrgaoSchema,
  modalidade: z.string().min(1),
  portalDisputa: z.string().optional(),
  valorEstimado: z.number().nonnegative(),
  dataPublicacaoPncp: z.coerce.date().optional(),
  dataAbertura: z.coerce.date(),
  dataUltimaAtualizacao: z.coerce.date().optional(),
  isPresencial: z.boolean().default(false),
  distanciaGoianiaKm: z.number().nullable().optional(),
  miniResumo: z.string().min(1),
  resumo: z.string().min(1),
  /**
   * Enum dos 22 códigos (PRD §5.1). Valores desconhecidos ou vazios vindos de
   * sistemas externos são normalizados para `OUTROS` (ver
   * `tipoSistemaCodigoNormalizadoSchema`).
   */
  tipoSistemaSugerido: tipoSistemaCodigoNormalizadoSchema,
  quantidadeLotes: z.number().int().positive().default(1),
  loteUnico: z.boolean().default(true),
  precoPorLote: z.boolean().default(false),
  parecerGoNoGo: parecerGoNoGoIngestaoSchema,
  justificativaTecnica: z.string().optional(),
  atestadosExigidos: z.array(z.string()).default([]),
  linkPncp: z.string().url().optional().or(z.literal("")),
  linkSistemaOrigem: z.string().url().optional().or(z.literal("")),
});

export const ingestaoPayloadV2Schema = z.object({
  versaoContrato: z.literal(2),
  executadoEm: z.string().min(1),
  totalRegistros: z.number().int().nonnegative(),
  licitacoes: z.array(ingestaoLicitacaoItemSchema),
});

export type ParecerGoNoGoIngestao = z.infer<typeof parecerGoNoGoIngestaoSchema>;
export type IngestaoOrgao = z.infer<typeof ingestaoOrgaoSchema>;
export type IngestaoLicitacaoItem = z.infer<typeof ingestaoLicitacaoItemSchema>;
export type IngestaoLicitacaoItemInput = z.input<
  typeof ingestaoLicitacaoItemSchema
>;
export type IngestaoPayloadV2 = z.infer<typeof ingestaoPayloadV2Schema>;
export type IngestaoPayloadV2Input = z.input<typeof ingestaoPayloadV2Schema>;
