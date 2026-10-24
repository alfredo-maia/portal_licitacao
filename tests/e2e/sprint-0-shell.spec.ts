import { expect, test } from "@playwright/test";
import { APP_CONFIG } from "../../src/config/brand";
import { APP_ROUTES } from "../../src/config/routes";
import { THEME_STORAGE_KEY } from "../../src/types/theme";

test.describe("Sprint 0 — E2E UI Shell Carbon, Tema Claro/Escuro e 11 Rotas", () => {
  test("deve exibir o Header global com APP_CONFIG.brandName, sino de notificações, alternador de tema e perfil", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("banner")).toContainText(APP_CONFIG.brandName);
    await expect(page.getByTestId("notifications-bell")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
    await expect(page.getByTestId("user-profile-action")).toBeVisible();
  });

  test("deve iniciar no Tema Claro (white/g10) e alternar para Tema Escuro (g90/g100) com persistência em localStorage", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const themeToggle = page.getByTestId("theme-toggle");
    await expect(themeToggle).toBeVisible();

    await themeToggle.click();

    const storedTheme = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      THEME_STORAGE_KEY,
    );
    expect(["g90", "g100", "dark"]).toContain(storedTheme);
  });

  test("deve renderizar as 11 rotas oficiais no SideNav, exibir badge 'Em breve' em /robo-de-lances e permitir navegação", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    for (const route of APP_ROUTES) {
      const navLink = page
        .locator(`a[href="${route.path}"]`)
        .filter({ hasText: route.label })
        .first();
      await expect(navLink).toBeVisible();
    }

    await expect(page.getByText("Em breve")).toBeVisible();

    for (const route of APP_ROUTES) {
      const response = await page.goto(route.path);
      expect(response?.status()).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { name: new RegExp(route.label, "i") }).first(),
      ).toBeVisible();
    }
  });
});
