import { z } from "zod";

/**
 * Contrato do Motor de Notificações (PRD §4.10, §6.2 / sprint-3-spec §2.3).
 * N1–N5 são emitidas na Sprint 3. N6–N8 têm contrato e enum definidos agora, mas
 * suas fontes (`Portal`, `Documento`, `Impugnacao`) só existem nas Sprints 4–5.
 */

export const NOTIFICACAO_TIPOS = [
  "N1_COLETA_CONCLUIDA",
  "N2_LICITACAO_ATUALIZADA",
  "N3_ABERTURA_AMANHA",
  "N4_PRESENCIAL_PROXIMA",
  "N5_PENDENTE_CRITICA",
  "N6_VENCIMENTO_PORTAL",
  "N7_VENCIMENTO_DOCUMENTO",
  "N8_PRAZO_IMPUGNACAO",
] as const;

export const notificacaoTipoSchema = z.enum(NOTIFICACAO_TIPOS);
export const notificacaoSeveridadeSchema = z.enum(["INFO", "ATENCAO", "CRITICA"]);

export const NOTIFICACAO_DESTINATARIOS = [
  "TODOS",
  "RESPONSAVEL_E_ATRIBUIDOS",
  "DIRETORIA_E_COMERCIAL",
  "DIRETORIA",
] as const;

export const notificacaoDestinatariosRegraSchema = z.enum(NOTIFICACAO_DESTINATARIOS);

/**
 * Matriz de eventos (PRD §6.2). `antecedenciaDias` lista, em dias antes do evento,
 * as janelas de disparo; `null` = disparo por evento (sem janela).
 * "Jurídico" (N8) não existe como perfil: mapeado para `DIRETORIA`.
 */
export const NOTIFICACAO_MATRIZ = {
  N1_COLETA_CONCLUIDA: {
    destinatarios: "TODOS",
    severidade: "INFO",
    antecedenciaDias: null,
  },
  N2_LICITACAO_ATUALIZADA: {
    destinatarios: "RESPONSAVEL_E_ATRIBUIDOS",
    severidade: "ATENCAO",
    antecedenciaDias: null,
  },
  N3_ABERTURA_AMANHA: {
    destinatarios: "RESPONSAVEL_E_ATRIBUIDOS",
    severidade: "ATENCAO",
    antecedenciaDias: [1],
  },
  N4_PRESENCIAL_PROXIMA: {
    destinatarios: "RESPONSAVEL_E_ATRIBUIDOS",
    severidade: "ATENCAO",
    antecedenciaDias: [7, 1],
  },
  N5_PENDENTE_CRITICA: {
    destinatarios: "DIRETORIA_E_COMERCIAL",
    severidade: "CRITICA",
    antecedenciaDias: null,
  },
  N6_VENCIMENTO_PORTAL: {
    destinatarios: "DIRETORIA_E_COMERCIAL",
    severidade: "ATENCAO",
    antecedenciaDias: [30, 21, 14, 7, 1],
  },
  N7_VENCIMENTO_DOCUMENTO: {
    destinatarios: "TODOS",
    severidade: "ATENCAO",
    antecedenciaDias: [30, 14, 1],
  },
  N8_PRAZO_IMPUGNACAO: {
    destinatarios: "DIRETORIA",
    severidade: "CRITICA",
    antecedenciaDias: [2, 1],
  },
} as const satisfies Record<
  (typeof NOTIFICACAO_TIPOS)[number],
  {
    destinatarios: (typeof NOTIFICACAO_DESTINATARIOS)[number];
    severidade: "INFO" | "ATENCAO" | "CRITICA";
    antecedenciaDias: readonly number[] | null;
  }
>;

/** Tipos efetivamente emitidos nesta sprint. */
export const NOTIFICACAO_TIPOS_SPRINT_3 = [
  "N1_COLETA_CONCLUIDA",
  "N2_LICITACAO_ATUALIZADA",
  "N3_ABERTURA_AMANHA",
  "N4_PRESENCIAL_PROXIMA",
  "N5_PENDENTE_CRITICA",
] as const;

/** Janela crítica do N5: `PENDENTE` com abertura em menos de 72 horas. */
export const NOTIFICACAO_N5_JANELA_HORAS = 72;

