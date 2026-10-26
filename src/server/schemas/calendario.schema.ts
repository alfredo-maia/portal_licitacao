import { z } from "zod";
import { licitacaoStatusSchema } from "./licitacao.schema";

/**
 * Contrato do Calendário de Certames (PRD §4.2 / sprint-3-spec §2.2).
 * `GET /api/calendario?ano=2026&mes=11`
 *
 * - Um chip por licitação cujo `dataAbertura` cai no mês (America/Sao_Paulo).
 * - Status em `STATUS_CALENDARIO_NORMAL` → `opaco: false`;
 *   status em `STATUS_CALENDARIO_OPACO` → `opaco: true` (40% de opacidade);
 *   `PENDENTE` e `RECUSADA` nunca aparecem.
 * - `alertasDocumentais` é a fonte de vencimentos de certidões (PRD §4.2). A fonte
 *   de dados (`Documento`) chega na Sprint 4: até lá o serviço devolve `[]`.
 */
export const calendarioQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  ano: z.coerce.number().int().min(2024).max(2100).optional(),
});

export const calendarioChipSchema = z.object({
  id: z.string().min(1),
  numeroEdital: z.string().min(1),
  orgaoNome: z.string().min(1),
  titulo: z.string().optional(),
  objeto: z.string().nullable().optional(),
  miniResumo: z.string().optional(),
  dataAbertura: z.coerce.date(),
  dataEncerramentoProposta: z.coerce.date().optional(),
  /** Dia do mês (1–31) já resolvido em America/Sao_Paulo. */
  dia: z.number().int().min(1).max(31),
  status: licitacaoStatusSchema,
  opaco: z.boolean(),
  linkDestino: z.string().startsWith("/oportunidades/"),
});

export const calendarioAlertaDocumentalSchema = z.object({
  documentoId: z.string().min(1),
  titulo: z.string().min(1),
  dia: z.number().int().min(1).max(31),
  /** Texto pronto para exibição: "⚠️ Certidão Negativa Federal — Vencimento hoje (Atualizar)". */
  mensagem: z.string().min(1),
  linkDestino: z.literal("/documentacao"),
});

export const calendarioResponseSchema = z.object({
  ok: z.literal(true),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int(),
  chips: z.array(calendarioChipSchema),
  alertasDocumentais: z.array(calendarioAlertaDocumentalSchema),
});

export type CalendarioQuery = z.infer<typeof calendarioQuerySchema>;
export type CalendarioChip = z.infer<typeof calendarioChipSchema>;
export type CalendarioResponse = z.infer<typeof calendarioResponseSchema>;
