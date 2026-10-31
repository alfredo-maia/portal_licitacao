import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cadastroSchema } from "@/server/schemas/cadastro.schema";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import { AppShell } from "@/components/shell/app-shell";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Sprint SaaS — Cadastro (Trial 14 Dias) & Ajuste Visual do Login (Issue #13)", () => {
  describe("Contratos e Validações de Cadastro", () => {
    it("deve validar payload correto de cadastro corporativo", () => {
      const valido = {
        nome: "João da Silva",
        email: "diretoria@minhaempresa.com.br",
        senha: "senhaSegura123",
        cnpj: "04.252.011/0001-10",
        razaoSocial: "Minha Empresa Comercial Ltda",
        whatsapp: "(62) 99999-8888",
        segmentos: ["SAUDE_MEDICAMENTOS_HOSPITALAR"],
        subsegmentos: ["MEDICAMENTOS_FARMACOS"],
        ufs: ["GO"],
        brasilInteiro: false,
      };

      const parsed = cadastroSchema.parse(valido);
      expect(parsed.nome).toBe("João da Silva");
      expect(parsed.email).toBe("diretoria@minhaempresa.com.br");
      expect(parsed.whatsapp).toBe("5562999998888");
    });

    it("deve rejeitar e-mail de provedor descartável", () => {
      const descartavel = {
        nome: "Hacker",
        email: "teste@tempmail.com",
        senha: "senhaSegura123",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Empresa Fake",
        whatsapp: "62999998888",
      };

      expect(() => cadastroSchema.parse(descartavel)).toThrow();
    });

    it("deve rejeitar CNPJ com dígitos verificadores inválidos", () => {
      const cnpjInvalido = {
        nome: "João",
        email: "joao@empresa.com.br",
        senha: "senhaSegura123",
        cnpj: "11.111.111/1111-11", // CNPJ inválido
        razaoSocial: "Empresa",
        whatsapp: "62999998888",
      };

      expect(() => cadastroSchema.parse(cnpjInvalido)).toThrow();
    });
  });

  describe("Serviço de Cadastro & Ativação de 14 Dias de Trial", () => {
    it("deve cadastrar novo usuário e empresa com 14 dias de Trial", async () => {
      const input = {
        nome: "Carlos Eduardo",
        email: "carlos@empresaabc.com.br",
        senha: "senhaSuperSegura123",
        cnpj: "04.252.011/0001-10",
        razaoSocial: "Empresa ABC Comércio e Serviços Ltda",
        whatsapp: "62988887777",
        segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
        subsegmentos: ["PANIFICACAO_LANCHES"],
        ufs: ["GO"],
        brasilInteiro: false,
      };

      const resultado = await realizarCadastroConta(input);
      expect(resultado.ok).toBe(true);
      expect(resultado.userId).toBeDefined();
      expect(resultado.tenantId).toBeDefined();
      expect(resultado.trialFim).toBeDefined();
    });
  });

  describe("Comportamento do AppShell em Rotas Públicas (/login e /cadastro)", () => {
    it("não deve renderizar Header nem SideNav na rota /login", async () => {
      const { usePathname } = await import("next/navigation");
      vi.mocked(usePathname).mockReturnValue("/login");

      render(
        <AppShell>
          <div data-testid="login-content">Conteúdo da Tela de Login</div>
        </AppShell>,
      );

      // Deve renderizar o conteúdo da tela de login
      expect(screen.getByTestId("login-content")).toBeInTheDocument();

      // NÃO deve renderizar o Header nem SideNav da aplicação interna
      expect(screen.queryByTestId("carbon-ui-shell")).not.toBeInTheDocument();
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
      expect(screen.queryByText("Oportunidades")).not.toBeInTheDocument();
    });

    it("não deve renderizar Header nem SideNav na rota /cadastro", async () => {
      const { usePathname } = await import("next/navigation");
      vi.mocked(usePathname).mockReturnValue("/cadastro");

      render(
        <AppShell>
          <div data-testid="cadastro-content">Conteúdo da Tela de Cadastro</div>
        </AppShell>,
      );

      expect(screen.getByTestId("cadastro-content")).toBeInTheDocument();
      expect(screen.queryByTestId("carbon-ui-shell")).not.toBeInTheDocument();
    });
  });
});
