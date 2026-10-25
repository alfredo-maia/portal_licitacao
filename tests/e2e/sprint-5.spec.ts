import { expect, test } from "@playwright/test";

test.describe("Sprint 5 — E2E Declarações Oficiais A4 & Gestão de Impugnações (AV-74)", () => {
  test("deve exibir a tela de Declarações (/declaracoes), validar os 8 modelos oficiais e split-screen A4", async ({
    page,
  }) => {
    await page.goto("/declaracoes");

    // Header do módulo de Declarações (Módulo #7)
    await expect(page.getByTestId("module-header-declaracoes")).toBeVisible();
    await expect(
      page.getByTestId("module-header-declaracoes").getByRole("heading", { name: "Declarações" }),
    ).toBeVisible();
    await expect(page.getByText("Módulo #7")).toBeVisible();

    // Título de escopo da Sprint 5 e Anexo 5
    await expect(
      page.getByText("Gerador dos 8 Modelos Oficiais de Declaração"),
    ).toBeVisible();
    await expect(
      page.locator(".cds--tag").filter({ hasText: "Anexo 5" }).first(),
    ).toBeVisible();

    // Split-Screen: Coluna Esquerda (Formulário)
    await expect(page.locator("#select-tipo-declaracao")).toBeVisible();
    await expect(page.locator("#input-numero-edital")).toBeVisible();
    await expect(page.locator("#input-orgao-nome")).toBeVisible();
    await expect(page.locator("#input-empresa-razao")).toBeVisible();
    await expect(page.locator("#input-representante-nome")).toBeVisible();

    // Split-Screen: Coluna Direita (Folha A4 Física)
    const folhaA4 = page.locator("#a4-folha-oficial");
    await expect(folhaA4).toBeVisible();

    // Botões de Ação Rápida
    await expect(page.locator("#btn-imprimir-a4")).toBeVisible();
    await expect(page.locator("#btn-copiar-declaracao")).toBeVisible();
    await expect(page.locator("#btn-baixar-txt")).toBeVisible();

    // Altera o modelo de declaração no Select
    await page.locator("#select-tipo-declaracao").selectOption("NAO_EMPREGA_MENOR");
    await expect(page.getByText("Fundamento Legal:")).toBeVisible();
    await expect(page.getByText("Art. 7º, XXXIII da CF/88 e Art. 68, VI da Lei nº 14.133/2021")).toBeVisible();
  });

  test("deve exibir o módulo de Impugnações (/impugnacoes), KPIs de risco e modal com jurisprudência TCU", async ({
    page,
  }) => {
    await page.goto("/impugnacoes");

    // Header do módulo de Impugnações (Módulo #8)
    await expect(page.getByTestId("module-header-impugnacoes")).toBeVisible();
    await expect(
      page.getByTestId("module-header-impugnacoes").getByRole("heading", { name: "Impugnações" }),
    ).toBeVisible();
    await expect(page.getByText("Módulo #8")).toBeVisible();

    // Badge legal Art. 164
    await expect(page.getByText("Art. 164 — 3 Dias Úteis")).toBeVisible();

    // KPI Metric Cards
    await expect(page.getByText("Total de Processos")).toBeVisible();
    await expect(page.getByText("Rascunhos em Análise")).toBeVisible();
    await expect(page.getByText("Prazos Críticos (≤ 48h)")).toBeVisible();
    await expect(page.getByText("Protocoladas / Acatadas")).toBeVisible();

    // Filtros e busca
    await expect(page.locator("#input-busca-impugnacao")).toBeVisible();
    await expect(page.locator("#select-status-filtro")).toBeVisible();
    await expect(page.locator("#btn-filtro-criticas")).toBeVisible();

    // Botão + Nova Impugnação
    const btnNova = page.locator("#btn-nova-impugnacao");
    await expect(btnNova).toBeVisible();
    await btnNova.click();

    // Modal de Nova Impugnação
    await expect(
      page.getByText("Nova Impugnação ou Pedido de Esclarecimento (Art. 164 Lei 14.133)"),
    ).toBeVisible();

    // Jurisprudência rápida do TCU
    await expect(page.getByText("Modelos Rápidos de Jurisprudência do TCU:")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Súmula 273\/TCU/i }),
    ).toBeVisible();

    // Fecha o modal
    await page.getByRole("button", { name: "Cancelar" }).click();
  });
});
