import { z } from "zod";
import { round2 } from "./proposta-calculadora.schema";

export const PERIODO_MESES_OPCOES = [3, 6, 12, 24] as const;
export const LASTRO_LIMITE_OPCOES = [10, 20, 30, 40, 50] as const;

export function normalizarUnidadeMedida(raw?: string | null): string {
  const limpo = (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
  if (!limpo) return "UN";

  if (
    limpo.startsWith("QUILO") ||
    limpo.startsWith("KILO") ||
    limpo.startsWith("KILLO") ||
    limpo === "KG" ||
    limpo === "KGS"
  ) {
    return "KG";
  }

  if (
    limpo.startsWith("UNID") ||
    limpo === "UND" ||
    limpo === "UN" ||
    limpo.startsWith("PECA") ||
    limpo === "PC"
  ) {
    return "UN";
  }

  if (limpo.startsWith("PACOT") || limpo === "PCT" || limpo === "PAC") return "PCT";
  if (limpo.startsWith("CAIX") || limpo === "CX") return "CX";
  if (limpo === "METROQUADRADO" || limpo === "M2") return "M2";
  if (limpo === "METROCUBICO" || limpo === "M3") return "M3";
  if (limpo.startsWith("LITR") || limpo === "LT" || limpo === "L") return "L";
  if (limpo.startsWith("METR") || limpo === "M") return "M";
  if (limpo.startsWith("FRASC") || limpo === "FR") return "FR";
  if (limpo.startsWith("RESM")) return "RESMA";
  if (limpo.startsWith("LOTE")) return "LOTE";
  if (limpo.startsWith("SERVIC") || limpo === "SV") return "SV";
  if (limpo.startsWith("HOR") || limpo === "HR") return "HORA";
  if (limpo.startsWith("DIAR")) return "DIARIA";
  if (limpo.startsWith("MES")) return "MES";
  if (limpo.startsWith("GRAM") || limpo === "G" || limpo === "GR") return "G";
  return limpo.slice(0, 8);
}

export const buscaInteligenciaPrecosQuerySchema = z.object({
  q: z.string().trim().min(2, "Informe ao menos 2 caracteres para pesquisar"),
  uf: z.string().trim().default("TODOS"),
  ufs: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .default([])
    .transform((val) => {
      if (Array.isArray(val)) {
        return val.map((s) => s.trim().toUpperCase()).filter(Boolean);
      }
      if (typeof val === "string" && val.trim()) {
        return val
          .split(/[|,]/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
      }
      return [];
    }),
  modalidade: z.string().trim().default("TODOS"),
  periodoMeses: z.coerce.number().int().min(1).max(36).default(12),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

export type BuscaInteligenciaPrecosQuery = z.infer<
  typeof buscaInteligenciaPrecosQuerySchema
>;

export const homologacaoItemPublicoSchema = z.object({
  id: z.string(),
  catmat: z.string().optional(),
  itemNumero: z.number().int().nonnegative().optional(),
  itemDescricao: z.string(),
  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  informacaoComplementar: z.string().nullable().optional(),
  unidade: z.string().optional(),
  unidadeOriginalAta: z.string().nullable().optional(),
  unidadeOriginalAntesConversao: z.string().nullable().optional(),
  valorHomologadoOriginal: z.number().nullable().optional(),
  unidadeConvertida: z.string().nullable().optional(),
  fatorConversao: z.number().nullable().optional(),
  observacaoConversao: z.string().nullable().optional(),
  editadoPeloUsuario: z.boolean().optional(),
  quantidade: z.number().positive().optional(),
  orgaoNome: z.string(),
  orgaoCnpj: z.string().optional(),
  uf: z.string(),
  municipio: z.string().nullable().optional(),
  modalidade: z.string().optional(),
  numeroProcesso: z.string(),
  dataHomologacao: z.string(),
  dataHomologacaoIso: z.string().nullable().optional(),
  empresaVencedora: z.string(),
  cnpjVencedor: z.string(),
  porteFornecedor: z.string().nullable().optional(),
  tipoBeneficio: z.string().nullable().optional(),
  valorEstimadoUnitario: z.number().nonnegative(),
  valorHomologadoUnitario: z.number().positive(),
  valorTotalHomologado: z.number().nonnegative().optional(),
  descontoPercentual: z.number(),
  linkPncp: z.string().nullable().optional(),
  fonte: z.enum(["PNCP_OFICIAL", "BASE_REFERENCIA"]).optional(),
});

export type HomologacaoItemPublico = z.infer<typeof homologacaoItemPublicoSchema>;

export interface EstatisticasPrecosHomologados {
  totalAmostras: number;
  amostrasSaneadas: number;
  outliersDescartados: number;
  precoMedio: number;
  mediana: number;
  menorPreco: number;
  maiorPreco: number;
  descontoMedio: number;
  faixaSugeridaMin: number;
  faixaSugeridaMax: number;
}

export interface ResultadoBuscaInteligenciaPrecos {
  termoConsultado: string;
  ufFiltro: string;
  ufsFiltro: string[];
  modalidadeFiltro: string;
  periodoMeses: number;
  limiteSolicitado: number;
  fontePrincipal: "PNCP_OFICIAL" | "BASE_REFERENCIA";
  tempoMs: number;
  estatisticas: EstatisticasPrecosHomologados;
  itens: HomologacaoItemPublico[];
  unidadesDisponiveis: { unidade: string; contagem: number }[];
}

export const salvarItemPrecoInputSchema = z.object({
  nomeProduto: z.string().trim().min(2, "Informe o nome do produto/item"),
  termoPesquisado: z.string().trim().min(2),
  marcaReferencia: z.string().trim().optional().nullable().default(""),
  catmat: z.string().trim().optional().nullable().default(""),
  especificacaoResumo: z.string().trim().optional().nullable().default(""),
  unidadeReferencia: z.string().trim().default("UN"),
  ufFiltro: z.string().trim().default("TODOS"),
  modalidadeFiltro: z.string().trim().default("TODOS"),
  periodoMeses: z.coerce.number().int().min(1).max(36).default(12),
  observacoes: z.string().trim().optional().nullable().default(""),
  homologacoes: z.array(homologacaoItemPublicoSchema).min(1, "Selecione ao menos 1 homologação para salvar"),
});

export type SalvarItemPrecoInput = z.infer<typeof salvarItemPrecoInputSchema>;

export interface ItemPrecoSalvoRecord {
  id: string;
  tenantId: string;
  nomeProduto: string;
  termoPesquisado: string;
  marcaReferencia: string | null;
  catmat: string | null;
  especificacaoResumo: string | null;
  unidadeReferencia: string;
  ufFiltro: string;
  modalidadeFiltro: string;
  periodoMeses: number;
  quantidadeAmostras: number;
  precoMedio: number;
  mediana: number;
  menorPreco: number;
  maiorPreco: number;
  descontoMedio: number;
  faixaSugeridaMin: number;
  faixaSugeridaMax: number;
  observacoes: string | null;
  homologacoesJson: HomologacaoItemPublico[];
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Calcula Mediana, Média Saneada (descartando outliers extremos < 30% ou > 250% da mediana
 * quando houver >= 4 amostras, evitando que acessórios puxem o preço de um equipamento para baixo)
 * e a Faixa de Lance Competitivo Sugerida.
 */
export function calcularEstatisticasPrecosHomologados(
  itens: Pick<HomologacaoItemPublico, "valorHomologadoUnitario" | "descontoPercentual">[],
): EstatisticasPrecosHomologados {
  const validos = itens.filter((i) => i.valorHomologadoUnitario > 0);
  if (validos.length === 0) {
    return {
      totalAmostras: 0,
      amostrasSaneadas: 0,
      outliersDescartados: 0,
      precoMedio: 0,
      mediana: 0,
      menorPreco: 0,
      maiorPreco: 0,
      descontoMedio: 0,
      faixaSugeridaMin: 0,
      faixaSugeridaMax: 0,
    };
  }

  const ordenados = [...validos].sort(
    (a, b) => a.valorHomologadoUnitario - b.valorHomologadoUnitario,
  );

  const calcMediana = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0
      ? arr[mid]!
      : round2((arr[mid - 1]! + arr[mid]!) / 2);
  };

  const medianaBruta = calcMediana(ordenados.map((x) => x.valorHomologadoUnitario));

  let saneados = ordenados;
  if (ordenados.length >= 4 && medianaBruta > 0) {
    const filtrados = ordenados.filter(
      (x) =>
        x.valorHomologadoUnitario >= medianaBruta * 0.3 &&
        x.valorHomologadoUnitario <= medianaBruta * 2.5,
    );
    if (filtrados.length >= 2) {
      saneados = filtrados;
    }
  }

  const valores = saneados.map((x) => x.valorHomologadoUnitario);
  const mediana = calcMediana(valores);
  const precoMedio = round2(
    valores.reduce((acc, v) => acc + v, 0) / valores.length,
  );
  const menorPreco = round2(valores[0]!);
  const maiorPreco = round2(valores[valores.length - 1]!);

  const descontosValidos = saneados.map((x) => Math.max(0, x.descontoPercentual || 0));
  const descontoMedio = round2(
    descontosValidos.reduce((acc, d) => acc + d, 0) / descontosValidos.length,
  );

  // Quartil inferior (Q1) ou 98% do menor preço saneado até a menor entre mediana e média
  const idxQ1 = Math.floor((valores.length - 1) * 0.25);
  const q1 = valores[idxQ1] ?? menorPreco;
  const faixaSugeridaMin = round2(valores.length >= 3 ? q1 : menorPreco * 0.98);
  const faixaSugeridaMax = round2(Math.max(faixaSugeridaMin, Math.min(precoMedio, mediana)));

  return {
    totalAmostras: validos.length,
    amostrasSaneadas: saneados.length,
    outliersDescartados: validos.length - saneados.length,
    precoMedio,
    mediana,
    menorPreco,
    maiorPreco,
    descontoMedio,
    faixaSugeridaMin,
    faixaSugeridaMax,
  };
}

