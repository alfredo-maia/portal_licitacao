/**
 * Script de retro-higienização de títulos truncados de licitações já armazenadas no banco.
 * Prioridade 1: IA em lote (quando GEMINI_API_KEY ou OPENAI_API_KEY presente e --no-ai ausente)
 * Prioridade 2: Heurística Determinística V2 sem cortes abruptos
 *
 * Uso: npx tsx scripts/higienizar-titulos-licitacoes.ts [--todos] [--no-ai]
 */
import "dotenv/config";
import { higienizarTitulosExistentesService } from "../src/server/services/resumo-objeto-licitacao.service";

async function main() {
  const args = new Set(process.argv.slice(2));
  const apenasTruncados = !args.has("--todos");
  const usarIa = !args.has("--no-ai");

  console.log(
    `[higienizar-titulos] Iniciando (apenasTruncados=${apenasTruncados}, usarIa=${usarIa})...`,
  );

  const res = await higienizarTitulosExistentesService({
    limite: 1000,
    apenasTruncados,
    usarIa,
  });

  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error("[higienizar-titulos] Erro:", err);
  process.exit(1);
});
