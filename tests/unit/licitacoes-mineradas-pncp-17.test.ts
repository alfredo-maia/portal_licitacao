import { describe, it, expect } from "vitest";
import { LICITACOES_MINERADAS_PNCP } from "@/config/licitacoes-pncp-coleta";
import { CATALOGO_MACRO_SEGMENTOS, type MacroSegmento } from "@/server/schemas/segmentos.schema";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";

describe("Carga e Qualificação das 17 Licitações Mineradas no PNCP (Taxonomia Multi-Segmento)", () => {
  it("deve conter exatamente 17 certames minerados e qualificados", () => {
    expect(LICITACOES_MINERADAS_PNCP).toHaveLength(17);
  });

  it("todos os 17 certames devem ter link oficial governamental do PNCP válido", () => {
    for (const lic of LICITACOES_MINERADAS_PNCP) {
      expect(lic.linkPncp).toMatch(/^https:\/\/pncp\.gov\.br\/app\/editais\/\d+\/\d+\/\d+$/);
      expect(lic.idPncp).toBeTruthy();
      expect(lic.orgaoNome).toBeTruthy();
      expect(lic.orgaoCnpj).toBeTruthy();
      expect(lic.uf).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("todos os certames devem estar classificados em Macro-Segmentos e Subcategorias oficiais do CATALOGO_MACRO_SEGMENTOS", () => {
    const macrosValidos = new Set(Object.keys(CATALOGO_MACRO_SEGMENTOS));

    for (const lic of LICITACOES_MINERADAS_PNCP) {
      expect(macrosValidos.has(lic.segmentoMacro)).toBe(true);

      const macroDef = CATALOGO_MACRO_SEGMENTOS[lic.segmentoMacro as MacroSegmento];
      expect(macroDef).toBeDefined();

      for (const sub of lic.subcategorias) {
        expect(typeof sub).toBe("string");
        expect(sub.length).toBeGreaterThan(0);
      }
    }
  });

  it("todos os certames devem possuir parecer de IA (GO, AVALIAR ou NO_GO) e justificativa analítica", () => {
    const pareceresPermitidos = new Set(["GO", "AVALIAR", "NO_GO"]);
    for (const lic of LICITACOES_MINERADAS_PNCP) {
      expect(pareceresPermitidos.has(lic.parecerIA)).toBe(true);
      expect(lic.justificativaIA).toBeTruthy();
      expect(lic.justificativaIA.length).toBeGreaterThan(20);
    }
  });

  it("deve disponibilizar as 17 licitações na listagem de oportunidades do portal", async () => {
    resetInMemoryLicitacoes();
    const oportunidades = await listOportunidades();
    const idsMinerados = new Set(LICITACOES_MINERADAS_PNCP.map((l) => l.idPncp));

    const encontradas = oportunidades.filter((op) => idsMinerados.has(op.idPncp));
    expect(encontradas.length).toBe(17);
  });
});
