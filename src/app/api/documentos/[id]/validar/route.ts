import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { runWithAuditActorContext } from "@/server/audit";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { revalidarAnexoDocumento } from "@/server/services/documentos.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SessionUserWithTenant {
  id?: string;
  name?: string | null;
  email?: string | null;
  activeTenantId?: string | null;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUserWithTenant | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const userId = user.id;
  const userName = user.name ?? user.email ?? null;

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = user.activeTenantId ?? null;
  const tenantId = await resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);

  return runWithAuditActorContext(
    {
      usuarioId: userId,
      usuarioNome: userName,
      tenantId,
      ip: request?.headers?.get?.("x-forwarded-for") ?? null,
    },
    async () => {
      const { id } = await params;
      const doc = await revalidarAnexoDocumento(id, tenantId, userId, {
        tenantId: tenantId ?? null,
        userId,
        usuarioNome: userName,
      });
      if (!doc) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, documento: doc }, { status: 200 });
    },
  );
}

