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

/**
 * Dicionário oficial de textos explicativos (Tooltips / Hover) com exemplos práticos
 * para todos os campos da Calculadora de Formação de Preços.
 */
export const CALCULADORA_TOOLTIPS = {
  impostosPercentual:
    "Alíquota efetiva de tributos descontados diretamente sobre o valor da Nota Fiscal emitida (Ex: DAS do Simples Nacional, ou soma de ISS/ICMS + PIS + COFINS + IRPJ/CSLL). Exemplo: 8,5% para empresa no Simples Nacional Anexo I.",
  bdiPercentual:
    "Benefícios e Despesas Indiretas (BDI) aplicados sobre o custo direto para cobrir os gastos fixos e operacionais da empresa: aluguel, energia elétrica, água, internet, contabilidade, equipe administrativa, seguros, garantias contratuais e riscos operacionais. (Obs: Impostos da NF e Margem de Lucro já possuem campos próprios ao lado). Exemplo: Se aluguel, luz, água e administrativo representam 15% da operação, sobre um custo direto de R$ 100 o sistema soma R$ 15 de rateio indireto.",
  margemMinimaPercentual:
    "Percentual mínimo de lucro líquido livre (já descontados custos diretos, BDI/despesas fixas e impostos) que sua empresa aceita ganhar no limite da disputa. Define o Piso Seguro inviolável (trava do robô). Exemplo: 10% garante lucro líquido mínimo de R$ 100 a cada R$ 1.000 faturados.",
  margemAlvoPercentual:
    "Percentual de lucro líquido desejado para cadastrar a Proposta Inicial antes da abertura dos lances, garantindo fôlego de negociação frente aos concorrentes. Exemplo: 20%.",
  numeroItem:
    "Número do item ou lote exatamente como identificado no Termo de Referência / Edital. Exemplo: 01, 02 ou Lote 01.",
  descricao:
    "Descrição técnica resumida ou integral do produto ou serviço licitado que sairá impressa na planilha da Proposta Comercial. Exemplo: Notebook Corporativo Core i7 16GB RAM SSD 512GB.",
  marcaModelo:
    "Marca e modelo ofertados pela sua empresa (exigido na maioria dos pregões de materiais/equipamentos). Exemplo: Dell Latitude 3440.",
  unidade:
    "Unidade de fornecimento exigida no edital (UN = Unidade, SV = Serviço, CX = Caixa, MES = Mensalidade, KG = Quilograma). Exemplo: UN.",
  quantidade:
    "Quantidade total demandada no edital para este item. Multiplica automaticamente os custos, o Piso Seguro e o total da Proposta. Exemplo: 10 unidades.",
  valorEstimadoUnitario:
    "Valor unitário máximo ou de referência estimado pelo órgão no edital. Serve para medir seu desconto, avisar se sua proposta está acima do teto e alertar risco de inexequibilidade (< 50% — Art. 59, §4º da Lei 14.133/2021). Exemplo: R$ 5.000,00.",
  custoUnitario:
    "Preço pago ao fornecedor/distribuidor ou custo direto de execução de 1 unidade do objeto, sem contar o frete. Exemplo: R$ 2.500,00 na cotação de fábrica.",
  freteUnitario:
    "Custo logístico de transporte/entrega (CIF) até o endereço do órgão dividido pela quantidade do item. Exemplo: Frete total de R$ 500 para 10 unidades = R$ 50,00 por unidade.",
  outrosCustosUnitario:
    "Despesas diretas extras por unidade exigidas pelo edital: instalação, montagem, envio de amostra, certificação/laudo, DIFAL ou embalagem especial. Exemplo: R$ 35,00 de montagem por unidade.",
} as const;

