import { z } from "zod";

/**
 * Contrato de Impugnações e Pedidos de Esclarecimento (PRD §4.9 / Art. 164 Lei 14.133/2021).
 */
export const IMPUGNACAO_STATUS = [
  "RASCUNHO",
  "PROTOCOLADA",
  "ACATADA",
  "INDEFERIDA",
] as const;

export const impugnacaoStatusSchema = z.enum(IMPUGNACAO_STATUS);
export type ImpugnacaoStatus = z.infer<typeof impugnacaoStatusSchema>;

/**
 * Função utilitária para cálculo do Prazo Fatal de Impugnação (Art. 164 da Lei 14.133/2021).
 * "Até 3 (três) dias úteis antes da data de abertura do certame".
 * Desconsidera sábados e domingos.
 */
export function calcularPrazoFatalImpugnacao(dataAbertura: Date): Date {
  const prazo = new Date(dataAbertura);
  let diasUteisRestantes = 3;

  while (diasUteisRestantes > 0) {
    prazo.setDate(prazo.getDate() - 1);
    const diaSemana = prazo.getDay(); // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteisRestantes--;
    }
  }

  // Define limite para o final do expediente útil (18:00 no fuso de referência)
  prazo.setHours(18, 0, 0, 0);
  return prazo;
}

export const impugnacaoCriarInputSchema = z.object({
  licitacaoId: z.string().trim().optional().nullable(),
  numeroEdital: z.string().trim().min(1, "Número do edital é obrigatório").max(100),
  orgaoNome: z.string().trim().min(2, "Nome do órgão é obrigatório").max(255),
  objeto: z.string().trim().max(5000).optional().nullable(),
  status: impugnacaoStatusSchema.default("RASCUNHO"),
  motivoLegal: z.string().trim().min(3, "Motivo legal é obrigatório").max(255),
  dataAberturaSessao: z.coerce.date(),
  fundamentacao: z.string().trim().min(10, "Fundamentação deve ter no mínimo 10 caracteres"),
  pedidos: z.string().trim().min(5, "Pedidos devem ter no mínimo 5 caracteres"),
  numeroProtocolo: z.string().trim().max(100).optional().nullable(),
  dataProtocolo: z.coerce.date().optional().nullable(),
});

export const impugnacaoAtualizarInputSchema = z.object({
  status: impugnacaoStatusSchema.optional(),
  motivoLegal: z.string().trim().min(3).max(255).optional(),
  fundamentacao: z.string().trim().min(10).optional(),
  pedidos: z.string().trim().min(5).optional(),
  numeroProtocolo: z.string().trim().max(100).optional().nullable(),
  dataProtocolo: z.coerce.date().optional().nullable(),
  dataResposta: z.coerce.date().optional().nullable(),
  decisaoJulgamento: z.string().trim().max(5000).optional().nullable(),
});

export const impugnacaoListQuerySchema = z.object({
  status: impugnacaoStatusSchema.optional(),
  busca: z.string().trim().optional(),
  apenasCriticas: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});

export const impugnacaoItemSchema = z.object({
  id: z.string().min(1),
  licitacaoId: z.string().nullable(),
  numeroEdital: z.string(),
  orgaoNome: z.string(),
  objeto: z.string().nullable(),
  status: impugnacaoStatusSchema,
  motivoLegal: z.string(),
  dataAberturaSessao: z.coerce.date(),
  prazoFatal: z.coerce.date(),
  fundamentacao: z.string(),
  pedidos: z.string(),
  numeroProtocolo: z.string().nullable(),
  dataProtocolo: z.coerce.date().nullable(),
  dataResposta: z.coerce.date().nullable(),
  decisaoJulgamento: z.string().nullable(),
  criadoPorId: z.string().nullable(),
  criadoEm: z.coerce.date(),
  atualizadoEm: z.coerce.date(),
  horasRestantesPrazoFatal: z.number().optional(),
  prazoVencido: z.boolean().optional(),
});

export const impugnacaoListResponseSchema = z.object({
  ok: z.literal(true),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  impugnacoes: z.array(impugnacaoItemSchema),
});

export const impugnacaoDetalheResponseSchema = z.object({
  ok: z.literal(true),
  impugnacao: impugnacaoItemSchema,
});

export type ImpugnacaoCriarInput = z.infer<typeof impugnacaoCriarInputSchema>;
export type ImpugnacaoAtualizarInput = z.infer<typeof impugnacaoAtualizarInputSchema>;
export type ImpugnacaoListQuery = z.infer<typeof impugnacaoListQuerySchema>;
export type ImpugnacaoItem = z.infer<typeof impugnacaoItemSchema>;
export type ImpugnacaoListResponse = z.infer<typeof impugnacaoListResponseSchema>;
export type ImpugnacaoDetalheResponse = z.infer<typeof impugnacaoDetalheResponseSchema>;
