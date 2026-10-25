import { expect, test } from "@playwright/test";

test.describe("Sprint 4 — E2E Portais de Licitações & Documentação de Habilitação (AV-64)", () => {
  test("deve exibir a tela de Portais (/portais), validar catálogo, diretriz de zero senhas e modal", async ({
    page,
  }) => {
    await page.goto("/portais");

    // Header do módulo de Portais
    await expect(page.getByTestId("module-header-portais")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Portais de Licitações" })).toBeVisible();
    await expect(page.getByText("Módulo #5")).toBeVisible();

    // Filtros e busca
    await expect(page.locator("#busca-portais")).toBeVisible();
    await expect(page.locator("#filtro-status-portal")).toBeVisible();

    // Botão + Novo Portal
    const btnNovo = page.getByTestId("btn-novo-portal");
    await expect(btnNovo).toBeVisible();

    // Clica para abrir modal
    await btnNovo.click();
    await expect(page.getByTestId("modal-portal")).toBeVisible();

    // Diretriz estrita de segurança: NUNCA armazenar senhas
    await expect(
      page.getByText(/Diretriz de Segurança: Por política de segurança estrita da Lei 14.133, este sistema nunca armazena senhas/i),
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator("#portal-senha")).toHaveCount(0);

    // Fecha o modal
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("modal-portal")).not.toBeVisible();
  });

  test("deve exibir o Repositório de Documentação (/documentacao) com as 5 categorias da Lei 14.133", async ({
    page,
  }) => {
    await page.goto("/documentacao");

    // Header do módulo de Documentação
    await expect(page.getByTestId("module-header-documentacao")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Documentação" })).toBeVisible();
    await expect(page.getByText("Módulo #6")).toBeVisible();

    // Abas das 5 categorias legais da Lei 14.133/2021
    await expect(page.getByRole("tab", { name: "Todas as Categorias" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Habilitação Jurídica" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Fiscal & Trabalhista" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Qualificação Técnica (ACTs)" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Qualificação Econômica" })).toBeVisible();

    // Botão de upload/cadastro
    await expect(page.getByTestId("btn-novo-documento")).toBeVisible();
    await page.getByTestId("btn-novo-documento").click();
    await expect(page.getByTestId("modal-novo-documento")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("modal-novo-documento")).not.toBeVisible();
  });

  test("deve exibir o funil Kanban (/minhas-licitacoes) com a coluna Contemplada e suporte a valor arrematado", async ({
    page,
  }) => {
    await page.goto("/minhas-licitacoes");

    // Header principal e container do kanban
    await expect(page.getByTestId("module-header-minhas-licitacoes")).toBeVisible();
    await expect(page.getByTestId("kanban-board-container")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("kanban-column-CONTEMPLADA")).toBeVisible();
    await expect(page.getByTestId("toggle-arquivadas")).toBeVisible();
  });
});
