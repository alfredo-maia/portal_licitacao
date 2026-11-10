import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import { OportunidadesServiceError, removerArquivoEdital } from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { GET as downloadArquivoGet } from "./download/route";

interface RouteContext {
  params: Promise<{ id: string; arquivoId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  return downloadArquivoGet(request, context);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, arquivoId } = await context.params;
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as (RbacUser & { id?: string; activeTenantId?: string }) | undefined;

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const tenantId = await resolveUserActiveTenantId(user.id, cookieTenant, user.activeTenantId);

  try {
    await removerArquivoEdital(id, arquivoId, user, {
      usuarioId: user.id,
      usuarioNome: user.name,
      tenantId,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
