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

export const ANALISE_STATUS = ["PROCESSANDO", "CONCLUIDO", "ERRO"] as const;
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

/**
 * Relatório estruturado de participação, universal para qualquer segmento
 * (obras, saúde, alimentação, frota, serviços, comércio, TI...).
 * É o contrato de saída exigido da LLM e do motor analítico interno.
 */
export const relatorioParticipacaoSchema = z.object({
  parecer: parecerHabilitacaoSchema,
  scoreAderencia: z.number().min(0).max(100),
  segmentoIdentificado: z.string(),
  resumoExecutivo: z.string(),
  aderenciaEscopo: z.object({
    compativel: z.boolean(),
    segmentoEmpresa: z.string(),
    segmentoEdital: z.string(),
    observacao: z.string(),
  }),
  checklistDocumental: z.array(
    z.object({
      documento: z.string(),
      categoria: z.string(),
      status: z.enum(["REGULAR", "VENCENDO", "VENCIDO", "AUSENTE"]),
      diasParaVencer: z.number().nullable(),
      detalhe: z.string(),
    }),
  ),
  statusPortalDisputa: z.object({
    portalNome: z.string(),
    status: z.enum(["ATIVO", "VENCIDO", "NAO_CADASTRADO"]),
    dataVencimento: z.string().nullable(),
    detalhe: z.string(),
  }),
  exigenciasTecnicas: z.array(
    z.object({
      exigencia: z.string(),
      atendido: z.enum(["SIM", "VERIFICAR", "NAO"]),
      observacao: z.string(),
    }),
  ),
  viabilidadeFinanceira: z.object({
    valorEstimadoEdital: z.number(),
    lanceMinimoReferencia: z.string().nullable(),
    margemSegurancaSugerida: z.string(),
    observacoesCustos: z.string(),
  }),
  riscosIdentificados: z.array(
    z.object({
      severidade: z.enum(["ALTA", "MEDIA", "BAIXA"]),
      titulo: z.string(),
      mitigacao: z.string(),
    }),
  ),
  recomendacoesPraticas: z.array(z.string()),
});

export type RelatorioParticipacao = z.infer<typeof relatorioParticipacaoSchema>;

/** `POST /api/oportunidades/[id]/analise-ia` — observações opcionais do solicitante. */
export const solicitarAnaliseInputSchema = z
  .object({
    observacoes: z.string().trim().max(2000).optional(),
    observacoesExtras: z.string().trim().max(2000).optional(),
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
