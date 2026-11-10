import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { revalidarAnexoDocumento } from "@/server/services/documentos.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = (session?.user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(user.id, cookieTenant, sessionTenant);

  const { id } = await params;
  const doc = await revalidarAnexoDocumento(id, tenantId, user.id);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, documento: doc }, { status: 200 });
}

