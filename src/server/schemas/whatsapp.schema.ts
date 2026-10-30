import { z } from "zod";

/**
 * Palavras-chave oficiais que acionam opt-out imediato do WhatsApp (PRD §7 / ADR 0010)
 */
export const WHATSAPP_OPT_OUT_KEYWORDS = [
  "PAUSAR",
  "SAIR",
  "STOP",
  "CANCELAR",
  "PARAR",
  "DESCADASTRAR",
] as const;

export const WHATSAPP_OPT_OUT_FOOTER =
  "\n\n_Para pausar estes alertas, responda PAUSAR a qualquer momento._";

/**
 * Gera tempo de espera aleatório (Jitter humano) entre 4 e 9 segundos (em milissegundos ou segundos).
 */
export function calcWhatsAppJitterSeconds(minSeconds = 4, maxSeconds = 9): number {
  const min = Math.min(minSeconds, maxSeconds);
  const max = Math.max(minSeconds, maxSeconds);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calcWhatsAppJitterMs(minSeconds = 4, maxSeconds = 9): number {
  return calcWhatsAppJitterSeconds(minSeconds, maxSeconds) * 1000;
}

/**
 * Sanitiza e valida número de telefone brasileiro (E.164 ou formato nacional com DDD)
 */
export function sanitizarTelefoneBR(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  // Se vier sem DDI 55 mas com DDD (10 ou 11 dígitos), prefixa com 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Verifica se um texto recebido é um comando de opt-out
 */
export function isWhatsAppOptOutMessage(texto: string): boolean {
  const normalizado = texto.trim().toUpperCase();
  return WHATSAPP_OPT_OUT_KEYWORDS.some((kw) => normalizado === kw || normalizado.startsWith(kw));
}

/**
 * Formata mensagem anexando o rodapé de opt-out caso ainda não esteja presente
 */
export function formatarMensagemWhatsAppComOptOut(mensagem: string): string {
  if (mensagem.includes("Para pausar estes alertas")) {
    return mensagem;
  }
  return `${mensagem.trim()}${WHATSAPP_OPT_OUT_FOOTER}`;
}

export const WhatsAppEnvioSchema = z.object({
  destinatario: z
    .string()
    .min(10, "Telefone inválido")
    .transform(sanitizarTelefoneBR),
  mensagem: z.string().min(1, "Mensagem não pode ser vazia"),
  tenantId: z.string().optional().nullable(),
  tipo: z.enum(["ALERTA", "BOAS_VINDAS", "URGENTE", "SISTEMA"]).default("ALERTA"),
  agendadoPara: z.date().optional(),
});

export type WhatsAppEnvioInput = z.infer<typeof WhatsAppEnvioSchema>;

export const WhatsAppFilaItemSchema = z.object({
  id: z.string(),
  destinatario: z.string(),
  mensagem: z.string(),
  tipo: z.string(),
  status: z.enum(["PENDENTE", "ENVIANDO", "ENVIADO", "FALHA", "PAUSADO_OPT_OUT"]),
  tentativas: z.number().int().nonnegative(),
  erro: z.string().optional().nullable(),
  jitterSegundos: z.number().int().positive(),
  agendadoPara: z.date(),
  enviadoEm: z.date().optional().nullable(),
  criadoEm: z.date(),
});

export type WhatsAppFilaItem = z.infer<typeof WhatsAppFilaItemSchema>;
