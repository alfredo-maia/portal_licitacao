import { expect, test } from "@playwright/test";

test.describe("Sprint 6 — E2E Configurações Corporativas, Equipe RBAC & Trilha de Auditoria (AV-85)", () => {
  test("deve acessar a tela de Configurações (/configuracoes) e validar a navegação pelas 4 abas Carbon", async ({
    page,
  }) => {
    await page.goto("/configuracoes");

    // 1. Header do Módulo #11
    await expect(page.getByTestId("module-header-configuracoes")).toBeVisible();
    await expect(
      page.getByTestId("module-header-configuracoes").getByRole("heading", { name: "Configurações" }),
    ).toBeVisible();
    await expect(page.getByText("Módulo #11")).toBeVisible();
    await expect(page.getByText("RBAC & Trilha Imutável")).toBeVisible();

    // 2. Aba 1: Meu Perfil & Tema
    await expect(page.getByRole("tab", { name: /Meu Perfil/i })).toBeVisible();
    await expect(page.getByText("Vítor Henrique")).toBeVisible();
    await expect(page.getByText("DIRETORIA (Acesso Total)")).toBeVisible();
    await expect(page.locator("#btn-tema-claro")).toBeVisible();
    await expect(page.locator("#btn-tema-escuro")).toBeVisible();

    // Alternar tema e validar notificação inline
    await page.locator("#btn-tema-escuro").click();
    await expect(page.getByText(/Tema alterado para Escuro/i)).toBeVisible();

    // 3. Aba 2: Dados da Empresa Licitante
    await page.getByRole("tab", { name: /Dados da Empresa/i }).click();
    await expect(page.getByText("Dados Cadastrais da Empresa Licitante")).toBeVisible();

    const inputRazao = page.locator("#empresa-razao");
    await expect(inputRazao).toBeVisible();
    await expect(page.locator("#empresa-cnpj")).toBeVisible();
    await expect(page.locator("#empresa-rep-nome")).toBeVisible();
    await expect(page.locator("#btn-salvar-empresa")).toBeVisible();

    // Salvar dados da empresa e aguardar confirmação
    await page.locator("#btn-salvar-empresa").click();
    await expect(page.getByText(/Dados societários da empresa atualizados com sucesso/i)).toBeVisible();

    // 4. Aba 3: Gestão da Equipe & RBAC
    await page.getByRole("tab", { name: /Gestão da Equipe/i }).click();
    await expect(page.getByText("Equipe de Colaboradores & Matriz de Papéis (Anexo 4)")).toBeVisible();
    await expect(page.locator("#btn-novo-colaborador")).toBeVisible();

    // Abrir Modal de Novo Colaborador
    await page.locator("#btn-novo-colaborador").click();
    await expect(page.getByText("Cadastrar Novo Colaborador (RBAC)")).toBeVisible();
    await expect(page.locator("#novo-nome")).toBeVisible();
    await expect(page.locator("#novo-email")).toBeVisible();
    await expect(page.locator("#novo-role")).toBeVisible();
    await expect(page.locator("#nova-senha")).toBeVisible();

    // Fechar Modal
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator("#novo-nome")).not.toBeVisible();

    // 5. Aba 4: Trilha de Auditoria Corporativa (audit_log)
    await page.getByRole("tab", { name: /Trilha de Auditoria/i }).click();
    await expect(page.getByText("Trilha Imutável de Auditoria Corporativa")).toBeVisible();
    await expect(page.locator("#busca-audit")).toBeVisible();
    await expect(page.locator("#filtro-entidade-audit")).toBeVisible();
    await expect(page.locator("#filtro-acao-audit")).toBeVisible();
    await expect(page.locator("#btn-exportar-csv")).toBeVisible();
  });
});
