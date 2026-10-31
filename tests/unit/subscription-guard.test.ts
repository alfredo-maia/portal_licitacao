import { describe, expect, it } from "vitest";
import { evaluateTenantAccess } from "@/lib/subscription-guard";

describe("Subscription Guard — Avaliação de Acesso, Carência e Modo Somente-Leitura", () => {
  const baseDate = new Date("2026-10-31T12:00:00Z");

  it("deve conceder acesso total para tenant com billingStatus ATIVO", () => {
    const result = evaluateTenantAccess(
      {
        plano: "PRO",
        billingStatus: "ATIVO",
        trialFim: null,
      },
      baseDate,
    );

    expect(result.isReadOnly).toBe(false);
    expect(result.isBlocked).toBe(false);
    expect(result.inGracePeriod).toBe(false);
    expect(result.diasRestantesTrial).toBe(0);
  });

  it("deve conceder acesso total para tenant em TRIAL ativo (dentro dos 14 dias)", () => {
    const trialFim = new Date("2026-11-05T12:00:00Z"); // 5 dias restantes
    const result = evaluateTenantAccess(
      {
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim,
      },
      baseDate,
    );

    expect(result.isReadOnly).toBe(false);
    expect(result.isBlocked).toBe(false);
    expect(result.inGracePeriod).toBe(false);
    expect(result.diasRestantesTrial).toBe(5);
  });

  it("deve ativar período de carência (3 dias pós-trial) sem bloquear mutações ainda", () => {
    // Trial encerrou ontem (30/10), carência vai até 02/11
    const trialFim = new Date("2026-10-30T12:00:00Z");
    const result = evaluateTenantAccess(
      {
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim,
      },
      baseDate,
    );

    expect(result.inGracePeriod).toBe(true);
    expect(result.isReadOnly).toBe(false);
    expect(result.isBlocked).toBe(false);
    expect(result.diasRestantesCarencia).toBeGreaterThanOrEqual(1);
    expect(result.mensagemStatus).toMatch(/carência/i);
  });

  it("deve ativar modo SOMENTE-LEITURA e bloqueio total após o fim dos 3 dias de carência", () => {
    // Trial encerrou há 5 dias (26/10), carência acabou em 29/10
    const trialFim = new Date("2026-10-26T12:00:00Z");
    const result = evaluateTenantAccess(
      {
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim,
      },
      baseDate,
    );

    expect(result.inGracePeriod).toBe(false);
    expect(result.isReadOnly).toBe(true);
    expect(result.isBlocked).toBe(true);
    expect(result.mensagemStatus).toMatch(/somente-leitura|expirou/i);
  });

  it("deve bloquear diretamente se billingStatus for BLOQUEADO ou CANCELADO", () => {
    const resultBloqueado = evaluateTenantAccess(
      {
        plano: "BASICO",
        billingStatus: "BLOQUEADO",
      },
      baseDate,
    );
    expect(resultBloqueado.isReadOnly).toBe(true);
    expect(resultBloqueado.isBlocked).toBe(true);

    const resultCancelado = evaluateTenantAccess(
      {
        plano: "PRO",
        billingStatus: "CANCELADO",
      },
      baseDate,
    );
    expect(resultCancelado.isReadOnly).toBe(true);
    expect(resultCancelado.isBlocked).toBe(true);
  });
});

