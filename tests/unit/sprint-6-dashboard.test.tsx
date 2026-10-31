import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "@/app/dashboard/page";
import { getRouteByPath } from "@/config/routes";

// Mocks
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockDashboardData = {
  ok: true,
  periodo: {
    mes: 10,
    ano: 2026,
    inicioUtc: "2026-10-01T03:00:00.000Z",
    fimUtc: "2026-11-01T03:00:00.000Z",
  },
  cards: {
    recebidas: { total: 42 },
    aguardandoDecisao: { total: 18, recebidasNoMes: 12 },
    emPrecificacao: { total: 9 },
    recusadas: { total: 15 },
  },
  resultados: {
    contempladas: { total: 4, valorTotal: 850000 },
    perdidasPreco: { total: 2 },
    perdidasDocumentacao: { total: 1 },
    desistencias: { total: 1 },
    impugnadas: { total: 0 },
    taxaConversaoPercentual: 57.1,
  },
  indicadores: {
    volumeEmDisputa: 2450000,
    viabilidadeIA: {
      totalAnalisadas: 40,
      goPercentual: 65,
      noGoPercentual: 35,
    },
    criticas72h: [],
  },
  topTipos: [],
};

global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockDashboardData),
  }),
);

describe("Sprint 6 - Task 5: Dashboard e Nomenclatura Comercial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve conter descrição limpa na rota /dashboard sem menção a Top 4 histórico", () => {
    const route = getRouteByPath("/dashboard");
    expect(route?.description).toBe("Visão executiva mensal.");
    expect(route?.description).not.toMatch(/Top 4 histórico/i);
    expect(route?.description).not.toMatch(/4 cards de topo/i);
  });

  it("deve renderizar os 4 cards de topo com títulos comerciais limpos e apenas o número", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      // Card 1: "Oportunidades Recebidas"
      expect(screen.getByText("Oportunidades Recebidas")).toBeInTheDocument();
      // Não deve ter mais "Recebidas da Coleta PNCP"
      expect(screen.queryByText(/Recebidas da Coleta PNCP/i)).toBeNull();

      // Card 2: "Aguardando Decisão"
      expect(screen.getByText("Aguardando Decisão")).toBeInTheDocument();

      // Card 3: "Em Precificação" (sem GO)
      expect(screen.getByText("Em Precificação")).toBeInTheDocument();

      // Card 4: "Recusadas" (sem NO-GO)
      expect(screen.getByText("Recusadas")).toBeInTheDocument();

      // Não deve ter frases de rodapé nos cards
      expect(screen.queryByText(/Editais enviados pela esteira/i)).toBeNull();
      expect(screen.queryByText(/recebidas no mês/i)).toBeNull();
      expect(screen.queryByText(/Certames aceitos em elaboração/i)).toBeNull();
      expect(screen.queryByText(/Certames descartados no período/i)).toBeNull();
    });
  });

  it("não deve conter nomenclatura 'GO/NO-GO' em nenhum lugar do Dashboard", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.queryByText(/GO\/NO-GO/i)).toBeNull();
      expect(screen.queryByText(/\(GO\)/i)).toBeNull();
      expect(screen.queryByText(/\(NO-GO\)/i)).toBeNull();
    });
  });

  it("deve manter o Painel de Desfecho & Resultados das Disputas", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Painel de Desfecho & Resultados das Disputas"),
      ).toBeInTheDocument();
      expect(screen.getByText(/Contempladas/i)).toBeInTheDocument();
    });
  });

  it("não deve renderizar o card 'Top 4 Categorias de TI (Histórico Acumulado)'", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.queryByText(/Top 4 Categorias de TI/i),
      ).toBeNull();
      expect(screen.queryByTestId("top-tipos-panel")).toBeNull();
    });
  });
});
