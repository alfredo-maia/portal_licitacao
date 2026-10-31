import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PlanosPage from "@/app/planos/page";

describe("Planos Page — Exibição de Planos, Limites e Badge de Plano Atual", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve renderizar os 3 planos oficiais (Básico, Pro e Enterprise)", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/planos/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              plano: "PRO",
              billingStatus: "TRIAL",
              diasRestantesTrial: 10,
              isReadOnly: false,
              isBlocked: false,
              inGracePeriod: false,
              maxCnpjs: 2,
              maxUsers: 2,
              cnpj: "12.345.678/0001-90",
            }),
        } as Response);
      }
      return Promise.reject(new Error("URL não mapeada"));
    });

    render(<PlanosPage />);

    expect(await screen.findByText(/Planos & Assinatura/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Básico$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Pro$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Enterprise$/i })).toBeInTheDocument();
  });

  it("deve exibir a tag 'Plano Atual' no card do plano ativo da empresa", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/planos/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              plano: "PRO",
              billingStatus: "ATIVO",
              diasRestantesTrial: 0,
              isReadOnly: false,
              isBlocked: false,
              inGracePeriod: false,
              maxCnpjs: 2,
              maxUsers: 2,
            }),
        } as Response);
      }
      return Promise.reject(new Error("URL não mapeada"));
    });

    render(<PlanosPage />);

    await waitFor(() => {
      const badges = screen.getAllByText(/Plano Atual/i);
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("deve exibir alerta de período de carência caso o trial tenha vencido", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/planos/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              plano: "PRO",
              billingStatus: "TRIAL",
              diasRestantesTrial: 0,
              diasRestantesCarencia: 2,
              isReadOnly: false,
              isBlocked: false,
              inGracePeriod: true,
              mensagemStatus: "Você tem 2 dias de carência antes do bloqueio.",
              maxCnpjs: 2,
              maxUsers: 2,
            }),
        } as Response);
      }
      return Promise.reject(new Error("URL não mapeada"));
    });

    render(<PlanosPage />);

    expect(
      await screen.findByText(/Você tem 2 dias de carência antes do bloqueio/i),
    ).toBeInTheDocument();
  });
});
