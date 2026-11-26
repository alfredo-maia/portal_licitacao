import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/shell/app-shell";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

describe("Issue #56 — AppShell banners de carência e bloqueio pós-trial sem erro useNoInteractiveChildren do Carbon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza banner de período de carência (inGracePeriod: true) com botão Regularizar Plano sem lançar exceção do Carbon", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/planos/status")) {
        return new Response(
          JSON.stringify({
            ok: true,
            billingStatus: "TRIAL",
            plano: "PRO",
            isReadOnly: false,
            inGracePeriod: true,
            diasRestantesTrial: 0,
            diasRestantesCarencia: 1,
            mensagemStatus:
              "Seu período de teste terminou. Você tem 1 dia(s) de carência antes do bloqueio das ações.",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, avisos: [], tickets: [], tenants: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    render(
      <AppShell>
        <div data-testid="dashboard-child">Conteúdo do Dashboard</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("banner-carencia-planos")).toBeInTheDocument();
    });

    expect(screen.getByText(/Período de Carência:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regularizar Plano/i })).toBeInTheDocument();
  });

  it("renderiza banner de acesso somente-leitura (isReadOnly: true) com botão Ver Planos sem lançar exceção do Carbon", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/planos/status")) {
        return new Response(
          JSON.stringify({
            ok: true,
            billingStatus: "BLOQUEADO",
            plano: "PRO",
            isReadOnly: true,
            inGracePeriod: false,
            diasRestantesTrial: 0,
            mensagemStatus:
              "Seu período de teste expirou. Escolha um plano para reativar as ações.",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, avisos: [], tickets: [], tenants: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    render(
      <AppShell>
        <div data-testid="dashboard-child">Conteúdo do Dashboard</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("banner-bloqueio-planos")).toBeInTheDocument();
    });

    expect(screen.getByText(/Acesso Somente-Leitura:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver Planos/i })).toBeInTheDocument();
  });
});
