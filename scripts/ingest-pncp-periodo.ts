/**
 * Script de Ingestão de Licitações do PNCP por Período
 *
 * Coleta certames no Portal Nacional de Contratações Públicas (PNCP)
 * entre uma data inicial e uma data final para as modalidades desejadas
 * e sincroniza no Portal de Licitações (via API de Ingestão v2).
 *
 * Uso:
 *   npx tsx scripts/ingest-pncp-periodo.ts [--dataInicial=20261106] [--dataFinal=20261113] [--maxPaginas=5]
 */

import {
  pncpContratacaoRawSchema,
  type PncpContratacaoRaw,
} from "../src/server/schemas/pncp-ingestao.schema";
import { mapPncpItemParaIngestao } from "../src/server/services/pncp-ingestao-diaria.service";
import { sintetizarTituloHeuristicoV2 } from "../src/lib/licitacao-texto";
import type { IngestaoLicitacaoItemInput } from "../src/server/schemas/ingestao.schema";

interface ScriptOptions {
  dataInicial: string;
  dataFinal: string;
  modalidades: number[];
  maxPaginasPorModalidade: number;
  tamanhoPagina: number;
  targetUrl: string;
}

function parseCliArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (key && value !== undefined) {
        opts[key] = value;
      }
    }
  }

  const dataInicial = opts.dataInicial || "20261106";
  const dataFinal = opts.dataFinal || "20261113";
  const modalidades = opts.modalidades
    ? opts.modalidades.split(",").map((n) => Number(n.trim())).filter(Boolean)
    : [6, 8, 5, 9, 1]; // 6=Pregão, 8=Dispensa, 5=Concorrência, 9=Inexigibilidade, 1=Leilão
  const maxPaginasPorModalidade = Number(opts.maxPaginas || opts.maxPaginasPorModalidade || 5);
  const tamanhoPagina = Number(opts.tamanhoPagina || 50);
  const targetUrl = (opts.targetUrl || process.env.TARGET_URL || "https://staging.aponta.cloud").replace(/\/$/, "");

  return {
    dataInicial,
    dataFinal,
    modalidades,
    maxPaginasPorModalidade,
    tamanhoPagina,
    targetUrl,
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enviarLoteAoPortal(
  targetUrl: string,
  itens: IngestaoLicitacaoItemInput[],
): Promise<{ criados: number; atualizados: number; inalterados: number }> {
  const url = `${targetUrl}/api/ingestao`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      versaoContrato: 2,
      executadoEm: new Date().toISOString(),
      totalRegistros: itens.length,
      licitacoes: itens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Falha no envio para ${url} (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    ok: boolean;
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

async function main() {
  const opts = parseCliArgs();

  console.log("==================================================================");
  console.log("🚀 Sincronização de Licitações PNCP por Período");
  console.log(`📅 Intervalo de Publicação : ${opts.dataInicial} até ${opts.dataFinal}`);
  console.log(`📋 Modalidades             : [${opts.modalidades.join(", ")}]`);
  console.log(`📄 Páginas por modalidade  : até ${opts.maxPaginasPorModalidade} (tamanho=${opts.tamanhoPagina})`);
  console.log(`🌐 Servidor de Destino     : ${opts.targetUrl}`);
  console.log("==================================================================\n");

  const porPncpId = new Map<string, PncpContratacaoRaw>();
  let totalConsultado = 0;

  for (const modalidadeCod of opts.modalidades) {
    console.log(`🔍 [PNCP] Consultando modalidade ${modalidadeCod}...`);

    for (let pagina = 1; pagina <= opts.maxPaginasPorModalidade; pagina++) {
      const qs = new URLSearchParams({
        dataInicial: opts.dataInicial,
        dataFinal: opts.dataFinal,
        codigoModalidadeContratacao: String(modalidadeCod),
        pagina: String(pagina),
        tamanhoPagina: String(opts.tamanhoPagina),
      });

      const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?${qs.toString()}`;

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (res.status === 204 || res.status === 404) {
          console.log(`   ℹ️ Sem mais resultados para modalidade ${modalidadeCod} na página ${pagina}.`);
          break;
        }

        if (!res.ok) {
          console.warn(`   ⚠️ Erro HTTP ${res.status} na modalidade ${modalidadeCod} página ${pagina}`);
          break;
        }

        const body = (await res.json()) as {
          data?: unknown[];
          totalPaginas?: number;
          totalRegistros?: number;
        } | null;

        const itensRaw = Array.isArray(body?.data) ? body.data : [];
        totalConsultado += itensRaw.length;

        let novosNestaPagina = 0;
        for (const rawItem of itensRaw) {
          const validated = pncpContratacaoRawSchema.safeParse(rawItem);
          if (!validated.success) continue;
          if (!porPncpId.has(validated.data.numeroControlePNCP)) {
            porPncpId.set(validated.data.numeroControlePNCP, validated.data);
            novosNestaPagina++;
          }
        }

        console.log(
          `   ✓ Pág ${pagina}/${body?.totalPaginas ?? "?"}: ${itensRaw.length} recebidos (${novosNestaPagina} novos únicos). Total acumulado: ${porPncpId.size}`,
        );

        const totalPaginas = Number(body?.totalPaginas ?? 0);
        if (
          itensRaw.length === 0 ||
          (totalPaginas > 0 && pagina >= totalPaginas) ||
          (totalPaginas === 0 && itensRaw.length < opts.tamanhoPagina)
        ) {
          break;
        }

        // Cortesia de rate limit com o PNCP
        await sleep(300);
      } catch (err: unknown) {
        console.error(`   ❌ Falha na requisição da modalidade ${modalidadeCod} pág ${pagina}:`, err);
        break;
      }
    }
  }

  const coletados = Array.from(porPncpId.values());
  console.log(`\n📦 Total de certames únicos coletados no PNCP: ${coletados.length}`);

  if (coletados.length === 0) {
    console.log("Nenhuma licitação encontrada no período informado.");
    return;
  }

  // Mapeamento e síntese heurística de títulos
  console.log("⚙️  Mapeando itens para o contrato de ingestão v2...");
  const itensMapeados: IngestaoLicitacaoItemInput[] = coletados.map((raw) => {
    const objeto = (raw.objetoCompra || raw.informacaoComplementar || "").trim();
    const tituloSintetizado = sintetizarTituloHeuristicoV2(objeto);
    return mapPncpItemParaIngestao(raw, tituloSintetizado);
  });

  // Envio em lotes de 50 para o portal
  const BATCH_SIZE = 50;
  let totalCriados = 0;
  let totalAtualizados = 0;
  let totalInalterados = 0;

  console.log(`\n📤 Enviando certames em lotes de ${BATCH_SIZE} para ${opts.targetUrl}/api/ingestao...`);

  for (let i = 0; i < itensMapeados.length; i += BATCH_SIZE) {
    const lote = itensMapeados.slice(i, i + BATCH_SIZE);
    const numeroLote = Math.floor(i / BATCH_SIZE) + 1;
    const totalLotes = Math.ceil(itensMapeados.length / BATCH_SIZE);

    try {
      const res = await enviarLoteAoPortal(opts.targetUrl, lote);
      totalCriados += res.criados;
      totalAtualizados += res.atualizados;
      totalInalterados += res.inalterados;
      console.log(
        `   [Lote ${numeroLote}/${totalLotes}] ${lote.length} itens -> Criados: ${res.criados} | Atualizados: ${res.atualizados} | Inalterados: ${res.inalterados}`,
      );
    } catch (err) {
      console.error(`   ❌ Erro no lote ${numeroLote}/${totalLotes}:`, err);
    }

    await sleep(200);
  }

  console.log("\n==================================================================");
  console.log("🏁 Resumo da Ingestão PNCP:");
  console.log(`   Total consultado no PNCP : ${totalConsultado}`);
  console.log(`   Total únicos filtrados   : ${coletados.length}`);
  console.log(`   Novos certames criados   : ${totalCriados}`);
  console.log(`   Certames atualizados     : ${totalAtualizados}`);
  console.log(`   Certames inalterados     : ${totalInalterados}`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Erro fatal na execução do script:", err);
  process.exit(1);
});
