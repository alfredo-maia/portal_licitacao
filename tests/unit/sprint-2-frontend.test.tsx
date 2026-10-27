import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import MinhasLicitacoesPage from "@/app/minhas-licitacoes/page";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";

const mockPush = vi.fn();
const mockBack = vi.fn();
let mockSearchParams = new URLSearchParams();

// Mocks de navegação e fetch
vi.mock("next/navigation", () => ({
  usePathname: () => "/minhas-licitacoes",
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: mockBack,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe("Sprint 2 — Frontend Kanban e Dossiê com 4 Abas (AV-48)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockClear();
    mockBack.mockClear();
    mockSearchParams = new URLSearchParams();
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear();
    }
  });

  it("deve renderizar o Funil Kanban com 9 colunas ativas e métricas de funil", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        total: 2,
        oportunidades: [
          {
            id: "lic-kanban-1",
            numeroEdital: "001/2026",
            orgaoNome: "Prefeitura de Goiânia",
            uf: "GO",
            miniResumo: "Portal de Saúde Municipal",
            resumo: "Contratação de fábrica de software",
            valorEstimado: 850000,
            dataAbertura: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
            status: "ACEITA",
            tipoSistemaCodigo: "SAUDE_ATENCAO_BASICA",
          },
          {
            id: "lic-kanban-2",
            numeroEdital: "002/2026",
            orgaoNome: "Governo do Estado de SP",
            uf: "SP",
            miniResumo: "Sistema de Gestão Escolar",
            resumo: "Plataforma de diário e matrículas",
            valorEstimado: 1950000,
            dataAbertura: new Date(Date.now() + 1000 * 60 * 60 * 120).toISOString(),
            status: "ANALISE_TECNICA",
            tipoSistemaCodigo: "EDUCACAO_PORTAL",
          },
        ],
      }),
    } as any);

    render(<MinhasLicitacoesPage />);

    expect(screen.getAllByText("Minhas Licitações")[0]).toBeInTheDocument();
    expect(screen.getByTestId("toggle-arquivadas")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("kanban-column-ACEITA")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-ANALISE_TECNICA")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-ANALISE_FINANCEIRA")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-CONTEMPLADA")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-IMPUGNADA")).toBeInTheDocument();
    });

    expect(screen.getByText(/Portal de Saúde Municipal/i)).toBeInTheDocument();
    expect(screen.getByText(/gestão escolar/i)).toBeInTheDocument();
  });

  it("deve renderizar o Dossiê com cabeçalho, equipe de execução e 4 abas Carbon", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/usuarios")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            usuarios: [
              { id: "usr-1", name: "Vítor Henrique", email: "vitor@empresa.com", role: "DIRETORIA" },
              { id: "usr-2", name: "Alfredo Maia", email: "alfredo@empresa.com", role: "ANALISTA_COMERCIAL" },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          oportunidade: {
            id: "lic-dossie-test",
            idPncp: "PNCP-2026-TEST",
            numeroEdital: "045/2026",
            orgaoNome: "Tribunal de Justiça de GO",
            orgaoCnpj: "01.000.000/0001-00",
            uf: "GO",
            modalidade: "Pregão Eletrônico",
            valorEstimado: 2500000,
            dataAbertura: "2026-11-15T09:00:00Z",
            miniResumo: "Fábrica de Software Sob Medida",
            resumo: "Prestação de serviços técnicos especializados de desenvolvimento de sistemas e sustentação em nuvem.",
            tipoSistemaCodigo: "SISTEMA_NOVO",
            parecerIA: "GO",
            status: "ANALISE_TECNICA",
            isPresencial: false,
            quantidadeLotes: 1,
            loteUnico: true,
            precoPorLote: false,
            responsavelId: "usr-1",
            responsavel: { id: "usr-1", name: "Vítor Henrique", email: "vitor@empresa.com" },
            atribuidos: [{ id: "atr-1", usuarioId: "usr-2", usuario: { id: "usr-2", name: "Alfredo Maia" } }],
            arquivos: [
              { id: "arq-1", nome: "termo-de-referencia.pdf", tamanho: 1048576, mimeType: "application/pdf", caminho: "/uploads/tr.pdf", criadoEm: new Date().toISOString() },
            ],
            repositoriosSimilares: [
              { id: "rep-1", nome: "tj-go-portal-antigo", url: "https://github.com/empresa/tjgo", criadoEm: new Date().toISOString() },
            ],
            analisesIA: [],
          },
        }),
      });
    });

    render(
      <OportunidadesDetalhePage params={Promise.resolve({ id: "lic-dossie-test" })} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dossie-header")).toBeInTheDocument();
      expect(screen.getByTestId("equipe-assignment-box")).toBeInTheDocument();
      expect(screen.getByTestId("tab-visao-geral")).toBeInTheDocument();
      expect(screen.getByTestId("tab-arquivos")).toBeInTheDocument();
      expect(screen.getByTestId("tab-repositorios")).toBeInTheDocument();
      expect(screen.getByTestId("tab-analise-ia")).toBeInTheDocument();
    });

    expect(screen.getByTestId("btn-open-verificar-participacao")).toBeInTheDocument();
    expect(screen.getByText(/Tribunal de Justiça de GO — Fábrica de software/i)).toBeInTheDocument();

    // Verificação do Botão Voltar (Issue #4)
    const btnVoltar = screen.getByTestId("btn-voltar");
    expect(btnVoltar).toBeInTheDocument();
    expect(btnVoltar).toHaveTextContent("Voltar");
    expect(btnVoltar).not.toHaveTextContent("Voltar para Central de Oportunidades");
  });

  it("deve navegar para a tela de origem ao clicar no botão Voltar quando houver ?origem= (Issue #4)", async () => {
    mockSearchParams = new URLSearchParams("origem=/calendario");

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/oportunidades/lic-origem-test")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            oportunidade: {
              id: "lic-origem-test",
              numeroEdital: "001/2026",
              orgaoNome: "Prefeitura de Goiânia",
              orgaoCnpj: "00.000.000/0001-00",
              uf: "GO",
              miniResumo: "Portal Escolar",
              status: "ACEITA",
              parecerIA: "GO",
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, usuarios: [] }) });
    });

    render(
      <OportunidadesDetalhePage params={Promise.resolve({ id: "lic-origem-test" })} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("btn-voltar")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-voltar"));
    expect(mockPush).toHaveBeenCalledWith("/calendario");
  });

  it("deve navegar para a tela gravada na sessão (ex: /minhas-licitacoes) ao clicar no botão Voltar (Issue #4)", async () => {
    mockSearchParams = new URLSearchParams();
    sessionStorage.setItem("portal_nav_origin", "/minhas-licitacoes");

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/oportunidades/lic-origem-test-2")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            oportunidade: {
              id: "lic-origem-test-2",
              numeroEdital: "002/2026",
              orgaoNome: "Prefeitura de Anápolis",
              orgaoCnpj: "00.000.000/0001-00",
              uf: "GO",
              miniResumo: "ERP Municipal",
              status: "ANALISE_TECNICA",
              parecerIA: "GO",
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, usuarios: [] }) });
    });

    render(
      <OportunidadesDetalhePage params={Promise.resolve({ id: "lic-origem-test-2" })} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("btn-voltar")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("btn-voltar"));
    expect(mockPush).toHaveBeenCalledWith("/minhas-licitacoes");
  });
});
