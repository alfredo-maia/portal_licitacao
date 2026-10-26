/**
 * Utilitário para higienização e síntese de títulos e mini-resumos de licitações públicas.
 * Remove prefixos de portais em colchetes (ex.: [Portal de Compras Públicas], [ComprasNet]),
 * elimina bordões burocráticos iniciais e sintetiza o núcleo do objeto em uma frase
 * executiva de 3 a 5 palavras sem truncar palavras no meio.
 */

const STOP_PATTERNS: RegExp[] = [
  /^\s*\[.*?\]\s*[-–—:]*\s*/i,
  /^\s*\(.*?\)\s*[-–—:]*\s*/i,
  /^\s*registro de pre[çc]os para (eventual e futura |futura e eventual |eventual |futura )?(aquisi[çc][ãa]o de|contrata[çc][ãa]o de|fornecimento de|loca[çc][ãa]o de)?\s*/i,
  /^\s*contrata[çc][ãa]o de empresa especializada em\s*/i,
  /^\s*contrata[çc][ãa]o de empresa especializada para (a )?\s*/i,
  /^\s*contrata[çc][ãa]o de empresa especializada\s*/i,
  /^\s*contrata[çc][ãa]o de empresa para (a )?\s*/i,
  /^\s*contrata[çc][ãa]o de empresa\s*/i,
  /^\s*contrata[çc][ãa]o de pessoa jur[íi]dica para (a )?\s*/i,
  /^\s*contrata[çc][ãa]o de pessoa jur[íi]dica\s*/i,
  /^\s*contrata[çc][ãa]o de servi[çc]os? (t[ée]cnicos? )?(especializados? )?de\s*/i,
  /^\s*contrata[çc][ãa]o de\s*/i,
  /^\s*(para a? |na? )?presta[çc][ãa]o de servi[çc]os? (t[ée]cnicos? )?(especializados? )?(de|em|para)\s*/i,
  /^\s*(para a? |na? )?presta[çc][ãa]o de servi[çc]os? (de|em|para)?\s*/i,
  /^\s*presta[çc][ãa]o de servi[çc]os? (t[ée]cnicos? )?(especializados? )?(de|em|para)\s*/i,
  /^\s*presta[çc][ãa]o de servi[çc]os? (de|em|para)?\s*/i,
  /^\s*presta[çc][ãa]o de\s*/i,
  /^\s*servi[çc]os? (t[ée]cnicos? )?(especializados? )?de\s*/i,
  /^\s*aquisi[çc][ãa]o de (equipamentos? de|materiais? de|material de|solu[çc][ãa]o de|sistema de)?\s*/i,
  /^\s*aquisi[çc][ãa]o de\s*/i,
  /^\s*(a\s+)?presente\s+licita[çc][ãa]o\s+tem\s+(por|como)?\s*(objeto\s+)?(a\s+|o\s+)?/i,
  /^\s*licita[çc][ãa]o\s+para\s+(contrata[çc][ãa]o|aquisi[çc][ãa]o|fornecimento|registro)\s+(de\s+)?/i,
  /^\s*empresa\s+especializada\s+(em|na|para|no)\s+(a\s+)?(presta[çc][ãa]o|fornecimento|implanta[çc][ãa]o|execu[çc][ãa]o)?\s*(de\s+|continuada\s+de\s+)?/i,
  /^\s*empresa\s+especializada\s+/i,
  /^\s*empresa\s+para\s+/i,
  /^\s*contrata[çc][ãa]o\s+da\s+presta[çc][ãa]o\s+de\s+servi[çc]os\s+(de\s+)?/i,
  /^\s*(futura\s+e\s+eventual|eventual\s+e\s+futura|eventual|futura)\s+aquisi[çc][ãa]o\s+(de\s+)?/i,
  /^\s*(o\s+)?fornecimento\s+de\s+(equipamentos? de|materiais? de|material de|solu[çc][ãa]o de|sistema de)?\s*/i,
  /^\s*(o\s+)?fornecimento\s+de\s+/i,
  /^\s*(a\s+)?aquisi[çc][ãa]o\s+de\s+(equipamentos? de|materiais? de|material de|solu[çc][ãa]o de|sistema de)?\s*/i,
  /^\s*(a\s+)?aquisi[çc][ãa]o\s+de\s+/i,
  /^\s*aquisi[çc][ãa]o\s+via\s+sistema\s+de\s+registro\s+de\s+pre[çc]os\s+(para\s+)?/i,
  /^\s*loca[çc][ãa]o\s+de\s+(equipamentos? de|software de|sistema de)?\s*/i,
  /^\s*loca[çc][ãa]o\s+de\s+/i,
  /^\s*implanta[çc][ãa]o\s+(e\s+suporte\s+)?de\s+(sistema\s+de|solu[çc][ãa]o\s+de)?\s*/i,
  /^\s*constitui\s+objeto\s+(da|do|desta|deste)?\s*(presente\s+)?licita[çc][ãa]o\s*(a\s+|o\s+)?/i,
  /^\s*o\s+objeto\s+(da|do|desta|deste)?\s*(presente\s+)?licita[çc][ãa]o\s+[ée]\s*(a\s+|o\s+)?/i,
  /^\s*sele[çc][ãa]o\s+de\s+proposta\s+mais\s+vantajosa\s+para\s*/i,
  /^\s*[-–—:]+\s*/,
];

