import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { declaracaoGerarInputSchema } from "@/server/schemas/declaracao.schema";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { gerarPdfDeclaracao } from "@/lib/declaracao-pdf";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const body = await req.json().catch(() => ({}));
    const parseResult = declaracaoGerarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para geração do PDF de declaração",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

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
    const { pdfBuffer, pdfNome } = await gerarPdfDeclaracao({
      dados: parseResult.data,
      empresa,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdfNome}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[DeclaracoesPdfRoute] Erro ao gerar PDF de declaração:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Erro interno ao gerar o PDF timbrado da declaração",
      },
      { status: 500 },
    );
  }
}