export const itemCalculadoraInputSchema = z.object({
  id: z.string().default(() => `item_${Math.random().toString(36).substring(2, 9)}`),
  numeroItem: z.string().trim().min(1, "Número do item é obrigatório"),
  descricao: z.string().trim().min(2, "Descrição do item é obrigatória"),
  marcaModelo: z.string().trim().nullable().optional(),
  unidade: z.string().trim().default("UN"),
  quantidade: z.number().positive("Quantidade deve ser maior que zero").default(1),
  valorEstimadoUnitario: z.number().nonnegative().nullable().optional(),
  custoUnitario: z.number().nonnegative("Custo unitário não pode ser negativo").default(0),
  freteUnitario: z.number().nonnegative("Frete não pode ser negativo").default(0),
  outrosCustosUnitario: z.number().nonnegative("Outros custos não podem ser negativos").default(0),
  impostosPercentual: z.number().min(0).max(80).default(12),
  bdiPercentual: z.number().min(0).max(100).default(25),
  margemMinimaPercentual: z.number().min(0).max(80).default(10),
  margemAlvoPercentual: z.number().min(0).max(100).default(20),
  valorUnitarioArrematado: z.number().nonnegative().nullable().optional(),
});

export type ItemCalculadoraInput = z.infer<typeof itemCalculadoraInputSchema>;

export interface ItemCalculadoProposta extends ItemCalculadoraInput {
  custoTotalUnitario: number;
  custoComBdiUnitario: number;
  pisoUnitarioSeguro: number;
  pisoTotalSeguro: number;
  propostaUnitaria: number;
  propostaTotal: number;
  valorUnitarioReadequado: number;
  valorTotalReadequado: number;
  lucroLiquidoPiso: number;
  lucroLiquidoProposta: number;
  alertaInexequivel: boolean;
  alertaAcimaEstimado: boolean;
  alertaMargemInvertida: boolean;
  alertaSomaPercentualInvalida: boolean;
  motivoAlerta?: string;
  avisosValidacao: string[];
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

export const PORTAIS_DISPUTA_OPCOES = [
  "Compras.gov.br",
  "Portal de Compras Públicas",
  "Licitanet",
  "BNC (Bolsa Nacional de Compras)",
  "BLL Compras",
  "BBMNet",
  "BEC-SP",
  "Licitações-e (Banco do Brasil)",
  "Outro Portal",
] as const;

export type PortalDisputaNome = (typeof PORTAIS_DISPUTA_OPCOES)[number];

export const TIPO_DECREMENTO_OPCOES = ["CENTAVOS_1", "FIXO_REAIS", "PERCENTUAL"] as const;
export type TipoDecremento = (typeof TIPO_DECREMENTO_OPCOES)[number];

export const TATICA_DISPUTA_OPCOES = ["IMEDIATO", "SNIPER", "MONITORAR"] as const;
export type TaticaDisputa = (typeof TATICA_DISPUTA_OPCOES)[number];

export const STATUS_DISPUTA_ITEM_OPCOES = [
  "PRONTO",
  "EM_DISPUTA",
  "PAUSADO",
  "PISO_ATINGIDO",
  "VENCEDOR",
  "FINALIZADO",
] as const;
export type StatusDisputaItem = (typeof STATUS_DISPUTA_ITEM_OPCOES)[number];

export const disputaItemRegraSchema = z.object({
  itemId: z.string(), // ID correspondente ao item da calculadora
  numeroItem: z.string(),
  descricao: z.string(),
  unidade: z.string().default("UN"),
  quantidade: z.number().default(1),
  ativoNoRobo: z.boolean().default(true),
  pisoUnitarioSeguro: z.number().nonnegative().default(0),
  propostaUnitaria: z.number().nonnegative().default(0),
  tipoDecremento: z.enum(TIPO_DECREMENTO_OPCOES).default("CENTAVOS_1"),
  valorDecremento: z.number().nonnegative().default(0.01), // R$ 0,01 ou valor fixo ou %
  tatica: z.enum(TATICA_DISPUTA_OPCOES).default("IMEDIATO"),
  statusItem: z.enum(STATUS_DISPUTA_ITEM_OPCOES).default("PRONTO"),
  melhorLanceSala: z.number().nonnegative().nullable().optional().default(null),
  meuUltimoLance: z.number().nonnegative().nullable().optional().default(null),
  minhaPosicao: z.number().int().positive().nullable().optional().default(null),
  observacoes: z.string().optional().default(""),
});

export type DisputaItemRegra = z.infer<typeof disputaItemRegraSchema>;

export const disputaConfigSchema = z.object({
  portal: z.string().default("Compras.gov.br"),
  identificadorSala: z.string().optional().default(""),
  statusGeral: z.enum(["CONFIGURADA", "EM_DISPUTA", "PAUSADA", "CONCLUIDA"]).default("CONFIGURADA"),
  pausaEmergencia: z.boolean().default(false),
  tempoRespostaSegundos: z.number().min(1).max(60).default(3),
  segundosFinaisSniper: z.number().min(2).max(120).default(10),
  regrasItens: z.array(disputaItemRegraSchema).default([]),
  atualizadoEm: z.string().optional().default(() => new Date().toISOString()),
});

export type DisputaConfig = z.infer<typeof disputaConfigSchema>;

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
  disputaConfig: disputaConfigSchema.optional().default({}),
  atualizadoEm: z.string().optional().default(() => new Date().toISOString()),
});