const STOPWORDS_CONECTIVAS = new Set([
  "de", "da", "do", "das", "dos",
  "para", "em", "com", "e", "a",
  "o", "por", "na", "no", "nas", "nos"
]);

export function sintetizarMiniResumo(
  objetoRaw?: string | null,
  tipoSistema?: string | null
): string {
  if (!objetoRaw || typeof objetoRaw !== "string") {
    if (tipoSistema && tipoSistema !== "OUTROS") {
      return `Sistema de ${tipoSistema.replace(/_/g, " ").toLowerCase()}`;
    }
    return "Licitação de Tecnologia";
  }

  // 1. Limpeza de colchetes de portais e caracteres soltos
  let texto = objetoRaw.replace(/\[.*?\]/g, "").trim();
  texto = texto.replace(/^[-–—:]+/, "").trim();

  // 2. Remoção em cascata dos bordões e stop-phrases burocráticas
  let modificado = true;
  let iteracoes = 0;
  while (modificado && iteracoes < 6) {
    modificado = false;
    iteracoes += 1;
    for (const pattern of STOP_PATTERNS) {
      const novo = texto.replace(pattern, "").trim();
      if (novo !== texto) {
        texto = novo.replace(/^[-–—:]+/, "").trim();
        modificado = true;
      }
    }
  }

  // 3. Remove conectivos soltos que tenham sobrado no início
  texto = texto.replace(/^(para a?|na?|de|do|da|em|com|para)\s+/i, "").trim();
  texto = texto.replace(/^[-–—:]+/, "").trim();

  // 4. Limpeza de siglas soltas entre parênteses no início ou fim
  texto = texto.replace(/^\([A-Z0-9\-_/ ]+\)\s*[-–—:]*/i, "");
  texto = texto.replace(/\([A-Z0-9\-_/ ]+\)/g, "");

  // 5. Normaliza pontuação e espaços múltiplos
  texto = texto.replace(/[(),;:.\-]+/g, " ");
  texto = texto.replace(/\s+/g, " ").trim();

  let palavras = texto.split(" ").filter(Boolean);

  // 6. Se sobrou muito pouco, enriquece com o tipo de sistema ou contexto
  if (palavras.length < 3) {
    if (tipoSistema && tipoSistema !== "OUTROS") {
      const tipoNome = tipoSistema.replace(/_/g, " ");
      palavras = `${texto} ${tipoNome}`.trim().split(" ").filter(Boolean);
    } else {
      palavras.push("em", "Tecnologia");
    }
  }

  // 7. Limita estritamente entre 3 e 5 palavras
  const maxPalavras = Math.min(5, palavras.length);
  const selecionadas = palavras.slice(0, maxPalavras);

  // 8. Se a última palavra for preposição/artigo pendente (ex: "para", "de"), remove para não ficar truncado
  while (
    selecionadas.length > 3 &&
    STOPWORDS_CONECTIVAS.has(selecionadas[selecionadas.length - 1].toLowerCase())
  ) {
    selecionadas.pop();
  }

  // 9. Capitalização limpa (Title Case suave)
  const partes = selecionadas;
  const formatado = partes
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && STOPWORDS_CONECTIVAS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");

  return formatado || "Licitação de Tecnologia";
}
