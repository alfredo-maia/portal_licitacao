import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import { obterAnaliseIAPorId } from "@/server/services/analise-ia-participacao.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteContext {
  params: Promise<{ id: string; analiseId: string }>;
}

/**
 * `GET /api/oportunidades/[id]/analise-ia/[analiseId]/pdf`:
 * Baixa ou visualiza em streaming o arquivo PDF oficial gerado para o relatório de IA.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id, analiseId } = await context.params;

  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = new URL(request.url).searchParams.get("tenantId") || undefined;
  const sessionTenant = user.activeTenantId || undefined;
  const preferredTenant = headerTenant || cookieTenant || sessionTenant;
  const tenantId = await resolveUserActiveTenantId(
    user.id || "",
    preferredTenant,
    sessionTenant,
  );

  try {
    const analise = await obterAnaliseIAPorId(id, analiseId, tenantId);

    if (!analise) {
      return NextResponse.json(
        { ok: false, error: "ANALISE_NAO_ENCONTRADA", message: "Relatório de IA não encontrado." },
        { status: 404 },
      );
    }

    if (analise.status === "PROCESSANDO" && !analise.pdfBase64) {
      return NextResponse.json(
        {
          ok: false,
          error: "PROCESSANDO",
          message: "O relatório em PDF ainda está sendo gerado em segundo plano. Tente novamente em instantes.",
        },
        { status: 202 },
      );
    }

    if (!analise.pdfBase64) {
      return NextResponse.json(
        { ok: false, error: "PDF_NAO_DISPONIVEL", message: "Arquivo PDF não disponível para este relatório." },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(analise.pdfBase64, "base64");
    const download = new URL(request.url).searchParams.get("download") === "true";
    const nomeArquivo = analise.pdfNome || `Relatorio_IA_${analiseId}.pdf`;
    const disposition = download ? "attachment" : "inline";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(nomeArquivo)}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

