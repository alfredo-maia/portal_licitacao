import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OportunidadesPage from "@/app/oportunidades/page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Tarefa 4 — UX de Carregamento em Oportunidades (#26)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve desabilitar filtros e botão de busca enquanto dados estiverem carregando", async () => {
    // Retarda a resposta do fetch para validar estado de loading
    let resolvePreferencias: any;
    const prefPromise = new Promise((resolve) => {
      resolvePreferencias = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/tenant/preferencias")) {
        return prefPromise;
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            total: 0,
            oportunidades: [],
          }),
      });
    });

    render(<OportunidadesPage />);

    // Enquanto carrega preferências, os filtros devem estar desabilitados
    const buscaInput = screen.getByTestId("filter-busca");
    expect(buscaInput).toBeDisabled();

    const buscaBtn = document.getElementById("btn-executar-busca-oportunidades");
    expect(buscaBtn).toBeDisabled();

    // Resolve a promise de preferências
    resolvePreferencias({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          segmentos: ["ALIMENTACAO"],
          ufs: ["GO"],
          brasilInteiro: false,
        }),
    });

    await waitFor(() => {
      expect(buscaInput).not.toBeDisabled();
      expect(buscaBtn).not.toBeDisabled();
    });
  });

  it("deve exibir banner de configuração pendente quando tenant não tiver segmentos", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/tenant/preferencias")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              segmentos: [],
              ufs: [],
              brasilInteiro: false,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            configuracaoPendente: true,
            total: 0,
            oportunidades: [],
          }),
      });
    });

    render(<OportunidadesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("banner-configuracao-pendente")).toBeInTheDocument();
      expect(screen.getByTestId("empty-configuracao-pendente")).toBeInTheDocument();
    });
  });
});

