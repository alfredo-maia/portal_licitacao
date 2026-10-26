import { describe, it, expect } from "vitest";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";

describe("sintetizarMiniResumo", () => {
  it("remove colchetes de portais e bordões burocráticos gerando síntese de 3 a 5 palavras", () => {
    const input =
      "[Portal de Compras Públicas] - Contratação de empresa especializada para prestação de serviços de implantação de software de gestão escolar integrado";
    const resultado = sintetizarMiniResumo(input, "EDUCACAO_PORTAL");
    expect(resultado).not.toContain("[Portal de Compras Públicas]");
    expect(resultado).not.toContain("Contratação de empresa especializada");
    const palavras = resultado.split(" ");
    expect(palavras.length).toBeGreaterThanOrEqual(3);
    expect(palavras.length).toBeLessThanOrEqual(5);
    expect(resultado).toBe("Software de Gestão Escolar Integrado");
  });

  it("elimina cortes abruptos de palavras no meio", () => {
    const input =
      "MUNICIPIO DE VICTOR GRAEFF — [Portal de Compras Públicas] - Contratação de empresa especializada em desenvolvimento de sistemas";
    const resultado = sintetizarMiniResumo(input, "OUTROS");
    expect(resultado).not.toContain("especi");
    expect(resultado).not.toContain("[Portal de Compras Públicas]");
    const palavras = resultado.split(" ");
    expect(palavras.length).toBeGreaterThanOrEqual(3);
    expect(palavras.length).toBeLessThanOrEqual(5);
  });

  it("trata objetos de licença de software e registro de preços", () => {
    const input =
      "Registro de preços para eventual aquisição de licenças de software Microsoft 365 e antivírus";
    const resultado = sintetizarMiniResumo(input, "LICENCA_SOFTWARE");
    expect(resultado).toBe("Licenças de Software Microsoft 365");
  });

  it("trata objetos vazios ou nulos provendo fallback adequado", () => {
    expect(sintetizarMiniResumo(null, "SAUDE_ATENCAO_BASICA")).toBe(
      "Sistema de saude atencao basica"
    );
    expect(sintetizarMiniResumo(undefined, null)).toBe("Licitação de Tecnologia");
  });
});
