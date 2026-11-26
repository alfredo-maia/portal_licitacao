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
  composto: boolean;
}

/** Pontuação na Zona Núcleo (o que está sendo efetivamente comprado/contratado). */
const PESO_NUCLEO_COMPOSTO = 30;
const PESO_NUCLEO_SIMPLES = 12;

/** Pontuação na Zona Destinatário/Finalidade ("para atender a Secretaria/Hospital/Rede..."). */
const PESO_DESTINATARIO_COMPOSTO = 4;
const PESO_DESTINATARIO_SIMPLES = 1;

/** Nota mínima exigida para atribuir um segmento comercial; abaixo disso classifica como "OUTROS". */
export const SCORE_MINIMO_CLASSIFICACAO = 10;

/** Bônus aplicado à macro LEILOES quando o objeto é, de fato, um leilão. */
const BONUS_LEILAO = 50;
/** LEILOES só pontua quando o texto indica leilão (evita falso positivo em compras comuns). */
const GATILHO_LEILAO = /\b(leilao|leiloes|leiloeiro|leiloeira|leiloar)\b/;

/**
 * Neutraliza jargões licitatórios e expressões polissêmicas que poderiam disparar falsos positivos
 * (ex.: "sistema de registro de preços" ≠ TI, "na forma de processo eletrônico" ≠ TI,
 * "rede municipal de ensino" ≠ rede de dados).
 */
function higienizarJargoesPolissemicos(textoNorm: string): string {
  return textoNorm
    .replace(/\bsistema de registro de precos?\b/g, " ")
    .replace(/\bregistro de precos?\b/g, " ")
    .replace(/\b(?:pregao|concorrencia|dispensa)\s+eletronic[oa]\b/g, " ")
    .replace(/\bleilao\s+eletronico\b/g, "leilao ")
    .replace(
      /\b(?:na forma de|sob a forma de|via|mediante|atraves de|modalidade)\s+processo\s+eletronico\b/g,
      " ",
    )
    .replace(/\bprocesso\s+(?:licitatorio|administrativo)\s+n?\s*\d*\b/g, " ")
    .replace(/\bassinatura\s+d[aeo]\s+(?:ata|contrato|termo)\b/g, " ")
    .replace(/\brede\s+(?:municipal|estadual|publica|federal)\s+de\s+(?:ensino|saude|educacao|assistencia)\b/g, " ")
    .replace(/\brede\s+de\s+(?:atencao|saude|ensino|protecao\s+social)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove preâmbulos licitatórios burocráticos no início da frase para expor o núcleo real do objeto
 * antes de dividir entre Núcleo e Destinatário.
 */
function removerPreambuloLicitatorio(textoNorm: string): string {
  return textoNorm
    .replace(
      /^(?:constitui\s+objeto\s+d[aoe]s?\s+(?:presente\s+)?licitacao\s+|o\s+objeto\s+d[aoe]s?\s+licitacao\s+e\s+|selecao\s+de\s+proposta\s+mais\s+vantajosa\s+(?:visando|para)\s+|visando\s+a?\s*|objetivando\s+a?\s*)+/,
      "",
    )
    .replace(
      /^(?:futura\s+e\s+eventual\s+|eventual\s+e\s+futura\s+|eventual\s+|futura\s+)?(?:contratacao\s+de\s+empresa(?:\s+especializada|\s+qualificada|\s+de\s+engenharia)?\s+(?:para|na|em|visando)\s+|contratacao\s+de\s+pessoa\s+juridica\s+(?:para|na|em)\s+|contratacao\s+de\s+|aquisicao\s+(?:parcelada\s+|eventual\s+)?de\s+|fornecimento\s+(?:parcelado\s+|continuo\s+)?de\s+|prestacao\s+de\s+servicos?\s+(?:tecnicos?\s+)?(?:especializados?\s+)?(?:de|em|para)\s+)/,
      "",
    )
    .trim();
}

const MARCADOR_DESTINATARIO_REGEX =
  /\b(?:para\s+atender|visando\s+atender|em\s+atendimento\s+a|destinad[oa]s?\s+(?:a|ao|as|aos)\s+(?:atender|suprir|manutencao|demanda|secretaria|fundo|rede|unidades?|hospital|escolas?|cras|creas|familias|pacientes|alunos|frota)|a\s+fim\s+de\s+atender|em\s+prol\s+d[aoe]s?|no\s+ambito\s+d[aoe]s?|junto\s+a(?:o|s)?\s+(?:secretaria|fundo|hospital|cras|creas)|das?\s+secretarias?\s+municipais?)\b/;

/**
 * Divide o texto normalizado entre Zona Núcleo (o que se compra/contrata) e Zona Destinatário (quem vai usar).
 */
export function separarNucleoEDestinatario(textoNorm: string): {
  nucleo: string;
  destinatario: string;
} {
  const semPreambulo = removerPreambuloLicitatorio(textoNorm);
  const match = MARCADOR_DESTINATARIO_REGEX.exec(semPreambulo);
  if (!match || match.index < 6) {
    return { nucleo: semPreambulo, destinatario: "" };
  }
  return {
    nucleo: semPreambulo.slice(0, match.index).trim(),
    destinatario: semPreambulo.slice(match.index).trim(),
  };
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenMorfoPortuguesRegex(palavra: string): string {
  if (palavra.length < 4) {
    return palavra.length === 3
      ? `${escaparRegex(palavra)}s?`
      : escaparRegex(palavra);
  }

  // -ais / -al (ex.: material <-> materiais, hospital <-> hospitais, animal <-> animais)
  if (palavra.endsWith("ais") && palavra.length >= 5) {
    return `${escaparRegex(palavra.slice(0, -3))}(?:al|ais)`;
  }
  if (palavra.endsWith("al")) {
    return `${escaparRegex(palavra.slice(0, -2))}(?:al|ais)`;
  }

  // -eis / -el (ex.: combustivel <-> combustiveis, papel <-> papeis, movel <-> moveis)
  if (palavra.endsWith("eis") && palavra.length >= 5) {
    return `${escaparRegex(palavra.slice(0, -3))}(?:el|eis)`;
  }
  if (palavra.endsWith("el")) {
    return `${escaparRegex(palavra.slice(0, -2))}(?:el|eis)`;
  }

  // -oes / -aes / -ao (ex.: locacao <-> locacoes, portao <-> portoes, caminhao <-> caminhoes)
  if ((palavra.endsWith("oes") || palavra.endsWith("aes")) && palavra.length >= 5) {
    return `${escaparRegex(palavra.slice(0, -3))}(?:ao|oes|aes)`;
  }
  if (palavra.endsWith("ao")) {
    return `${escaparRegex(palavra.slice(0, -2))}(?:ao|oes|aes)`;
  }

  // -ns / -m (ex.: embalagem <-> embalagens, passagem <-> passagens)
  if (palavra.endsWith("ns") && palavra.length >= 5) {
    return `${escaparRegex(palavra.slice(0, -2))}(?:m|ns)`;
  }
  if (palavra.endsWith("m")) {
    return `${escaparRegex(palavra.slice(0, -1))}(?:m|ns)`;
  }

  // -res / -r e -ses / -s (ex.: computador <-> computadores, gas <-> gases)
  if (palavra.endsWith("res") && palavra.length >= 5) {
    return `${escaparRegex(palavra.slice(0, -2))}(?:es)?`;
  }
  if (palavra.endsWith("r")) {
    return `${escaparRegex(palavra)}(?:es)?`;
  }

  // Plural regular -s
  const stem = palavra.endsWith("s") ? palavra.slice(0, -1) : palavra;
  return `${escaparRegex(stem)}(?:s|es)?`;
}

function compilarTermo(palavraNorm: string): RegExp {
  const partes = palavraNorm.split(" ").map(tokenMorfoPortuguesRegex);
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
          composto: palavraNorm.includes(" "),
        });
      }
    }
  }
  termosCompilados = lista;
  return lista;
}

