import { describe, expect, it } from "vitest";
import { obterPalavrasChaveSubsegmento } from "@/server/services/oportunidades.service";

describe("Task 4 — Filtro Semântico de Sub-segmentos em Oportunidades", () => {
  it("deve retornar a lista de palavras-chave do dicionário para subcategoria de Medicamentos", () => {
    const palavras = obterPalavrasChaveSubsegmento("Medicamentos & Fármacos");
    expect(palavras).toContain("medicamento");
    expect(palavras).toContain("comprimido");
    expect(palavras).toContain("ampola");
  });

  it("deve retornar palavras-chave para subcategoria por código (MEDICAMENTOS_FARMACOS)", () => {
    const palavras = obterPalavrasChaveSubsegmento("MEDICAMENTOS_FARMACOS");
    expect(palavras).toContain("fármaco");
    expect(palavras).toContain("antibiótico");
  });

  it("deve retornar palavras-chave para subcategoria de Pneus Automotivos", () => {
    const palavras = obterPalavrasChaveSubsegmento("PNEUS_CAMARAS_RECAPAGEM");
    expect(palavras).toContain("pneu");
    expect(palavras).toContain("recapagem");
  });

  it("deve retornar fallback com o próprio termo quando o subsegmento for customizado", () => {
    const palavras = obterPalavrasChaveSubsegmento("TermoInexistenteXYZ");
    expect(palavras).toEqual(["TermoInexistenteXYZ"]);
  });
});

