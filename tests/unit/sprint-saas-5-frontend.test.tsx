import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RoboDeLancesPage from "@/app/robo-de-lances/page";

describe("Sprint SaaS 5 — Frontend Arsenal de Disputa (/robo-de-lances)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("deve renderizar o ModulePageShell de /robo-de-lances sem flash de salas demo e carregar salas reais do tenant", async () => {
    let resolverFetch!: (value: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolverFetch = resolve;
        }),
    );

    render(<RoboDeLancesPage />);

    expect(
      screen.getByRole("heading", { name: "Robô de Lances" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Painel Central de Disputas/i),
    ).toBeInTheDocument();

    // Durante o carregamento inicial, NÃO pode piscar salas fictícias de demo
    expect(screen.queryByText("PE 099/2026 - TRE-GO")).not.toBeInTheDocument();
    expect(
      screen.queryByText("PE 045/2026 - Prefeitura de Anápolis/GO"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("salas-loading-state")).toBeInTheDocument();

    resolverFetch(
      new Response(
        JSON.stringify({
          ok: true,
          plano: "PRO",
          salas: [
            {
              id: "lic-tenant-1",
              titulo: "PE 101/2026 - Hospital das Clínicas",
              orgao: "Hospital das Clínicas",
              uf: "SP",
              numeroEdital: "PE 101/2026",
              portal: "Compras.gov.br",
              identificadorSala: "UASG 090001",
              modoDisputaEdital: "ABERTO",
              intervaloMinimoLances: "R$ 5,00",
              statusGeral: "EM_DISPUTA",
              pausaEmergencia: false,
              tempoRespostaSegundos: 4,
              segundosFinaisSniper: 15,
              totalItens: 2,
              itensAtivosNoRobo: 2,
              pisoSeguroTotal: 12000,
              propostaInicialTotal: 15000,
              regrasItens: [],
              statusKanban: "EM_DISPUTA",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    expect(await screen.findByText("PE 101/2026")).toBeInTheDocument();
    expect(screen.queryByText("PE 099/2026 - TRE-GO")).not.toBeInTheDocument();
  });

  it("deve exibir aviso de Sandbox isolado, remover selects globais sem efeito e manter preferência ME/EPP", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, plano: "PRO", salas: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<RoboDeLancesPage />);

    expect(screen.getByTestId("robo-lances-sandbox-aviso")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pausar Motor Global/i }),
    ).not.toBeInTheDocument();
    expect(document.getElementById("select-decremento-padrao")).toBeNull();
    expect(document.getElementById("select-tempo-disparo")).toBeNull();

    const selectMe = document.getElementById("select-empate-me") as HTMLSelectElement;
    expect(selectMe).toBeInTheDocument();
    expect(selectMe.value).toBe("ATIVO");
    fireEvent.change(selectMe, { target: { value: "DESATIVO" } });
    expect(selectMe.value).toBe("DESATIVO");

    await waitFor(() => {
      expect(screen.getByTestId("salas-empty-state")).toBeInTheDocument();
    });
  });
});
