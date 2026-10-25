import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ConfiguracoesPage from "@/app/configuracoes/page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/configuracoes",
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Sprint 6 — Frontend: Configurações Corporativas, Equipe RBAC & Auditoria (AV-84)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar as 4 abas principais de configurações", async () => {
    const mockEmpresa = {
      id: "default",
      razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
      cnpj: "12.345.678/0001-90",
      endereco: "Av. República do Líbano, 1200",
      cidade: "Goiânia",
      uf: "GO",
      cep: "74115-030",
      representanteNome: "Vítor Henrique de Souza",
      representanteCpf: "123.456.789-00",
      representanteCargo: "Sócio-Administrador",
    };

    const mockUsuarios = [
      {
        id: "usr_1",
        name: "Vítor Henrique",
        email: "vitor@aponta.cloud",
        role: "DIRETORIA",
        ativo: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "usr_2",
        name: "Mariana Souza",
        email: "mariana@aponta.cloud",
        role: "ANALISTA_COMERCIAL",
        ativo: true,
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    const mockLogs = [
      {
        id: "log_1",
        ocorridoEm: "2026-10-25T14:00:00.000Z",
        usuarioNome: "Vítor Henrique",
        acao: "DECIDE_GO_NOGO",
        entidadeTipo: "LICITACAO",
        entidadeId: "lic_100",
        depois: { status: "ACEITA" },
      },
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, empresa: mockEmpresa }),
        });
      }
      if (url.includes("/api/configuracoes/equipe")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, total: mockUsuarios.length, usuarios: mockUsuarios }),
        });
      }
      if (url.includes("/api/audit")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, total: mockLogs.length, logs: mockLogs }),
        });
      }
      console.error("UNKNOWN FETCH URL:", url);
      return Promise.reject(new Error("URL desconhecida: " + url));
    });

    render(<ConfiguracoesPage />);

    // Header principal
    expect(screen.getByText("Configurações Corporativas & Auditoria")).toBeDefined();
    expect(screen.getByText("RBAC & Trilha Imutável")).toBeDefined();

    // Abas Carbon
    expect(screen.getByRole("tab", { name: /Meu Perfil/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Dados da Empresa/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Gestão da Equipe/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Trilha de Auditoria/i })).toBeDefined();

    // Perfil do Usuário
    expect(screen.getByText("Vítor Henrique")).toBeDefined();
    expect(screen.getByText("DIRETORIA (Acesso Total)")).toBeDefined();
    expect(screen.getByRole("button", { name: /Tema Claro/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Tema Escuro/i })).toBeDefined();

    // Troca para Aba 2 (Dados da Empresa)
    const tabEmpresa = screen.getByRole("tab", { name: /Dados da Empresa/i });
    fireEvent.click(tabEmpresa);

    await waitFor(() => {
      expect(screen.getByDisplayValue("APONTA TECNOLOGIA E SERVICOS LTDA")).toBeDefined();
      expect(screen.getByDisplayValue("12.345.678/0001-90")).toBeDefined();
      expect(screen.getByRole("button", { name: /Salvar Alterações/i })).toBeDefined();
    });

    // Troca para Aba 3 (Gestão de Equipe)
    const tabEquipe = screen.getByRole("tab", { name: /Gestão da Equipe/i });
    fireEvent.click(tabEquipe);

    await waitFor(() => {
      expect(screen.getByText(/mariana@aponta.cloud/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /Novo Colaborador/i })).toBeDefined();
    });

    // Troca para Aba 4 (Trilha de Auditoria)
    const tabAuditoria = screen.getByRole("tab", { name: /Trilha de Auditoria/i });
    fireEvent.click(tabAuditoria);

    await waitFor(() => {
      expect(screen.getAllByText("DECIDE_GO_NOGO").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /Exportar Relatório CSV/i })).toBeDefined();
    });
  });
});
