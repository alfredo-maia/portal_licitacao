import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CadastroPage from "@/app/cadastro/page";

// Mocks
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("Sprint 6 - Task 2: Tela de Cadastro em 2 Etapas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar a Etapa 1 com subtítulo profissional e label Telefone", () => {
    render(<CadastroPage />);

    // Não deve conter o texto informal antigo
    expect(
      screen.queryByText(/Inicie sua degustação corporativa gratuita/i),
    ).toBeNull();

    // Deve conter subtítulo corporativo profissional
    expect(
      screen.getByText(/Cadastre sua empresa para monitorar e gerenciar licitações/i),
    ).toBeInTheDocument();

    // Campo de telefone deve ter label "Telefone"
    expect(screen.getByLabelText(/^Telefone/i)).toBeInTheDocument();

    // Botão de avanço da Etapa 1 deve ser "Escolher o ramo do seu negócio"
    expect(
      screen.getByRole("button", { name: /Escolher o ramo do seu negócio/i }),
    ).toBeInTheDocument();
  });

  it("deve validar campos na Etapa 1 com validação em português e noValidate", async () => {
    render(<CadastroPage />);

    const form = document.querySelector("form");
    expect(form).toHaveAttribute("novalidate");

    const btnAvancar = screen.getByRole("button", {
      name: /Escolher o ramo do seu negócio/i,
    });
    fireEvent.click(btnAvancar);

    // Deve exibir notificação em português
    await waitFor(() => {
      expect(
        screen.getByText(/Preencha todos os campos obrigatórios/i),
      ).toBeInTheDocument();
    });
  });

  it("deve avançar para a Etapa 2 ao preencher dados válidos da Etapa 1", async () => {
    render(<CadastroPage />);

    fireEvent.change(screen.getByLabelText(/CNPJ da Empresa/i), {
      target: { value: "00.000.000/0001-91" },
    });
    fireEvent.change(screen.getByLabelText(/Razão Social/i), {
      target: { value: "Panificadora Pão Nosso Ltda" },
    });
    fireEvent.change(screen.getByLabelText(/Nome Completo do Responsável/i), {
      target: { value: "João da Silva" },
    });
    fireEvent.change(screen.getByLabelText(/E-mail Corporativo/i), {
      target: { value: "opaonossopanificadora@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Telefone/i), {
      target: { value: "(62) 98888-7777" },
    });
    fireEvent.change(screen.getByLabelText(/^Senha de Acesso/i), {
      target: { value: "123456" },
    });

    const btnAvancar = screen.getByRole("button", {
      name: /Escolher o ramo do seu negócio/i,
    });
    fireEvent.click(btnAvancar);

    // Na Etapa 2, deve exibir a lista de Macro-Segmentos
    await waitFor(() => {
      expect(screen.getByText(/Ramo do seu negócio/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Alimentos & Merenda Escolar/i),
      ).toBeInTheDocument();
    });

    // O botão de finalizar deve estar inicialmente desabilitado se nenhum segmento estiver marcado
    const btnFinalizar = screen.getByRole("button", {
      name: /Começar Teste de 14 Dias Grátis/i,
    });
    expect(btnFinalizar).toBeDisabled();

    // Ao selecionar um Macro-Segmento, seus sub-segmentos vêm marcados por padrão
    const checkboxAlimentos = screen.getByRole("checkbox", {
      name: /Alimentos & Merenda Escolar/i,
    });
    fireEvent.click(checkboxAlimentos);

    // Sub-segmentos devem estar visíveis e selecionados
    expect(screen.getByText(/Panificação & Lanches/i)).toBeInTheDocument();

    // E o botão agora deve estar habilitado
    expect(btnFinalizar).not.toBeDisabled();
  });
});
