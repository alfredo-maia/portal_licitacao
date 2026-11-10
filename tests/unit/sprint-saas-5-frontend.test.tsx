import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RoboDeLancesPage from "@/app/robo-de-lances/page";

describe("Sprint SaaS 5 — Frontend Arsenal de Disputa (/robo-de-lances)", () => {
  it("deve renderizar o ModulePageShell de /robo-de-lances e o painel central de Disputas", () => {
    render(<RoboDeLancesPage />);

    expect(
      screen.getByRole("heading", { name: "Robô de Lances" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Painel Central de Disputas/i),
    ).toBeInTheDocument();

    expect(
      screen.getByText("PE 099/2026 - TRE-GO"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("PE 045/2026 - Prefeitura de Anápolis/GO"),
    ).toBeInTheDocument();
  });

  it("deve exibir aviso de Sandbox isolado, remover selects globais sem efeito e manter preferência ME/EPP", () => {
    render(<RoboDeLancesPage />);

    expect(screen.getByTestId("robo-lances-sandbox-aviso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pausar Motor Global/i })).not.toBeInTheDocument();
    expect(document.getElementById("select-decremento-padrao")).toBeNull();
    expect(document.getElementById("select-tempo-disparo")).toBeNull();

    const selectMe = document.getElementById("select-empate-me") as HTMLSelectElement;
    expect(selectMe).toBeInTheDocument();
    expect(selectMe.value).toBe("ATIVO");
    fireEvent.change(selectMe, { target: { value: "DESATIVO" } });
    expect(selectMe.value).toBe("DESATIVO");
  });
});
