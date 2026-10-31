import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
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

describe("Sprint UX — Prevenção de FOUC/Clarão e Scroll Elástico Branco no Dark Mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-carbon-theme");
  });

  it("deve conter script inline anti-FOUC no layout para aplicar tema antes da hidratação", () => {
    const { container } = render(
      <RootLayout>
        <div>Conteúdo Teste</div>
      </RootLayout>,
    );

    const script = container.querySelector("script#theme-init-script");
    expect(script).not.toBeNull();
    expect(script?.textContent).toContain(THEME_STORAGE_KEY);
    expect(script?.textContent).toContain("data-carbon-theme");
  });

  it("deve definir meta tags de theme-color e color-scheme para navegadores móveis e desktop", () => {
    const { container } = render(
      <RootLayout>
        <div>Conteúdo Teste</div>
      </RootLayout>,
    );

    const colorSchemeMeta = container.querySelector('meta[name="color-scheme"]');
    expect(colorSchemeMeta).not.toBeNull();
    expect(colorSchemeMeta?.getAttribute("content")).toBe("light dark");

    const themeColorMeta = container.querySelector('meta[name="theme-color"]');
    expect(themeColorMeta).not.toBeNull();
  });
});
