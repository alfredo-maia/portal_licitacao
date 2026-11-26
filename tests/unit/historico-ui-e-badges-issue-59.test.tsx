// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { APP_ROUTES } from "@/config/routes";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/historico-licitacoes",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/hooks/use-tenant-subscription", () => ({
  useTenantSubscription: () => ({
    isReadOnly: false,
    inGracePeriod: false,
    plano: "BASICO",
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
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Issue #59 (Task 6) — Frontend Histórico de Licitações, Ordenação Global & Badges no Dossiê", () => {
  it("posiciona Histórico de Licitações imediatamente entre Minhas Licitações (3) e Calendário (5)", () => {
    const idxMinhas = APP_ROUTES.findIndex((r) => r.id === "minhas-licitacoes");
    const idxHistorico = APP_ROUTES.findIndex(
      (r) => r.id === "historico-licitacoes",
    );
    const idxCalendario = APP_ROUTES.findIndex((r) => r.id === "calendario");

    expect(idxMinhas).toBe(2);
    expect(idxHistorico).toBe(3);
    expect(idxCalendario).toBe(4);
    expect(APP_ROUTES[idxHistorico]?.label).toBe("Histórico de Licitações");
    expect(APP_ROUTES[idxHistorico]?.path).toBe("/historico-licitacoes");
  });

  it("HistoricoLicitacoesPage abre vazia sem buscar no mount, valida mín 3 letras/30 dias e dispara busca SQL ao clicar Buscar", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          itens: [
            {
              id: "lic_hist_1",
              orgaoNome: "Prefeitura Histórica",
              uf: "SP",
              miniResumo: "Aquisição de Equipamentos",
              resumo: "Aquisição de equipamentos escolares diversos.",
              valorEstimado: 120000,
              dataAbertura: "2026-11-10T12:00:00.000Z",
              dataEncerramentoProposta: "2026-11-10T12:00:00.000Z",
              segmentoMacro: "OUTROS",
              prazoEncerrado: true,
              statusTenant: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { default: HistoricoLicitacoesPage } = await import(
      "@/app/historico-licitacoes/page"
    );
    render(<HistoricoLicitacoesPage />);

    // Zero query automática ao montar a tela
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("historico-empty-initial")).toBeTruthy();

    // Tenta buscar com apenas 2 letras -> bloqueia no cliente sem chamar API
    const buscaInput = screen.getByTestId("historico-filter-busca");
    fireEvent.change(buscaInput, { target: { value: "da" } });
    fireEvent.click(screen.getByTestId("btn-buscar-historico"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/ao menos 3 caracteres/i)).toBeTruthy();

    // Limpa busca e clica em Buscar -> dispara GET /api/historico-licitacoes
    fireEvent.change(buscaInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("btn-buscar-historico"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(calledUrl).toContain("/api/historico-licitacoes?");
    expect(calledUrl).toContain("sortBy=dataLimite");

    await waitFor(() => {
      expect(screen.getByText("Aquisição de Equipamentos")).toBeTruthy();
    });
  });

  it("OportunidadesPage oferece pageSizes [10, 25, 50, 100] e dispara ordenação global server-side ao clicar na coluna Valor Estimado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
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
          total: 25,
          page: 1,
          pageSize: 10,
          totalPages: 3,
          oportunidades: [
            {
              id: "op_1",
              orgaoNome: "Prefeitura A",
              uf: "GO",
              miniResumo: "Licença de Software",
              resumo: "Contratação de licença de software ERP.",
              valorEstimado: 90000,
              dataAbertura: "2026-12-20T12:00:00.000Z",
              dataEncerramentoProposta: "2026-12-20T12:00:00.000Z",
              parecerIA: "GO",
              status: "PENDENTE",
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
      expect(screen.getByText("Licença de Software")).toBeTruthy();
    });

    // Verifica que opção 100 existe no seletor de itens por página
    const pagination = screen.getByTestId("oportunidades-pagination");
    expect(pagination.textContent).toContain("100");

    // Clica no cabeçalho Valor Estimado -> atualiza URL com sortBy=valorEstimado
    const valorHeaderBtn = screen.getByRole("button", {
      name: /Valor Estimado/i,
    });
    fireEvent.click(valorHeaderBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    const pushedUrl = String(mockPush.mock.calls[mockPush.mock.calls.length - 1]?.[0] || "");
    expect(pushedUrl).toContain("sortBy=valorEstimado");
    expect(pushedUrl).toContain("sortDir=");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("Dossiê /oportunidades/[id] exibe badge de Prazo Encerrado (sem botões Participar/Não Participar) para edital vencido e badge Reaberta após Recusa", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/oportunidades/lic_vencida")) {
        return new Response(
          JSON.stringify({
            ok: true,
            oportunidade: {
              id: "lic_vencida",
              idPncp: "01000000000100-1-000001/2026",
              numeroEdital: "PE 001/2026",
              orgaoNome: "Prefeitura Passada",
              orgaoCnpj: "01.000.000/0001-00",
              uf: "SP",
              modalidade: "Pregão Eletrônico",
              valorEstimado: 150000,
              dataAbertura: "2026-01-10T10:00:00.000Z",
              dataEncerramentoProposta: "2026-01-10T10:00:00.000Z",
              miniResumo: "Edital Histórico Encerrado",
              resumo: "Objeto histórico encerrado para consulta.",
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
      if (url.includes("/api/oportunidades/lic_reaberta")) {
        return new Response(
          JSON.stringify({
            ok: true,
            oportunidade: {
              id: "lic_reaberta",
              idPncp: "01000000000100-1-000002/2026",
              numeroEdital: "PE 002/2026",
              orgaoNome: "Prefeitura Reaberta",
              orgaoCnpj: "01.000.000/0001-00",
              uf: "GO",
              modalidade: "Pregão Eletrônico",
              valorEstimado: 250000,
              dataAbertura: "2099-12-20T10:00:00.000Z",
              dataEncerramentoProposta: "2099-12-20T10:00:00.000Z",
              miniResumo: "Edital Reaberto PNCP",
              resumo: "Objeto reaberto com nova data.",
              tipoSistemaCodigo: "OUTROS",
              parecerIA: "GO",
              status: "PENDENTE",
              motivoRecusa: "Prazo anterior muito curto",
              reabertaPosRecusa: true,
              tags: ["REABERTA_POS_RECUSA"],
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

    const { unmount } = render(
      <DossiePage params={Promise.resolve({ id: "lic_vencida" })} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("badge-prazo-encerrado-historico")).toBeTruthy();
    });
    expect(screen.queryByTestId("btn-dossie-aceitar")).toBeNull();
    expect(screen.queryByTestId("btn-dossie-recusar")).toBeNull();

    unmount();

    render(<DossiePage params={Promise.resolve({ id: "lic_reaberta" })} />);
    await waitFor(() => {
      expect(screen.getByTestId("badge-reaberta-pos-recusa")).toBeTruthy();
    });
    expect(screen.getByTestId("btn-dossie-aceitar")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });
});
