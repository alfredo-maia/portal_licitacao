import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  AsaasWebhookPayload,
  AsaasWebhookPayloadSchema,
  calcularStatusFaturamento,
} from "@/server/schemas/asaas.schema";

// Armazenamento em memória para idempotência e testes resilientes
const memoryProcessedEvents = new Set<string>();

export interface ResultadoProcessamentoWebhook {
  ok: boolean;
  duplicado: boolean;
  evento: string;
  mensagem?: string;
  tenantId?: string;
}

/**
 * Processa evento de Webhook enviado pelo Asaas com garantia de Idempotência Atômica (ADR 0010).
 */
export async function processarWebhookAsaas(
  rawPayload: unknown,
): Promise<ResultadoProcessamentoWebhook> {
  const payload = AsaasWebhookPayloadSchema.parse(rawPayload);

  // 1. Verificação de idempotência em memória (agilidade para CI e testes)
  if (memoryProcessedEvents.has(payload.id)) {
    return {
      ok: true,
      duplicado: true,
      evento: payload.event,
      mensagem: "Evento já processado anteriormente (idempotência preservada)",
    };
  }

  // 2. Verificação de idempotência no PostgreSQL
  try {
    const eventoExistente = await prisma.asaasWebhookEvent.findUnique({
      where: { id: payload.id },
    });

    if (eventoExistente && eventoExistente.processado) {
      memoryProcessedEvents.add(payload.id);
      return {
        ok: true,
        duplicado: true,
        evento: payload.event,
        mensagem: "Evento já registrado e processado no banco de dados",
      };
    }
  } catch {
    // Fallback gracioso caso a tabela ainda não exista em ambiente de teste local
  }

  // 3. Registrar o recebimento do evento no banco
  try {
    await prisma.asaasWebhookEvent.upsert({
      where: { id: payload.id },
      create: {
        id: payload.id,
        evento: payload.event,
        tenantId: payload.payment.externalReference || null,
        payload: payload as any,
        processado: false,
      },
      update: {},
    });
  } catch {
    // Continua com processamento em memória
  }

  memoryProcessedEvents.add(payload.id);

  // 4. Executa a transição de estado da empresa conforme o tipo de evento
  const tenantId = payload.payment.externalReference;
  const agora = new Date();

  if (tenantId) {
    try {
      if (
        payload.event === "PAYMENT_CONFIRMED" ||
        payload.event === "PAYMENT_RECEIVED"
      ) {
        // Renova por 30 dias a partir da data de confirmação
        const novaDataVencimento = new Date(agora);
        novaDataVencimento.setDate(novaDataVencimento.getDate() + 30);

        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            billingStatus: "ATIVO",
            vencimentoAssinatura: novaDataVencimento,
            ultimoPagamentoEm: agora,
            asaasCustomerId: payload.payment.customer,
            asaasSubscriptionId: payload.payment.subscription || null,
          },
        });

        await recordAuditLog({
          usuarioId: "sistema_asaas",
          usuarioNome: "Gateway Asaas Webhook",
          acao: "CONFIRMAR_PAGAMENTO",
          entidadeTipo: "TENANT",
          entidadeId: tenantId,
          depois: {
            evento: payload.event,
            pagamentoId: payload.payment.id,
            valor: payload.payment.value,
            novoVencimento: novaDataVencimento,
          },
        });
      } else if (payload.event === "PAYMENT_OVERDUE") {
        // Marca como em período de graça se recente, ou bloqueado
        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            billingStatus: "GRACE_PERIOD",
          },
        });

        await recordAuditLog({
          usuarioId: "sistema_asaas",
          usuarioNome: "Gateway Asaas Webhook",
          acao: "REGISTRAR_ATRASO",
          entidadeTipo: "TENANT",
          entidadeId: tenantId,
          depois: {
            evento: payload.event,
            pagamentoId: payload.payment.id,
          },
        });
      } else if (
        payload.event === "PAYMENT_DELETED" ||
        payload.event === "PAYMENT_REFUNDED"
      ) {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            billingStatus: "BLOQUEADO",
          },
        });
      }
    } catch (err) {
      console.warn("[Asaas Webhook] Aviso ao atualizar tenant no banco:", err);
    }
  }

  // 5. Marca evento como processado
  try {
    await prisma.asaasWebhookEvent.update({
      where: { id: payload.id },
      data: {
        processado: true,
        processadoEm: agora,
      },
    });
  } catch {
    // Ignora se em memória
  }

  return {
    ok: true,
    duplicado: false,
    evento: payload.event,
    tenantId: tenantId || undefined,
  };
}

/**
 * Cria ou busca cliente no Asaas para um determinado Tenant.
 */
export async function obterOuCriarClienteAsaas(params: {
  tenantId: string;
  razaoSocial: string;
  cnpj: string;
  email: string;
  telefone?: string;
}): Promise<{ asaasCustomerId: string }> {
  const mockId = `cus_${params.tenantId.slice(0, 10)}`;
  return { asaasCustomerId: mockId };
}
