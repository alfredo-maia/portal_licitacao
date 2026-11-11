import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import {
  AdminTenantsQuerySchema,
  ExpansaoCotaStorageSchema,
} from "@/server/schemas/superadmin.schema";
import {
  expandirCotaStorageTenant,
  listarTenantsSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/**
 * GET: lista clientes (filtros `?status=` e `?busca=` por e-mail/nome/CNPJ).
 * POST: expande cota de armazenamento R2 com 1 clique. 404 para não administradores.
 */
export async function GET(req: NextRequest) {
  const g = await exigirAdmin("clientes");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const sp = req.nextUrl.searchParams;
        const query = AdminTenantsQuerySchema.parse({
          status: sp.get("status")?.trim() || undefined,
          busca: sp.get("busca")?.trim() || undefined,
        });
        const tenants = await listarTenantsSuperAdmin({
          statusFiltro: query.status,
          busca: query.busca,
        });
        return NextResponse.json(tenants, { status: 200 });
      } catch (error) {
        return respostaErroAdmin(error, "tenants");
      }
    },
  );
}

export async function POST(req: NextRequest) {
  const g = await exigirAdmin("clientes", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const payload = ExpansaoCotaStorageSchema.parse(await req.json());
        const res = await expandirCotaStorageTenant(payload);
        return NextResponse.json(res, { status: 200 });
      } catch (error) {
        return respostaErroAdmin(error, "expandir-cota");
      }
    },
  );
}
