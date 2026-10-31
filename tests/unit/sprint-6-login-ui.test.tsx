import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";

// Mocks
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
  }),
}));

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: any[]) => signInMock(...args),
}));

global.fetch = vi.fn();

describe("Sprint 6 - Task 3: Tela de Login Multi-Step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar o Passo 1 apenas com E-mail Corporativo, Avançar e Novo Por Aqui", () => {
    render(<LoginPage />);

    // Campo de e-mail corporativo presente
    expect(screen.getByLabelText(/E-mail Corporativo/i)).toBeInTheDocument();

    // Botão Avançar presente
    expect(screen.getByRole("button", { name: /Avançar/i })).toBeInTheDocument();

    // Divisor "NOVO POR AQUI?" e botão "Cadastrar Novo Usuário"
    expect(screen.getByText(/NOVO POR AQUI\?/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cadastrar Novo Usuário/i }),
    ).toBeInTheDocument();

    // Não deve conter campo de senha nem link "Esqueceu a senha?" no Passo 1
    expect(screen.queryByLabelText(/^Senha/i)).toBeNull();
    expect(screen.queryByText(/Esqueceu a senha\?/i)).toBeNull();
  });

  it("deve avançar para o Passo 2 ('Como deseja entrar?') com as 3 opções de login", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/E-mail Corporativo/i), {
      target: { value: "opaonossopanificadora@gmail.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Como deseja entrar\?/i)).toBeInTheDocument();
      expect(
        screen.getByText("opaonossopanificadora@gmail.com"),
      ).toBeInTheDocument();
    });

    // 3 opções devem estar visíveis
    expect(
      screen.getByRole("button", { name: /Entrar com senha/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Receber código por E-mail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Receber código por WhatsApp/i }),
    ).toBeInTheDocument();

    // Link esqueceu a senha não deve aparecer no Passo 2
    expect(screen.queryByText(/Esqueceu a senha\?/i)).toBeNull();
  });

  it("deve abrir o Passo 3A ('Digite sua senha') com 'Esqueceu a senha?' apenas nele", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/E-mail Corporativo/i), {
      target: { value: "opaonossopanificadora@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Como deseja entrar\?/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Entrar com senha/i }));

    await waitFor(() => {
      expect(screen.getByText(/Digite sua senha/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Senha/i)).toBeInTheDocument();
      // O link Esqueceu a senha? deve aparecer exclusivamente aqui
      expect(screen.getByText(/Esqueceu a senha\?/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Escolher outro método de entrada/i }),
      ).toBeInTheDocument();
    });
  });

  it("deve abrir o Passo 3B ('Digite o código' - E-mail) sem 'Esqueceu a senha?'", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, mensagem: "Código enviado" }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/E-mail Corporativo/i), {
      target: { value: "opaonossopanificadora@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Como deseja entrar\?/i)).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Receber código por E-mail/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Digite o código/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Código enviado para o seu e-mail/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Esqueceu a senha\?/i)).toBeNull();
      expect(
        screen.getByRole("button", { name: /Escolher outro método de entrada/i }),
      ).toBeInTheDocument();
    });
  });

  it("deve abrir o Passo 3C ('Digite o código' - WhatsApp) sem 'Esqueceu a senha?'", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, mensagem: "Código enviado" }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/E-mail Corporativo/i), {
      target: { value: "opaonossopanificadora@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Como deseja entrar\?/i)).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Receber código por WhatsApp/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Digite o código/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Código enviado para o seu WhatsApp/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Esqueceu a senha\?/i)).toBeNull();
      expect(
        screen.getByRole("button", { name: /Escolher outro método de entrada/i }),
      ).toBeInTheDocument();
    });
  });
});
