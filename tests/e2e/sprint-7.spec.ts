import { expect, test } from "@playwright/test";

test.describe("Sprint 7 — E2E Validações Globais, UI/UX, Portais, Documentação e Governança", () => {
  test("1. Redirecionamento da raiz / para /dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("2. Dashboard sem frase redundante (Item 1.1)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(
      page.getByText(/Painel executivo de indicadores, taxa de conversão e inteligência de mercado sob a Lei nº 14.133\/2021/i),
    ).toHaveCount(0);
  });

  test("3. Central de Oportunidades: Botão Buscar, Participar/Não Participar e sem coluna Resumo (Itens 2.2 a 2.9)", async ({
    page,
  }) => {
    await page.goto("/oportunidades");
    await expect(page.getByRole("heading", { name: "Oportunidades" })).toBeVisible();

    // Botão de Busca por palavra-chave (Item 2.7)
    await expect(page.getByRole("button", { name: "Buscar" })).toBeVisible();

    // Dropdown de 6 Faixas de Valor (Item 2.9)
    await expect(page.locator("#filter-faixa-valor")).toBeVisible();

    // Não deve exibir "GO / No-GO" (Termo substituído por Participar / Não Participar)
    await expect(page.getByText("Decisão GO / No-GO")).toHaveCount(0);
    await expect(page.getByText("Decisão de Participação")).toBeVisible();
  });

  test("4. Funil Kanban: Abrir Projeto e sem frase Trello (Itens 3.1 a 3.4)", async ({ page }) => {
    await page.goto("/minhas-licitacoes");
    await expect(page.getByTestId("module-header-minhas-licitacoes")).toBeVisible();

    // Não deve conter a frase do Trello
    await expect(page.getByText(/no estilo Trello/i)).toHaveCount(0);
    await expect(page.getByTestId("kanban-board-container")).toBeVisible({ timeout: 15000 });
  });

  test("5. Portais: Sem '(sem senhas salvas)' (Item 4.1)", async ({ page }) => {
    await page.goto("/portais");
    await expect(page.getByRole("heading", { name: "Portais de Licitações" })).toBeVisible();
    await expect(page.getByText(/\(sem senhas salvas\)/i)).toHaveCount(0);
  });

  test("6. Documentação: Subtítulo limpo e botão Buscar (Itens 5.1 e 5.2)", async ({ page }) => {
    await page.goto("/documentacao");
    await expect(page.getByRole("heading", { name: "Documentação" })).toBeVisible();
    await expect(page.getByText(/com controle de vencimento estrito/i)).toHaveCount(0);

    // Botão Buscar
    await expect(page.getByRole("button", { name: "Buscar" })).toBeVisible();

    // Modal novo documento com seletor de arquivo
    await page.getByTestId("btn-novo-documento").click();
    await expect(page.getByTestId("modal-novo-documento").getByText("Selecionar arquivo")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("7. Declarações: Subtítulo 'Gerador de modelos oficiais.' (Item 6.1)", async ({ page }) => {
    await page.goto("/declaracoes");
    await expect(page.getByRole("heading", { name: "Declarações" })).toBeVisible();
    await expect(page.getByText("Gerador de modelos oficiais.")).toBeVisible();
  });
});
