import { describe, it, expect } from "vitest";
import { LICITACOES_MINERADAS_PNCP } from "@/config/licitacoes-pncp-coleta";
import { buildLicitacoesSeed } from "@/config/licitacoes-seed";
import { TIPOS_SISTEMA_CATALOG } from "@/config/tipos-sistema";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";

describe("Carga e Qualificação das 17 Licitações Mineradas no PNCP (Paperclip 03/11/2026)", () => {
  it("deve conter exatamente 17 certames minerados e qualificados para software/SaaS", () => {
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

  it("todos os certames devem estar classificados no segmento macro TECNOLOGIA_TELECOM", () => {
    for (const lic of LICITACOES_MINERADAS_PNCP) {
      expect(lic.segmentoMacro).toBe("TECNOLOGIA_TELECOM");
      expect(lic.subcategorias).toContain("SOFTWARE_SAAS");
    }
  });

  it("todos os tipos de sistema sugeridos devem pertencer ao catálogo oficial dos 22 tipos", () => {
    const codigosValidos = new Set<string>(TIPOS_SISTEMA_CATALOG.map((t) => t.codigo));
    for (const lic of LICITACOES_MINERADAS_PNCP) {
      expect(codigosValidos.has(lic.tipoSistemaCodigo)).toBe(true);
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
