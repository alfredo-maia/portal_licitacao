import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CadastroPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("Task 1 - Trava de UF e Segmento no /cadastro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const avancarParaEtapa2 = async () => {
    render(<CadastroPage />);

    fireEvent.change(screen.getByLabelText(/CNPJ da Empresa/i), {
      target: { value: "00.000.000/0001-91" },
    });
    fireEvent.change(screen.getByLabelText(/Razão Social/i), {
      target: { value: "Empresa Licitante Teste Ltda" },
    });
    fireEvent.change(screen.getByLabelText(/Nome Completo do Responsável/i), {
      target: { value: "Diretor Responsável" },
    });
    fireEvent.change(screen.getByLabelText(/E-mail Corporativo/i), {
      target: { value: "contato@licitanteteste.com.br" },
    });
    fireEvent.change(screen.getByLabelText(/^Telefone/i), {
      target: { value: "(11) 98765-4321" },
    });
    fireEvent.change(screen.getByLabelText(/^Senha de Acesso/i), {
      target: { value: "senhaForte123" },
    });

    const btnAvancar = screen.getByRole("button", {
      name: /Escolher o ramo do seu negócio/i,
    });
    fireEvent.click(btnAvancar);

    await waitFor(() => {
      expect(screen.getByText(/Ramo do seu negócio/i)).toBeInTheDocument();
    });
  };

  it("deve desabilitar o botão 'Começar Teste de 14 Dias Grátis' se nenhum segmento estiver selecionado", async () => {
    await avancarParaEtapa2();

    const btnFinalizar = screen.getByRole("button", {
      name: /Começar Teste de 14 Dias Grátis/i,
    });
    expect(btnFinalizar).toBeDisabled();
  });

  it("deve desabilitar o botão se Brasil Inteiro for desmarcado e nenhuma UF estiver selecionada", async () => {
    await avancarParaEtapa2();

    const btnFinalizar = screen.getByRole("button", {
      name: /Começar Teste de 14 Dias Grátis/i,
    });

    // Seleciona um segmento
    const checkboxAlimentos = screen.getByRole("checkbox", {
      name: /Alimentos & Merenda Escolar/i,
    });
    fireEvent.click(checkboxAlimentos);

    // Com Brasil Inteiro marcado (default) e 1 segmento, botão deve estar ativo
    expect(btnFinalizar).not.toBeDisabled();

    // Desmarca Brasil Inteiro (nenhuma UF está marcada ainda)
    const checkBrasilInteiro = screen.getByRole("checkbox", {
      name: /Brasil inteiro/i,
    });
    fireEvent.click(checkBrasilInteiro);

    // Botão DEVE ficar desabilitado porque ufs.length === 0 && !brasilInteiro
    expect(btnFinalizar).toBeDisabled();

    // Marca ao menos uma UF (ex: SP)
    const checkSp = screen.getByRole("checkbox", { name: "SP" });
    fireEvent.click(checkSp);

    // Agora deve reabilitar o botão
    expect(btnFinalizar).not.toBeDisabled();

    // Desmarca a UF SP novamente -> volta a ficar desabilitado
    fireEvent.click(checkSp);
    expect(btnFinalizar).toBeDisabled();
  });
});
