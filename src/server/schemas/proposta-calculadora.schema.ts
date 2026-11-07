import { z } from "zod";

export const UNIDADES_ITEM_OPCOES = [
  "UN",
  "SV",
  "CX",
  "KG",
  "M",
  "M2",
  "M3",
  "MES",
  "HORA",
  "DIARIA",
  "LOTE",
  "PAR",
  "PCT",
] as const;

export type UnidadeItemLicitacao = (typeof UNIDADES_ITEM_OPCOES)[number];

export const itemCalculadoraInputSchema = z.object({
  id: z.string().default(() => `item_${Math.random().toString(36).substring(2, 9)}`),
  numeroItem: z.string().trim().min(1, "Número do item é obrigatório"),
  descricao: z.string().trim().min(2, "Descrição do item é obrigatória"),
  marcaModelo: z.string().trim().optional().nullable().default(""),
  unidade: z.string().trim().default("UN"),
  quantidade: z.number().positive("Quantidade deve ser maior que zero").default(1),
  valorEstimadoUnitario: z.number().nonnegative().optional().nullable().default(null),
  custoUnitario: z.number().nonnegative("Custo unitário não pode ser negativo").default(0),
  freteUnitario: z.number().nonnegative("Frete não pode ser negativo").default(0),
  outrosCustosUnitario: z.number().nonnegative("Outros custos não podem ser negativos").default(0),
  impostosPercentual: z.number().min(0).max(80).default(12),
  bdiPercentual: z.number().min(0).max(100).default(25),
  margemMinimaPercentual: z.number().min(0).max(80).default(10),
  margemAlvoPercentual: z.number().min(0).max(100).default(20),
});

export type ItemCalculadoraInput = z.infer<typeof itemCalculadoraInputSchema>;

export interface ItemCalculadoProposta extends ItemCalculadoraInput {
  custoTotalUnitario: number;
  custoComBdiUnitario: number;
  pisoUnitarioSeguro: number;
  pisoTotalSeguro: number;
  propostaUnitaria: number;
  propostaTotal: number;
  lucroLiquidoPiso: number;
  lucroLiquidoProposta: number;
  alertaInexequivel: boolean;
  motivoAlerta?: string;
}

export const configuracaoPropostaSchema = z.object({
  modoEmissao: z.enum(["ITENS_CALCULADORA", "VALOR_GLOBAL"]).default("ITENS_CALCULADORA"),
  tipoTabelaProposta: z.enum(["PROPOSTA_INICIAL", "PROPOSTA_READEQUADA"]).default("PROPOSTA_INICIAL"),
  tipoAgrupamentoGlobal: z.enum(["LOTE_01", "PRECO_GLOBAL"]).default("LOTE_01"),
  tituloGlobalCustomizado: z.string().trim().optional().default("Lote 01"),
  descricaoGlobal: z.string().trim().optional().default(""),
  valorGlobalManual: z.number().nonnegative().optional().nullable().default(null),
  validadeDias: z.number().int().positive().default(60),
  prazoEntrega: z.string().trim().default("15 (quinze) dias úteis"),
  condicoesPagamento: z.string().trim().default("30 (trinta) dias após a liquidação da Nota Fiscal"),
  garantiaObservacoes: z.string().trim().optional().default("Garantia legal de 90 dias acrescida da garantia contratual do fabricante."),
  dadosBancariosPersonalizados: z
    .object({
      bancoNome: z.string().trim().optional().nullable(),
      agencia: z.string().trim().optional().nullable(),
      contaCorrente: z.string().trim().optional().nullable(),
      chavePix: z.string().trim().optional().nullable(),
    })
    .optional()
    .nullable()
    .default(null),
  dataEmissao: z.string().optional().default(() => new Date().toISOString().split("T")[0]),
});

export type ConfiguracaoPropostaInput = z.infer<typeof configuracaoPropostaSchema>;

export const calculadoraDadosSchema = z.object({
  parametrosPadrao: z.object({
    impostosPercentual: z.number().min(0).max(80).default(12),
    bdiPercentual: z.number().min(0).max(100).default(25),
    margemMinimaPercentual: z.number().min(0).max(80).default(10),
    margemAlvoPercentual: z.number().min(0).max(100).default(20),
  }).default({
    impostosPercentual: 12,
    bdiPercentual: 25,
    margemMinimaPercentual: 10,
    margemAlvoPercentual: 20,
  }),
  itens: z.array(itemCalculadoraInputSchema).default([]),
  propostaConfig: configuracaoPropostaSchema.default({}),
  atualizadoEm: z.string().optional().default(() => new Date().toISOString()),
});

export type CalculadoraDados = z.infer<typeof calculadoraDadosSchema>;

