import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import NotFoundPage from "@/app/not-found";
import AcessoNegadoPage from "@/app/acesso-negado/page";
import { can, ROLE_PERMISSIONS_CONTRACT, type RbacUser } from "@/lib/rbac";

// Mock do next/navigation
const mockBack = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
  usePathname: () => "/rota-inexistente",
}));

describe("Issue #6 — TDD: Página 404 (not-found) e 403 (Acesso Negado)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Página 404 Personalizada (src/app/not-found.tsx)", () => {
    it("deve renderizar a página 404 com título e mensagens em PT-BR amigáveis", () => {
      render(<NotFoundPage />);

      expect(screen.getByTestId("not-found-page")).toBeDefined();
      expect(screen.getByRole("heading", { level: 1, name: /Página não encontrada/i })).toBeDefined();
      expect(
        screen.getByText(/O endereço acessado não existe, foi movido ou está temporariamente indisponível/i),
      ).toBeDefined();
      expect(screen.getByText(/404/i)).toBeDefined();
    });

    it("deve conter botão Voltar que executa router.back()", () => {
      render(<NotFoundPage />);

      const backButton = screen.getByRole("button", { name: /Voltar/i });
      expect(backButton).toBeDefined();

      fireEvent.click(backButton);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it("deve conter botão para navegar para a Central de Oportunidades", () => {
      render(<NotFoundPage />);

      const homeButton = screen.getByRole("button", { name: /Central de Oportunidades/i });
      expect(homeButton).toBeDefined();

      fireEvent.click(homeButton);
      expect(mockPush).toHaveBeenCalledWith("/oportunidades");
    });
  });

  describe("Tela 403 — Acesso Não Autorizado (src/app/acesso-negado/page.tsx)", () => {
    it("deve renderizar a tela 403 com avisos claros de permissão em PT-BR", () => {
      render(<AcessoNegadoPage />);

      expect(screen.getByTestId("forbidden-page")).toBeDefined();
      expect(screen.getByRole("heading", { level: 1, name: /Acesso Não Autorizado/i })).toBeDefined();
      expect(
        screen.getByText(/Seu perfil de usuário não possui permissão para acessar esta área ou executar esta ação/i),
      ).toBeDefined();
      expect(screen.getByText(/403/i)).toBeDefined();
    });

    it("deve permitir que o usuário retorne à tela anterior via botão Voltar", () => {
      render(<AcessoNegadoPage />);

      const backBtn = screen.getByRole("button", { name: /Voltar/i });
      expect(backBtn).toBeDefined();

      fireEvent.click(backBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it("deve conter botão de retorno seguro para a Central de Oportunidades ou Dashboard", () => {
      render(<AcessoNegadoPage />);

      const safeButton = screen.getByRole("button", { name: /Área Principal/i });
      expect(safeButton).toBeDefined();

      fireEvent.click(safeButton);
      expect(mockPush).toHaveBeenCalledWith("/oportunidades");
    });
  });

  describe("RBAC Governança — Verificação de Bloqueio 403 para Perfis", () => {
    const operador: RbacUser = { id: "op-1", role: "OPERADOR", ativo: true };
    const analista: RbacUser = { id: "an-1", role: "ANALISTA_COMERCIAL", ativo: true };
    const diretoria: RbacUser = { id: "dir-1", role: "DIRETORIA", ativo: true };

    it("OPERADOR deve ter acesso negado para ações restritas (decide_go_nogo, manage_team)", () => {
      expect(can(operador, "decide_go_nogo")).toBe(false);
      expect(can(operador, "manage_team")).toBe(false);
      expect(can(operador, "approve_price")).toBe(false);
      expect(can(operador, "discard")).toBe(false);
    });

    it("OPERADOR possui acesso permitido apenas para leitura e exportação", () => {
      expect(can(operador, "view")).toBe(true);
      expect(can(operador, "read")).toBe(true);
      expect(can(operador, "export")).toBe(true);
    });

    it("DIRETORIA possui acesso irrestrito a todas as ações contratuais", () => {
      for (const action of ROLE_PERMISSIONS_CONTRACT.DIRETORIA) {
        expect(can(diretoria, action)).toBe(true);
      }
    });

    it("ANALISTA_COMERCIAL possui permissão de deliberação mas não de gestão de equipe ou aprovação de preço", () => {
      expect(can(analista, "licitacao:decide")).toBe(true);
      expect(can(analista, "manage_team")).toBe(false);
      expect(can(analista, "approve_price")).toBe(false);
    });
  });
});
