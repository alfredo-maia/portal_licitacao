import { z } from "zod";

/**
 * Eventos oficiais de webhook do Asaas (PRD §6 / ADR 0010)
 */
export const AsaasEventTypeEnum = z.enum([
  "PAYMENT_CREATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_ANTICIPATED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DUNNING_RECEIVED",
  "PAYMENT_DUNNING_REQUESTED",
  "PAYMENT_BANK_SLIP_VIEWED",
  "PAYMENT_CHECKOUT_VIEWED",
]);

export type AsaasEventType = z.infer<typeof AsaasEventTypeEnum>;

/**
 * Dados de pagamento contidos no payload do Asaas
 */
export const AsaasPaymentDataSchema = z.object({
  id: z.string().min(1, "ID do pagamento obrigatório"),
  customer: z.string().min(1, "ID do cliente Asaas obrigatório"),
  subscription: z.string().optional().nullable(),
  installment: z.string().optional().nullable(),
  paymentLink: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  value: z.number().nonnegative(),
  netValue: z.number().optional().nullable(),
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("PIX"),
  status: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  externalReference: z.string().optional().nullable(), // ID do Tenant no Portal
  confirmedDate: z.string().optional().nullable(),
  paymentDate: z.string().optional().nullable(),
  clientPaymentDate: z.string().optional().nullable(),
  invoiceUrl: z.string().url().optional().nullable(),
  bankSlipUrl: z.string().url().optional().nullable(),
  pixTransaction: z.any().optional().nullable(),
});

export type AsaasPaymentData = z.infer<typeof AsaasPaymentDataSchema>;

/**
 * Payload completo do Webhook Asaas
 */
export const AsaasWebhookPayloadSchema = z.object({
  id: z.string().min(1, "ID único do evento de webhook é obrigatório para idempotência"),
  event: AsaasEventTypeEnum,
  dateCreated: z.string().optional(),
  payment: AsaasPaymentDataSchema,
});

export type AsaasWebhookPayload = z.infer<typeof AsaasWebhookPayloadSchema>;

/**
 * Status de Faturamento do Tenant (Ciclo de Vida)
 */
export const TenantBillingStatusEnum = z.enum([
  "TRIAL",
  "ATIVO",
  "GRACE_PERIOD",
  "BLOQUEADO",
  "CANCELADO",
]);

export type TenantBillingStatusType = z.infer<typeof TenantBillingStatusEnum>;

/**
 * Calcula o status de faturamento do Tenant baseado em datas e regras de negócio:
 * - 14 dias de Trial
 * - 3 dias de Grace Period pós-vencimento
 * - Bloqueio suave a partir do 4º dia
 */
export function calcularStatusFaturamento(params: {
  plano: string;
  trialFim?: Date | null;
  vencimentoAssinatura?: Date | null;
  ultimoPagamentoEm?: Date | null;
  agora?: Date;
}): {
  status: TenantBillingStatusType;
  diasRestantesTrial: number;
  diasAtraso: number;
  emPeriodoDeGraca: boolean;
  bloqueado: boolean;
} {
  const agora = params.agora || new Date();
  const GRACE_PERIOD_DAYS = 3;

  // 1. Se estiver em período de Trial
  if (params.trialFim) {
    const diffMs = params.trialFim.getTime() - agora.getTime();
    const diasRestantesTrial = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diasRestantesTrial > 0) {
      return {
        status: "TRIAL",
        diasRestantesTrial,
        diasAtraso: 0,
        emPeriodoDeGraca: false,
        bloqueado: false,
      };
    }
  }

  // 2. Se tiver assinatura com data de vencimento
  if (params.vencimentoAssinatura) {
    const diffMs = agora.getTime() - params.vencimentoAssinatura.getTime();
    const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diasAtraso <= 0) {
      // Vencimento futuro: Assinatura Ativa
      return {
        status: "ATIVO",
        diasRestantesTrial: 0,
        diasAtraso: 0,
        emPeriodoDeGraca: false,
        bloqueado: false,
      };
    }

    if (diasAtraso <= GRACE_PERIOD_DAYS) {
      // Entre 1 e 3 dias de atraso: Período de Graça com banner amarelo
      return {
        status: "GRACE_PERIOD",
        diasRestantesTrial: 0,
        diasAtraso,
        emPeriodoDeGraca: true,
        bloqueado: false,
      };
    }

    // Mais de 3 dias de atraso: Bloqueio Suave
    return {
      status: "BLOQUEADO",
      diasRestantesTrial: 0,
      diasAtraso,
      emPeriodoDeGraca: false,
      bloqueado: true,
    };
  }

  // Se o trial expirou e não há assinatura configurada
  return {
    status: "BLOQUEADO",
    diasRestantesTrial: 0,
    diasAtraso: 4,
    emPeriodoDeGraca: false,
    bloqueado: true,
  };
}
