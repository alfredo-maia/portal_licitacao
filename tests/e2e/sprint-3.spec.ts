import { expect, test } from "@playwright/test";

test.describe("Sprint 3 — E2E Dashboard, Calendário & Notificações (AV-54)", () => {
  test("deve exibir o Dashboard com os 4 cards principais clicáveis e SEM mini-calendário", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Validar os 4 cards principais
    await expect(page.getByTestId("kpi-card-recebidas")).toBeVisible();
    await expect(page.getByTestId("kpi-card-pendentes")).toBeVisible();
    await expect(page.getByTestId("kpi-card-precificacao")).toBeVisible();
    await expect(page.getByTestId("kpi-card-recusadas")).toBeVisible();

    // Validar destinos dos links dos cards
    await expect(page.getByTestId("kpi-card-recebidas").locator("..")).toHaveAttribute(
      "href",
      "/oportunidades?periodo=mes",
    );
    await expect(page.getByTestId("kpi-card-pendentes").locator("..")).toHaveAttribute(
      "href",
      "/oportunidades?status=PENDENTE",
    );
    await expect(page.getByTestId("kpi-card-precificacao").locator("..")).toHaveAttribute(
      "href",
      "/minhas-licitacoes",
    );
    await expect(page.getByTestId("kpi-card-recusadas").locator("..")).toHaveAttribute(
      "href",
      "/oportunidades?status=RECUSADA",
    );

    // Painéis de desfecho e indicadores
    await expect(page.getByTestId("painel-desfecho")).toBeVisible();
    await expect(page.getByTestId("indicadores-operacionais")).toBeVisible();
    await expect(page.getByTestId("criticas-72h-panel")).toBeVisible();
    await expect(page.getByTestId("top-tipos-panel")).toBeVisible();

    // Requisito estrito: sem mini-calendário no dashboard
    await expect(page.getByTestId("calendario-grid")).not.toBeVisible();
  });

  test("deve exibir a tela de Calendário com grade mensal e navegação", async ({
    page,
  }) => {
    await page.goto("/calendario");

    await expect(page.getByTestId("calendario-grid")).toBeVisible();
    await expect(page.getByText("Hoje")).toBeVisible();
    await expect(page.getByText("Seg")).toBeVisible();
    await expect(page.getByText("Sex")).toBeVisible();
  });

  test("deve exibir a Central de Notificações com botão de marcar todas", async ({
    page,
  }) => {
    await page.goto("/notificacoes");

    await expect(page.getByTestId("btn-marcar-todas")).toBeVisible();
    await expect(page.getByText(/Todas/i)).toBeVisible();
    await expect(page.getByText(/Não lidas/i)).toBeVisible();
  });
});
