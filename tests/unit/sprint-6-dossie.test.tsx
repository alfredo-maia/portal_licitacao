import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";

// Mocks
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockDetalheData = {
  ok: true,
  oportunidade: {
    id: "opp_123",
    idPncp: "12345678000190-1-000001/2026",
    numeroEdital: "PE 10/2026",
    orgaoNome: "Prefeitura de Goiânia",
    orgaoCnpj: "12.345.678/0001-90",
    uf: "GO",
    modalidade: "Pregão Eletrônico",
    valorEstimado: 450000,
    dataAbertura: "2026-11-15T09:00:00.000Z",
    miniResumo: "Fornecimento de pães",
    resumo: "Aquisição de pães franceses para alimentação escolar.",
    tipoSistemaCodigo: "ALIMENTOS_MERENDA_ESCOLAR",
    parecerIA: "GO",
    status: "PENDENTE",
    isPresencial: false,
    arquivos: [
      {
        id: "arq_1",
        nome: "Edital_Completo.pdf",
        tamanho: 1048576,
        mimeType: "application/pdf",
        caminho: "/uploads/edital.pdf",
        criadoEm: "2026-10-30T10:00:00.000Z",
      },
    ],
    repositoriosSimilares: [],
    analisesIA: [],
  },
};

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/sync-pncp")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          sincronizados: 2,
          mensagem: "2 arquivos sincronizados com sucesso do PNCP",
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockDetalheData),
  });
});

describe("Sprint 6 - Task 7: Dossiê da Oportunidade e Sincronização PNCP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não deve renderizar tags de Parecer IA nem Tipo de sistema no cabeçalho", async () => {
    render(<OportunidadesDetalhePage params={{ id: "opp_123" }} />);

    await waitFor(() => {
      expect(screen.getByTestId("dossie-header")).toBeInTheDocument();
    });

    // Não deve conter a tag "Parecer IA: GO"
    expect(screen.queryByText(/Parecer IA:/i)).toBeNull();
    // Não deve conter a tag do tipo de sistema no cabeçalho
    expect(screen.queryByText("ALIMENTOS_MERENDA_ESCOLAR")).toBeNull();
  });

  it("não deve renderizar os botões 'Abrir Edital Oficial no PNCP' e 'Portal de Disputa'", async () => {
    render(<OportunidadesDetalhePage params={{ id: "opp_123" }} />);

    await waitFor(() => {
      expect(screen.getByTestId("dossie-header")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Abrir Edital Oficial no PNCP/i)).toBeNull();
    expect(screen.queryByText(/Portal de Disputa/i)).toBeNull();
  });

  it("não deve exibir a aba 'Repositórios Similares' nem a seção 'Classificação do Tipo de Sistema'", async () => {
    render(<OportunidadesDetalhePage params={{ id: "opp_123" }} />);

    await waitFor(() => {
      expect(screen.getByTestId("dossie-header")).toBeInTheDocument();
    });

    // Aba Repositórios Similares não deve existir
    expect(screen.queryByText(/Repositórios Similares/i)).toBeNull();
    // Card Classificação do Tipo de Sistema não deve existir
    expect(
      screen.queryByText(/Classificação do Tipo de Sistema/i),
    ).toBeNull();
  });

  it("deve renderizar a aba 'Arquivos do Edital' sem contagem no título e com botão 'Buscar Edital'", async () => {
    render(<OportunidadesDetalhePage params={{ id: "opp_123" }} />);

    await waitFor(() => {
      // O título da aba deve ser "Arquivos do Edital" sem ()
      expect(screen.getByText("Arquivos do Edital")).toBeInTheDocument();
      expect(screen.queryByText(/Arquivos do Edital \(\d+\)/i)).toBeNull();
    });

    // Clica na aba Arquivos do Edital
    fireEvent.click(screen.getByText("Arquivos do Edital"));

    // Botão "Buscar Edital" presente
    const btnBuscar = await screen.findByTestId("btn-buscar-edital-pncp");
    expect(btnBuscar).toBeInTheDocument();
    expect(btnBuscar).toHaveTextContent(/Buscar Edital/i);

    // Clica em Buscar Edital
    fireEvent.click(btnBuscar);

    // Deve chamar o endpoint de sincronização
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/oportunidades/opp_123/arquivos/sync-pncp"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
