import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { auditViewerQuerySchema } from "@/server/schemas/audit-viewer.schema";
import { exportarAuditLogsCsv } from "@/server/services/audit-viewer.service";

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
    });

    const csvContent = await exportarAuditLogsCsv(query, tenantId);
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
