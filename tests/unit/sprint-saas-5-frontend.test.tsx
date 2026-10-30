import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RoboDeLancesPage from "@/app/robo-de-lances/page";

describe("Sprint SaaS 5 — Frontend Arsenal Premium de Disputa (/robo-de-lances)", () => {
  it("deve renderizar o ModulePageShell de /robo-de-lances e as abas do Arsenal Pro & Enterprise", () => {
    render(<RoboDeLancesPage />);

    expect(
      screen.getByRole("heading", { name: /Robô de Lances/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("tab", { name: /Calculadora de Lance & BDI/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Proposta Comercial PDF/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Monitor Chat Pregoeiro/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Impugnação com IA/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /BI Concorrentes & Relatório/i }),
    ).toBeInTheDocument();
  });

  it("deve permitir simular o lance mínimo e o BDI em tempo real na Calculadora", () => {
    render(<RoboDeLancesPage />);

    const btnCalcular = screen.getByTestId("btn-calcular-lance-bdi");
    expect(btnCalcular).toBeInTheDocument();

    fireEvent.click(btnCalcular);

    expect(
      screen.getByTestId("resultado-lance-minimo-seguro"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("status-risco-lance")).toBeInTheDocument();
  });
});

