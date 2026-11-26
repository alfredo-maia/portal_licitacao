/**
 * Script Resiliente de Carga Histórica PNCP 2026 com Checkpoint (Issue #59)
 *
 * Percorre janelas reversas de publicação (ex.: 20261125 -> 20260101),
 * coleta apenas metadados (zero download de PDFs — R2 sob demanda),
 * classifica via Motor Determinístico V3 (`usarIaTitulos: false`),
 * silencia notificações N1/N2 (`silenciarNotificacoes: true`) e salva
 * checkpoint JSON retomável a cada janela concluída.
 *
 * Uso:
 *   npx tsx scripts/backfill-pncp-2026.ts \
 *     [--de=20260101] [--ate=20261125] [--janelaDias=3] \
 *     [--maxPaginasPorJanela=10] [--modalidades=6,8,5,9,1] \
 *     [--targetUrl=https://staging.aponta.cloud]
 */

import fs from "node:fs";
import path from "node:path";
import {
  pncpContratacaoRawSchema,
  type PncpContratacaoRaw,
} from "../src/server/schemas/pncp-ingestao.schema";
import { mapPncpItemParaIngestao } from "../src/server/services/pncp-ingestao-diaria.service";
import { sintetizarTituloHeuristicoV2 } from "../src/lib/licitacao-texto";
import type { IngestaoLicitacaoItemInput } from "../src/server/schemas/ingestao.schema";

export interface JanelaBackfill {
  de: string;
  ate: string;
  chave: string;
}

export interface CheckpointBackfill {
  atualizadoEm: string;
  janelasConcluidas: string[];
  totais: {
    consultados: number;
    criados: number;
    atualizados: number;
    inalterados: number;
  };
}

