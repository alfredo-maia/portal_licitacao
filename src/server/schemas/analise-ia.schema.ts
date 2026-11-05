import { z } from "zod";
import { OPERACAO_TIMEZONE } from "./status-grupos.schema";
import { PLAN_LIMITS, type PlanoAssinatura } from "./tenant.schema";

/**
 * Contrato de persistência da análise profunda gerada pela ferramenta de IA
 * "Verificar Status de Participação" (PRD §4.4.1 F e sprint-2-spec §2.2).
 */
export const salvarAnaliseIASchema = z.object({
  scriptPrompt: z.string().min(1, "Script do prompt é obrigatório"),
  relatorioTexto: z.string().min(1, "Texto do relatório é obrigatório"),
  impedimentos: z.any().optional(),
  viabilidade: z.any().optional(),
  custos: z.any().optional(),
  precoSugerido: z.any().optional(),
});

export type SalvarAnaliseIAInput = z.infer<typeof salvarAnaliseIASchema>;

/* =========================================================================
   Análise de Participação Assíncrona (Issue #36)
========================================================================= */

export const ANALISE_STATUS = [
  "PROCESSANDO",
  "CONCLUIDO",
  "ERRO",
  "AGUARDANDO_DOCUMENTOS",
] as const;
export const analiseStatusSchema = z.enum(ANALISE_STATUS);
export type AnaliseStatus = z.infer<typeof analiseStatusSchema>;

export const PARECERES_HABILITACAO = [
  "APTO",
  "APTO_COM_RESSALVAS",
  "INAPTO",
] as const;
export const parecerHabilitacaoSchema = z.enum(PARECERES_HABILITACAO);
export type ParecerHabilitacao = z.infer<typeof parecerHabilitacaoSchema>;

export const ANALISE_ORIGENS = [
  "IA_HIBRIDA",
  "LLM_GEMINI",
  "LLM_OPENAI",
  "ANALISE_INTERNA",
] as const;
export type AnaliseOrigem = (typeof ANALISE_ORIGENS)[number];

/** Item/Lote detalhado do certame (Issue #37) */
export const itemDisputaEditalSchema = z.object({
  numeroItem: z.number(),
  lote: z.number().nullable().optional(),
  descricao: z.string(),
  especificacaoDetalhada: z.string().optional(),
  quantidade: z.number(),
  unidadeMedida: z.string().default("UN"),
  valorUnitarioEstimado: z.number().nullable().optional(),
  valorTotalEstimado: z.number().nullable().optional(),
  marcaExigidaOuReferencia: z.string().nullable().optional(),
  exigeAmostra: z.boolean().optional(),
});
export type ItemDisputaEdital = z.infer<typeof itemDisputaEditalSchema>;

/**
 * Relatório estruturado de participação (Raio-X de Edital & ATA — Issue #37)
 * Focado em verificação real de habilitação da empresa, extração de marcas exigidas,
 * prazos de início/pedidos, endereços físicos de entrega, riscos contratuais e matriz SWOT.
 */
