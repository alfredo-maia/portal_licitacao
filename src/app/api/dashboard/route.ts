import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { getDashboardData } from "@/server/services/dashboard.service";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mesParam = searchParams.get("mes");
  const anoParam = searchParams.get("ano");

  const userId = (user as any)?.id || "";
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = searchParams.get("tenantId");
  const preferredTenant = headerTenant || cookieTenant || (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(userId, preferredTenant);

  let configuracaoPendente = false;
  let segmentosTenantAtivo: string[] | undefined;
  if (tenantId) {
    try {
      const cfg = await obterConfiguracaoEmpresa(tenantId);
      if (!cfg?.segmentos || cfg.segmentos.length === 0) {
        configuracaoPendente = true;
      } else {
        segmentosTenantAtivo = cfg.segmentos;
      }
    } catch {}
  }

  if (configuracaoPendente) {
    try {
      const data = await getDashboardData({
        mes: mesParam ? parseInt(mesParam, 10) : undefined,
        ano: anoParam ? parseInt(anoParam, 10) : undefined,
        tenantId: tenantId || undefined,
        segmentosTenantAtivo: [],
      });
      return NextResponse.json({ ...data, configuracaoPendente: true }, { status: 200 });
    } catch {
      // Fallback seguro caso falhe
    }
  }

  try {
    const data = await getDashboardData({
      mes: mesParam ? parseInt(mesParam, 10) : undefined,
      ano: anoParam ? parseInt(anoParam, 10) : undefined,
      tenantId: tenantId || undefined,
      segmentosTenantAtivo,
    });
    return NextResponse.json({ ...data, configuracaoPendente: false }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}
