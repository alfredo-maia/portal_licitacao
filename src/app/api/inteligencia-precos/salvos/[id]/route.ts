import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { excluirItemPrecoSalvo } from "@/server/services/inteligencia-precos.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions).catch(() => null);
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const { searchParams } = new URL(req.url);
    const queryTenant = searchParams.get("tenantId") || req.headers.get("x-tenant-id");
    const userId = (session?.user as any)?.id || "";
    const sessionTenant =
      (session?.user as any)?.activeTenantId || (session?.user as any)?.tenantId;
    const requestedTenant = queryTenant || cookieTenant;

    const tenantId = userId
      ? await resolveUserActiveTenantId(userId, requestedTenant, sessionTenant)
      : requestedTenant || "tenant-default";

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Empresa ativa não identificada" },
        { status: 403 },
      );
    }

    const excluido = await excluirItemPrecoSalvo(tenantId, id);
    if (!excluido) {
      return NextResponse.json(
        { ok: false, error: "Item salvo não encontrado para exclusão" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, excluido: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao excluir item salvo",
      },
      { status: 500 },
    );
  }
}

