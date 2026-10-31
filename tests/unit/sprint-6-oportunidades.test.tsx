import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OportunidadesPage from "@/app/oportunidades/page";

// Mocks
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockOportunidadesData = {
  ok: true,
  total: 1,
  oportunidades: [
    {
      id: "lic_test_1",
      idPncp: "12345678000190-1-000001/2026",
      numeroEdital: "PE 10/2026",
      orgaoNome: "Prefeitura Municipal de Goiânia",
      uf: "GO",
      dataAbertura: "2026-11-10T10:00:00.000Z",
      valorEstimado: 350000,
      miniResumo: "Fornecimento de pães e gêneros alimentícios",
      resumo: "Aquisição de pães franceses, bolos e produtos de panificação para a merenda escolar do município.",
      status: "PENDENTE",
      parecerIA: "GO",
      tipoSistemaCodigo: "ALIMENTOS_MERENDA_ESCOLAR",
    },
  ],
};

const mockPreferenciasData = {
  ok: true,
  segmentos: ["ALIMENTOS_MERENDA_ESCOLAR", "SAUDE_MEDICAMENTOS_HOSPITALAR"],
  subsegmentos: ["PANIFICACAO_LANCHES", "MEDICAMENTOS_FARMACOS"],
  ufs: ["GO"],
  brasilInteiro: false,
};

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/api/tenant/preferencias")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockPreferenciasData),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockOportunidadesData),
  });
});

describe("Sprint 6 - Task 6: Central de Oportunidades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve substituir 'Tipo de Sistema' por 'Segmento / Ramo' e adicionar 'Sub-segmento' dinâmico", async () => {
    render(<OportunidadesPage />);

    await waitFor(() => {
      // Deve conter o filtro "Segmento / Ramo"
      expect(screen.getByTestId("filter-segmento")).toBeInTheDocument();
      // Não deve ter mais o filtro "Tipo de Sistema"
      expect(screen.queryByTestId("filter-tipo-sistema")).toBeNull();
      // Deve conter o filtro dinâmico "Sub-segmento"
      expect(screen.getByTestId("filter-subsegmento")).toBeInTheDocument();
    });
  });

  it("não deve exibir 'Parecer da IA' no filtro nem na coluna da tabela", async () => {
    render(<OportunidadesPage />);

    await waitFor(() => {
      // Filtro Parecer da IA removido
      expect(screen.queryByTestId("filter-parecer-ia")).toBeNull();
      // Coluna Parecer da IA removida do cabeçalho da tabela
      expect(
        screen.queryByRole("columnheader", { name: /Parecer da IA/i }),
      ).toBeNull();
    });
  });

  it("não deve exibir a busca na tabela ('Filtrar tabela...') nem o botão 'Importar JSON'", async () => {
    render(<OportunidadesPage />);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Filtrar tabela/i)).toBeNull();
      expect(screen.queryByTestId("btn-open-import-modal")).toBeNull();
    });
  });

  it("deve exibir a célula de Mini-resumo sem tags/ícones de código abaixo do texto", async () => {
    render(<OportunidadesPage />);

    await waitFor(() => {
      // O sintetizarMiniResumo extrai o objeto limpo formatado
      expect(
        screen.getByText(/pães e gêneros alimentícios/i),
      ).toBeInTheDocument();
      // Não deve renderizar tags de tipoSistemaCodigo na célula de miniResumo
      expect(screen.queryByText("ALIMENTOS_MERENDA_ESCOLAR")).toBeNull();
    });
  });
});
