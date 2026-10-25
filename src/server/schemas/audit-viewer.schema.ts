import { z } from "zod";

/**
 * Contrato de Visualização da Trilha de Auditoria (PRD §7 / Sprint 6).
 */
export const auditViewerQuerySchema = z.object({
  entidadeTipo: z.string().trim().optional(),
  acao: z.string().trim().optional(),
  usuarioId: z.string().trim().optional(),
  busca: z.string().trim().optional(),
  dataInicio: z.string().trim().optional(),
  dataFim: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(15),
});

export const auditViewerItemSchema = z.object({
  id: z.string(),
  ocorridoEm: z.coerce.date(),
  usuarioId: z.string().nullable().optional(),
  usuarioNome: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  acao: z.string(),
  entidadeTipo: z.string(),
  entidadeId: z.string(),
  antes: z.record(z.string(), z.unknown()).nullable().optional(),
  depois: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const auditViewerListResponseSchema = z.object({
  ok: z.literal(true),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  logs: z.array(auditViewerItemSchema),
});

export type AuditViewerQuery = z.infer<typeof auditViewerQuerySchema>;
export type AuditViewerItem = z.infer<typeof auditViewerItemSchema>;
export type AuditViewerListResponse = z.infer<typeof auditViewerListResponseSchema>;
