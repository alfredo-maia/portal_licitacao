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

/**
 * Classifica um edital com base em seu objeto, resumo ou descrição, atribuindo
 * o Macro-Segmento mais relevante e a lista de Subcategorias correspondentes.
 */
export function classificarLicitacaoPorTexto(
  objeto: string,
  resumo?: string,
): ClassificacaoSegmento {
  const textoCompleto = `${objeto || ""} ${resumo || ""}`;
  const textoNormalizado = normalizarTexto(textoCompleto);

  if (!textoNormalizado) {
    return {
      macro: "TECNOLOGIA_TELECOM",
      subcategorias: [],
      score: 0,
      termosCorrespondentes: [],
    };
  }

  const scores: Record<
    MacroSegmento,
    {
      scoreTotal: number;
      subcategorias: Set<string>;
      termos: Set<string>;
    }
  > = {
    SAUDE_MEDICAMENTOS_HOSPITALAR: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
    AUTOMOTIVO_PECAS_FROTAS: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
    OBRAS_CONSTRUCAO_MANUTENCAO: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
    ALIMENTOS_MERENDA_ESCOLAR: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
    TECNOLOGIA_TELECOM: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
    SERVICOS_TERCEIRIZADOS_OPERACIONAIS: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
    MATERIAIS_ESCRITORIO_SUPRIMENTOS: { scoreTotal: 0, subcategorias: new Set(), termos: new Set() },
  };

  for (const [macroKey, macroDef] of Object.entries(CATALOGO_MACRO_SEGMENTOS)) {
    const macro = macroKey as MacroSegmento;
    const entry = scores[macro];

    for (const sub of macroDef.subcategorias) {
      for (const palavraChave of sub.palavrasChave) {
        const palavraNorm = normalizarTexto(palavraChave);
        if (!palavraNorm) continue;

        // Se for termo composto (ex: "oleo lubrificante", "merenda escolar")
        if (palavraNorm.includes(" ")) {
          if (textoNormalizado.includes(palavraNorm)) {
            entry.scoreTotal += 15; // Pontuação maior para expressões exatas compostas
            entry.subcategorias.add(sub.codigo);
            entry.termos.add(palavraChave);
          }
        } else {
          // Busca por palavra inteira ou plural simples (ex: seringa / seringas)
          const stem = palavraNorm.endsWith("s") && palavraNorm.length > 3 ? palavraNorm.slice(0, -1) : palavraNorm;
          const regex = new RegExp(`\\b${stem}s?\\b`, "i");
          if (regex.test(textoNormalizado)) {
            entry.scoreTotal += 5;
            entry.subcategorias.add(sub.codigo);
            entry.termos.add(palavraChave);
          }
        }
      }
    }
  }

  // Encontra o macro-segmento com maior pontuação
  let melhorMacro: MacroSegmento = "MATERIAIS_ESCRITORIO_SUPRIMENTOS";
  let maiorScore = 0;

  for (const [macroKey, data] of Object.entries(scores)) {
    if (data.scoreTotal > maiorScore) {
      maiorScore = data.scoreTotal;
      melhorMacro = macroKey as MacroSegmento;
    }
  }

  // Fallback heurístico caso nenhuma palavra-chave exata do catálogo tenha pontuado
  if (maiorScore === 0) {
    if (/\b(saude|hospital|medic|farmac|ambulator|odontolog|clinica|ubs|upa|enfermag|cirurg|vacin|exame)\w*/i.test(textoNormalizado)) {
      melhorMacro = "SAUDE_MEDICAMENTOS_HOSPITALAR";
      scores[melhorMacro].subcategorias.add("MATERIAIS_HOSPITALARES_DESCARTAVEIS");
    } else if (/\b(veicul|frota|automot|combustiv|oleo|lubrific|pneu|mecan|viatur|motor|diesel|gasolin)\w*/i.test(textoNormalizado)) {
      melhorMacro = "AUTOMOTIVO_PECAS_FROTAS";
      scores[melhorMacro].subcategorias.add("PECAS_AUTOMOTIVAS_ACESSORIOS");
    } else if (/\b(obra|construc|engenhari|reforma|paviment|britag|eletric|hidraulic|asfalt|drenag|predial|terrapl)\w*/i.test(textoNormalizado)) {
      melhorMacro = "OBRAS_CONSTRUCAO_MANUTENCAO";
      scores[melhorMacro].subcategorias.add("OBRAS_ENGENHARIA_PAVIMENTACAO");
    } else if (/\b(aliment|merenda|refeic|nutric|hortifrut|cesta basica|genero|padaria|panific|cozinha)\w*/i.test(textoNormalizado)) {
      melhorMacro = "ALIMENTOS_MERENDA_ESCOLAR";
      scores[melhorMacro].subcategorias.add("GENEROS_NAO_PERECIVEIS");
    } else if (/\b(software|sistema|informatica|computador|rede|telecom|licenca|nuvem|saas|servidor|impressora|internet|fibra)\w*/i.test(textoNormalizado)) {
      melhorMacro = "TECNOLOGIA_TELECOM";
      scores[melhorMacro].subcategorias.add("SOFTWARES_SAAS_LICENCAS");
    } else if (/\b(limpez|vigilanc|portari|locacao|terceiriz|manutencao|seguranca|transporte|coleta|evento)\w*/i.test(textoNormalizado)) {
      melhorMacro = "SERVICOS_TERCEIRIZADOS_OPERACIONAIS";
      scores[melhorMacro].subcategorias.add("LIMPEZA_CONSERVACAO_PREDIAL");
    } else {
      melhorMacro = "MATERIAIS_ESCRITORIO_SUPRIMENTOS";
      scores[melhorMacro].subcategorias.add("PAPELARIA_MATERIAL_ESCOLAR");
    }
  }

  const melhorResultado = scores[melhorMacro];

  return {
    macro: melhorMacro,
    subcategorias: Array.from(melhorResultado.subcategorias),
    score: maiorScore,
    termosCorrespondentes: Array.from(melhorResultado.termos),
  };
}
