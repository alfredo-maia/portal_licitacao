import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { gerarPdfPedidoCotacao } from "@/lib/pedido-cotacao-pdf";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const body = await req.json().catch(() => ({}));

    const { orgaoNome, numeroEdital, itens, configuracao } = body;

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const queryTenant = new URL(req.url).searchParams.get("tenantId");
    const userId = (session?.user as any)?.id || "";
    const sessionTenant = (session?.user as any)?.activeTenantId;
    const requestedTenant = queryTenant || body.tenantId || cookieTenant;
    const tenantId = await resolveUserActiveTenantId(userId, requestedTenant, sessionTenant);

    const empresa = await obterConfiguracaoEmpresa(tenantId);

    const { pdfBuffer, pdfNome } = await gerarPdfPedidoCotacao({
      orgaoNome: String(orgaoNome || ""),
      numeroEdital: String(numeroEdital || ""),
      itens: Array.isArray(itens) ? itens : [],
      configuracao: configuracao || {},
      empresa,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdfNome}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[CotacoesPdfRoute] Erro ao gerar PDF do pedido de cotação:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Falha interna ao gerar o PDF do pedido de cotação",
        mensagem: err?.message || String(err),
      },
      { status: 500 },
    );
  }
}