export const relatorioParticipacaoSchema = z.object({
  parecer: parecerHabilitacaoSchema,
  scoreAderencia: z.number().min(0).max(100),
  segmentoIdentificado: z.string().default("Fornecimento de Bens e Serviços"),
  resumoExecutivo: z.string(),

  // 1. Veredito de Habilitação Documental
  habilitacao: z
    .object({
      status: parecerHabilitacaoSchema,
      scoreConformidade: z.number().min(0).max(100).default(80),
      resumo: z.string(),
      certidoesRegulares: z.array(z.string()).default([]),
      certidoesVencidasOuPendentes: z.array(z.string()).default([]),
      atestadosExigidos: z.preprocess((val) => {
        if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
        if (typeof val === "string") {
          const t = val.trim();
          if (!t) return [];
          return t.split(/[;\n•]+/).map((s) => s.trim()).filter(Boolean);
        }
        return [];
      }, z.array(z.string()).default([])),
      exigenciasEspeciais: z.preprocess((val) => {
        if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
        if (typeof val === "string") {
          const t = val.trim();
          if (!t) return [];
          return t.split(/[;\n•]+/).map((s) => s.trim()).filter(Boolean);
        }
        return [];
      }, z.array(z.string()).default([])),
    })
    .default({
      status: "APTO",
      scoreConformidade: 80,
      resumo: "Conformidade documental preliminar aprovada.",
      certidoesRegulares: [],
      certidoesVencidasOuPendentes: [],
      atestadosExigidos: [],
      exigenciasEspeciais: [],
    }),

  // 2. Cronograma & Localização Física
  cronograma: z
    .object({
      dataPrevisaoInicio: z.string().default("A definir após homologação"),
      prazoInicioPedidosAposAssinatura: z
        .string()
        .default("Até 5 a 10 dias úteis após assinatura da Ata/Contrato"),
      prazoEntregaExecucao: z
        .string()
        .default("Em conformidade com as Ordens de Fornecimento emitidas pelo órgão"),
      enderecoExecucaoOuEntrega: z
        .string()
        .default("Conforme especificado no Termo de Referência"),
      isPresencial: z.boolean().default(false),
      observacoesLogistica: z.string().optional(),
    })
    .default({
      dataPrevisaoInicio: "A definir após homologação",
      prazoInicioPedidosAposAssinatura: "Até 5 a 10 dias úteis após assinatura da Ata/Contrato",
      prazoEntregaExecucao: "Em conformidade com as Ordens de Fornecimento emitidas pelo órgão",
      enderecoExecucaoOuEntrega: "Conforme especificado no Termo de Referência",
      isPresencial: false,
    }),

  // 3. Itens, Quantidades & Marcas Exigidas
  itens: z
    .object({
      totalItens: z.number().default(0),
      valorTotalEstimado: z.number().default(0),
      destaqueMarcasExigidas: z.array(z.string()).default([]),
      lista: z.array(itemDisputaEditalSchema).default([]),
    })
    .default({
      totalItens: 0,
      valorTotalEstimado: 0,
      destaqueMarcasExigidas: [],
      lista: [],
    }),

  // 4. Riscos Contratuais & Financeiros
  riscos: z
    .object({
      prazoPagamentoOrgao: z
        .string()
        .default("Até 30 dias após liquidação e atesto da Nota Fiscal"),
      exigenciaGarantiaContratual: z
        .string()
        .default("Conforme estipulado na Minuta Contratual"),
      clausulasPenalidadesMultas: z.array(z.string()).default([]),
      riscosFinanceirosIdentificados: z.array(z.string()).default([]),
      nivelRiscoGeral: z.enum(["BAIXO", "MEDIO", "ALTO"]).default("MEDIO"),
    })
    .default({
      prazoPagamentoOrgao: "Até 30 dias após liquidação e atesto da Nota Fiscal",
      exigenciaGarantiaContratual: "Conforme estipulado na Minuta Contratual",
      clausulasPenalidadesMultas: [],
      riscosFinanceirosIdentificados: [],
      nivelRiscoGeral: "MEDIO",
    }),

  // 5. Matriz SWOT
  swot: z
    .object({
      forcas: z.array(z.string()).default([]),
      fraquezas: z.array(z.string()).default([]),
      oportunidades: z.array(z.string()).default([]),
      ameacas: z.array(z.string()).default([]),
    })
    .default({
      forcas: [],
      fraquezas: [],
      oportunidades: [],
      ameacas: [],
    }),

  // Campos retrocompatíveis para não quebrar módulos anteriores
  aderenciaEscopo: z
    .object({
      compativel: z.boolean(),
      segmentoEmpresa: z.string(),
      segmentoEdital: z.string(),
      observacao: z.string(),
    })
    .optional(),
  checklistDocumental: z
    .array(
      z.object({
        documento: z.string(),
        categoria: z.string(),
        status: z.enum(["REGULAR", "VENCENDO", "VENCIDO", "AUSENTE"]),
        diasParaVencer: z.number().nullable(),
        detalhe: z.string(),
      }),
    )
    .optional(),
  statusPortalDisputa: z
    .object({
      portalNome: z.string(),
      status: z.enum(["ATIVO", "VENCIDO", "NAO_CADASTRADO"]),
      dataVencimento: z.string().nullable(),
      detalhe: z.string(),
    })
    .optional(),
  exigenciasTecnicas: z
    .array(
      z.object({
        exigencia: z.string(),
        atendido: z.enum(["SIM", "VERIFICAR", "NAO"]),
        observacao: z.string(),
      }),
    )
    .optional(),
  viabilidadeFinanceira: z
    .object({
      valorEstimadoEdital: z.number(),
      lanceMinimoReferencia: z.string().nullable(),
      margemSegurancaSugerida: z.string(),
      observacoesCustos: z.string(),
    })
    .optional(),
  riscosIdentificados: z
    .array(
      z.object({
        severidade: z.enum(["ALTA", "MEDIA", "BAIXA"]),
        titulo: z.string(),
        mitigacao: z.string(),
      }),
    )
    .optional(),
  recomendacoesPraticas: z.array(z.string()).default([]),
});

