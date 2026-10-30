import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { PaywallBanner } from "@/components/faturamento/PaywallBanner";

describe("Sprint SaaS 4 — Frontend SuperAdmin & Paywall", () => {
  it("deve renderizar o painel executivo SuperAdmin com tiles e tabela de clientes", () => {
    const mockMetrics = {
      mrrEstimado: 12500.0,
      totalTenants: 15,
      tenantsAtivos: 10,
      tenantsTrial: 3,
      tenantsGracePeriod: 1,
      tenantsBloqueados: 1,
      totalVolumeArrematado: 4500000.0,
      totalLicitacoesContempladas: 8,
      r2StorageTotalMb: 320.5,
      whatsappFilaPendentes: 2,
      whatsappInstanciaConectada: true,
    };

    const mockTenants = [
      {
        id: "tnt_001",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Alfredo Maia Licitações Ltda",
        nomeFantasia: "Grupo Maia",
        plano: "PRO",
        billingStatus: "ATIVO" as const,
        diasRestantesTrial: 0,
        diasAtraso: 0,
        cotaBaseMb: 2000,
        cotaExtraMb: 0,
        cotaTotalMb: 2000,
        espacoUsadoMb: 120.0,
        percentualUsado: 6,
        volumeArrematado: 1200000.0,
        totalContempladas: 2,
        criadoEm: new Date(),
      },
    ];

    render(
      <SuperAdminDashboard
        initialMetrics={mockMetrics}
        initialTenants={mockTenants}
      />,
    );

    expect(screen.getByText("Portal Administrativo (SuperAdmin)")).toBeInTheDocument();
    expect(screen.getByText("MRR ESTIMADO (MENSAL)")).toBeInTheDocument();
    expect(screen.getByText("Alfredo Maia Licitações Ltda")).toBeInTheDocument();
    expect(screen.getByText("+1 GB")).toBeInTheDocument();
    expect(screen.getByText("+2 GB")).toBeInTheDocument();
  });

  it("deve renderizar PaywallBanner com aviso amarelo durante GRACE_PERIOD", () => {
    render(<PaywallBanner initialStatus="GRACE_PERIOD" />);

    expect(
      screen.getByTestId("paywall-grace-period-banner"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Período de Tolerância Ativo (3 Dias de Graça)"),
    ).toBeInTheDocument();
  });

  it("deve renderizar PaywallBanner com aviso de bloqueio quando BLOQUEADO", () => {
    render(<PaywallBanner initialStatus="BLOQUEADO" />);

    expect(screen.getByTestId("paywall-blocked-banner")).toBeInTheDocument();
    expect(
      screen.getByText("Assinatura Pendente de Regularização"),
    ).toBeInTheDocument();
  });
});
