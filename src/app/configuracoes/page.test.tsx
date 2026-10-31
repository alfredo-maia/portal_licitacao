import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ConfiguracoesPage from "./page";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: vi.fn().mockReturnValue({
    data: {
      user: {
        id: "usr_dir_1",
        name: "Vítor Henrique",
        email: "vitor@empresa.com",
        role: "DIRETORIA",
        cnpj: "12.345.678/0001-90",
        plano: "BASICO",
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), replace: vi.fn() }),
  usePathname: vi.fn().mockReturnValue("/configuracoes"),
}));

describe("Configurações Page — Reforma Completa (Meu Perfil 3 Cards, Multi-CNPJ & Equipe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/session")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                id: "usr_dir_1",
                name: "Vítor Henrique",
                email: "vitor@empresa.com",
                role: "DIRETORIA",
                cnpj: "12.345.678/0001-90",
                plano: "BASICO",
                billingStatus: "TRIAL",
              },
            }),
        });
      }
      if (url.includes("/api/configuracoes/perfil")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              perfil: {
                name: "Vítor Henrique",
                email: "vitor@empresa.com",
                cpf: "123.456.789-00",
                telefone: "(62) 99999-8888",
                cep: "74115-030",
                logradouro: "Avenida República do Líbano",
                numero: "1200",
                complemento: "",
                bairro: "Setor Oeste",
                cidade: "Goiânia",
                uf: "GO",
              },
            }),
        });
      }
      if (url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              empresa: {
                id: "default",
                razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
                cnpj: "12.345.678/0001-90",
                inscricaoEstadual: "10.123.456-7",
                inscricaoMunicipal: "98765-4",
                cnae: "62.01-5-00",
                endereco: "Av. República do Líbano, 1200",
                numero: "1200",
                complemento: "",
                bairro: "Setor Oeste",
                cidade: "Goiânia",
                uf: "GO",
                cep: "74115-030",
                representanteNome: "Vítor Henrique de Souza",
                representanteCpf: "123.456.789-00",
                representanteCargo: "Sócio-Administrador",
                bancoNome: "Banco do Brasil",
                agencia: "1234-5",
                contaCorrente: "98765-4",
                chavePix: "12.345.678/0001-90",
              },
            }),
        });
      }
      if (url.includes("/api/configuracoes/tenants") || url.includes("/api/tenants")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              tenants: [
                {
                  id: "tenant_1",
                  cnpj: "12345678000190",
                  razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
                  plano: "BASICO",
                  billingStatus: "TRIAL",
                },
              ],
            }),
        });
      }
      if (url.includes("/api/configuracoes/equipe")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              total: 1,
              usuarios: [
                {
                  id: "usr_dir_1",
                  name: "Vítor Henrique",
                  email: "vitor@empresa.com",
                  role: "DIRETORIA",
                  ativo: true,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    });
  });

  it("não deve renderizar a frase residual de Front-only no cabeçalho", async () => {
    render(<ConfiguracoesPage />);
    expect(
      screen.queryByText(/Front-only: Perfil, Dados da Empresa/i),
    ).not.toBeInTheDocument();
  });

  it("não deve exibir a aba Trilha de Auditoria (Logs) para clientes", async () => {
    render(<ConfiguracoesPage />);
    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: /Trilha de Auditoria/i })).not.toBeInTheDocument();
    });
  });

  it("Aba Meu Perfil deve conter 3 cards estruturados e sem o bloco de preferência de tema", async () => {
    render(<ConfiguracoesPage />);

    // Verifica que o bloco de tema não existe
    expect(
      screen.queryByText(/Preferência de Visualização do Tema/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tema Claro \(White\)/i })).not.toBeInTheDocument();

    // Card 1: Dados Pessoais
    expect(screen.getByText(/Dados Pessoais/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Nome Completo/i)[0]).toBeInTheDocument();
    const emailInput = screen.getByLabelText(/E-mail \(Não pode ser alterado\)/i);
    expect(emailInput).toBeDisabled();

    // Card 2: Endereço
    expect(screen.getByText(/Endereço Residencial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^CEP/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rua \/ Logradouro/i)).toBeInTheDocument();

    // Card 3: Segurança
    expect(screen.getByText(/Card 3 — Segurança/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nova Senha$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirmar Nova Senha/i)).toBeInTheDocument();

    // Botão de salvar Meu Perfil
    expect(
      screen.getByRole("button", { name: /Salvar Meu Perfil/i }),
    ).toBeInTheDocument();

    // Card Sessão Ativa mantido
    expect(screen.getByText(/Sessão Ativa/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sair da Conta/i })).toBeInTheDocument();
  });

  it("Aba Dados da Empresa deve conter seletor Multi-CNPJ e botão Adicionar CNPJ com regra de plano", async () => {
    render(<ConfiguracoesPage />);

    await waitFor(() => {
      expect(screen.getByText("Vítor Henrique")).toBeInTheDocument();
      expect(screen.getByText("DIRETORIA (Titular)")).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole("tab");
    console.log("TABS FOUND:", tabs.map(t => t.textContent));
    fireEvent.click(tabs[1]);

    await waitFor(() => {
      // Dados da Empresa na Aba 2
      expect(screen.getByDisplayValue("APONTA TECNOLOGIA E SERVICOS LTDA")).toBeInTheDocument();
      expect(screen.getAllByDisplayValue("12.345.678/0001-90")[0]).toBeInTheDocument();

      // Botão Adicionar CNPJ (habilitado em TRIAL pois tem funções do PRO até 2 CNPJs)
      const btnAddCnpj = screen.getByRole("button", { name: /Adicionar CNPJ/i });
      expect(btnAddCnpj).not.toBeDisabled();

      // Inscrição Municipal deve estar presente
      expect(screen.getByLabelText(/Inscrição Municipal/i)).toBeInTheDocument();

      // Frase removida
      expect(
        screen.queryByText(/Fonte única da verdade utilizada no auto-preenchimento/i),
      ).not.toBeInTheDocument();

      // Seção 5: Triagem & Escopo de Licitações
      expect(screen.getByText(/5\. Triagem & Escopo de Licitações/i)).toBeInTheDocument();
      expect(screen.getByText(/Saúde, Medicamentos & Hospitalar/i)).toBeInTheDocument();
      expect(screen.getByText(/Tecnologia.*Telecom/i)).toBeInTheDocument();
      expect(screen.getByText(/Brasil Inteiro/i)).toBeInTheDocument();
    });
  });

  it("Aba Gestão da Equipe deve ser renomeada, sem Anexo 4/RBAC e sem opção Operador Técnico", async () => {
    render(<ConfiguracoesPage />);

    // Verifica nome da aba
    const equipeTab = screen.getByRole("tab", { name: "Gestão da Equipe" });
    expect(equipeTab).toBeInTheDocument();
    fireEvent.click(equipeTab);

    await waitFor(() => {
      // Frase de diretoria/operadores removida
      expect(
        screen.queryByText(/Diretoria, Analistas Comerciais e Operadores Técnicos com segregação de funções/i),
      ).not.toBeInTheDocument();
    });

    // Abrir Modal de Novo Colaborador
    const btnNovo = screen.getByRole("button", { name: /Novo Colaborador/i });
    fireEvent.click(btnNovo);

    await waitFor(() => {
      // Modal sem '(RBAC)'
      expect(screen.getByText("Cadastrar Novo Colaborador")).toBeInTheDocument();

      // Não deve ter a opção Operador Técnico
      expect(screen.queryByText(/OPERADOR TÉCNICO/i)).not.toBeInTheDocument();
    });
  });
});