export interface ConsolidadoCalculadoraProposta {
  itens: ItemCalculadoProposta[];
  totalItens: number;
  custoTotalGeral: number;
  pisoTotalGeral: number;
  propostaTotalGeral: number;
  lucroLiquidoEstimadoProposta: number;
  margemMediaLiquida: number;
  temAlertaInexequibilidade: boolean;
  propostaConfig: ConfiguracaoPropostaInput;
}

export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calcularItemProposta(input: ItemCalculadoraInput): ItemCalculadoProposta {
  const custoTotalUnitario = round2(
    input.custoUnitario + input.freteUnitario + input.outrosCustosUnitario,
  );
  const custoComBdiUnitario = round2(
    custoTotalUnitario * (1 + input.bdiPercentual / 100),
  );

  // Divisor para cálculo por dentro (Markup sobre o faturamento)
  // Preço = CustoComBDI / (1 - (Impostos% + Margem%) / 100)
  const somaPiso = (input.impostosPercentual + input.margemMinimaPercentual) / 100;
  const divisorPiso = Math.max(0.05, 1 - somaPiso);
  const pisoUnitarioSeguro = round2(custoComBdiUnitario / divisorPiso);
  const pisoTotalSeguro = round2(pisoUnitarioSeguro * input.quantidade);

  const somaAlvo = (input.impostosPercentual + input.margemAlvoPercentual) / 100;
  const divisorAlvo = Math.max(0.05, 1 - somaAlvo);
  const propostaUnitaria = round2(custoComBdiUnitario / divisorAlvo);
  const propostaTotal = round2(propostaUnitaria * input.quantidade);

  // Lucro líquido em R$ = Faturamento Liquefeito de Impostos - Custos Operacionais
  const lucroLiquidoPiso = round2(
    pisoTotalSeguro * (1 - input.impostosPercentual / 100) -
      custoComBdiUnitario * input.quantidade,
  );
  const lucroLiquidoProposta = round2(
    propostaTotal * (1 - input.impostosPercentual / 100) -
      custoComBdiUnitario * input.quantidade,
  );

  // Alerta de Inexequibilidade (Art. 59 §4º da Lei 14.133/2021)
  let alertaInexequivel = false;
  let motivoAlerta: string | undefined;

  if (input.valorEstimadoUnitario && input.valorEstimadoUnitario > 0) {
    if (pisoUnitarioSeguro < input.valorEstimadoUnitario * 0.5) {
      alertaInexequivel = true;
      motivoAlerta =
        "Piso com desconto superior a 50% do valor de referência (Art. 59, §4º da Lei 14.133/2021). Sujeito à comprovação de exequibilidade.";
    } else if (pisoUnitarioSeguro < input.valorEstimadoUnitario * 0.75) {
      motivoAlerta =
        "Desconto expressivo superior a 25% frente ao valor estimado do edital.";
    }
  }

  return {
    ...input,
    custoTotalUnitario,
    custoComBdiUnitario,
    pisoUnitarioSeguro,
    pisoTotalSeguro,
    propostaUnitaria,
    propostaTotal,
    lucroLiquidoPiso,
    lucroLiquidoProposta,
    alertaInexequivel,
    motivoAlerta,
  };
}

export function consolidarCalculadoraProposta(
  itensRaw: ItemCalculadoraInput[],
  configRaw?: Partial<ConfiguracaoPropostaInput>,
): ConsolidadoCalculadoraProposta {
  const itensCalculados = itensRaw.map(calcularItemProposta);

  const totalItens = itensCalculados.length;
  let custoTotalGeral = 0;
  let pisoTotalGeral = 0;
  let propostaTotalGeral = 0;
  let lucroLiquidoEstimadoProposta = 0;
  let temAlertaInexequibilidade = false;

  for (const it of itensCalculados) {
    custoTotalGeral += round2(it.custoTotalUnitario * it.quantidade);
    pisoTotalGeral += it.pisoTotalSeguro;
    propostaTotalGeral += it.propostaTotal;
    lucroLiquidoEstimadoProposta += it.lucroLiquidoProposta;
    if (it.alertaInexequivel) {
      temAlertaInexequibilidade = true;
    }
  }

  custoTotalGeral = round2(custoTotalGeral);
  pisoTotalGeral = round2(pisoTotalGeral);
  propostaTotalGeral = round2(propostaTotalGeral);
  lucroLiquidoEstimadoProposta = round2(lucroLiquidoEstimadoProposta);

  const margemMediaLiquida =
    propostaTotalGeral > 0
      ? round2((lucroLiquidoEstimadoProposta / propostaTotalGeral) * 100)
      : 0;

  const parsedConfig = configuracaoPropostaSchema.parse(configRaw || {});

  return {
    itens: itensCalculados,
    totalItens,
    custoTotalGeral,
    pisoTotalGeral,
    propostaTotalGeral,
    lucroLiquidoEstimadoProposta,
    margemMediaLiquida,
    temAlertaInexequibilidade,
    propostaConfig: parsedConfig,
  };
}

export function formatarMoedaBrl(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
