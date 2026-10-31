import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { auditViewerQuerySchema } from "@/server/schemas/audit-viewer.schema";
import { listarAuditLogs } from "@/server/services/audit-viewer.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const tenantId = (session?.user as any)?.activeTenantId;

    const { searchParams } = new URL(req.url);
    const query = auditViewerQuerySchema.parse({
      entidadeTipo: searchParams.get("entidadeTipo") || undefined,
      acao: searchParams.get("acao") || undefined,
      usuarioId: searchParams.get("usuarioId") || undefined,
      tenantId: searchParams.get("tenantId") || undefined,
      busca: searchParams.get("busca") || undefined,
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 15,
    });

    const resultado = await listarAuditLogs(query, tenantId);
    return NextResponse.json(resultado);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao consultar trilha de auditoria" },
      { status: 400 },
    );
  }
}
