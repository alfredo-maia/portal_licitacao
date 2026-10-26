import { describe, it, expect } from "vitest";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";

describe("sintetizarMiniResumo", () => {
  it("gera mini-resumos com o tipo claro do produto/serviço", () => {
    const input1 =
      "Contratação de Solução de Tecnologia da Informação e Comunicação de Gerenciamento Unificado de Ativos (Endpoints Management)";
    expect(sintetizarMiniResumo(input1)).toBe(
      "Gerenciamento unificado de ativos (endpoints) de TI"
    );

    const input2 =
      "[Portal de Compras Públicas] - CONTRATAÇÃO DE EMPRESA PARA PRESTAÇÃO DE SERVIÇOS DE LOCAÇÃO DE SISTEMAS DE GESTÃO PÚBLICA PARA UTILIZAÇÃO NA PREFEITURA MUNICIPAL DE CACIMBA DE DENTRO/PB E SUAS SECRETARIAS";
    expect(sintetizarMiniResumo(input2)).toBe(
      "Locação de sistema de gestão pública para prefeitura e secretarias"
    );

    const input3 =
      "CONTRATACAO PARA IMPLANTACAO E LICENCIAMENTO DE SOLUCAO TECNOLOGICA DE GESTAO DA ASSISTENCIA SOCIAL SAAS PLATAFORMA DE INTELIGENCIA E ACOMPANHAMENTO PERMANENTE DA GESTAO DO SISTEMA UNICO DE ASSISTENCIA SOCIAL SUAS";
    expect(sintetizarMiniResumo(input3)).toBe(
      "SaaS de gestão da assistência social (SUAS)"
    );

    const input4 =
      "Registro de preços para eventual fornecimento de subscrição de software de virtualização VMware Cloud Foundation";
    expect(sintetizarMiniResumo(input4)).toBe(
      "Licenciamento de software de virtualização de servidores (VMware)"
    );
  });

  it("elimina colchetes e cortes abruptos de palavras", () => {
    const input =
      "MUNICIPIO DE VICTOR GRAEFF — [Portal de Compras Públicas] - Contratação de empresa especializada em desenvolvimento de software e sustentação sob medida";
    const resultado = sintetizarMiniResumo(input);
    expect(resultado).not.toContain("[Portal de Compras Públicas]");
    expect(resultado).not.toContain("especi");
    expect(resultado).toBe("Fábrica de software, sustentação e desenvolvimento sob medida");
  });

  it("trata objetos vazios ou nulos provendo fallback adequado", () => {
    expect(sintetizarMiniResumo(null, "SAUDE_ATENCAO_BASICA")).toBe(
      "Sistema de saude atencao basica"
    );
    expect(sintetizarMiniResumo(undefined, null)).toBe("Licitação de Tecnologia");
  });
});
