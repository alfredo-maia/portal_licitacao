import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { can, type RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { auditViewerQuerySchema } from "@/server/schemas/audit-viewer.schema";
import { exportarAuditLogsCsv } from "@/server/services/audit-viewer.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
    if (!guard.ok) return guard.response;

    const rbacUser = session?.user as RbacUser;
    if (!can(rbacUser, "audit", "audit_log")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const { searchParams } = new URL(req.url);
    const tenantId = await resolveUserActiveTenantId(
      guard.user.id,
      searchParams.get("tenantId") || cookieTenant,
      guard.user.activeTenantId,
    );

    const query = auditViewerQuerySchema.parse({
      entidadeTipo: searchParams.get("entidadeTipo") || undefined,
      acao: searchParams.get("acao") || undefined,
      usuarioId: searchParams.get("usuarioId") || undefined,
      busca: searchParams.get("busca") || undefined,
    });

    const csvContent = tenantId
      ? await exportarAuditLogsCsv(query, tenantId)
      : "ID,DATA_HORA,USUARIO,ACAO,ENTIDADE_TIPO,ENTIDADE_ID,ANTES,DEPOIS";
    const dataHoje = new Date().toISOString().substring(0, 10);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trilha_auditoria_${dataHoje}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao exportar trilha de auditoria em CSV" },
      { status: 500 },
    );
  }
}
