import { z } from "zod";

export const EmailCanalSchema = z.literal("EMAIL");

export const EmailEventoEnum = z.enum([
  "BOAS_VINDAS",
  "OTP_ACESSO",
  "RECUPERACAO_SENHA",
  "CONVITE_EQUIPE",
  "SUPORTE_PROTOCOLO",
  "SUPORTE_ATUALIZACAO",
  "VENCIMENTO_DOCUMENTO",
  "VENCIMENTO_PORTAL",
  "FATURAMENTO_CHECKOUT",
  "FATURAMENTO_CONFIRMADO",
  "FATURAMENTO_ATRASO",
  "FATURAMENTO_CANCELADO",
  "GERAL",
]);

export type EmailEvento = z.infer<typeof EmailEventoEnum>;

export const EmailDeliveryStatusEnum = z.enum([
  "ENVIADO",
  "FALHA",
  "IGNORADO_SEM_CHAVE",
]);

export type EmailDeliveryStatus = z.infer<typeof EmailDeliveryStatusEnum>;

export const EnviarEmailInputSchema = z.object({
  para: z.union([
    z.string().trim().email("E-mail de destinatário inválido"),
    z.array(z.string().trim().email("E-mail de destinatário inválido")).min(1),
  ]),
  assunto: z.string().trim().min(1, "Assunto obrigatório").max(220),
  html: z.string().min(1, "Corpo HTML obrigatório"),
  texto: z.string().optional(),
  evento: EmailEventoEnum.default("GERAL"),
  tenantId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  replyTo: z.string().email().optional().nullable(),
});

export type EnviarEmailInput = z.input<typeof EnviarEmailInputSchema>;

export const EmailDeliveryLogItemSchema = z.object({
  id: z.string(),
  canal: z.enum(["EMAIL", "WHATSAPP"]),
  evento: z.string(),
  destinatario: z.string(),
  assunto: z.string().nullable().optional(),
  status: z.string(),
  providerMessageId: z.string().nullable().optional(),
  erro: z.string().nullable().optional(),
  tenantId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  criadoEm: z.date(),
});

export type EmailDeliveryLogItem = z.infer<typeof EmailDeliveryLogItemSchema>;

