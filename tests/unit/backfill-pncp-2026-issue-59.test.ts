import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  carregarCheckpointBackfill,
  fatiarPeriodoReverso,
  salvarCheckpointBackfill,
} from "../../scripts/backfill-pncp-2026";

describe("Issue #59 (Task 7) — Script de Carga Histórica PNCP 2026 com Checkpoint", () => {
  it("fatia período 20260101–20260110 em janelas reversas contíguas de 3 dias sem lacunas nem sobreposição", () => {
    const janelas = fatiarPeriodoReverso("20260101", "20260110", 3);
    expect(janelas).toEqual([
      { de: "20260108", ate: "20260110", chave: "20260108_20260110" },
      { de: "20260105", ate: "20260107", chave: "20260105_20260107" },
      { de: "20260102", ate: "20260104", chave: "20260102_20260104" },
      { de: "20260101", ate: "20260101", chave: "20260101_20260101" },
    ]);
  });

  it("persiste e retoma checkpoint JSON ignorando janelas já concluídas", () => {
    const tmpFile = path.join(
      os.tmpdir(),
      `backfill-pncp-2026-test-${Date.now()}.json`,
    );
    try {
      const inicial = carregarCheckpointBackfill(tmpFile);
      expect(inicial.janelasConcluidas).toEqual([]);

      salvarCheckpointBackfill(tmpFile, {
        atualizadoEm: "2026-11-26T12:00:00.000Z",
        janelasConcluidas: ["20260108_20260110", "20260105_20260107"],
        totais: { consultados: 200, criados: 180, atualizados: 10, inalterados: 10 },
      });

      const retomado = carregarCheckpointBackfill(tmpFile);
      expect(retomado.janelasConcluidas).toEqual([
        "20260108_20260110",
        "20260105_20260107",
      ]);
      expect(retomado.totais.criados).toBe(180);

      const janelas = fatiarPeriodoReverso("20260101", "20260110", 3);
      const pendentes = janelas.filter(
        (j) => !retomado.janelasConcluidas.includes(j.chave),
      );
      expect(pendentes.map((p) => p.chave)).toEqual([
        "20260102_20260104",
        "20260101_20260101",
      ]);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
