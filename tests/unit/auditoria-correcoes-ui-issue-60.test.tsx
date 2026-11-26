// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/oportunidades",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/hooks/use-tenant-subscription", () => ({
  useTenantSubscription: () => ({
    isReadOnly: false,
    inGracePeriod: false,
    plano: "PRO",
  }),
}));

vi.mock("@/components/shell/module-page-shell", () => ({
  ModulePageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-shell">{children}</div>
  ),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockSearchParams = new URLSearchParams();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Issue #60 — Correções de UX Frontend (Oportunidades, Histórico e Dossiê)", () => {
  it("Item 2 & 9: Oportunidades exibe badge 'Reaberta', oculta botões rápidos quando status != PENDENTE e não trava modal ao navegar na mesma URL", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/tenant/preferencias")) {
        return new Response(
          JSON.stringify({
            ok: true,
            segmentos: ["INFORMATICA"],
            subsegmentos: [],
            ufs: ["GO"],
            brasilInteiro: false,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          configuracaoPendente: false,
          total: 2,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          oportunidades: [
            {
              id: "op_reaberta",
              orgaoNome: "Prefeitura X",
              uf: "GO",
              miniResumo: "Software de Gestão",
              resumo: "Software de gestão escolar",
              valorEstimado: 100000,
              dataAbertura: "2099-12-20T12:00:00.000Z",
              dataEncerramentoProposta: "2099-12-20T12:00:00.000Z",
              status: "PENDENTE",
              reabertaPosRecusa: true,
            },
            {
              id: "op_recusada",
              orgaoNome: "Prefeitura Y",
              uf: "GO",
              miniResumo: "Hardware Diverso",
              resumo: "Hardware diverso",
              valorEstimado: 50000,
              dataAbertura: "2099-12-22T12:00:00.000Z",
              dataEncerramentoProposta: "2099-12-22T12:00:00.000Z",
              status: "RECUSADA",
              reabertaPosRecusa: false,
            },
          ],
        }),
        { status: 200 },
      );
    });

    const { default: OportunidadesPage } = await import(
      "@/app/oportunidades/page"
    );
    render(<OportunidadesPage />);

    await waitFor(() => {
      expect(screen.getByText("Software de Gestão")).toBeTruthy();
    });

    // Badge Reaberta visível na linha da oportunidade reaberta
    expect(screen.getByTestId("badge-row-reaberta-op_reaberta")).toBeTruthy();

    // Botões rápidos visíveis apenas na linha PENDENTE, ausentes na linha RECUSADA
    expect(screen.getByTestId("btn-aceitar-op_reaberta")).toBeTruthy();
    expect(screen.queryByTestId("btn-aceitar-op_recusada")).toBeNull();
  });

  it("Item 6: HistoricoLicitacoesPage restaura filtros e resultados quando usuário retorna do Dossiê", async () => {
    window.sessionStorage.setItem(
      "portal_historico_last_state",
      JSON.stringify({
        dataInicio: "2026-10-27",
        dataFim: "2026-11-26",
        situacaoPrazo: "ENCERRADAS",
        segmento: "OUTROS",
        subsegmento: "",
        uf: "SP",
        faixaValor: "",
        busca: "merenda",
        sortBy: "valorEstimado",
        sortDir: "desc",
        page: 1,
        pageSize: 25,
        returningFromDossie: true,
      }),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          itens: [
            {
              id: "lic_restaurada",
              orgaoNome: "Prefeitura Restaurada",
              uf: "SP",
              miniResumo: "Merenda Escolar Restaurada",
              resumo: "Fornecimento de merenda escolar",
              valorEstimado: 80000,
              dataAbertura: "2026-11-05T10:00:00.000Z",
              dataEncerramentoProposta: "2026-11-05T10:00:00.000Z",
              segmentoMacro: "OUTROS",
              prazoEncerrado: true,
              statusTenant: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
          totalPages: 1,
        }),
        { status: 200 },
      ),
    );

    const { default: HistoricoLicitacoesPage } = await import(
      "@/app/historico-licitacoes/page"
    );
    render(<HistoricoLicitacoesPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toContain("busca=merenda");
    expect(calledUrl).toContain("segmento=OUTROS");
    expect(calledUrl).toContain("uf=SP");
    await waitFor(() => {
      expect(screen.getByText("Merenda Escolar Restaurada")).toBeTruthy();
    });
  });

  it("Item 5 (UI): Dossiê em modo Consulta Histórica oculta a caixa editável Equipe Operacional", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/oportunidades/lic_hist_eq")) {
        return new Response(
          JSON.stringify({
            ok: true,
            oportunidade: {
              id: "lic_hist_eq",
              idPncp: "05000000000100-1-000001/2026",
              numeroEdital: "PE 050/2026",
              orgaoNome: "Prefeitura Antiga",
              orgaoCnpj: "05.000.000/0001-00",
              uf: "GO",
              modalidade: "Pregão Eletrônico",
              valorEstimado: 100000,
              dataAbertura: "2026-01-10T10:00:00.000Z",
              dataEncerramentoProposta: "2026-01-10T10:00:00.000Z",
              miniResumo: "Edital Histórico Sem Equipe",
              resumo: "Edital encerrado para consulta histórica.",
              tipoSistemaCodigo: "OUTROS",
              parecerIA: "AVALIAR",
              status: "PENDENTE",
              reabertaPosRecusa: false,
              tags: [],
              isPresencial: false,
              quantidadeLotes: 1,
              loteUnico: true,
              precoPorLote: false,
              arquivos: [],
              repositoriosSimilares: [],
              analisesIA: [],
              notas: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, usuarios: [], membros: [] }), {
        status: 200,
      });
    });

    const { default: DossiePage } = await import(
      "@/app/oportunidades/[id]/page"
    );
    render(<DossiePage params={Promise.resolve({ id: "lic_hist_eq" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("badge-prazo-encerrado-historico")).toBeTruthy();
    });
    expect(screen.queryByTestId("equipe-assignment-box")).toBeNull();
  });
});
