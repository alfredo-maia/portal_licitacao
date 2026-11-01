import { describe, expect, it } from "vitest";
import { formatarDataSemOffset, parseDataCivil } from "@/lib/date-utils";

describe("Tarefa 6 — Correção de Fuso Horário (-1 Dia) em Portais (#26)", () => {
  it("parseDataCivil deve fixar o meio-dia UTC para que qualquer fuso preserve o dia civil", () => {
    const dataString = "2026-11-10";
    const dataCivil = parseDataCivil(dataString);

    expect(dataCivil).not.toBeNull();
    // 12h UTC garante que em UTC-3 continue sendo 09:00 do dia 10
    expect(dataCivil!.getUTCFullYear()).toBe(2026);
    expect(dataCivil!.getUTCMonth()).toBe(10); // Novembro (0-indexed: 10)
    expect(dataCivil!.getUTCDate()).toBe(10);
  });

  it("formatarDataSemOffset deve renderizar exatamente o dia civil selecionado sem recuar para o dia anterior", () => {
    // Caso 1: string no formato ISO YYYY-MM-DD
    expect(formatarDataSemOffset("2026-11-10")).toBe("10/11/2026");

    // Caso 2: string ISO com timestamp UTC zero (00:00:00.000Z)
    expect(formatarDataSemOffset("2026-11-10T00:00:00.000Z")).toBe("10/11/2026");

    // Caso 3: string ISO com meio-dia UTC (12:00:00.000Z)
    expect(formatarDataSemOffset("2026-11-10T12:00:00.000Z")).toBe("10/11/2026");

    // Caso 4: objeto Date gerado pelo parseDataCivil
    const parsedDate = parseDataCivil("2026-11-10");
    expect(formatarDataSemOffset(parsedDate)).toBe("10/11/2026");
  });
});

