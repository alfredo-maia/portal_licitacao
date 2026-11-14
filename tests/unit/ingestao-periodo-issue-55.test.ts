import { describe, expect, it } from "vitest";
import { AdminLicitacoesPostSchema } from "@/server/schemas/superadmin.schema";
import { executarIngestaoPncpInputSchema } from "@/server/schemas/pncp-ingestao.schema";

describe("Issue #55 — Ingestão de Licitações do PNCP por Período", () => {
  it("1. AdminLicitacoesPostSchema aceita sincronizar_pncp com diasRetroativos de até 60 dias", () => {
    const valid = AdminLicitacoesPostSchema.parse({
      acao: "sincronizar_pncp",
      diasRetroativos: 7,
      usarIa: false,
    });
    expect(valid.acao).toBe("sincronizar_pncp");
    if (valid.acao === "sincronizar_pncp") {
      expect(valid.diasRetroativos).toBe(7);
      expect(valid.usarIa).toBe(false);
    }
  });

  it("2. AdminLicitacoesPostSchema aceita intervalo customizado com dataInicial e dataFinal no formato YYYYMMDD", () => {
    const valid = AdminLicitacoesPostSchema.parse({
      acao: "sincronizar_pncp",
      dataInicial: "20261106",
      dataFinal: "20261113",
      usarIa: true,
    });
    expect(valid.acao).toBe("sincronizar_pncp");
    if (valid.acao === "sincronizar_pncp") {
      expect(valid.dataInicial).toBe("20261106");
      expect(valid.dataFinal).toBe("20261113");
    }

    // Rejeita formato de data que não tenha exatamente 8 dígitos numéricos
    expect(() =>
      AdminLicitacoesPostSchema.parse({
        acao: "sincronizar_pncp",
        dataInicial: "06/11/2026",
      }),
    ).toThrow();
  });

  it("3. executarIngestaoPncpInputSchema aceita dataInicial e dataFinal customizadas", () => {
    const parsed = executarIngestaoPncpInputSchema.parse({
      dataInicial: "20261106",
      dataFinal: "20261113",
      diasRetroativos: 7,
      modalidades: [6, 8],
    });
    expect(parsed.dataInicial).toBe("20261106");
    expect(parsed.dataFinal).toBe("20261113");
    expect(parsed.diasRetroativos).toBe(7);
    expect(parsed.modalidades).toEqual([6, 8]);
  });
});

