import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { getCalendarioData } from "@/server/services/calendario.service";
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

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(
    (user as any)?.id || "",
    cookieTenant,
    sessionTenant,
  );

  try {
    const data = await getCalendarioData(
      {
        mes: mesParam ? parseInt(mesParam, 10) : undefined,
        ano: anoParam ? parseInt(anoParam, 10) : undefined,
      },
      tenantId,
    );
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}
