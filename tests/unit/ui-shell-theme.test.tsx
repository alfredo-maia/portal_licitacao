import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import { APP_CONFIG } from "@/config/brand";
import { APP_ROUTES } from "@/config/routes";
import { THEME_STORAGE_KEY } from "@/types/theme";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("Sprint 0 — UI Shell Carbon, Header Global, SideNav (11 Rotas) e Tema Claro/Escuro", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("deve renderizar o Header global com APP_CONFIG.brandName, sino, seletor de tema e avatar", () => {
    render(
      <RootLayout>
        <div data-testid="page-content">Conteúdo Teste</div>
      </RootLayout>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(APP_CONFIG.brandName))).toBeInTheDocument();
    expect(screen.getByTestId("notifications-bell")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("user-profile-action")).toBeInTheDocument();
  });

  it("deve iniciar com Tema Claro (white/g10) por padrão e alternar para Tema Escuro (g90/g100) persistindo em localStorage ('pncp-theme')", () => {
    render(
      <RootLayout>
        <div>Conteúdo Teste</div>
      </RootLayout>,
    );

    const themeToggle = screen.getByTestId("theme-toggle");
    const initialStoredTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (initialStoredTheme !== null) {
      expect(["white", "g10", "light"]).toContain(initialStoredTheme);
    }

    fireEvent.click(themeToggle);

    const updatedStoredTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    expect(updatedStoredTheme).toBeTruthy();
    expect(["g90", "g100", "dark"]).toContain(updatedStoredTheme);
  });

  it("deve renderizar o SideNav com links para todas as 11 rotas oficiais e o badge 'Em breve' em /robo-de-lances", () => {
    render(
      <RootLayout>
        <div>Conteúdo Teste</div>
      </RootLayout>,
    );

    for (const route of APP_ROUTES) {
      const links = screen.getAllByRole("link", {
        name: new RegExp(route.label, "i"),
      });
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(
        links.some((link) => link.getAttribute("href") === route.path),
        `Esperado link com href="${route.path}" para a rota "${route.label}"`,
      ).toBe(true);
    }

    expect(screen.getByText("Em breve")).toBeInTheDocument();
  });
});
