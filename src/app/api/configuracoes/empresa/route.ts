import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { configuracaoEmpresaAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import {
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from "@/server/services/configuracoes.service";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const headerTenant = req ? new URL(req.url).searchParams.get("tenantId") : null;
    const tenantId = headerTenant || cookieTenant || (session?.user as any)?.activeTenantId;
    const empresa = await obterConfiguracaoEmpresa(tenantId);
    return NextResponse.json({ ok: true, empresa });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao obter configurações da empresa" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const body = await req.json().catch(() => ({}));
    const parseResult = configuracaoEmpresaAtualizarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para atualização da empresa",
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
    const tenantId = cookieTenant || (session?.user as any)?.activeTenantId;
    const empresa = await atualizarConfiguracaoEmpresa(
      parseResult.data,
      (session?.user as any)?.id,
      tenantId,
    );

    return NextResponse.json({ ok: true, empresa });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar dados da empresa" },
      { status: 500 },
    );
  }
}