export type CalculadoraDados = z.infer<typeof calculadoraDadosSchema>;

export interface ConsolidadoCalculadoraProposta {
  itens: ItemCalculadoProposta[];
  totalItens: number;
  custoTotalGeral: number;
  custoComBdiTotalGeral: number;
  pisoTotalGeral: number;
  propostaTotalGeral: number;
  readequadaTotalGeral: number;
  lucroLiquidoEstimadoPiso: number;
  lucroLiquidoEstimadoProposta: number;
  margemMediaLiquida: number;
  temAlertaInexequibilidade: boolean;
  propostaConfig: ConfiguracaoPropostaInput;
}

export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calcularItemProposta(input: ItemCalculadoraInput): ItemCalculadoProposta {
  const quantidadeSegura = input.quantidade > 0 ? input.quantidade : 1;
  const custoTotalUnitario = round2(
    Math.max(0, input.custoUnitario) +
      Math.max(0, input.freteUnitario) +
      Math.max(0, input.outrosCustosUnitario),
  );
  const custoComBdiUnitario = round2(
    custoTotalUnitario * (1 + Math.max(0, input.bdiPercentual) / 100),
  );

  const avisosValidacao: string[] = [];
  const somaPercentualPiso = input.impostosPercentual + input.margemMinimaPercentual;
  const somaPercentualAlvo = input.impostosPercentual + input.margemAlvoPercentual;

  const alertaSomaPercentualInvalida =
    somaPercentualPiso >= 95 || somaPercentualAlvo >= 95;
  if (alertaSomaPercentualInvalida) {
    avisosValidacao.push(
      "A soma de Impostos (%) + Margem de Lucro (%) não deve atingir ou ultrapassar 95% do faturamento.",
    );
  }

  const alertaMargemInvertida =
    input.margemMinimaPercentual > input.margemAlvoPercentual;
  if (alertaMargemInvertida) {
    avisosValidacao.push(
      "A Margem Mínima (Piso) está maior que a Margem Alvo da Proposta Inicial.",
    );
  }

  // Divisor para cálculo por dentro (Markup sobre o faturamento)
  // Preço = CustoComBDI / (1 - (Impostos% + Margem%) / 100)
  const somaPiso = somaPercentualPiso / 100;
  const divisorPiso = Math.max(0.05, 1 - somaPiso);
  const pisoUnitarioSeguro = round2(custoComBdiUnitario / divisorPiso);
  const pisoTotalSeguro = round2(pisoUnitarioSeguro * quantidadeSegura);

  const somaAlvo = somaPercentualAlvo / 100;
  const divisorAlvo = Math.max(0.05, 1 - somaAlvo);
  const propostaUnitaria = round2(custoComBdiUnitario / divisorAlvo);
  const propostaTotal = round2(propostaUnitaria * quantidadeSegura);

  // Valor Readequado: prioriza o valor arrematado informado pelo cliente; senão usa o Piso Seguro
  const valorUnitarioReadequado =
    input.valorUnitarioArrematado != null && input.valorUnitarioArrematado > 0
      ? round2(input.valorUnitarioArrematado)
      : pisoUnitarioSeguro;
  const valorTotalReadequado = round2(valorUnitarioReadequado * quantidadeSegura);

  // Lucro líquido em R$ = Faturamento Líquido de Impostos - Custos Operacionais (Direto + BDI)
  const lucroLiquidoPiso = round2(
    pisoTotalSeguro * (1 - input.impostosPercentual / 100) -
      custoComBdiUnitario * quantidadeSegura,
  );
  const lucroLiquidoProposta = round2(
    propostaTotal * (1 - input.impostosPercentual / 100) -
      custoComBdiUnitario * quantidadeSegura,
  );

  // Alerta de Inexequibilidade (Art. 59 §4º da Lei 14.133/2021) e Teto do Edital
  let alertaInexequivel = false;
  let alertaAcimaEstimado = false;
  let motivoAlerta: string | undefined;

  if (input.valorEstimadoUnitario && input.valorEstimadoUnitario > 0) {
    if (pisoUnitarioSeguro < input.valorEstimadoUnitario * 0.5) {
      alertaInexequivel = true;
      motivoAlerta =
        "Piso com desconto superior a 50% do valor de referência (Art. 59, §4º da Lei 14.133/2021). Sujeito à comprovação de exequibilidade.";
    } else if (propostaUnitaria > input.valorEstimadoUnitario) {
      alertaAcimaEstimado = true;
      motivoAlerta =
        "Proposta Inicial acima do Valor Estimado do Edital. Atenção ao risco de desclassificação se o orçamento for teto máximo.";
    } else if (pisoUnitarioSeguro < input.valorEstimadoUnitario * 0.75) {
      motivoAlerta =
        "Desconto expressivo superior a 25% frente ao valor estimado do edital.";
    }
  }

  if (!motivoAlerta && avisosValidacao.length > 0) {
    motivoAlerta = avisosValidacao[0];
  }

  return {
    ...input,
    quantidade: quantidadeSegura,
    custoTotalUnitario,
    custoComBdiUnitario,
    pisoUnitarioSeguro,
    pisoTotalSeguro,
    propostaUnitaria,
    propostaTotal,
    valorUnitarioReadequado,
    valorTotalReadequado,
    lucroLiquidoPiso,
    lucroLiquidoProposta,
    alertaInexequivel,
    alertaAcimaEstimado,
    alertaMargemInvertida,
    alertaSomaPercentualInvalida,
    motivoAlerta,
    avisosValidacao,
  };
}

