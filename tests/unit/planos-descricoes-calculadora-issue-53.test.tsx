import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PlanosPage from "@/app/planos/page";
import { parseMoedaBRL } from "@/lib/masks";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/planos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_1",
        name: "Licitante Teste",
        email: "licitante@empresa.com.br",
        role: "DIRETORIA",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

describe("Issue #53 — Melhoria das descrições dos planos (Calculadora, Busca de Preços, Orçamentos) e remoção de Go/No-Go", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/planos/status")) {
        return new Response(
          JSON.stringify({
            ok: true,
            plano: "PRO",
            billingStatus: "TRIAL",
            diasRestantesTrial: 12,
            maxCnpjs: 2,
            maxUsers: 2,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, faturas: [] }), { status: 200 });
    });
  });

  it("1. Não deve conter nenhuma menção a 'Go/No-Go' em nenhum plano", async () => {
    render(<PlanosPage />);
    expect(await screen.findByText(/R\$\s*59,90/i)).toBeTruthy();
    expect(screen.queryByText(/Go\/No-Go/i)).toBeNull();
    expect(screen.queryByText(/Parecer Go/i)).toBeNull();
  });

  it("2. Deve conter termos e recursos relativos a Calculadora, Busca de Preços e Orçamentos", async () => {
    render(<PlanosPage />);
    expect(await screen.findByText(/R\$\s*59,90/i)).toBeTruthy();

    // Calculadora presente
    const elementosCalculadora = screen.getAllByText(/Calculadora/i);
    expect(elementosCalculadora.length).toBeGreaterThanOrEqual(3);

    // Busca de Preços em outras licitações presente
    const elementosPrecos = screen.getAllByText(/Preços|pesquisa de preços/i);
    expect(elementosPrecos.length).toBeGreaterThanOrEqual(2);

    // Orçamento presente
    const elementosOrcamento = screen.getAllByText(/Orçamento/i);
    expect(elementosOrcamento.length).toBeGreaterThanOrEqual(3);
  });

  it("3. Botão de Escolher Plano/Upgrade deve abrir o modal de checkout com formas de pagamento", async () => {
    render(<PlanosPage />);
    expect(await screen.findByText(/R\$\s*59,90/i)).toBeTruthy();

    const btnsUpgrade = screen.getAllByRole("button", { name: /Contratar|Fazer Upgrade/i });
    expect(btnsUpgrade.length).toBeGreaterThan(0);

    fireEvent.click(btnsUpgrade[0]);
    await waitFor(() => {
      expect(screen.getByText(/Confirmar Contratação/i)).toBeTruthy();
    });
  });

  it("4. Utilitário parseMoedaBRL deve interpretar corretamente valores formatados em Real", () => {
    expect(parseMoedaBRL("1.200,50")).toBe(1200.5);
    expect(parseMoedaBRL("R$ 150,00")).toBe(150);
    expect(parseMoedaBRL("59,90")).toBe(59.9);
    expect(parseMoedaBRL("97")).toBe(97);
    expect(parseMoedaBRL(null)).toBeNaN();
    expect(parseMoedaBRL("")).toBeNaN();
  });
});
