import { z } from "zod";
import { APP_CONFIG } from "@/config/brand";
import { calcularPrazoFatalImpugnacao } from "@/server/schemas/impugnacao.schema";

export const planoAssinaturaArsenalSchema = z.enum([
  "BASICO",
  "PRO",
  "ENTERPRISE",
]);
export type PlanoAssinaturaArsenal = z.infer<
  typeof planoAssinaturaArsenalSchema
>;

export const arsenalFeatureSchema = z.enum([
  "CALCULADORA_BDI",
  "PROPOSTA_PDF",
  "MONITOR_CHAT_PREGOEIRO",
  "MINUTA_IMPUGNACAO_IA",
  "INTELIGENCIA_PRECOS",
  "RELATORIO_EXECUTIVO_MENSAL",
]);
export type ArsenalFeature = z.infer<typeof arsenalFeatureSchema>;

export const ARSENAL_PLAN_MATRIX: Readonly<
  Record<ArsenalFeature, readonly PlanoAssinaturaArsenal[]>
> = {
  CALCULADORA_BDI: ["BASICO", "PRO", "ENTERPRISE"],
  PROPOSTA_PDF: ["PRO", "ENTERPRISE"],
  MONITOR_CHAT_PREGOEIRO: ["ENTERPRISE"],
  MINUTA_IMPUGNACAO_IA: ["ENTERPRISE"],
  INTELIGENCIA_PRECOS: ["ENTERPRISE"],
  RELATORIO_EXECUTIVO_MENSAL: ["ENTERPRISE"],
} as const;

export function canUseArsenalFeature(
  plano: PlanoAssinaturaArsenal,
  feature: ArsenalFeature,
): boolean {
  const allowed = ARSENAL_PLAN_MATRIX[feature];
  return allowed.includes(plano);
}

// 1. Calculadora de Lance Mínimo & Simulador de BDI
export const tipoObjetoLicitacaoSchema = z.enum([
  "BENS_SERVICOS",
  "OBRAS_ENGENHARIA",
]);
export type TipoObjetoLicitacao = z.infer<typeof tipoObjetoLicitacaoSchema>;

export const calculadoraLanceSchema = z.object({
  descricaoItem: z.string().min(2),
  quantidade: z.number().positive(),
  custoUnitarioDireto: z.number().nonnegative(),
  freteUnitario: z.number().nonnegative().default(0),
  impostosPercentual: z.number().min(0).max(60),
  bdiPercentual: z.number().min(0).max(100),
  margemMinimaPercentual: z.number().min(0).max(80),
  valorEstimadoUnitarioEdital: z.number().positive(),
  lanceUnitarioProposto: z.number().positive(),
  tipoObjeto: tipoObjetoLicitacaoSchema.default("BENS_SERVICOS"),
});
export type CalculadoraLanceInput = z.infer<typeof calculadoraLanceSchema>;

export interface CalculadoraLanceOutput {
  descricaoItem: string;
  quantidade: number;
  custoBaseUnitario: number;
  lanceMinimoUnitarioSeguro: number;
  lanceMinimoTotalSeguro: number;
  precoSugeridoComBdiUnitario: number;
  precoSugeridoComBdiTotal: number;
  lanceUnitarioProposto: number;
  lanceTotalProposto: number;
  impostoUnitarioNoLance: number;
  lucroLiquidoUnitario: number;
  lucroLiquidoTotal: number;
  margemLiquidaRealPercentual: number;
  descontoSobreEstimadoPercentual: number;
  statusRisco:
    | "SEGURO"
    | "ABAIXO_MARGEM_MINIMA"
    | "RISCO_INEXEQUIBILIDADE"
    | "MARGEM_NEGATIVA";
  alertaMensagem: string;
}

// 2. Gerador Automático de Proposta Comercial Timbrada (Pro & Enterprise)
export const itemPropostaComercialSchema = z.object({
  numeroItem: z.number().int().positive(),
  descricao: z.string().min(2),
  marcaModelo: z.string().min(1),
  unidade: z.string().min(1).default("UN"),
  quantidade: z.number().positive(),
  valorUnitario: z.number().positive(),
});