export function consolidarCalculadoraProposta(
  itensRaw: ItemCalculadoraInput[],
  configRaw?: Partial<ConfiguracaoPropostaInput>,
): ConsolidadoCalculadoraProposta {
  const itensCalculados = itensRaw.map(calcularItemProposta);

  const totalItens = itensCalculados.length;
  let custoTotalGeral = 0;
  let custoComBdiTotalGeral = 0;
  let pisoTotalGeral = 0;
  let propostaTotalGeral = 0;
  let readequadaTotalGeral = 0;
  let lucroLiquidoEstimadoPiso = 0;
  let lucroLiquidoEstimadoProposta = 0;
  let temAlertaInexequibilidade = false;

  for (const it of itensCalculados) {
    custoTotalGeral += round2(it.custoTotalUnitario * it.quantidade);
    custoComBdiTotalGeral += round2(it.custoComBdiUnitario * it.quantidade);
    pisoTotalGeral += it.pisoTotalSeguro;
    propostaTotalGeral += it.propostaTotal;
    readequadaTotalGeral += it.valorTotalReadequado;
    lucroLiquidoEstimadoPiso += it.lucroLiquidoPiso;
    lucroLiquidoEstimadoProposta += it.lucroLiquidoProposta;
    if (it.alertaInexequivel) {
      temAlertaInexequibilidade = true;
    }
  }

  custoTotalGeral = round2(custoTotalGeral);
  custoComBdiTotalGeral = round2(custoComBdiTotalGeral);
  pisoTotalGeral = round2(pisoTotalGeral);
  propostaTotalGeral = round2(propostaTotalGeral);
  readequadaTotalGeral = round2(readequadaTotalGeral);
  lucroLiquidoEstimadoPiso = round2(lucroLiquidoEstimadoPiso);
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
    custoComBdiTotalGeral,
    pisoTotalGeral,
    propostaTotalGeral,
    readequadaTotalGeral,
    lucroLiquidoEstimadoPiso,
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