export type RelatorioParticipacao = z.infer<typeof relatorioParticipacaoSchema>;

/** `POST /api/oportunidades/[id]/analise-ia` — observações opcionais do solicitante. */
export const solicitarAnaliseInputSchema = z
  .object({
    observacoes: z.string().trim().max(2000).optional(),
    observacoesExtras: z.string().trim().max(2000).optional(),
    sistemaBaseProprio: z.string().optional(),
    repositorioReferencia: z.string().optional(),
  })
  .default({});

export type SolicitarAnaliseInput = z.infer<typeof solicitarAnaliseInputSchema>;

/* =========================================================================
   Cota mensal por plano
========================================================================= */

export type AcaoSugeridaCota = "UPGRADE" | "CONTATO_VENDAS";

export interface CotaAnaliseIA {
  plano: PlanoAssinatura;
  limite: number;
  usadas: number;
  restantes: number;
  atingiuLimite: boolean;
  mesReferencia: string;
  renovaEm: string;
  acaoSugerida: AcaoSugeridaCota | null;
  mensagemBloqueio: string | null;
}

export type CotaMensalAnaliseIA = CotaAnaliseIA;

const NOMES_PLANO: Record<PlanoAssinatura, string> = {
  BASICO: "Básico",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

/** `YYYY-MM-DD` do instante em America/Sao_Paulo. */
function dataCivilBRT(ref: Date): string {
  return ref.toLocaleDateString("sv-SE", { timeZone: OPERACAO_TIMEZONE });
}

/** Mês civil de referência (`YYYY-MM`) em America/Sao_Paulo. */
export function mesReferenciaBRT(ref: Date = new Date()): string {
  return dataCivilBRT(ref).slice(0, 7);
}

/** Primeiro instante (00:00 BRT) do mês civil de `ref`. */
export function inicioMesCivilBRT(ref: Date = new Date()): Date {
  return new Date(`${mesReferenciaBRT(ref)}-01T00:00:00-03:00`);
}

/** Primeiro instante (00:00 BRT) do mês civil seguinte a `ref` — momento do reset da cota. */
export function proximoMesCivilBRT(ref: Date = new Date()): Date {
  const [ano, mes] = mesReferenciaBRT(ref).split("-").map(Number);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  return new Date(
    `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01T00:00:00-03:00`,
  );
}

/**
 * Cota mensal de análises de IA por plano: Básico 5, Pro/Trial 10, Enterprise 20
 * (`PLAN_LIMITS.aiAnalisesMes`). O contador zera a cada mês civil (BRT).
 * Ao atingir o limite: Básico/Pro são orientados a fazer upgrade; Enterprise
 * (plano mais alto) é orientado a falar com a equipe de vendas.
 */
export function calcularCotaAnaliseIA(params: {
  plano: PlanoAssinatura;
  usadas: number;
  referencia?: Date;
}): CotaAnaliseIA {
  const referencia = params.referencia ?? new Date();
  const limite = PLAN_LIMITS[params.plano].aiAnalisesMes;
  const usadas = Math.max(0, Math.floor(params.usadas));
  const restantes = Math.max(0, limite - usadas);
  const atingiuLimite = usadas >= limite;

  let acaoSugerida: AcaoSugeridaCota | null = null;
  let mensagemBloqueio: string | null = null;

  if (atingiuLimite) {
    const nome = NOMES_PLANO[params.plano];
    if (params.plano === "ENTERPRISE") {
      acaoSugerida = "CONTATO_VENDAS";
      mensagemBloqueio = `Você atingiu o limite de ${limite} análises de IA do plano ${nome} neste mês. Entre em contato com a nossa equipe de vendas para ampliar a sua cota.`;
    } else {
      acaoSugerida = "UPGRADE";
      const proximo = params.plano === "BASICO" ? "PRO" : "ENTERPRISE";
      const limiteProximo = PLAN_LIMITS[proximo].aiAnalisesMes;
      mensagemBloqueio = `Você atingiu o limite de ${limite} análises de IA do plano ${nome} neste mês. Faça upgrade para o plano ${NOMES_PLANO[proximo]} (${limiteProximo} análises por mês) para continuar utilizando esta função.`;
    }
  }

  return {
    plano: params.plano,
    limite,
    usadas,
    restantes,
    atingiuLimite,
    mesReferencia: mesReferenciaBRT(referencia),
    renovaEm: proximoMesCivilBRT(referencia).toISOString(),
    acaoSugerida,
    mensagemBloqueio,
  };
}
