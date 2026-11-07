import { z } from "zod";
import { round2 } from "./proposta-calculadora.schema";

export const PERIODO_MESES_OPCOES = [3, 6, 12, 24] as const;
export const LASTRO_LIMITE_OPCOES = [10, 20, 30] as const;

export const buscaInteligenciaPrecosQuerySchema = z.object({
  q: z.string().trim().min(2, "Informe ao menos 2 caracteres para pesquisar"),
  uf: z.string().trim().default("TODOS"),
  modalidade: z.string().trim().default("TODOS"),
  periodoMeses: z.coerce.number().int().min(1).max(36).default(12),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

export type BuscaInteligenciaPrecosQuery = z.infer<
  typeof buscaInteligenciaPrecosQuerySchema
>;

export const homologacaoItemPublicoSchema = z.object({
  id: z.string(),
  catmat: z.string().default("N/I"),
  itemNumero: z.number().int().nonnegative().default(1),
  itemDescricao: z.string(),
  marca: z.string().nullable().optional().default(null),
  modelo: z.string().nullable().optional().default(null),
  informacaoComplementar: z.string().nullable().optional().default(null),
  unidade: z.string().default("UN"),
  quantidade: z.number().positive().default(1),
  orgaoNome: z.string(),
  orgaoCnpj: z.string().default(""),
  uf: z.string(),
  municipio: z.string().nullable().optional().default(null),
  modalidade: z.string().default("Pregão Eletrônico"),
  numeroProcesso: z.string(),
  dataHomologacao: z.string(),
  empresaVencedora: z.string(),
  cnpjVencedor: z.string(),
  porteFornecedor: z.string().nullable().optional().default(null),
  tipoBeneficio: z.string().nullable().optional().default(null),
  valorEstimadoUnitario: z.number().nonnegative(),
  valorHomologadoUnitario: z.number().positive(),
  valorTotalHomologado: z.number().nonnegative().default(0),
  descontoPercentual: z.number(),
  linkPncp: z.string().nullable().optional().default(null),
  fonte: z.enum(["PNCP_OFICIAL", "BASE_REFERENCIA"]).default("PNCP_OFICIAL"),
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
  modalidadeFiltro: string;
  periodoMeses: number;
  limiteSolicitado: number;
  fontePrincipal: "PNCP_OFICIAL" | "BASE_REFERENCIA";
  tempoMs: number;
  estatisticas: EstatisticasPrecosHomologados;
  itens: HomologacaoItemPublico[];
}

export const salvarItemPrecoInputSchema = z.object({
  nomeProduto: z.string().trim().min(2, "Informe o nome do produto/item"),
  termoPesquisado: z.string().trim().min(2),
  marcaReferencia: z.string().trim().optional().nullable().default(""),
  catmat: z.string().trim().optional().nullable().default(""),
  especificacaoResumo: z.string().trim().optional().nullable().default(""),
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
