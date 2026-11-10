import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { can, type RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  atualizarLicitacao,
  getOportunidadeById,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * `GET /api/oportunidades/[id]` (sprint-1-spec §2.3/§2.4): detalhes de uma
 * oportunidade para a rota `/oportunidades/[id]`. Responde `404` quando o
 * identificador não existe.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = new URL(request.url).searchParams.get("tenantId") || undefined;
  const sessionTenant = (user as any)?.activeTenantId || undefined;
  const preferredTenant = headerTenant || cookieTenant || sessionTenant;
  const tenantId = await resolveUserActiveTenantId(
    (user as any)?.id || "",
    preferredTenant,
    sessionTenant,
  );

  try {
    const oportunidade = await getOportunidadeById(id, tenantId);
    return NextResponse.json({ ok: true, oportunidade }, { status: 200 });
  } catch (error) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/**
 * `PATCH /api/oportunidades/[id]`: atualiza dados operacionais e técnicos da licitação
 * (ex: tipoSistemaCodigo, isPresencial, distanciaGoianiaKm, linkPncp, etc).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (!can(user, "update", "licitacao")) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN", message: "Sem permissão para atualizar licitação." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  try {
    const atualizado = await atualizarLicitacao(
      id,
      body,
      user,
      {
        ip: request.headers.get("x-forwarded-for"),
        usuarioId: user?.id,
        usuarioNome: user?.name,
      },
    );
    return NextResponse.json({ ok: true, oportunidade: atualizado }, { status: 200 });
  } catch (error) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