/**
 * Heurística de radicais avaliada EXCLUSIVAMENTE sobre a Zona Núcleo quando nenhum termo exato pontuou.
 * Não inclui palavras genéricas ("sistema", "rede", "social", "gestao").
 */
const FALLBACK_RADICAIS_NUCLEO: ReadonlyArray<{
  regex: RegExp;
  macro: MacroSegmento;
  subcategoria: string;
}> = [
  { regex: /\b(funerari|funeral|sepultament|velori|cremac|jazig)\w*/, macro: "FUNERARIA", subcategoria: "3601" },
  { regex: /\b(medicament|farmac|ambulator|odontolog|cirurg|vacin)\w*/, macro: "SAUDE", subcategoria: "2202" },
  { regex: /\b(veicul|automot|pneu|viatur)\w*/, macro: "TRANSPORTES_RODOVIARIOS", subcategoria: "1705" },
  { regex: /\b(construc|paviment|asfalt|drenag|terrapl)\w*/, macro: "ENGENHARIA_SERVICOS", subcategoria: "0101" },
  { regex: /\b(alimentici|merenda|refeic|hortifrut|panific)\w*/, macro: "ALIMENTACAO", subcategoria: "2501" },
  { regex: /\b(software|informatica|computador|notebook|saas|datacenter|ciberseguranc)\w*/, macro: "INFORMATICA", subcategoria: "3101" },
  { regex: /\b(vigilanc|portari|zeladori|dedetiz|desinsetiz)\w*/, macro: "PRESTACAO_DE_SERVICOS_MAO_DE_OBRA", subcategoria: "0301" },
];

/**
 * Motor Semântico Determinístico V3:
 * Classifica um edital exclusivamente pelo seu objeto/descrição oficial (sem `miniResumo` sintético),
 * ponderando Núcleo do Objeto (2.0x) vs. Destinatário/Finalidade (0.25x), aplicando travas anti-colisão
 * e retornando `macro: "OUTROS"` quando não houver aderência confiável (>= SCORE_MINIMO_CLASSIFICACAO).
 */
