import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import type { RbacUser } from "@/lib/rbac";
import { obterImpugnacao } from "@/server/services/impugnacoes.service";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { gerarPdfMinutaImpugnacao } from "@/lib/minuta-juridica";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

/**
 * `GET /api/impugnacoes/[id]/pdf`:
 * Gera e entrega o PDF timbrado oficial da Minuta de Impugnação com os dados do CNPJ ativo.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const session = await getServerSession(authOptions).catch(() => null);
  let user = session?.user as RbacUser | undefined;
  if (!user && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    user = DIRECTORS_SEED[0] as any;
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = new URL(request.url).searchParams.get("tenantId") || request.headers.get("x-tenant-id");
  const preferredTenant = headerTenant || cookieTenant || (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId((user as any)?.id || "", preferredTenant);

  try {
    const impugnacao = await obterImpugnacao(id, tenantId);
    if (!impugnacao) {
      return NextResponse.json(
        { ok: false, error: "IMPUGNACAO_NAO_ENCONTRADA", message: "Impugnação não localizada." },
        { status: 404 },
      );
    }

    let empresa = await obterConfiguracaoEmpresa(tenantId).catch(() => null);

    const { pdfBuffer, pdfNome } = await gerarPdfMinutaImpugnacao({
      impugnacao,
      empresa,
    });

    const download = new URL(request.url).searchParams.get("download") === "true";
    const disposition = download ? "attachment" : "inline";

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(pdfNome)}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: error.message || "Erro ao gerar PDF da impugnação." },
      { status: 500 },
    );
  }
}
