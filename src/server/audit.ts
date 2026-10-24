import type { AuditLogInput, AuditLogRecord } from "@/server/schemas/audit.schema";

export type { AuditLogInput, AuditLogRecord };

export interface AuditActorContext {
  usuarioId?: string | null;
  usuarioNome?: string | null;
  ip?: string | null;
}

/**
 * Contrato de gravação imutável na tabela `audit_log` (PRD §7 / sprint-0-spec §2.4).
 * A implementação definitiva (GREEN) pertence à Etapa 3A (AV-28 - Backend).
 */
export async function recordAuditLog(
  _input: AuditLogInput,
): Promise<AuditLogRecord> {
  throw new Error(
    "Not implemented: recordAuditLog awaits Sprint 0 Stage 3A Backend GREEN implementation (AV-28)",
  );
}
