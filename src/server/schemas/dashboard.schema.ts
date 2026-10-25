import { z } from "zod";
import { tipoSistemaCodigoSchema } from "./tipos-sistema.schema";

/**
 * Contrato do Dashboard Executivo (PRD §4.1 / sprint-3-spec §2.1).
 *
 * Regras de cálculo (todas relativas ao mês `ano/mes` em America/Sao_Paulo;
 * limites do mês convertidos para UTC com offset -03:00):
 * - `recebidas`: licitações com `createdAt` no mês.
 * - `aguardandoDecisao.total`: backlog atual com `status = PENDENTE` (sem filtro de data);
 *   `aguardandoDecisao.recebidasNoMes`: PENDENTE com `createdAt` no mês.
 * - `emPrecificacao`: status atual em `STATUS_EM_PRECIFICACAO` e com transição para
 *   `ACEITA` registrada no mês em `licitacao_status_historico`.
 * - `recusadas`: status atual `RECUSADA` com transição para `RECUSADA` no mês.
 * - Desfechos (`contempladas`, `perdidasPreco`, `perdidasDocumentacao`,
 *   `desistencias`, `impugnadas`): status atual igual ao desfecho E última
 *   transição para esse status ocorrida no mês.
 * - `contempladas.valorTotal`: soma de `coalesce(valorArrematado, valorEstimado)`.
 * - `taxaConversaoPercentual`: `contempladas / (contempladas + perdidasPreco +
 *   perdidasDocumentacao) * 100`, arredondada a 1 casa; `null` se denominador = 0.
 */
export const dashboardQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  ano: z.coerce.number().int().min(2024).max(2100).optional(),
});

const contagemSchema = z.object({ total: z.number().int().nonnegative() });

const contagemValorSchema = contagemSchema.extend({
  valorTotal: z.number().nonnegative(),
});

export const dashboardTopTipoSchema = z.object({
  posicao: z.number().int().min(1).max(4),
  tipoSistemaCodigo: tipoSistemaCodigoSchema,
  nome: z.string().min(1),
  total: z.number().int().positive(),
});

export const dashboardCriticaSchema = z.object({
  id: z.string().min(1),
  numeroEdital: z.string().min(1),
  orgaoNome: z.string().min(1),
  dataAbertura: z.coerce.date(),
  segundosRestantes: z.number().int().nonnegative(),
  status: z.string().min(1),
});

export const dashboardResponseSchema = z.object({
  ok: z.literal(true),
  periodo: z.object({
    mes: z.number().int().min(1).max(12),
    ano: z.number().int(),
    inicioUtc: z.coerce.date(),
    fimUtc: z.coerce.date(),
  }),
  cards: z.object({
    recebidas: contagemSchema,
    aguardandoDecisao: contagemSchema.extend({
      recebidasNoMes: z.number().int().nonnegative(),
    }),
    emPrecificacao: contagemSchema,
    recusadas: contagemSchema,
  }),
  resultados: z.object({
    contempladas: contagemValorSchema,
    perdidasPreco: contagemSchema,
    perdidasDocumentacao: contagemSchema,
    desistencias: contagemSchema,
    impugnadas: contagemSchema,
    taxaConversaoPercentual: z.number().min(0).max(100).nullable(),
  }),
  indicadores: z.object({
    volumeEmDisputa: z.number().nonnegative(),
    viabilidadeIA: z.object({
      totalAnalisadas: z.number().int().nonnegative(),
      goPercentual: z.number().min(0).max(100).nullable(),
      noGoPercentual: z.number().min(0).max(100).nullable(),
    }),
    criticas72h: z.array(dashboardCriticaSchema),
  }),
  topTipos: z.array(dashboardTopTipoSchema).max(4),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
