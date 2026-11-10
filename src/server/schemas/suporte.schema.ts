import { z } from "zod";

export const SUPORTE_CATEGORIAS = [
  "DUVIDA",
  "PROBLEMA_TECNICO",
  "FINANCEIRO",
  "SUGESTAO",
] as const;

export const SUPORTE_URGENCIAS = [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "CRITICA",
] as const;

export const SUPORTE_STATUS = [
  "ABERTO",
  "EM_ATENDIMENTO",
  "AGUARDANDO_CLIENTE",
  "RESPONDIDO",
  "CONCLUIDO",
] as const;

export const SUPORTE_AUTOR_TIPOS = ["CLIENTE", "SUPORTE"] as const;

export const supportTicketCategoriaSchema = z.enum(SUPORTE_CATEGORIAS);
export const supportTicketUrgenciaSchema = z.enum(SUPORTE_URGENCIAS);
export const supportTicketStatusSchema = z.enum(SUPORTE_STATUS);
export const supportTicketAutorTipoSchema = z.enum(SUPORTE_AUTOR_TIPOS);

export type SupportTicketCategoria = z.infer<typeof supportTicketCategoriaSchema>;
export type SupportTicketUrgencia = z.infer<typeof supportTicketUrgenciaSchema>;
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

export const criarTicketSuporteInputSchema = z.object({
  categoria: supportTicketCategoriaSchema.default("DUVIDA"),
  urgencia: supportTicketUrgenciaSchema.default("MEDIA"),
  assunto: z
    .string()
    .trim()
    .min(3, "O assunto deve ter no mínimo 3 caracteres.")
    .max(160, "O assunto deve ter no máximo 160 caracteres."),
  descricao: z
    .string()
    .trim()
    .min(5, "Descreva sua solicitação com pelo menos 5 caracteres.")
    .max(4000, "Descrição excede o limite de 4000 caracteres."),
});

export type CriarTicketSuporteInput = z.infer<typeof criarTicketSuporteInputSchema>;

export const responderTicketSuporteInputSchema = z.object({
  mensagem: z
    .string()
    .trim()
    .min(1, "Digite uma mensagem para enviar.")
    .max(4000, "Mensagem excede o limite de 4000 caracteres."),
});

export type ResponderTicketSuporteInput = z.infer<typeof responderTicketSuporteInputSchema>;

export const supportTicketMessageSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  autorId: z.string().nullable(),
  autorNome: z.string(),
  autorTipo: supportTicketAutorTipoSchema,
  mensagem: z.string(),
  criadoEm: z.coerce.date(),
});

export const supportTicketItemSchema = z.object({
  id: z.string(),
  protocolo: z.string(),
  tenantId: z.string().nullable(),
  userId: z.string().nullable(),
  autorNome: z.string(),
  autorEmail: z.string().nullable(),
  autorTelefone: z.string().nullable(),
  categoria: supportTicketCategoriaSchema,
  urgencia: supportTicketUrgenciaSchema,
  assunto: z.string(),
  status: supportTicketStatusSchema,
  criadoEm: z.coerce.date(),
  atualizadoEm: z.coerce.date(),
  concluidoEm: z.coerce.date().nullable(),
  mensagens: z.array(supportTicketMessageSchema).default([]),
});

export type SupportTicketMessageItem = z.infer<typeof supportTicketMessageSchema>;
export type SupportTicketItem = z.infer<typeof supportTicketItemSchema>;

