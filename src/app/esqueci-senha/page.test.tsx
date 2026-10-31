import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EsqueciSenhaPage from "./page";

describe("EsqueciSenhaPage UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve renderizar título, campo de e-mail e botão de envio", () => {
    render(<EsqueciSenhaPage />);

    expect(screen.getByRole("heading", { name: /Recuperar Senha/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail Corporativo/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Recuperar Senha/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Voltar para o Login/i)).toBeInTheDocument();
  });

  it("deve exibir notificação de sucesso ao enviar e-mail válido", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        message: "Enviamos as instruções de recuperação para o seu e-mail.",
      }),
    } as any);

    render(<EsqueciSenhaPage />);

    const inputEmail = screen.getByLabelText(/E-mail Corporativo/i);
    fireEvent.change(inputEmail, {
      target: { value: "teste@empresa.com.br" },
    });

    const submitBtn = screen.getByRole("button", { name: /Recuperar Senha/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Enviamos as instruções de recuperação/i),
      ).toBeInTheDocument();
    });
  });

  it("deve exibir notificação de erro quando atingir rate limit (429)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Limite de 2 tentativas a cada 15 minutos atingido.",
      }),
    } as any);

    render(<EsqueciSenhaPage />);

    const inputEmail = screen.getByLabelText(/E-mail Corporativo/i);
    fireEvent.change(inputEmail, {
      target: { value: "teste@empresa.com.br" },
    });

    const submitBtn = screen.getByRole("button", { name: /Recuperar Senha/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Limite de 2 tentativas a cada 15 minutos atingido/i),
      ).toBeInTheDocument();
    });
  });
});
