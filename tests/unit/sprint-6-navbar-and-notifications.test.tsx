import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/shell/app-shell";
import { ModulePageShell } from "@/components/shell/module-page-shell";

// Mocks
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "Vítor Henrique",
        email: "vitorhenrique018@gmail.com",
        role: "SUPERADMIN",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    ok: true,
    naoLidas: 2,
    recentes: [
      {
        id: "notif_1",
        tipo: "N1_COLETA_CONCLUIDA",
        titulo: "Nova Licitação Encontrada",
        descricao: "Pregão Eletrônico nº 12/2026",
        severidade: "INFO",
        linkDestino: "/oportunidades",
        criadaEm: new Date().toISOString(),
        lida: false,
        lidaEm: null,
      },
    ],
  }),
});

describe("Sprint 6 - Task 4: NavBar e Cabeçalho Global", () => {
  it("não deve renderizar o botão 'X' de fechar a barra lateral (#btn-close-navbar-right)", () => {
    const { container } = render(
      <AppShell>
        <div>Conteúdo</div>
      </AppShell>,
    );

    const btnClose = container.querySelector("#btn-close-navbar-right");
    expect(btnClose).toBeNull();
  });

  it("não deve renderizar a tag de versão 'Portal PNCP · v1.0.0' no ModulePageShell", () => {
    render(
      <ModulePageShell routePath="/dashboard">
        <div>Conteúdo da página</div>
      </ModulePageShell>,
    );

    // Não deve conter a tag estática com versão "Portal PNCP · v..."
    expect(screen.queryByText(/· v\d+\.\d+\.\d+/i)).toBeNull();
  });
});

