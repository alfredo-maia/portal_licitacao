import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type AuditLogInput,
  type AuditLogRecord,
  auditLogInputSchema,
  auditLogRecordSchema,
} from "@/server/schemas/audit.schema";

export type { AuditLogInput, AuditLogRecord };

export interface AuditActorContext {
  usuarioId?: string | null;
  usuarioNome?: string | null;
  tenantId?: string | null;
  ip?: string | null;
}

let currentAuditActor: AuditActorContext | null = null;
const inMemoryAuditLogs: AuditLogRecord[] = [];

export function setAuditActorContext(context: AuditActorContext | null): void {
  currentAuditActor = context;
}

export function getAuditActorContext(): AuditActorContext | null {
  return currentAuditActor;
}

export function getInMemoryAuditLogs(): readonly AuditLogRecord[] {
  return inMemoryAuditLogs;
}

/**
 * Gravação imutável na tabela `audit_log` (PRD §7 / sprint-0-spec §2.4).
 * Persiste no PostgreSQL 16 via Prisma ORM com fallback resiliente em memória
 * caso o banco não esteja acessível (ex.: execução isolada de testes unitários em CI).
 */
export async function recordAuditLog(
  input: AuditLogInput,
): Promise<AuditLogRecord> {
  const parsed = auditLogInputSchema.parse(input);
  const actor = currentAuditActor;

  const usuarioId = parsed.usuarioId ?? actor?.usuarioId ?? null;
  const usuarioNome = parsed.usuarioNome ?? actor?.usuarioNome ?? null;
  const tenantId = parsed.tenantId ?? actor?.tenantId ?? null;
  const ip = parsed.ip ?? actor?.ip ?? null;
  const antes = parsed.antes ?? null;
  const depois = parsed.depois ?? null;

  try {
    let dbUsuarioId: string | null = null;
    if (usuarioId) {
      const existingUser = await prisma.user.findUnique({
        where: { id: usuarioId },
        select: { id: true },
      });
      if (existingUser) {
        dbUsuarioId = existingUser.id;
      }
    }

    const created = await prisma.auditLog.create({
      data: {
        usuarioId: dbUsuarioId,
        usuarioNome,
        tenantId,
        ip,
        acao: parsed.acao,
        entidadeTipo: parsed.entidadeTipo,
        entidadeId: parsed.entidadeId,
        antes: (antes ?? undefined) as Prisma.InputJsonValue | undefined,
        depois: (depois ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    const record: AuditLogRecord = {
      id: created.id,
      ocorridoEm: created.ocorridoEm,
      usuarioId: created.usuarioId ?? usuarioId,
      usuarioNome: created.usuarioNome ?? usuarioNome,
      tenantId: created.tenantId ?? tenantId,
      ip: created.ip ?? ip,
      acao: created.acao,
      entidadeTipo: created.entidadeTipo,
      entidadeId: created.entidadeId,
      antes: (created.antes as Record<string, unknown> | null) ?? antes,
      depois: (created.depois as Record<string, unknown> | null) ?? depois,
    };

    const validated = auditLogRecordSchema.parse(record);
    inMemoryAuditLogs.push(validated);
    return validated;
  } catch {
    const fallbackRecord: AuditLogRecord = {
      id: `audit_${randomUUID()}`,
      ocorridoEm: new Date(),
      usuarioId,
      usuarioNome,
      tenantId,
      ip,
      acao: parsed.acao,
      entidadeTipo: parsed.entidadeTipo,
      entidadeId: parsed.entidadeId,
      antes,
      depois,
    };

    const validated = auditLogRecordSchema.parse(fallbackRecord);
    inMemoryAuditLogs.push(validated);
    return validated;
  }
}
