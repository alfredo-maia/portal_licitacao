import { z } from "zod";

export const auditActionSchema = z.enum([
  "CREATE",
  "UPDATE",
  "DELETE",
  "DECIDE_GO_NOGO",
  "MOVE_KANBAN",
  "LOGIN",
  "SEED",
]);

export const auditLogInputSchema = z.object({
  usuarioId: z.string().nullable().optional(),
  usuarioNome: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  acao: z.string().min(1),
  entidadeTipo: z.string().min(1),
  entidadeId: z.string().min(1),
  antes: z.record(z.string(), z.unknown()).nullable().optional(),
  depois: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const auditLogRecordSchema = auditLogInputSchema.extend({
  id: z.string().min(1),
  ocorridoEm: z.coerce.date(),
});

export type AuditLogInput = z.infer<typeof auditLogInputSchema>;
export type AuditLogRecord = z.infer<typeof auditLogRecordSchema>;