export function classificarLicitacaoPorTexto(
  objeto: string,
  descricaoComplementar?: string,
): ClassificacaoSegmento {
  const brutoNormalizado = normalizarTexto(
    `${objeto || ""} ${descricaoComplementar || ""}`,
  );

  if (!brutoNormalizado) {
    return { macro: "OUTROS", subcategorias: [], score: 0, termosCorrespondentes: [] };
  }

  const textoHigienizado = higienizarJargoesPolissemicos(brutoNormalizado);
  if (!textoHigienizado) {
    return { macro: "OUTROS", subcategorias: [], score: 0, termosCorrespondentes: [] };
  }

  const ehLeilao = GATILHO_LEILAO.test(textoHigienizado);
  const { nucleo, destinatario } = separarNucleoEDestinatario(textoHigienizado);

  // Travas contextuais específicas contra colisões conhecidas entre segmentos
  const nucleoTemObraOuReforma =
    /\b(?:obra|obras|reforma|ampliacao|construcao|pavimentacao|recapeamento|terraplanagem|drenagem|demolicao)\b/.test(
      nucleo,
    );
  const nucleoTemLicenciamentoAmbiental =
    /\b(?:licenciamento ambiental|licenca ambiental|estudo ambiental|estudos ambientais)\b/.test(
      nucleo,
    );

  const scores = new Map<
    MacroSegmento,
    {
      scoreTotal: number;
      subcategoriasNucleo: Set<string>;
      subcategoriasDestinatario: Set<string>;
      termos: Set<string>;
    }
  >();

  for (const termo of obterTermosCompilados()) {
    if (termo.macro === "LEILOES" && !ehLeilao) continue;

    // Trava anti-colisão: licenciamento ambiental nunca pontua software/TI
    if (nucleoTemLicenciamentoAmbiental && termo.macro === "INFORMATICA") {
      continue;
    }

    // Trava anti-colisão: se o núcleo é explicitamente obra/reforma de prédio (ex.: reforma de UBS/escola),
    // menções a UBS/hospital/escola não roubam a categoria de ENGENHARIA_SERVICOS para SAUDE/DIDATICO
    if (
      nucleoTemObraOuReforma &&
      (termo.macro === "SAUDE" || termo.macro === "DIDATICO") &&
      !/\b(?:equipamento hospitalar|material hospitalar|medicamento|livro didatico)\b/.test(nucleo)
    ) {
      continue;
    }

    const bateuNucleo = nucleo.length > 0 && termo.regex.test(nucleo);
    const bateuDestinatario =
      !bateuNucleo && destinatario.length > 0 && termo.regex.test(destinatario);

    if (!bateuNucleo && !bateuDestinatario) continue;

    let entry = scores.get(termo.macro);
    if (!entry) {
      entry = {
        scoreTotal: 0,
        subcategoriasNucleo: new Set(),
        subcategoriasDestinatario: new Set(),
        termos: new Set(),
      };
      scores.set(termo.macro, entry);
    }

    if (bateuNucleo) {
      entry.scoreTotal += termo.composto ? PESO_NUCLEO_COMPOSTO : PESO_NUCLEO_SIMPLES;
      entry.subcategoriasNucleo.add(termo.subcategoria);
    } else {
      entry.scoreTotal += termo.composto
        ? PESO_DESTINATARIO_COMPOSTO
        : PESO_DESTINATARIO_SIMPLES;
      entry.subcategoriasDestinatario.add(termo.subcategoria);
    }
    entry.termos.add(termo.termo);
  }

  if (ehLeilao) {
    const leilao = scores.get("LEILOES") ?? {
      scoreTotal: 0,
      subcategoriasNucleo: new Set<string>(),
      subcategoriasDestinatario: new Set<string>(),
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
      (data.scoreTotal === maiorScore &&
        melhor &&
        (data.subcategoriasNucleo.size > melhor.subcategoriasNucleo.size ||
          data.termos.size > melhor.termos.size))
    ) {
      maiorScore = data.scoreTotal;
      melhorMacro = macro;
    }
  }

  if (melhorMacro && maiorScore >= SCORE_MINIMO_CLASSIFICACAO) {
    const resultado = scores.get(melhorMacro)!;
    const subsFinais =
      resultado.subcategoriasNucleo.size > 0
        ? Array.from(resultado.subcategoriasNucleo).sort()
        : Array.from(resultado.subcategoriasDestinatario).sort();

    return {
      macro: melhorMacro,
      subcategorias: subsFinais,
      score: maiorScore,
      termosCorrespondentes: Array.from(resultado.termos),
    };
  }

  const fallback = FALLBACK_RADICAIS_NUCLEO.find((f) => f.regex.test(nucleo));
  if (fallback) {
    return {
      macro: fallback.macro,
      subcategorias: [fallback.subcategoria],
      score: SCORE_MINIMO_CLASSIFICACAO,
      termosCorrespondentes: [],
    };
  }

  return { macro: "OUTROS", subcategorias: [], score: 0, termosCorrespondentes: [] };
}
