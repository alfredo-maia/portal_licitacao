import { z } from "zod";
import {
  buscaMinTresCaracteresSchema,
  faixaValorSchema,
  oportunidadesSortBySchema,
  sortDirSchema,
} from "./oportunidades.schema";

/**
 * Contratos do Módulo "Histórico de Licitações" (`/historico-licitacoes` /
 * `GET /api/historico-licitacoes` — Issue #59).
 *
 * Aberto a qualquer plano de cliente com todos os 40 segmentos + `OUTROS` e
 * 27 UFs liberados, protegido por trava de janela máxima de 30 dias corridos
 * e mínimo de 3 caracteres na busca textual.
 */

export const MAX_HISTORICO_DIAS_JANELA = 30 as const;

export const situacaoPrazoHistoricoSchema = z.enum([
  "TODAS",
  "ENCERRADAS",
  "ABERTAS",
]);

const isoDateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use o formato YYYY-MM-DD)");

function parseIsoDayUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export const historicoLicitacoesQuerySchema = z
  .object({
    dataInicio: isoDateOnlySchema,
    dataFim: isoDateOnlySchema,
    situacaoPrazo: situacaoPrazoHistoricoSchema.default("TODAS"),
    segmento: z
      .string()
      .trim()
      .transform((v) => (v === "" || v === "TODOS" ? undefined : v))
      .optional(),
    subsegmento: z
      .string()
      .trim()
      .transform((v) => (v === "" || v === "TODOS" ? undefined : v))
      .optional(),
    uf: z
      .string()
      .trim()
      .regex(/^[a-zA-Z]{2}(\s*,\s*[a-zA-Z]{2})*$/, "UF inválida")
      .transform((value) =>
        value
          .split(",")
          .map((u) => u.trim().toUpperCase())
          .filter(Boolean)
          .join(","),
      )
      .optional(),
    faixaValor: faixaValorSchema.optional(),
    valorMin: z.coerce.number().nonnegative().optional(),
    valorMax: z.coerce.number().nonnegative().optional(),
    busca: buscaMinTresCaracteresSchema,
    sortBy: oportunidadesSortBySchema.default("dataLimite"),
    sortDir: sortDirSchema.default("desc"),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(10),
  })
  .superRefine((data, ctx) => {
    const startMs = parseIsoDayUtcMs(data.dataInicio);
    const endMs = parseIsoDayUtcMs(data.dataFim);

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataInicio"],
        message: "Datas informadas são inválidas",
      });
      return;
    }

    if (endMs < startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataFim"],
        message: "A data final deve ser igual ou posterior à data inicial",
      });
      return;
    }

    const diffDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
    if (diffDays > MAX_HISTORICO_DIAS_JANELA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataFim"],
        message: `O intervalo máximo de consulta no Histórico é de ${MAX_HISTORICO_DIAS_JANELA} dias`,
      });
    }
  });

export type SituacaoPrazoHistorico = z.infer<
  typeof situacaoPrazoHistoricoSchema
>;
export type HistoricoLicitacoesQuery = z.infer<
  typeof historicoLicitacoesQuerySchema
>;
export type HistoricoLicitacoesQueryInput = z.input<
  typeof historicoLicitacoesQuerySchema
>;
