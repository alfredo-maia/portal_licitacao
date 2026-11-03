import {
  CATALOGO_MACRO_SEGMENTOS,
  type ClassificacaoSegmento,
  type MacroSegmento,
} from "@/server/schemas/segmentos.schema";

/**
 * Normaliza uma string para comparação fonética e busca textual insensível a acentos e maiúsculas.
 */
export function normalizarTexto(texto: string): string {
  if (!texto) return "";
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface TermoCompilado {
  macro: MacroSegmento;
  subcategoria: string;
  termo: string;
  regex: RegExp;
  peso: number;
}

const PESO_TERMO_COMPOSTO = 15;
const PESO_TERMO_SIMPLES = 5;
/** Bônus aplicado à macro LEILOES quando o objeto é, de fato, um leilão. */
const BONUS_LEILAO = 50;
/** LEILOES só pontua quando o texto indica leilão (evita falso positivo em compras comuns). */
const GATILHO_LEILAO = /\b(leilao|leiloes|leiloeiro|leiloeira|leiloar)\b/;

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilarTermo(palavraNorm: string): RegExp {
  const partes = palavraNorm.split(" ").map((palavra) => {
    const stem =
      palavra.length > 3 && palavra.endsWith("s") ? palavra.slice(0, -1) : palavra;
    return palavra.length >= 3
      ? `${escaparRegex(stem)}(?:s|es)?`
      : escaparRegex(palavra);
  });
  return new RegExp(`\\b${partes.join("\\s+")}\\b`);
}

let termosCompilados: TermoCompilado[] | null = null;

function obterTermosCompilados(): TermoCompilado[] {
  if (termosCompilados) return termosCompilados;
  const lista: TermoCompilado[] = [];
  for (const macroDef of Object.values(CATALOGO_MACRO_SEGMENTOS)) {
    for (const sub of macroDef.subcategorias) {
      for (const palavraChave of sub.palavrasChave) {
        const palavraNorm = normalizarTexto(palavraChave);
        if (!palavraNorm) continue;
        lista.push({
          macro: macroDef.codigo,
          subcategoria: sub.codigo,
          termo: palavraChave,
          regex: compilarTermo(palavraNorm),
          peso: palavraNorm.includes(" ") ? PESO_TERMO_COMPOSTO : PESO_TERMO_SIMPLES,
        });
      }
    }
  }
  termosCompilados = lista;
  return lista;
}

/**
 * Heurística de último recurso (radicais) quando nenhum termo do catálogo pontuou.
 * Mantém a classificação coerente com a árvore Conlicitação sem inventar subcategorias.
 */
const FALLBACK_RADICAIS: ReadonlyArray<{
  regex: RegExp;
  macro: MacroSegmento;
  subcategoria: string;
}> = [
  { regex: /\b(saude|hospital|medic|farmac|ambulator|odontolog|clinica|ubs|upa|enfermag|cirurg|vacin|exame)\w*/, macro: "SAUDE", subcategoria: "2202" },
  { regex: /\b(veicul|frota|automot|pneu|mecanic|viatur|motor)\w*/, macro: "TRANSPORTES_RODOVIARIOS", subcategoria: "1705" },
  { regex: /\b(obra|construc|engenhari|reforma|paviment|eletric|hidraulic|asfalt|drenag|terrapl)\w*/, macro: "ENGENHARIA_SERVICOS", subcategoria: "0101" },
  { regex: /\b(aliment|merenda|refeic|nutric|hortifrut|genero|padaria|panific)\w*/, macro: "ALIMENTACAO", subcategoria: "2501" },
  { regex: /\b(software|sistema|informatica|computador|telecom|licenca|nuvem|saas|servidor|impressora|internet)\w*/, macro: "INFORMATICA", subcategoria: "3101" },
  { regex: /\b(limpez|vigilanc|portari|terceiriz|conservac|zeladori)\w*/, macro: "PRESTACAO_DE_SERVICOS_MAO_DE_OBRA", subcategoria: "0301" },
];

/**
 * Classifica um edital com base em seu objeto, resumo ou descrição, atribuindo
 * a macro-categoria mais relevante e as subatividades correspondentes da árvore
 * oficial Conlicitação (40 macro-categorias / 188 subatividades).
 */
export function classificarLicitacaoPorTexto(
  objeto: string,
  resumo?: string,
): ClassificacaoSegmento {
  const textoNormalizado = normalizarTexto(`${objeto || ""} ${resumo || ""}`);

  if (!textoNormalizado) {
    return { macro: "ASSESSORIAS", subcategorias: [], score: 0, termosCorrespondentes: [] };
  }

  const ehLeilao = GATILHO_LEILAO.test(textoNormalizado);
  const scores = new Map<
    MacroSegmento,
    { scoreTotal: number; subcategorias: Set<string>; termos: Set<string> }
  >();

  for (const termo of obterTermosCompilados()) {
    if (termo.macro === "LEILOES" && !ehLeilao) continue;
    if (!termo.regex.test(textoNormalizado)) continue;
    let entry = scores.get(termo.macro);
    if (!entry) {
      entry = { scoreTotal: 0, subcategorias: new Set(), termos: new Set() };
      scores.set(termo.macro, entry);
    }
    entry.scoreTotal += termo.peso;
    entry.subcategorias.add(termo.subcategoria);
    entry.termos.add(termo.termo);
  }

  if (ehLeilao) {
    const leilao = scores.get("LEILOES") ?? {
      scoreTotal: 0,
      subcategorias: new Set<string>(),
      termos: new Set<string>(),
    };
    leilao.scoreTotal += BONUS_LEILAO;
    scores.set("LEILOES", leilao);
  }

  let melhorMacro: MacroSegmento | null = null;
  let maiorScore = 0;
  for (const [macro, data] of scores) {
    const melhor = melhorMacro ? scores.get(melhorMacro) : undefined;
    if (
      data.scoreTotal > maiorScore ||
      (data.scoreTotal === maiorScore && melhor && data.termos.size > melhor.termos.size)
    ) {
      maiorScore = data.scoreTotal;
      melhorMacro = macro;
    }
  }

  if (melhorMacro) {
    const resultado = scores.get(melhorMacro)!;
    return {
      macro: melhorMacro,
      subcategorias: Array.from(resultado.subcategorias).sort(),
      score: maiorScore,
      termosCorrespondentes: Array.from(resultado.termos),
    };
  }

  const fallback = FALLBACK_RADICAIS.find((f) => f.regex.test(textoNormalizado));
  if (fallback) {
    return {
      macro: fallback.macro,
      subcategorias: [fallback.subcategoria],
      score: 0,
      termosCorrespondentes: [],
    };
  }

  return { macro: "ASSESSORIAS", subcategorias: [], score: 0, termosCorrespondentes: [] };
}