export const dadosEmpresaPropostaSchema = z.object({
  razaoSocial: z.string().min(2),
  cnpj: z.string().min(11),
  endereco: z.string().min(3),
  email: z.string().email(),
  telefone: z.string().min(8),
  bancoNome: z.string().min(2),
  agencia: z.string().min(1),
  contaCorrente: z.string().min(1),
  chavePix: z.string().optional(),
  representanteNome: z.string().min(2),
  representanteCpf: z.string().min(11),
});

export const gerarPropostaComercialSchema = z.object({
  planoTenant: planoAssinaturaArsenalSchema,
  numeroEdital: z.string().min(2),
  orgaoNome: z.string().min(2),
  uasg: z.string().optional(),
  objeto: z.string().min(3),
  validadeDias: z.number().int().min(30).max(180).default(60),
  prazoEntregaDias: z.number().int().min(1).max(365).default(15),
  empresa: dadosEmpresaPropostaSchema,
  itens: z.array(itemPropostaComercialSchema).min(1),
});
export type GerarPropostaComercialInput = z.infer<
  typeof gerarPropostaComercialSchema
>;

export interface PropostaComercialGerada {
  numeroEdital: string;
  orgaoNome: string;
  valorGlobalProposta: number;
  validadeDias: number;
  itensCalculados: Array<{
    numeroItem: number;
    descricao: string;
    marcaModelo: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
  textoTimbrado: string;
  htmlTimbrado: string;
  geradoEmIso: string;
}

// 3. Monitor de Chat do Pregoeiro com Alertas WhatsApp (Enterprise)
export const mensagemChatSalaSchema = z.object({
  autor: z.string().min(1),
  horario: z.string().min(1),
  texto: z.string().min(1),
});

export const monitorChatPregoeiroSchema = z.object({
  planoTenant: planoAssinaturaArsenalSchema,
  numeroEdital: z.string().min(2),
  orgaoNome: z.string().min(2),
  cnpjMonitorado: z.string().min(11),
  razaoSocialMonitorada: z.string().min(2),
  telefoneAlerta: z.string().optional(),
  mensagens: z.array(mensagemChatSalaSchema).min(1),
});
export type MonitorChatPregoeiroInput = z.infer<
  typeof monitorChatPregoeiroSchema
>;

export interface AlertaChatPregoeiro {
  horario: string;
  autor: string;
  textoOriginal: string;
  mencionouEmpresa: boolean;
  tipoEvento:
    | "CONVOCACAO_DIRETA"
    | "PRAZO_PROPOSTA_READEQUADA"
    | "SOLICITACAO_ANEXO"
    | "FASE_RECURSAL";
  acaoRecomendada: string;
}

export interface MonitorChatPregoeiroOutput {
  numeroEdital: string;
  totalMensagensAnalisadas: number;
  alertasCriticos: AlertaChatPregoeiro[];
  alertaSonoroAtivo: boolean;
  whatsappEnfileirado: boolean;
}

// 4. Gerador de Minutas de Impugnação com IA — Art. 164 Lei 14.133 (Enterprise)
export const teseImpugnacaoIaSchema = z.enum([
  "RESTRICAO_COMPETITIVIDADE_E_MARCA",
  "QUALIFICACAO_TECNICA_EXCESSIVA",
  "PRAZO_ENTREGA_INEXEQUIVEL",
  "ORCAMENTO_DEFASADO_OU_SIGILOSO_IRREGULAR",
]);
export type TeseImpugnacaoIa = z.infer<typeof teseImpugnacaoIaSchema>;

export const gerarMinutaIaImpugnacaoSchema = z.object({
  planoTenant: planoAssinaturaArsenalSchema,
  numeroEdital: z.string().min(2),
  orgaoNome: z.string().min(2),
  dataAberturaSessao: z.string().min(10),
  clausulaQuestionada: z.string().min(10),
  tesePrincipal: teseImpugnacaoIaSchema,
  empresaImpugnante: z.string().min(2),
  cnpjImpugnante: z.string().min(11),
});
export type GerarMinutaIaImpugnacaoInput = z.infer<
  typeof gerarMinutaIaImpugnacaoSchema
>;

export interface MinutaImpugnacaoIaOutput {
  numeroEdital: string;
  orgaoNome: string;
  prazoFatalIso: string;
  motivoLegalSintetico: string;
  fundamentacaoLegal: string;
  pedidosFormais: string;
  textoCompletoPeticao: string;
}

// 5. Inteligência de Preços dos Concorrentes & Relatório Executivo Mensal (Enterprise)
export const inteligenciaPrecosSchema = z.object({
  planoTenant: planoAssinaturaArsenalSchema,
  termoOuCatmat: z.string().min(2),
  uf: z.string().length(2).optional(),
});
export type InteligenciaPrecosInput = z.infer<typeof inteligenciaPrecosSchema>;

export interface InteligenciaPrecosOutput {
  termoConsultado: string;
  ufFiltro: string;
  descontoMedioHomologadoPercentual: number;
  precoMedioEstimado: number;
  precoMedioHomologado: number;
  faixaLanceRecomendada: {
    minimo: number;
    maximo: number;
  };
  historicoHomologacoes: Array<{
    edital: string;
    orgao: string;
    uf: string;
    vencedor: string;
    cnpjVencedor: string;
    valorEstimado: number;
    valorHomologado: number;
    descontoPercentual: number;
    dataHomologacao: string;
  }>;
}

export const relatorioExecutivoMensalSchema = z.object({
  planoTenant: planoAssinaturaArsenalSchema,
  mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
  razaoSocialTenant: z.string().min(2),
  cnpjTenant: z.string().min(11),
  certamesAnalisados: z.number().int().nonnegative(),
  certamesDisputados: z.number().int().nonnegative(),
  certamesVencidos: z.number().int().nonnegative(),
  volumeFinanceiroDisputado: z.number().nonnegative(),
  volumeFinanceiroArrematado: z.number().nonnegative(),
  economiaMediaObtidaPercentual: z.number().nonnegative(),
});
export type RelatorioExecutivoMensalInput = z.infer<
  typeof relatorioExecutivoMensalSchema
>;

export interface RelatorioExecutivoMensalOutput {
  mesReferencia: string;
  razaoSocialTenant: string;
  taxaParticipacaoPercentual: number;
  taxaConversaoDisputaPercentual: number;
  ticketMedioArrematado: number;
  volumeFinanceiroArrematado: number;
  resumoExecutivoTexto: string;
}

function formatarMoedaBR(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function calcularLanceMinimoEBdi(
  rawInput: CalculadoraLanceInput,
): CalculadoraLanceOutput {
  const input = calculadoraLanceSchema.parse(rawInput);

  const custoBaseUnitario = arredondar2(
    input.custoUnitarioDireto + input.freteUnitario,
  );
  const taxaImposto = input.impostosPercentual / 100;
  const taxaMargemMinima = input.margemMinimaPercentual / 100;
  const taxaBdi = input.bdiPercentual / 100;

  const divisorSeguro = Math.max(0.05, 1 - taxaImposto - taxaMargemMinima);
  const lanceMinimoUnitarioSeguro = arredondar2(
    custoBaseUnitario / divisorSeguro,
  );
  const lanceMinimoTotalSeguro = arredondar2(
    lanceMinimoUnitarioSeguro * input.quantidade,
  );

  const precoSugeridoComBdiUnitario = arredondar2(
    (custoBaseUnitario * (1 + taxaBdi)) / Math.max(0.05, 1 - taxaImposto),
  );
  const precoSugeridoComBdiTotal = arredondar2(
    precoSugeridoComBdiUnitario * input.quantidade,
  );

  const lanceTotalProposto = arredondar2(
    input.lanceUnitarioProposto * input.quantidade,
  );
  const impostoUnitarioNoLance = arredondar2(
    input.lanceUnitarioProposto * taxaImposto,
  );
  const lucroLiquidoUnitario = arredondar2(
    input.lanceUnitarioProposto - custoBaseUnitario - impostoUnitarioNoLance,
  );
  const lucroLiquidoTotal = arredondar2(
    lucroLiquidoUnitario * input.quantidade,
  );
  const margemLiquidaRealPercentual = arredondar2(
    (lucroLiquidoUnitario / input.lanceUnitarioProposto) * 100,
  );

  const descontoSobreEstimadoPercentual = arredondar2(
    ((input.valorEstimadoUnitarioEdital - input.lanceUnitarioProposto) /
      input.valorEstimadoUnitarioEdital) *
      100,
  );

  const limiteDescontoInexequivel =
    input.tipoObjeto === "OBRAS_ENGENHARIA" ? 25 : 50;

  let statusRisco: CalculadoraLanceOutput["statusRisco"] = "SEGURO";
  let alertaMensagem = `Lance seguro: margem líquida preservada em ${margemLiquidaRealPercentual.toFixed(2)}% (${formatarMoedaBR(lucroLiquidoTotal)} de lucro estimado).`;

  if (lucroLiquidoUnitario < 0) {
    statusRisco = "MARGEM_NEGATIVA";
    alertaMensagem = `ALERTA CRÍTICO: Lance gera prejuízo líquido de ${formatarMoedaBR(Math.abs(lucroLiquidoTotal))}. O valor não cobre o custo direto + impostos.`;
  } else if (descontoSobreEstimadoPercentual > limiteDescontoInexequivel) {
    statusRisco = "RISCO_INEXEQUIBILIDADE";
    alertaMensagem = `ATENÇÃO JURÍDICA (Art. 59 da Lei 14.133/2021): Desconto de ${descontoSobreEstimadoPercentual.toFixed(1)}% ultrapassa o patamar de presunção de inexequibilidade (${limiteDescontoInexequivel}%). Prepare planilha de exequibilidade e notas fiscais de entrada.`;
  } else if (margemLiquidaRealPercentual < input.margemMinimaPercentual) {
    statusRisco = "ABAIXO_MARGEM_MINIMA";
    alertaMensagem = `Atenção Comercial: Margem líquida de ${margemLiquidaRealPercentual.toFixed(2)}% está abaixo do piso mínimo parametrizado (${input.margemMinimaPercentual}%).`;
  }

  return {
    descricaoItem: input.descricaoItem,
    quantidade: input.quantidade,
    custoBaseUnitario,
    lanceMinimoUnitarioSeguro,
    lanceMinimoTotalSeguro,
    precoSugeridoComBdiUnitario,
    precoSugeridoComBdiTotal,
    lanceUnitarioProposto: input.lanceUnitarioProposto,
    lanceTotalProposto,
    impostoUnitarioNoLance,
    lucroLiquidoUnitario,
    lucroLiquidoTotal,
    margemLiquidaRealPercentual,
    descontoSobreEstimadoPercentual,
    statusRisco,
    alertaMensagem,
  };
}

export function gerarPropostaComercialTimbrada(
  rawInput: GerarPropostaComercialInput,
): PropostaComercialGerada {
  const input = gerarPropostaComercialSchema.parse(rawInput);

  if (!canUseArsenalFeature(input.planoTenant, "PROPOSTA_PDF")) {
    throw new Error(
      "Recurso exclusivo do Plano PRO ou ENTERPRISE. Faça upgrade para emitir Propostas Comerciais Timbradas automaticamente.",
    );
  }

  const itensCalculados = input.itens.map((item) => {
    const valorTotal = arredondar2(item.quantidade * item.valorUnitario);
    return {
      numeroItem: item.numeroItem,
      descricao: item.descricao,
      marcaModelo: item.marcaModelo,
      unidade: item.unidade,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      valorTotal,
    };
  });

  const valorGlobalProposta = arredondar2(
    itensCalculados.reduce((acc, cur) => acc + cur.valorTotal, 0),
  );
  const geradoEmIso = new Date().toISOString();
  const dataFormatada = new Date().toLocaleDateString("pt-BR");

  const linhasTextoItens = itensCalculados
    .map(
      (i) =>
        `Item ${i.numeroItem} | ${i.descricao} | Marca/Modelo: ${i.marcaModelo} | Qtd: ${i.quantidade} ${i.unidade} | Unit.: ${formatarMoedaBR(i.valorUnitario)} | Total: ${formatarMoedaBR(i.valorTotal)}`,
    )
    .join("\n");

  const textoTimbrado = [
    `====================================================================`,
    `${input.empresa.razaoSocial.toUpperCase()}`,
    `CNPJ: ${input.empresa.cnpj} | Endereço: ${input.empresa.endereco}`,
    `E-mail: ${input.empresa.email} | Telefone: ${input.empresa.telefone}`,
    `====================================================================`,
    ``,
    `PROPOSTA COMERCIAL READEQUADA — ${input.numeroEdital}`,
    `Ao ${input.orgaoNome}${input.uasg ? ` (UASG ${input.uasg})` : ""}`,
    `Objeto: ${input.objeto}`,
    ``,
    `QUADRO DEMONSTRATIVO DE PREÇOS:`,
    linhasTextoItens,
    ``,
    `VALOR GLOBAL DA PROPOSTA: ${formatarMoedaBR(valorGlobalProposta)}`,
    `Validade da Proposta: ${input.validadeDias} (sessenta) dias corridos, nos termos do Art. 90, § 3º da Lei Federal nº 14.133/2021.`,
    `Prazo de Entrega / Execução: até ${input.prazoEntregaDias} dias corridos após o recebimento da Nota de Empenho ou Ordem de Fornecimento.`,
    ``,
    `DADOS BANCÁRIOS PARA PAGAMENTO:`,
    `Banco: ${input.empresa.bancoNome} | Agência: ${input.empresa.agencia} | Conta Corrente: ${input.empresa.contaCorrente}${input.empresa.chavePix ? ` | PIX: ${input.empresa.chavePix}` : ""}`,
    ``,
    `DECLARAÇÃO DE INTEGRALIDADE DE CUSTOS (Art. 63, § 1º da Lei nº 14.133/2021):`,
    `Declaramos que nos preços propostos estão inclusos todos os custos diretos e indiretos, tributos, encargos trabalhistas, previdenciários, fiscais, comerciais, seguros, fretes e quaisquer outras despesas incidentes sobre o objeto.`,
    ``,
    `Data de Emissão: ${dataFormatada}`,
    `${input.empresa.representanteNome} — CPF: ${input.empresa.representanteCpf}`,
    `Representante Legal — ${input.empresa.razaoSocial}`,
    `Gerado via ${APP_CONFIG.brandName}`,
  ].join("\n");

  const linhasHtmlItens = itensCalculados
    .map(
      (i) =>
        `<tr><td>${i.numeroItem}</td><td>${i.descricao}</td><td>${i.marcaModelo}</td><td>${i.quantidade} ${i.unidade}</td><td>${formatarMoedaBR(i.valorUnitario)}</td><td><strong>${formatarMoedaBR(i.valorTotal)}</strong></td></tr>`,
    )
    .join("");

  const htmlTimbrado = `
<article class="proposta-timbrada">
  <header>
    <h2>${input.empresa.razaoSocial}</h2>
    <p>CNPJ: ${input.empresa.cnpj} — ${input.empresa.endereco}</p>
  </header>
  <h3>PROPOSTA COMERCIAL READEQUADA — ${input.numeroEdital}</h3>
  <p><strong>Órgão:</strong> ${input.orgaoNome}</p>
  <p><strong>Objeto:</strong> ${input.objeto}</p>
  <table>
    <thead>
      <tr><th>Item</th><th>Descrição</th><th>Marca/Modelo</th><th>Qtd</th><th>Vlr. Unitário</th><th>Vlr. Total</th></tr>
    </thead>
    <tbody>${linhasHtmlItens}</tbody>
    <tfoot>
      <tr><td colspan="5"><strong>VALOR GLOBAL</strong></td><td><strong>${formatarMoedaBR(valorGlobalProposta)}</strong></td></tr>
    </tfoot>
  </table>
  <p><strong>Validade:</strong> ${input.validadeDias} dias | <strong>Prazo de Entrega:</strong> ${input.prazoEntregaDias} dias</p>
  <p><strong>Dados Bancários:</strong> ${input.empresa.bancoNome} — Ag. ${input.empresa.agencia} — CC ${input.empresa.contaCorrente}</p>
</article>`.trim();

  return {
    numeroEdital: input.numeroEdital,
    orgaoNome: input.orgaoNome,
    valorGlobalProposta,
    validadeDias: input.validadeDias,
    itensCalculados,
    textoTimbrado,
    htmlTimbrado,
    geradoEmIso,
  };
}

export function gerarMinutaImpugnacaoIA(
  rawInput: GerarMinutaIaImpugnacaoInput,
): MinutaImpugnacaoIaOutput {
  const input = gerarMinutaIaImpugnacaoSchema.parse(rawInput);

  if (!canUseArsenalFeature(input.planoTenant, "MINUTA_IMPUGNACAO_IA")) {
    throw new Error(
      "O Gerador de Minutas de Impugnação com IA (Art. 164 da Lei 14.133/2021) é exclusivo do Plano ENTERPRISE.",
    );
  }

  const dataAbertura = new Date(input.dataAberturaSessao);
  const prazoFatal = calcularPrazoFatalImpugnacao(dataAbertura);

  const tesesCatalogo: Record<
    GerarMinutaIaImpugnacaoInput["tesePrincipal"],
    {
      motivo: string;
      fundamentacao: string;
      pedidos: string;
    }
  > = {
    RESTRICAO_COMPETITIVIDADE_E_MARCA: {
      motivo:
        "Restrição indevida ao caráter competitivo e direcionamento de especificações técnicas / marca exclusiva",
      fundamentacao:
        "Nos termos do Art. 5º, Art. 9º, inciso I e Art. 41, inciso I da Lei Federal nº 14.133/2021, bem como da Súmula nº 270 e Súmula nº 273 do Tribunal de Contas da União (TCU), é vedada a inclusão de especificações técnicas excessivas, irrelevantes ou desnecessárias que limitem o universo de competidores ou configurem direcionamento de marca sem justificativa técnica circunstanciada em Estudo Técnico Preliminar (ETP).",
      pedidos:
        "Requer-se o acolhimento da presente Impugnação para suprimir a exigência restritiva apontada, admitindo-se soluções tecnologicamente equivalentes ou similares, com a consequente retificação e republicação do edital e reabertura integral do prazo de apresentação de propostas (Art. 55, § 1º da Lei nº 14.133/2021).",
    },
    QUALIFICACAO_TECNICA_EXCESSIVA: {
      motivo:
        "Exigência desproporcional de atestados de capacidade técnica acima dos limites legais do Art. 67 da Lei 14.133/2021",
      fundamentacao:
        "O Art. 67, §§ 1º e 2º da Lei Federal nº 14.133/2021 e a Súmula nº 263 do TCU determinam de forma taxativa que a exigência de atestados de capacidade técnico-operacional deve restringir-se às parcelas de maior relevância e valor significativo (iguais ou superiores a 4% do valor total estimado), vedada a exigência de quantitativos mínimos superiores a 50% (cinquenta por cento) da execução pretendida.",
      pedidos:
        "Requer-se a retificação imediata das exigências de habilitação técnica para adequá-las ao teto máximo de 50% previsto no Art. 67, § 2º da Lei nº 14.133/2021, promovendo-se a republicação do instrumento convocatório.",
    },
    PRAZO_ENTREGA_INEXEQUIVEL: {
      motivo:
        "Estipulação de prazo de entrega/mobilização materialmente inexequível em afronta à razoabilidade",
      fundamentacao:
        "A fixação de prazo exíguo para fornecimento ou início da execução contratual viola frontalmente os princípios da razoabilidade, proporcionalidade e competitividade insculpidos no Art. 5º e no Art. 25 da Lei Federal nº 14.133/2021, além da jurisprudência pacífica do TCU (Acórdão nº 1.542/2019-Plenário), pois privilegia apenas fornecedores que já detenham estoque imediato na localidade do órgão.",
      pedidos:
        "Requer-se a dilação do prazo de entrega/execução para patamar compatível com a logística nacional de mercado (mínimo de 15 a 30 dias corridos), com a republicação do edital.",
    },
    ORCAMENTO_DEFASADO_OU_SIGILOSO_IRREGULAR: {
      motivo:
        "Inconsistência na formação da cesta de preços estimados (Art. 23 da Lei 14.133/2021)",
      fundamentacao:
        "De acordo com o Art. 23, § 1º da Lei Federal nº 14.133/2021 e a IN SEGES/ME nº 65/2021, o valor previamente estimado da contratação deve ser compatível com os valores praticados pelo mercado no Painel de Preços e no PNCP. A subavaliação artificial do preço de referência inviabiliza a formulação de propostas exequíveis e conduz ao fracasso ou deserção do certame.",
      pedidos:
        "Requer-se a revisão da pesquisa mercadológica e a atualização da planilha orçamentária de referência conforme o Art. 23 da Lei nº 14.133/2021, seguida da republicação do edital.",
    },
  };

  const tese = tesesCatalogo[input.tesePrincipal];

  const textoCompletoPeticao = [
    `ILUSTRÍSSIMO(A) SENHOR(A) PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO DO ${input.orgaoNome.toUpperCase()}`,
    ``,
    `Referência: Edital ${input.numeroEdital}`,
    `Prazo Legal (Art. 164 da Lei nº 14.133/2021): ${prazoFatal.toLocaleDateString("pt-BR")} às 18:00`,
    ``,
    `${input.empresaImpugnante.toUpperCase()}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${input.cnpjImpugnante}, vem, tempestivamente, com fulcro no Art. 164 da Lei Federal nº 14.133/2021, apresentar`,
    ``,
    `IMPUGNAÇÃO AO EDITAL DE LICITAÇÃO`,
    ``,
    `1. DA TEMPESTIVIDADE (ART. 164 DA LEI Nº 14.133/2021)`,
    `A sessão pública de abertura está designada para ${dataAbertura.toLocaleDateString("pt-BR")}. Protocolada até 3 (três) dias úteis antes da data de abertura do certame, a presente peça é plenamente tempestiva, impondo-se o seu conhecimento e resposta motivada no prazo de até 3 (três) dias úteis, limitado ao último dia útil anterior à data da abertura (Art. 164, parágrafo único).`,
    ``,
    `2. DA CLÁUSULA EDITALÍCIA IMPUGNADA`,
    `"${input.clausulaQuestionada}"`,
    ``,
    `3. DO DIREITO E DA FUNDAMENTAÇÃO JURÍDICA (${tese.motivo})`,
    `${tese.fundamentacao}`,
    ``,
    `4. DOS PEDIDOS`,
    `${tese.pedidos}`,
    ``,
    `Termos em que pede deferimento.`,
    `${new Date().toLocaleDateString("pt-BR")}`,
    `${input.empresaImpugnante} — CNPJ ${input.cnpjImpugnante}`,
  ].join("\n");

  return {
    numeroEdital: input.numeroEdital,
    orgaoNome: input.orgaoNome,
    prazoFatalIso: prazoFatal.toISOString(),
    motivoLegalSintetico: tese.motivo,
    fundamentacaoLegal: tese.fundamentacao,
    pedidosFormais: tese.pedidos,
    textoCompletoPeticao,
  };
}

export function consultarInteligenciaPrecosConcorrentes(
  rawInput: InteligenciaPrecosInput,
): InteligenciaPrecosOutput {
  const input = inteligenciaPrecosSchema.parse(rawInput);

  if (!canUseArsenalFeature(input.planoTenant, "INTELIGENCIA_PRECOS")) {
    throw new Error(
      "O painel de Inteligência de Preços dos Concorrentes é exclusivo do Plano ENTERPRISE.",
    );
  }

  const ufFiltro = input.uf?.toUpperCase() || "BR";
  const historicoHomologacoes = [
    {
      edital: "PE 088/2026",
      orgao: "Tribunal de Justiça do Estado de Goiás",
      uf: ufFiltro === "BR" ? "GO" : ufFiltro,
      vencedor: "SOLUTIONS TECH SUPRIMENTOS LTDA",
      cnpjVencedor: "21.450.890/0001-14",
      valorEstimado: 5200,
      valorHomologado: 4212,
      descontoPercentual: 19.0,
      dataHomologacao: "2026-10-12",
    },
    {
      edital: "PE 041/2026",
      orgao: "Secretaria Estadual de Administração",
      uf: ufFiltro === "BR" ? "DF" : ufFiltro,
      vencedor: "BRASIL DIGITAL EQUIPAMENTOS S/A",
      cnpjVencedor: "33.901.112/0001-88",
      valorEstimado: 4950,
      valorHomologado: 4108.5,
      descontoPercentual: 17.0,
      dataHomologacao: "2026-09-28",
    },
    {
      edital: "PE 119/2026",
      orgao: "Universidade Federal de Goiás",
      uf: ufFiltro === "BR" ? "GO" : ufFiltro,
      vencedor: "CENTRO-OESTE LICITACOES E COMERCIO LTDA",
      cnpjVencedor: "14.220.771/0001-05",
      valorEstimado: 5100,
      valorHomologado: 4335,
      descontoPercentual: 15.0,
      dataHomologacao: "2026-09-14",
    },
  ];

  const descontoMedioHomologadoPercentual = arredondar2(
    historicoHomologacoes.reduce((acc, h) => acc + h.descontoPercentual, 0) /
      historicoHomologacoes.length,
  );
  const precoMedioEstimado = arredondar2(
    historicoHomologacoes.reduce((acc, h) => acc + h.valorEstimado, 0) /
      historicoHomologacoes.length,
  );
  const precoMedioHomologado = arredondar2(
    historicoHomologacoes.reduce((acc, h) => acc + h.valorHomologado, 0) /
      historicoHomologacoes.length,
  );

  return {
    termoConsultado: input.termoOuCatmat,
    ufFiltro,
    descontoMedioHomologadoPercentual,
    precoMedioEstimado,
    precoMedioHomologado,
    faixaLanceRecomendada: {
      minimo: arredondar2(precoMedioHomologado * 0.96),
      maximo: arredondar2(precoMedioHomologado * 1.03),
    },
    historicoHomologacoes,
  };
}

export function gerarRelatorioExecutivoMensal(
  rawInput: RelatorioExecutivoMensalInput,
): RelatorioExecutivoMensalOutput {
  const input = relatorioExecutivoMensalSchema.parse(rawInput);

  if (!canUseArsenalFeature(input.planoTenant, "RELATORIO_EXECUTIVO_MENSAL")) {
    throw new Error(
      "O Relatório Executivo Mensal de Desempenho é exclusivo do Plano ENTERPRISE.",
    );
  }

  const taxaParticipacaoPercentual =
    input.certamesAnalisados > 0
      ? arredondar2(
          (input.certamesDisputados / input.certamesAnalisados) * 100,
        )
      : 0;
  const taxaConversaoDisputaPercentual =
    input.certamesDisputados > 0
      ? arredondar2((input.certamesVencidos / input.certamesDisputados) * 100)
      : 0;
  const ticketMedioArrematado =
    input.certamesVencidos > 0
      ? arredondar2(input.volumeFinanceiroArrematado / input.certamesVencidos)
      : 0;

  const resumoExecutivoTexto = [
    `RELATÓRIO EXECUTIVO DE DESEMPENHO — COMPETÊNCIA ${input.mesReferencia}`,
    `Empresa: ${input.razaoSocialTenant} (CNPJ ${input.cnpjTenant})`,
    `----------------------------------------------------------------`,
    `• Editais Triados no Período: ${input.certamesAnalisados}`,
    `• Participações em Disputa: ${input.certamesDisputados} (${taxaParticipacaoPercentual.toFixed(1)}% de aproveitamento)`,
    `• Licitações Homologadas / Vencidas: ${input.certamesVencidos} (Taxa de Conversão: ${taxaConversaoDisputaPercentual.toFixed(2)}%)`,
    `• Volume Financeiro Disputado: ${formatarMoedaBR(input.volumeFinanceiroDisputado)}`,
    `• Volume Financeiro Arrematado: ${formatarMoedaBR(input.volumeFinanceiroArrematado)}`,
    `• Ticket Médio por Vitória: ${formatarMoedaBR(ticketMedioArrematado)}`,
    `• Desconto Médio Praticado nas Vitórias: ${input.economiaMediaObtidaPercentual.toFixed(1)}%`,
    `----------------------------------------------------------------`,
    `Emitido por ${APP_CONFIG.brandName}`,
  ].join("\n");

  return {
    mesReferencia: input.mesReferencia,
    razaoSocialTenant: input.razaoSocialTenant,
    taxaParticipacaoPercentual,
    taxaConversaoDisputaPercentual,
    ticketMedioArrematado,
    volumeFinanceiroArrematado: input.volumeFinanceiroArrematado,
    resumoExecutivoTexto,
  };
}
