import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RoboDeLancesPage from "@/app/robo-de-lances/page";

describe("Sprint SaaS 5 — Frontend Arsenal de Disputa (/robo-de-lances)", () => {
  it("deve renderizar o ModulePageShell de /robo-de-lances e o painel central de Auto-Bidder", () => {
    render(<RoboDeLancesPage />);

    expect(
      screen.getByRole("heading", { name: "Robô de Lances" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Painel Central de Disputas em Tempo Real (Auto-Bidder)"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("PE 099/2026 - TRE-GO"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("PE 045/2026 - Prefeitura de Anápolis/GO"),
    ).toBeInTheDocument();
  });

  it("deve permitir pausar e reativar o motor global de lances em tempo real", () => {
    render(<RoboDeLancesPage />);

    expect(screen.getByText("● Motor em Tempo Real ATIVO")).toBeInTheDocument();

    const btnPausar = screen.getByRole("button", { name: /Pausar Motor Global/i });
    expect(btnPausar).toBeInTheDocument();
    fireEvent.click(btnPausar);

    expect(screen.getByText("⏸️ Motor PAUSADO")).toBeInTheDocument();

    const btnLigar = screen.getByRole("button", { name: /Ligar Motor Global/i });
    fireEvent.click(btnLigar);

    expect(screen.getByText("● Motor em Tempo Real ATIVO")).toBeInTheDocument();
  });
});
