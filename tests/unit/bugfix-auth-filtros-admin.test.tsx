import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/shell/app-shell";
import ConfiguracoesPage from "@/app/configuracoes/page";
import OportunidadesPage from "@/app/oportunidades/page";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import * as nextAuthReact from "next-auth/react";
import * as nextAuthJwt from "next-auth/jwt";

// Mocks de navegação e Next.js
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/providers/theme-provider", () => ({
  useAppTheme: () => ({
    isDark: false,
    toggleTheme: vi.fn(),
  }),
}));

describe("Bugfix Hotfix — Multi-Tenant Auth, Filtros de Oportunidades e Acesso /admin (#16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  describe("1. Logout Global no AppShell e Perfil", () => {
    it("deve renderizar botão de logout no cabeçalho do AppShell e chamar signOut", () => {
      render(
        <AppShell>
          <div>Conteúdo Principal</div>
        </AppShell>,
      );

      const logoutBtn = screen.getByTestId("header-logout-btn");
      expect(logoutBtn).toBeDefined();
      expect(logoutBtn.getAttribute("aria-label")).toContain("Sair da Conta");

      fireEvent.click(logoutBtn);
      expect(nextAuthReact.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });

    it("deve renderizar dados dinâmicos da sessão do usuário e botão de logout em /configuracoes", async () => {
      // Mock do fetch da sessão
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/auth/session") {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                user: {
                  id: "usr_padaria",
                  name: "Carlos Panificador",
                  email: "opaonossopanificadora@gmail.com",
                  role: "DIRETORIA",
                  activeTenantId: "tnt_padaria",
                },
              }),
          });
        }
        if (url === "/api/configuracoes/empresa") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ok: true,
                empresa: {
                  id: "cfg_padaria",
                  razaoSocial: "O PAO NOSSO PANIFICADORA LTDA",
                  cnpj: "44.555.666/0001-77",
                  representanteNome: "Carlos Panificador",
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        });
      }) as any;

      render(<ConfiguracoesPage />);

      // Aguarda carregar dados dinâmicos da sessão
      await waitFor(() => {
        expect(screen.getByText("Carlos Panificador")).toBeDefined();
        expect(screen.getByText("opaonossopanificadora@gmail.com")).toBeDefined();
      });

      // Botão de logout no perfil
      const logoutPerfilBtn = screen.getByTestId("btn-logout-perfil");
      expect(logoutPerfilBtn).toBeDefined();
      fireEvent.click(logoutPerfilBtn);
      expect(nextAuthReact.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });
  });

  describe("2. Filtros Atômicos em /oportunidades", () => {
    it("deve atualizar segmento e limpar subsegmento em uma única navegação atômica", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/tenant/preferencias")) {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                segmentos: ["ALIMENTOS_MERENDA_ESCOLAR", "SAUDE_MEDICAMENTOS_HOSPITALAR"],
                subsegmentos: [],
                ufs: ["GO"],
              }),
          });
        }
        if (url.includes("/api/oportunidades")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                oportunidades: [],
                total: 0,
                page: 1,
                pageSize: 10,
                totalPages: 1,
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }) as any;

      render(<OportunidadesPage />);

      // Abre dropdown de segmento
      const segmentoDropdown = screen.getByTestId("filter-segmento");
      expect(segmentoDropdown).toBeDefined();

      const combobox = segmentoDropdown.querySelector("button") || segmentoDropdown;
      fireEvent.click(combobox);

      const opcaoAlimentacao = await screen.findByText(/Alimentos & Merenda/i);
      fireEvent.click(opcaoAlimentacao);

      expect(mockPush).toHaveBeenCalled();
      const lastCall = mockPush.mock.calls[mockPush.mock.calls.length - 1][0];
      expect(lastCall).toContain("segmento=ALIMENTOS_MERENDA_ESCOLAR");
      expect(lastCall).not.toContain("segmento=&");
    });
  });

  describe("3. Middleware com Cookies Seguros em Proxy Reverso Caddy (/admin)", () => {
    it("deve aceitar __Secure-next-auth.session-token e liberar acesso para superadmin", async () => {
      vi.spyOn(nextAuthJwt, "getToken").mockImplementation(async ({ secureCookie }) => {
        if (secureCookie) {
          return {
            email: "vitorhenrique018@gmail.com",
            role: "SUPERADMIN",
          } as any;
        }
        return null;
      });

      const req = new NextRequest("http://localhost:3011/admin", {
        headers: {
          host: "staging.aponta.cloud",
          "x-forwarded-proto": "https",
          cookie: "__Secure-next-auth.session-token=mock-valid-token",
        },
      });

      const response = await middleware(req);
      // Não deve reescrever para /404 quando o token for de superadmin (NextResponse.next() não tem header de rewrite)
      const rewriteHeader = response?.headers.get("x-middleware-rewrite");
      expect(rewriteHeader).toBeNull();
    });

    it("deve reescrever para /404 quando não for superadmin mesmo com token", async () => {
      vi.spyOn(nextAuthJwt, "getToken").mockImplementation(async () => {
        return {
          email: "opaonossopanificadora@gmail.com",
          role: "DIRETORIA",
        } as any;
      });

      const req = new NextRequest("http://localhost:3011/admin", {
        headers: {
          cookie: "next-auth.session-token=cliente-normal",
        },
      });

      const response = await middleware(req);
      const rewriteHeader = response?.headers.get("x-middleware-rewrite");
      expect(rewriteHeader).toContain("/404");
    });
  });
});
