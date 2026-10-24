import { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/server/audit";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaAuditRegistered: boolean | undefined;
};

const MUTATION_ACTIONS: Readonly<Record<string, string>> = {
  create: "CREATE",
  update: "UPDATE",
  upsert: "UPDATE",
  delete: "DELETE",
};

function sanitizeAuditPayload(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const clone: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "passwordHash" || key === "password") {
      clone[key] = "[REDACTED]";
    } else if (val instanceof Date) {
      clone[key] = val.toISOString();
    } else {
      clone[key] = val;
    }
  }
  return clone;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  client.$use(async (params, next) => {
    const result = await next(params);

    const mappedAction = params.action
      ? MUTATION_ACTIONS[params.action]
      : undefined;

    if (params.model && params.model !== "AuditLog" && mappedAction) {
      const entityId =
        result &&
        typeof result === "object" &&
        "id" in result &&
        result.id !== undefined
          ? String(result.id)
          : String(params.args?.where?.id ?? params.args?.where?.email ?? "unknown");

      await recordAuditLog({
        acao: mappedAction,
        entidadeTipo: params.model,
        entidadeId: entityId,
        antes: null,
        depois: sanitizeAuditPayload(result),
      }).catch(() => undefined);
    }

    return result;
  });

  return client;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
