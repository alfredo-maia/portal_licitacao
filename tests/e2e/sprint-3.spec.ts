import { expect, test } from "@playwright/test";

test.describe("Sprint 3 — E2E Dashboard, Calendário & Notificações (AV-54)", () => {
  test("deve exibir o Dashboard com os 4 cards principais clicáveis e SEM mini-calendário", async ({
    page,
  }) => {
    // Mock da API para isolar autenticação e dados no teste E2E de interface
    await page.route(
      (url) => url.pathname === "/api/dashboard",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            periodo: {
              mes: 10,
              ano: 2026,
              inicioUtc: "2026-10-01T03:00:00.000Z",
              fimUtc: "2026-11-01T02:59:59.999Z",
            },
            cards: {
              recebidas: { total: 10 },
              aguardandoDecisao: { total: 5, recebidasNoMes: 3 },
              emPrecificacao: { total: 2 },
              recusadas: { total: 1 },
            },
            resultados: {
              contempladas: { total: 1, valorTotal: 100000 },
              perdidasPreco: { total: 0 },
              perdidasDocumentacao: { total: 0 },
              desistencias: { total: 0 },
              impugnadas: { total: 0 },
              taxaConversaoPercentual: 100,
            },
            indicadores: {
              volumeEmDisputa: 500000,
              viabilidadeIA: { totalAnalisadas: 5, goPercentual: 80, noGoPercentual: 20 },
              criticas72h: [],
            },
            topTipos: [],
          }),
        });
      },
    );

    await page.goto("/dashboard");

    // Validar os 4 cards principais
    await expect(page.getByTestId("kpi-card-recebidas")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("kpi-card-pendentes")).toBeVisible();
    await expect(page.getByTestId("kpi-card-precificacao")).toBeVisible();
    await expect(page.getByTestId("kpi-card-recusadas")).toBeVisible();

    // Validar destinos dos links dos cards
    await expect(page.getByTestId("kpi-card-recebidas")).toHaveAttribute(
      "href",
      "/oportunidades?periodo=mes",
    );
    await expect(page.getByTestId("kpi-card-pendentes")).toHaveAttribute(
      "href",
      "/oportunidades?status=PENDENTE",
    );
    await expect(page.getByTestId("kpi-card-precificacao")).toHaveAttribute(
      "href",
      "/minhas-licitacoes",
    );
    await expect(page.getByTestId("kpi-card-recusadas")).toHaveAttribute(
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

    const grid = page.getByTestId("calendario-grid");
    await expect(grid).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Hoje")).toBeVisible();
    await expect(grid.getByText("Seg", { exact: true })).toBeVisible();
    await expect(grid.getByText("Sex", { exact: true })).toBeVisible();
  });

  test("deve exibir a Central de Notificações com botão de marcar todas", async ({
    page,
  }) => {
    await page.goto("/notificacoes");

    await expect(page.getByTestId("btn-marcar-todas")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("tab", { name: /Todas/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Não lidas/i })).toBeVisible();
  });
});
