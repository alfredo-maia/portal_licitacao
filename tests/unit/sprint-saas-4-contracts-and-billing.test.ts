import { describe, it, expect } from "vitest";
import {
  AsaasWebhookPayloadSchema,
  calcularStatusFaturamento,
} from "@/server/schemas/asaas.schema";
import {
  processarWebhookAsaas,
  obterOuCriarClienteAsaas,
} from "@/server/services/asaas.service";

describe("Sprint SaaS 4 — Contratos de Faturamento Asaas & Regras de Grace Period", () => {
  it("deve validar payload canônico de webhook do Asaas com sucesso", () => {
    const rawPayload = {
      id: "evt_test_001",
      event: "PAYMENT_RECEIVED",
      dateCreated: "2026-10-30 10:00:00",
      payment: {
        id: "pay_test_999",
        customer: "cus_0000123",
        subscription: "sub_111",
        value: 97.0,
        netValue: 95.01,
        billingType: "PIX",
        status: "RECEIVED",
        externalReference: "tenant_cuid_123",
        confirmedDate: "2026-10-30",
        paymentDate: "2026-10-30",
      },
    };

    const parsed = AsaasWebhookPayloadSchema.parse(rawPayload);
    expect(parsed.id).toBe("evt_test_001");
    expect(parsed.event).toBe("PAYMENT_RECEIVED");
    expect(parsed.payment.value).toBe(97.0);
    expect(parsed.payment.externalReference).toBe("tenant_cuid_123");
  });

  it("deve rejeitar payload de webhook sem ID único de idempotência", () => {
    const invalidPayload = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_test_999",
        customer: "cus_0000123",
        value: 97.0,
      },
    };

    expect(() => AsaasWebhookPayloadSchema.parse(invalidPayload)).toThrow();
  });

  describe("Cálculo do Ciclo de Faturamento & Grace Period (3 Dias)", () => {
    it("deve classificar como TRIAL quando a data final for no futuro", () => {
      const agora = new Date("2026-10-30T12:00:00Z");
      const trialFim = new Date("2026-11-10T12:00:00Z"); // 11 dias restantes

      const res = calcularStatusFaturamento({
        plano: "PRO",
        trialFim,
        agora,
      });

      expect(res.status).toBe("TRIAL");
      expect(res.diasRestantesTrial).toBe(11);
      expect(res.emPeriodoDeGraca).toBe(false);
      expect(res.bloqueado).toBe(false);
    });

    it("deve classificar como ATIVO quando a assinatura estiver dentro da vigência", () => {
      const agora = new Date("2026-10-30T12:00:00Z");
      const vencimento = new Date("2026-11-20T12:00:00Z");

      const res = calcularStatusFaturamento({
        plano: "PRO",
        vencimentoAssinatura: vencimento,
        agora,
      });

      expect(res.status).toBe("ATIVO");
      expect(res.diasAtraso).toBe(0);
      expect(res.emPeriodoDeGraca).toBe(false);
      expect(res.bloqueado).toBe(false);
    });

    it("deve entrar em GRACE_PERIOD com acesso liberado nos primeiros 3 dias pós-vencimento", () => {
      const agora = new Date("2026-10-30T12:00:00Z");
      const vencimento = new Date("2026-10-28T12:00:00Z"); // 2 dias de atraso

      const res = calcularStatusFaturamento({
        plano: "PRO",
        vencimentoAssinatura: vencimento,
        agora,
      });

      expect(res.status).toBe("GRACE_PERIOD");
      expect(res.diasAtraso).toBe(2);
      expect(res.emPeriodoDeGraca).toBe(true);
      expect(res.bloqueado).toBe(false); // Não bloqueia ainda
    });

    it("deve entrar em BLOQUEADO a partir do 4º dia pós-vencimento", () => {
      const agora = new Date("2026-10-30T12:00:00Z");
      const vencimento = new Date("2026-10-26T12:00:00Z"); // 4 dias de atraso

      const res = calcularStatusFaturamento({
        plano: "PRO",
        vencimentoAssinatura: vencimento,
        agora,
      });

      expect(res.status).toBe("BLOQUEADO");
      expect(res.diasAtraso).toBe(4);
      expect(res.emPeriodoDeGraca).toBe(false);
      expect(res.bloqueado).toBe(true);
    });
  });

  describe("Serviço de Faturamento Asaas & Idempotência de Webhook", () => {
    it("deve processar evento PAYMENT_CONFIRMED ativando assinatura do tenant", async () => {
      const payload = {
        id: "evt_idempotente_01",
        event: "PAYMENT_CONFIRMED" as const,
        payment: {
          id: "pay_100",
          customer: "cus_100",
          value: 97.0,
          billingType: "PIX" as const,
          externalReference: "tenant_empresa_x",
          confirmedDate: "2026-10-30",
        },
      };

      const resultado = await processarWebhookAsaas(payload);
      expect(resultado.ok).toBe(true);
      expect(resultado.duplicado).toBe(false);
      expect(resultado.evento).toBe("PAYMENT_CONFIRMED");
    });

    it("deve ignorar evento duplicado com mesmo ID de webhook (idempotência estrita)", async () => {
      const payloadDuplicado = {
        id: "evt_idempotente_01", // Mesmo ID do teste anterior
        event: "PAYMENT_CONFIRMED" as const,
        payment: {
          id: "pay_100",
          customer: "cus_100",
          value: 97.0,
          billingType: "PIX" as const,
          externalReference: "tenant_empresa_x",
        },
      };

      const resultado = await processarWebhookAsaas(payloadDuplicado);
      expect(resultado.ok).toBe(true);
      expect(resultado.duplicado).toBe(true); // Detectou duplicata
    });
  });
});
