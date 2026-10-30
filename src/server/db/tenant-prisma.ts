import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

/**
 * Cria um cliente Prisma com escopo estrito de Tenant via Prisma Extension ($extends)
 * PRD §3.3 / ADR 0007 / Issue #9
 *
 * Injeta automaticamente a cláusula `tenantId` em todas as consultas a entidades privadas
 * (TenantLicitacao, Documento, etc.), impedindo vazamento de dados entre empresas.
 */
export function getTenantPrisma(tenantId: string, baseClient: PrismaClient = prisma) {
  if (!tenantId || typeof tenantId !== "string" || tenantId.trim().length === 0) {
    throw new Error("tenantId é obrigatório e não pode ser vazio ao invocar getTenantPrisma()");
  }

  const cleanTenantId = tenantId.trim();

  return baseClient.$extends({
    name: `tenant-scope-${cleanTenantId}`,
    query: {
      tenantLicitacao: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId: cleanTenantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, tenantId: cleanTenantId };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, tenantId: cleanTenantId };
          return query(args);
        },
        async create({ args, query }) {
          if (args.data && typeof args.data === "object") {
            (args.data as Record<string, unknown>).tenantId = cleanTenantId;
          }
          return query(args);
        },
      },
      documento: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId: cleanTenantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, tenantId: cleanTenantId };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, tenantId: cleanTenantId };
          return query(args);
        },
        async create({ args, query }) {
          if (args.data && typeof args.data === "object") {
            (args.data as Record<string, unknown>).tenantId = cleanTenantId;
          }
          return query(args);
        },
      },
    },
  });
}
