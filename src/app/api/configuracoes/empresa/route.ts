import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { configuracaoEmpresaAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import {
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
    if (!guard.ok) return guard.response;
    const userId = guard.user.id;
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const headerTenant = req ? new URL(req.url).searchParams.get("tenantId") : null;
    const sessionTenant = guard.user.activeTenantId;
    const requestedTenant = headerTenant || cookieTenant;
    const tenantId = await resolveUserActiveTenantId(userId, requestedTenant, sessionTenant);

    const empresa = await obterConfiguracaoEmpresa(tenantId);
    return NextResponse.json({ ok: true, empresa, activeTenantId: tenantId });
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
    const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
    if (!guard.ok) return guard.response;
    const userId = guard.user.id;
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
    const queryTenant = new URL(req.url).searchParams.get("tenantId");
    const sessionTenant = guard.user.activeTenantId;
    const requestedTenant = queryTenant || body.tenantId || cookieTenant;
    const tenantId = await resolveUserActiveTenantId(userId, requestedTenant, sessionTenant);

    const empresa = await atualizarConfiguracaoEmpresa(
      parseResult.data,
      userId,
      tenantId,
    );

    return NextResponse.json({ ok: true, empresa, activeTenantId: tenantId });
  } catch (error: any) {
    const status = error.statusCode || 500;
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar dados da empresa", diasRestantes: error.diasRestantes },
      { status },
    );
  }
}
