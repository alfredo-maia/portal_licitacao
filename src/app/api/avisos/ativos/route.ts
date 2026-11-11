import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { listarAvisosAtivosParaTenant } from "@/server/services/superadmin.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

/** Avisos em massa ativos para o CNPJ do usuário logado (banner de topo / sino). */
export async function GET(req?: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as
    | { id?: string; activeTenantId?: string | null }
    | undefined;
  if (!session?.user) return NextResponse.json({ avisos: [] });
  try {
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const queryTenant = req
      ? new URL(req.url).searchParams.get("tenantId") || undefined
      : undefined;
    const headerTenant = req?.headers.get("x-tenant-id") || undefined;
    const preferredTenant = queryTenant || headerTenant || cookieTenant;

    const tenantId = user?.id
      ? await resolveUserActiveTenantId(
          user.id,
          preferredTenant,
          user.activeTenantId ?? null,
        )
      : (user?.activeTenantId ?? null);

    const avisos = await listarAvisosAtivosParaTenant(tenantId);
    return NextResponse.json({
      avisos: avisos.filter(
        (a) =>
          a.formato === "BANNER_TOPO" ||
          a.formato === "AMBOS" ||
          a.formato === "SINO",
      ),
    });
  } catch {
    return NextResponse.json({ avisos: [] });
  }
}
