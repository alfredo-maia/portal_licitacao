import { describe, expect, it } from "vitest";
import {
  oportunidadesFilterSchema,
  oportunidadesSortBySchema,
  sortDirSchema,
  REABERTA_POS_RECUSA_TAG,
} from "@/server/schemas/oportunidades.schema";
import { dashboardQuerySchema } from "@/server/schemas/dashboard.schema";
import { ingestaoPayloadV2Schema } from "@/server/schemas/ingestao.schema";
import {
  historicoLicitacoesQuerySchema,
  MAX_HISTORICO_DIAS_JANELA,
} from "@/server/schemas/historico-licitacoes.schema";

describe("Issue #59 — Contratos Zod (Oportunidades, Histórico, Dashboard e Ingestão)", () => {
  describe("oportunidadesFilterSchema e ordenação SQL", () => {
    it("aceita sortBy, sortDir, ufsTenantAtivo e pageSize 10/25/50/100", () => {
      const parsed = oportunidadesFilterSchema.parse({
        sortBy: "valorEstimado",
        sortDir: "desc",
        ufsTenantAtivo: ["go", "df"],
        pageSize: 100,
        busca: "merenda",
      });

      expect(parsed.sortBy).toBe("valorEstimado");
      expect(parsed.sortDir).toBe("desc");
      expect(parsed.ufsTenantAtivo).toEqual(["GO", "DF"]);
      expect(parsed.pageSize).toBe(100);
      expect(parsed.busca).toBe("merenda");
      expect(REABERTA_POS_RECUSA_TAG).toBe("REABERTA_POS_RECUSA");
      expect(oportunidadesSortBySchema.options).toEqual([
        "dataLimite",
        "orgaoNome",
        "miniResumo",
        "valorEstimado",
      ]);
      expect(sortDirSchema.options).toEqual(["asc", "desc"]);
    });

    it("rejeita busca com menos de 3 caracteres e aceita busca vazia ou omitida", () => {
      expect(() => oportunidadesFilterSchema.parse({ busca: "da" })).toThrow();
      expect(() => oportunidadesFilterSchema.parse({ busca: " a " })).toThrow();

      const vazia = oportunidadesFilterSchema.parse({ busca: "   " });
      expect(vazia.busca).toBeUndefined();

      const omitida = oportunidadesFilterSchema.parse({});
      expect(omitida.busca).toBeUndefined();
    });
  });

  describe("historicoLicitacoesQuerySchema", () => {
    it("aceita janela exata de 30 dias, segmento OUTROS, todas UFs e pageSize até 100", () => {
      expect(MAX_HISTORICO_DIAS_JANELA).toBe(30);

      const parsed = historicoLicitacoesQuerySchema.parse({
        dataInicio: "2026-10-26",
        dataFim: "2026-11-25",
        situacaoPrazo: "TODAS",
        segmento: "OUTROS",
        uf: "sp,mg",
        busca: "software",
        sortBy: "dataLimite",
        sortDir: "desc",
        page: 2,
        pageSize: 50,
      });

      expect(parsed.dataInicio).toBe("2026-10-26");
      expect(parsed.dataFim).toBe("2026-11-25");
      expect(parsed.situacaoPrazo).toBe("TODAS");
      expect(parsed.segmento).toBe("OUTROS");
      expect(parsed.uf).toBe("SP,MG");
      expect(parsed.busca).toBe("software");
      expect(parsed.page).toBe(2);
      expect(parsed.pageSize).toBe(50);
    });

    it("rejeita janela maior que 30 dias, dataFim anterior a dataInicio e busca com 2 letras", () => {
      expect(() =>
        historicoLicitacoesQuerySchema.parse({
          dataInicio: "2026-10-25",
          dataFim: "2026-11-25",
        }),
      ).toThrow(/30 dias/i);

      expect(() =>
        historicoLicitacoesQuerySchema.parse({
          dataInicio: "2026-11-26",
          dataFim: "2026-11-20",
        }),
      ).toThrow();

      expect(() =>
        historicoLicitacoesQuerySchema.parse({
          dataInicio: "2026-11-01",
          dataFim: "2026-11-25",
          busca: "da",
        }),
      ).toThrow(/3 caracteres/i);

      const semBusca = historicoLicitacoesQuerySchema.parse({
        dataInicio: "2026-11-01",
        dataFim: "2026-11-25",
        busca: "",
      });
      expect(semBusca.busca).toBeUndefined();
    });
  });

  describe("dashboardQuerySchema e ingestaoPayloadV2Schema", () => {
    it("aceita subsegmentosTenantAtivo e ufsTenantAtivo no Dashboard", () => {
      const parsed = dashboardQuerySchema.parse({
        mes: 11,
        ano: 2026,
        tenantId: "tenant_1",
        segmentosTenantAtivo: ["SAUDE"],
        subsegmentosTenantAtivo: ["1401"],
        ufsTenantAtivo: ["GO", "DF"],
      });

      expect(parsed.subsegmentosTenantAtivo).toEqual(["1401"]);
      expect(parsed.ufsTenantAtivo).toEqual(["GO", "DF"]);
    });

    it("aceita silenciarNotificacoes na ingestão V2", () => {
      const parsed = ingestaoPayloadV2Schema.parse({
        versaoContrato: 2,
        executadoEm: "2026-11-26T00:00:00Z",
        silenciarNotificacoes: true,
        usarIaTitulos: false,
        licitacoes: [],
      });

      expect(parsed.silenciarNotificacoes).toBe(true);
      expect(parsed.usarIaTitulos).toBe(false);
    });
  });
});
