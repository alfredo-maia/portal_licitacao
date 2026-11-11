import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { PaywallBanner } from "@/components/faturamento/PaywallBanner";

describe("Sprint SaaS 4 — Frontend SuperAdmin & Paywall", () => {
  it("deve renderizar o painel executivo SuperAdmin com tooltips de siglas e Radar de Teste Grátis em tabela", () => {
    const mockMetrics = {
      mrrEstimado: 12500.0,
      arrEstimado: 150000.0,
      receitaEmRisco: 497.0,
      totalTenants: 15,
      tenantsAtivos: 10,
      tenantsTrial: 3,
      tenantsGracePeriod: 1,
      tenantsBloqueados: 1,
      tenantsCancelados: 0,
      novosClientesHoje: 1,
      novosClientes7d: 4,
      novosClientes30d: 10,
      trialsEngajados: 1,
      trialsAbandonados: 2,
      totalVolumeArrematado: 4500000.0,
      totalLicitacoesContempladas: 8,
      r2StorageTotalMb: 320.5,
      whatsappFilaPendentes: 2,
      whatsappInstanciaConectada: true,
      gastoIaHojeBrl: 12.5,
      gastoIaMesBrl: 180.0,
      tokensIaHoje: 14000,
      chamadasIaHoje: 5,
      ticketsAbertos: 1,
      comissoesPendentesBrl: 100.0,
      ultimaColetaStatus: "CONCLUIDO",
      ultimaColetaEm: new Date().toISOString(),
    };

    const mockTenants = [
      {
        id: "tnt_001",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Alfredo Maia Licitações Ltda",
        nomeFantasia: "Grupo Maia",
        plano: "PRO",
        billingStatus: "TRIAL" as const,
        diasRestantesTrial: 9,
        diasAtraso: 0,
        cotaBaseMb: 2000,
        cotaExtraMb: 0,
        cotaTotalMb: 2000,
        espacoUsadoMb: 120.0,
        percentualUsado: 6,
        volumeArrematado: 1200000.0,
        totalContempladas: 2,
        titularNome: "Carlos Maia",
        titularEmail: "carlos@grupomaia.com.br",
        qtdCnpjs: 2,
        cnpjsAdicionaisCount: 1,
        onboarding: {
          contaCriada: true,
          cnpjCadastrado: true,
          filtrosConfigurados: true,
          empresaPreenchida: false,
          documentoCofreEnviado: false,
          licitacaoNoKanban: false,
          iaOuCalculadoraUsada: false,
          score: 3,
          percentual: 43,
          statusEngajamento: "EM_CONFIGURACAO" as const,
        },
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
    expect(screen.getAllByTestId("kpi-info-icon")).toHaveLength(5);
    expect(screen.getByText("Radar de Teste Grátis")).toBeInTheDocument();
    expect(screen.getByText("Primeiro CNPJ Cadastrado")).toBeInTheDocument();
    expect(screen.getByText("Nome do Cliente")).toBeInTheDocument();
    expect(screen.getByText("Marcos de Configuração")).toBeInTheDocument();
    expect(screen.getByText("Dias Restantes")).toBeInTheDocument();
    expect(screen.getByText("Engajamento / Configuração")).toBeInTheDocument();
    expect(screen.getByText("Grupo Maia")).toBeInTheDocument();
    expect(screen.getByText("+1 CNPJ(s)")).toBeInTheDocument();
    expect(screen.queryByText("Clientes & Assinaturas (Multi-Tenant)")).not.toBeInTheDocument();
    expect(screen.queryByText("+1 GB")).not.toBeInTheDocument();
    expect(screen.queryByText("+2 GB")).not.toBeInTheDocument();
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