function parseYyyymmddToUtc(yyyymmdd: string): Date {
  const ano = Number(yyyymmdd.slice(0, 4));
  const mes = Number(yyyymmdd.slice(4, 6));
  const dia = Number(yyyymmdd.slice(6, 8));
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function formatUtcToYyyymmdd(d: Date): string {
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}${mes}${dia}`;
}

export function fatiarPeriodoReverso(
  deYyyymmdd: string,
  ateYyyymmdd: string,
  janelaDias = 3,
): JanelaBackfill[] {
  const step = Math.max(1, Math.floor(janelaDias));
  const inicioMs = parseYyyymmddToUtc(deYyyymmdd).getTime();
  const fimMs = parseYyyymmddToUtc(ateYyyymmdd).getTime();
  if (fimMs < inicioMs) return [];

  const diaMs = 24 * 60 * 60 * 1000;
  const janelas: JanelaBackfill[] = [];
  let cursorFim = fimMs;

  while (cursorFim >= inicioMs) {
    const cursorInicio = Math.max(inicioMs, cursorFim - (step - 1) * diaMs);
    const de = formatUtcToYyyymmdd(new Date(cursorInicio));
    const ate = formatUtcToYyyymmdd(new Date(cursorFim));
    janelas.push({ de, ate, chave: `${de}_${ate}` });
    cursorFim = cursorInicio - diaMs;
  }

  return janelas;
}

export function carregarCheckpointBackfill(filePath: string): CheckpointBackfill {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        atualizadoEm: parsed.atualizadoEm || new Date().toISOString(),
        janelasConcluidas: Array.isArray(parsed.janelasConcluidas)
          ? parsed.janelasConcluidas
          : [],
        totais: {
          consultados: Number(parsed?.totais?.consultados) || 0,
          criados: Number(parsed?.totais?.criados) || 0,
          atualizados: Number(parsed?.totais?.atualizados) || 0,
          inalterados: Number(parsed?.totais?.inalterados) || 0,
        },
      };
    }
  } catch {
    // Checkpoint corrompido: inicia limpo
  }
  return {
    atualizadoEm: new Date().toISOString(),
    janelasConcluidas: [],
    totais: { consultados: 0, criados: 0, atualizados: 0, inalterados: 0 },
  };
}

export function salvarCheckpointBackfill(
  filePath: string,
  checkpoint: CheckpointBackfill,
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const idx = arg.indexOf("=");
      if (idx > 2) {
        opts[arg.slice(2, idx)] = arg.slice(idx + 1);
      }
    }
  }

  return {
    de: opts.de || "20260101",
    ate: opts.ate || "20261125",
    janelaDias: Number(opts.janelaDias || opts.janelasDias || 3),
    modalidades: opts.modalidades
      ? opts.modalidades
          .split(",")
          .map((n) => Number(n.trim()))
          .filter(Boolean)
      : [6, 8, 5, 9, 1],
    maxPaginasPorJanela: Number(opts.maxPaginasPorJanela || opts.maxPaginas || 6),
    tamanhoPagina: Number(opts.tamanhoPagina || 50),
    targetUrl: (
      opts.targetUrl ||
      process.env.TARGET_URL ||
      "https://staging.aponta.cloud"
    ).replace(/\/$/, ""),
    checkpointPath:
      opts.checkpoint ||
      path.resolve(process.cwd(), ".cache/backfill-pncp-2026-checkpoint.json"),
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchComRetry(url: string, init: RequestInit, tentativas = 3): Promise<Response> {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      return res;
    } catch (err) {
      ultimoErro = err;
      await sleep(1000 * Math.pow(2, i));
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(`Falha ao consultar ${url}`);
}

async function enviarLoteHistorico(
  targetUrl: string,
  itens: IngestaoLicitacaoItemInput[],
): Promise<{ criados: number; atualizados: number; inalterados: number }> {
  const res = await fetchComRetry(
    `${targetUrl}/api/ingestao`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        versaoContrato: 2,
        executadoEm: new Date().toISOString(),
        totalRegistros: itens.length,
        usarIaTitulos: false,
        silenciarNotificacoes: true,
        licitacoes: itens,
      }),
    },
    3,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} em /api/ingestao: ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    criados?: number;
    atualizados?: number;
    inalterados?: number;
  };
  return {
    criados: json.criados ?? 0,
    atualizados: json.atualizados ?? 0,
    inalterados: json.inalterados ?? 0,
  };
}

async function executarBackfillCli() {
  const cfg = parseCliArgs();
  const janelas = fatiarPeriodoReverso(cfg.de, cfg.ate, cfg.janelaDias);
  const checkpoint = carregarCheckpointBackfill(cfg.checkpointPath);
  const concluidasSet = new Set(checkpoint.janelasConcluidas);
  const pendentes = janelas.filter((j) => !concluidasSet.has(j.chave));

  console.log("==================================================================");
  console.log("📚 Backfill Histórico PNCP 2026 (Metadados apenas — Zero PDFs)");
  console.log(`📅 Período          : ${cfg.de} → ${cfg.ate} (${janelas.length} janelas de ${cfg.janelaDias}d)`);
  console.log(`⏭️  Já concluídas    : ${concluidasSet.size} | Pendentes: ${pendentes.length}`);
  console.log(`📋 Modalidades      : [${cfg.modalidades.join(", ")}] (até ${cfg.maxPaginasPorJanela} págs/mod)`);
  console.log(`🌐 Destino          : ${cfg.targetUrl}`);
  console.log("==================================================================\n");

  for (let idx = 0; idx < pendentes.length; idx++) {
    const janela = pendentes[idx];
    console.log(
      `\n🗓️  [Janela ${idx + 1}/${pendentes.length}] ${janela.de} até ${janela.ate}...`,
    );

    const porPncpId = new Map<string, PncpContratacaoRaw>();
    let consultadosJanela = 0;

    for (const modCod of cfg.modalidades) {
      for (let pagina = 1; pagina <= cfg.maxPaginasPorJanela; pagina++) {
        const qs = new URLSearchParams({
          dataInicial: janela.de,
          dataFinal: janela.ate,
          codigoModalidadeContratacao: String(modCod),
          pagina: String(pagina),
          tamanhoPagina: String(cfg.tamanhoPagina),
        });
        const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?${qs.toString()}`;

        try {
          const res = await fetchComRetry(
            url,
            { method: "GET", headers: { Accept: "application/json" } },
            3,
          );
          if (res.status === 204 || res.status === 404 || !res.ok) {
            break;
          }
          const body = (await res.json()) as {
            data?: unknown[];
            totalPaginas?: number;
          } | null;
          const itensRaw = Array.isArray(body?.data) ? body.data : [];
          consultadosJanela += itensRaw.length;

          for (const raw of itensRaw) {
            const parsed = pncpContratacaoRawSchema.safeParse(raw);
            if (parsed.success && !porPncpId.has(parsed.data.numeroControlePNCP)) {
              porPncpId.set(parsed.data.numeroControlePNCP, parsed.data);
            }
          }

          const totalPaginas = Number(body?.totalPaginas ?? 0);
          if (
            itensRaw.length === 0 ||
            (totalPaginas > 0 && pagina >= totalPaginas) ||
            (totalPaginas === 0 && itensRaw.length < cfg.tamanhoPagina)
          ) {
            break;
          }
          await sleep(150);
        } catch (err) {
          console.warn(`   ⚠️ Erro PNCP mod=${modCod} p=${pagina}:`, err);
          break;
        }
      }
    }

    const itensMapeados = Array.from(porPncpId.values()).map((raw) => {
      const obj = (raw.objetoCompra || raw.informacaoComplementar || "").trim();
      return mapPncpItemParaIngestao(raw, sintetizarTituloHeuristicoV2(obj));
    });

    let criados = 0;
    let atualizados = 0;
    let inalterados = 0;
    const BATCH = 50;

    for (let i = 0; i < itensMapeados.length; i += BATCH) {
      const lote = itensMapeados.slice(i, i + BATCH);
      try {
        const res = await enviarLoteHistorico(cfg.targetUrl, lote);
        criados += res.criados;
        atualizados += res.atualizados;
        inalterados += res.inalterados;
      } catch (err) {
        console.error(`   ❌ Erro ao enviar lote da janela ${janela.chave}:`, err);
      }
      await sleep(100);
    }

    checkpoint.janelasConcluidas.push(janela.chave);
    checkpoint.atualizadoEm = new Date().toISOString();
    checkpoint.totais.consultados += consultadosJanela;
    checkpoint.totais.criados += criados;
    checkpoint.totais.atualizados += atualizados;
    checkpoint.totais.inalterados += inalterados;
    salvarCheckpointBackfill(cfg.checkpointPath, checkpoint);

    console.log(
      `   ✓ Janela ${janela.chave}: ${itensMapeados.length} únicos | Criados: ${criados} | Atualizados: ${atualizados} | Inalterados: ${inalterados}`,
    );
  }

  console.log("\n==================================================================");
  console.log("🏁 Backfill 2026 Concluído:", JSON.stringify(checkpoint.totais));
  console.log("==================================================================");
}

const isMainExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]?.includes("backfill-pncp-2026"));

if (isMainExecution) {
  executarBackfillCli().catch((err) => {
    console.error("Erro fatal no backfill 2026:", err);
    process.exit(1);
  });
}
