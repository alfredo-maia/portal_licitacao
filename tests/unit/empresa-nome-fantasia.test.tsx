import { describe, expect, it } from "vitest";
import {
  configuracaoEmpresaSchema,
  configuracaoEmpresaAtualizarInputSchema,
} from "@/server/schemas/configuracao.schema";
import {
  obterConfiguracaoEmpresa,
  atualizarConfiguracaoEmpresa,
} from "@/server/services/configuracoes.service";

describe("Tarefa 7 — Campo Nome Fantasia na Aba Dados da Empresa (#26)", () => {
  it("schema deve aceitar nomeFantasia tanto na leitura quanto na atualização", () => {
    const inputAtualizar = configuracaoEmpresaAtualizarInputSchema.parse({
      razaoSocial: "Minha Empresa LTDA",
      nomeFantasia: "Aponta Soluções",
      cnpj: "12345678000190",
    });
    expect(inputAtualizar.nomeFantasia).toBe("Aponta Soluções");

    const schemaCompleto = configuracaoEmpresaSchema.parse({
      id: "cfg_1",
      razaoSocial: "Minha Empresa LTDA",
      nomeFantasia: "Aponta Soluções",
      cnpj: "12345678000190",
    });
    expect(schemaCompleto.nomeFantasia).toBe("Aponta Soluções");
  });

  it("atualizarConfiguracaoEmpresa e obterConfiguracaoEmpresa devem persistir e recuperar o nomeFantasia", async () => {
    await atualizarConfiguracaoEmpresa(
      {
        razaoSocial: "Padaria e Confeitaria Estrela LTDA",
        nomeFantasia: "Panificadora Estrela",
        cnpj: "12345678000195",
        segmentos: ["ALIMENTOS"],
        subsegmentos: [],
        ufs: ["GO"],
        brasilInteiro: false,
      },
      "usr_test",
      "tenant_test_fantasia",
    );

    const config = await obterConfiguracaoEmpresa("tenant_test_fantasia");
    expect(config.nomeFantasia).toBe("Panificadora Estrela");
  });
});
