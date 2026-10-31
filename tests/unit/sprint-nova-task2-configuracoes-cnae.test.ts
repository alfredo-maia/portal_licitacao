import { describe, expect, it } from "vitest";
import { configuracaoEmpresaAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import { CATALOGO_CNAE, buscarCnaes } from "@/config/cnae-catalogo";
import { atualizarConfiguracaoEmpresa, obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";

describe("Sprint Nova Task 2 — Persistência de Configurações e Catálogo CNAE", () => {
  it("deve permitir validação e salvamento parcial de campos da empresa sem exigir todos os dados secundários", () => {
    const inputParcial = {
      razaoSocial: "NOVA EMPRESA ALIMENTOS LTDA",
      cnpj: "12.345.678/0001-90",
      segmentos: ["ALIMENTACAO_BEBIDAS"],
      ufs: ["GO", "DF"],
      endereco: "Av Brasil 100",
      cidade: "Goiânia",
      uf: "GO",
    };

    const parsed = configuracaoEmpresaAtualizarInputSchema.safeParse(inputParcial);
    expect(parsed.success).toBe(true);
  });

  it("deve fornecer catálogo de CNAEs oficiais do IBGE com busca por código e texto", () => {
    expect(CATALOGO_CNAE.length).toBeGreaterThan(50);
    const resultadosAlimento = buscarCnaes("alimentação");
    expect(resultadosAlimento.length).toBeGreaterThan(0);
    expect(resultadosAlimento[0]).toHaveProperty("codigo");
    expect(resultadosAlimento[0]).toHaveProperty("descricao");
  });

  it("deve persistir e recuperar configurações associadas ao tenantId específico", async () => {
    const tenantIdTeste = "tenant_teste_persist_1";
    await atualizarConfiguracaoEmpresa(
      {
        razaoSocial: "EMPRESA TESTE MULTI-CNPJ",
        cnpj: "11.222.333/0001-44",
        cnae: "4711-3/02",
        endereco: "Rua T-63, 500",
        cidade: "Goiânia",
        uf: "GO",
        segmentos: ["ALIMENTACAO_BEBIDAS"],
        subsegmentos: [],
        ufs: ["GO"],
        brasilInteiro: false,
      },
      "user_123",
      tenantIdTeste,
    );

    const config = await obterConfiguracaoEmpresa(tenantIdTeste);
    expect(config.razaoSocial).toBe("EMPRESA TESTE MULTI-CNPJ");
    expect(config.segmentos).toContain("ALIMENTACAO_BEBIDAS");
    expect(config.cnae).toBe("4711-3/02");
  });
});
