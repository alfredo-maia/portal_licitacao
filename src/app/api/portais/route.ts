import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { parseDataCivil } from "@/lib/date-utils";
import { criarPortal, listarPortais } from "@/server/services/portais.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
  if (!guard.ok) return guard.response;

  const userId = guard.user.id;
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = guard.user.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const busca = searchParams.get("busca") || undefined;
  const apenasVencendo = searchParams.get("apenasVencendoEmDias");
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  try {
    const data = await listarPortais({
      tenantId: tenantId || undefined,
      status: status as any,
      busca,
      apenasVencendoEmDias: apenasVencendo ? parseInt(apenasVencendo, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
  if (!guard.ok) return guard.response;
  const userId = guard.user.id;

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = guard.user.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);

  try {
    const body = await request.json();
    if (body.dataVencimento) {
      body.dataVencimento = parseDataCivil(body.dataVencimento);
    }
    const portal = await criarPortal(body, userId, tenantId);
    return NextResponse.json({ ok: true, portal }, { status: 201 });
  } catch (error: any) {
    const errorMsg = error?.errors?.[0]?.message || error?.message || "Erro de validação ao salvar portal.";
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: errorMsg },
      { status: 400 },
    );
  }
}
