import { describe, it, expect } from "vitest";
import { classificarLicitacaoPorTexto } from "@/server/services/classificador-segmentos.service";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";
import {
  oportunidadesFilterSchema,
  criarLicitacaoManualSchema,
} from "@/server/schemas/oportunidades.schema";

describe("Sprint New — Task 4: Classificador de Segmentos, Resumo, Multi-UF e Cadastro Manual", () => {
  it("deve classificar corretamente licitações de Óleos e Lubrificantes em COMBUSTIVEIS e não em INFORMATICA", () => {
    const res = classificarLicitacaoPorTexto(
      "Registro de preços para aquisição de óleos e lubrificantes destinados à frota municipal",
    );
    expect(res.macro).toBe("COMBUSTIVEIS");
    expect(res.subcategorias).toContain("2001");
  });

  it("deve classificar corretamente licitações de materiais ambulatoriais em SAUDE", () => {
    const res = classificarLicitacaoPorTexto(
      "Aquisição de insumos e materiais ambulatoriais para unidades básicas de saúde",
    );
    expect(res.macro).toBe("SAUDE");
  });

  it("deve classificar corretamente serviços de britagem e obras em ENGENHARIA_SERVICOS", () => {
    const res = classificarLicitacaoPorTexto(
      "Contratação de empresa especializada em serviços de britagem de pedra e recuperação de estradas vicinais",
    );
    expect(res.macro).toBe("ENGENHARIA_SERVICOS");
  });

  it("sintetizarMiniResumo não deve transformar aquisição de óleo/combustível para frota em Sistema informatizado de TI", () => {
    const resumo = sintetizarMiniResumo(
      "Registro de preços para aquisição de óleos e lubrificantes para manutenção da frota municipal",
    );
    expect(resumo).not.toContain("Sistema informatizado");
    expect(resumo).not.toContain("Tecnologia da Informação");
  });

  it("oportunidadesFilterSchema deve aceitar múltiplas UFs separadas por vírgula (ex: GO,DF,MT)", () => {
    const parsed = oportunidadesFilterSchema.parse({
      uf: "go,df,mt",
    });
    expect(parsed.uf).toBe("GO,DF,MT");
  });

  it("criarLicitacaoManualSchema não deve exigir tipoSistemaCodigo e deve aceitar segmentoMacro e subsegmento", () => {
    const parsed = criarLicitacaoManualSchema.parse({
      numeroEdital: "010/2026",
      orgaoNome: "Prefeitura Municipal de Goiânia",
      orgaoCnpj: "01.612.092/0001-23",
      uf: "GO",
      valorEstimado: 150000,
      dataAbertura: "2026-11-15T09:00:00.000Z",
      miniResumo: "Aquisição de óleos lubrificantes",
      resumo: "Aquisição de óleos e lubrificantes automotivos para frota",
      segmentoMacro: "TRANSPORTES_RODOVIARIOS",
      subsegmento: "2001",
    });
    expect(parsed.tipoSistemaCodigo).toBe("OUTROS");
    expect(parsed.segmentoMacro).toBe("TRANSPORTES_RODOVIARIOS");
    expect(parsed.subsegmento).toBe("2001");
  });
});

