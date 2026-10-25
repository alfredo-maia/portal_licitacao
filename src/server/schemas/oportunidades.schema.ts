import { z } from "zod";
import { licitacaoStatusSchema } from "./licitacao.schema";
import { tipoSistemaCodigoSchema } from "./tipos-sistema.schema";

/**
 * Contratos da Central de Oportunidades (`/oportunidades`): filtros operacionais,
 * deliberação GO / No-GO e cadastro manual de licitação
 * (PRD §4.4 / sprint-1-spec §2.3).
 */

/** Faixas de valor estimado para o filtro operacional (sprint-1-spec §2.3). */
export const faixaValorSchema = z.enum(["ATE_500K", "500K_A_2M", "ACIMA_2M"]);

/**
 * Parecer da IA aceito nos filtros. A grafia legada `"NO-GO"` é normalizada
 * para `"NO_GO"` (enum `ParecerIA` no Prisma) na saída do parse.
 */
export const parecerIAFilterSchema = z
  .enum(["GO", "AVALIAR", "NO_GO", "NO-GO"])
  .transform((value) => (value === "NO-GO" ? "NO_GO" : value));

/**
 * Filtros da listagem de oportunidades (`GET /api/oportunidades`), incluindo
 * os query params vindos do Dashboard (`periodo=mes`, `status`, `tipoSistema`).
 * A ordenação é sempre `dataAbertura ASC` e não faz parte deste contrato.
 */
export const oportunidadesFilterSchema = z.object({
  tipoSistema: tipoSistemaCodigoSchema.optional(),
  uf: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  faixaValor: faixaValorSchema.optional(),
  valorMin: z.coerce.number().nonnegative().optional(),
  valorMax: z.coerce.number().nonnegative().optional(),
  status: licitacaoStatusSchema.optional(),
  parecerIA: parecerIAFilterSchema.optional(),
  periodo: z.enum(["mes", "todos"]).optional(),
  busca: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().max(100).default(10).optional(),
});

/**
 * Payload da deliberação rápida (`POST /api/oportunidades/[id]/decisao`).
 * A grafia `"NO-GO"` é normalizada para `"NO_GO"` na saída do parse; o serviço
 * persiste `status = "ACEITA"` (GO) ou `status = "RECUSADA"` (NO_GO) com
 * `motivoRecusa` opcional e grava `DECISAO_GO` / `DECISAO_NO_GO` em `audit_log`.
 */
export const decisaoOportunidadeSchema = z.object({
  decisao: z
    .enum(["GO", "NO_GO", "NO-GO"])
    .transform((value) => (value === "NO-GO" ? "NO_GO" : value)),
  motivoRecusa: z.string().max(1000).optional(),
});

const MINI_RESUMO_MIN_PALAVRAS = 2;
const MINI_RESUMO_MAX_PALAVRAS = 5;

function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Payload do cadastro manual (`POST /api/oportunidades`) para certames
 * capturados fora da esteira automática (Diário Oficial, portais privados).
 * Se `pncpId` for omitido, o serviço gera `MANUAL-${timestamp}-${random}`.
 */
export const criarLicitacaoManualSchema = z.object({
  numeroEdital: z.string().min(1),
  orgaoNome: z.string().min(1),
  orgaoCnpj: z.string().min(11).max(18),
  uf: z.string().length(2),
  municipio: z.string().optional(),
  modalidade: z.string().min(1).default("Pregão Eletrônico"),
  valorEstimado: z.number().nonnegative(),
  dataAbertura: z.coerce.date(),
  miniResumo: z
    .string()
    .min(1)
    .refine(
      (value) => {
        const palavras = contarPalavras(value);
        return (
          palavras >= MINI_RESUMO_MIN_PALAVRAS &&
          palavras <= MINI_RESUMO_MAX_PALAVRAS
        );
      },
      {
        message: `miniResumo deve conter entre ${MINI_RESUMO_MIN_PALAVRAS} e ${MINI_RESUMO_MAX_PALAVRAS} palavras`,
      },
    ),
  resumo: z.string().min(1),
  tipoSistemaCodigo: tipoSistemaCodigoSchema,
  parecerIA: z.enum(["GO", "AVALIAR", "NO_GO"]).default("AVALIAR"),
  isPresencial: z.boolean().default(false),
  pncpId: z.string().min(1).optional(),
});

export type FaixaValor = z.infer<typeof faixaValorSchema>;
export type ParecerIAFilter = z.infer<typeof parecerIAFilterSchema>;
export type OportunidadesFilterInput = z.infer<
  typeof oportunidadesFilterSchema
>;
export type DecisaoOportunidade = z.infer<typeof decisaoOportunidadeSchema>;
export type DecisaoOportunidadeInput = z.input<
  typeof decisaoOportunidadeSchema
>;
export type CriarLicitacaoManualInput = z.infer<
  typeof criarLicitacaoManualSchema
>;