/**
 * Chave de idempotência: `${tipo}:${entidadeId}:${janela}`.
 * `janela` identifica a ocorrência (ex.: data BRT `2026-11-04` para N3/N4/N5,
 * `hashCritico` para N2, `executadoEm` ISO para N1). A mesma chave nunca gera
 * duas notificações (UK em `notificacao.chaveIdempotencia`).
 */
export const chaveIdempotenciaInputSchema = z.object({
  tipo: notificacaoTipoSchema,
  entidadeId: z.string().min(1),
  janela: z.string().min(1),
});

export function montarChaveIdempotencia(
  input: z.input<typeof chaveIdempotenciaInputSchema>,
): string {
  const { tipo, entidadeId, janela } = chaveIdempotenciaInputSchema.parse(input);
  return `${tipo}:${entidadeId}:${janela}`;
}

export const notificacaoCriarInputSchema = z.object({
  tipo: notificacaoTipoSchema,
  titulo: z.string().trim().min(1).max(160),
  descricao: z.string().trim().min(1).max(2000),
  severidade: notificacaoSeveridadeSchema.optional(),
  linkDestino: z.string().startsWith("/").optional(),
  licitacaoId: z.string().min(1).optional(),
  chaveIdempotencia: z.string().min(1),
  destinatarioIds: z.array(z.string().min(1)).min(1),
});

/** `z.coerce.boolean("false")` retorna `true`; por isso o parse explícito de string. */
const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const notificacoesListQuerySchema = z.object({
  apenasNaoLidas: booleanQuerySchema.optional(),
  tipo: notificacaoTipoSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});

export const notificacaoItemSchema = z.object({
  id: z.string().min(1),
  tipo: notificacaoTipoSchema,
  titulo: z.string().min(1),
  descricao: z.string().min(1),
  severidade: notificacaoSeveridadeSchema,
  linkDestino: z.string().nullable(),
  criadaEm: z.coerce.date(),
  lida: z.boolean(),
  lidaEm: z.coerce.date().nullable(),
});

export const notificacoesListResponseSchema = z.object({
  ok: z.literal(true),
  total: z.number().int().nonnegative(),
  naoLidas: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  notificacoes: z.array(notificacaoItemSchema),
});

/** `GET /api/notificacoes/resumo` — alimenta o sino global (badge + 5 mais recentes). */
export const notificacoesResumoResponseSchema = z.object({
  ok: z.literal(true),
  naoLidas: z.number().int().nonnegative(),
  recentes: z.array(notificacaoItemSchema).max(5),
});

/** `POST /api/notificacoes/marcar-todas` e `PATCH /api/notificacoes/[id]/lida`. */
export const notificacaoMarcarLidasResponseSchema = z.object({
  ok: z.literal(true),
  marcadas: z.number().int().nonnegative(),
});

/**
 * `POST /api/notificacoes/jobs/diario` — varredura idempotente de N3/N4/N5.
 * Autenticação por header `x-cron-secret` (env `CRON_SECRET`, mín. 16 caracteres),
 * invocada por cron externo (VPS/Paperclip/GitHub Actions). `referencia` permite
 * reprocessar um dia específico (default: agora).
 */
export const notificacoesJobHeaderSchema = z.object({
  "x-cron-secret": z.string().min(16),
});

export const notificacoesJobInputSchema = z.object({
  referencia: z.coerce.date().optional(),
});

export const notificacoesJobResponseSchema = z.object({
  ok: z.literal(true),
  criadas: z.record(notificacaoTipoSchema, z.number().int().nonnegative()),
  ignoradasPorIdempotencia: z.number().int().nonnegative(),
});

export type NotificacaoTipo = z.infer<typeof notificacaoTipoSchema>;
export type NotificacaoCriarInput = z.infer<typeof notificacaoCriarInputSchema>;
export type NotificacoesListQuery = z.infer<typeof notificacoesListQuerySchema>;
export type NotificacaoItem = z.infer<typeof notificacaoItemSchema>;
export type NotificacoesListResponse = z.infer<
  typeof notificacoesListResponseSchema
>;
