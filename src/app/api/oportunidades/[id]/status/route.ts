import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  isSuperAdminSessionUser,
  respostaProibidaAdminEmRotaCliente,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import {
  atualizarKanbanStatus,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (isSuperAdminSessionUser(user as unknown as SessionActorClaims)) {
    return respostaProibidaAdminEmRotaCliente();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(
    user?.id || "",
    cookieTenant,
    sessionTenant,
  );

  try {
    const atualizado = await atualizarKanbanStatus(
      id,
      body,
      user,
      {
        ip: request.headers.get("x-forwarded-for"),
        usuarioId: user?.id,
        usuarioNome: user?.name,
      },
      tenantId,
    );
    return NextResponse.json({ ok: true, oportunidade: atualizado }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "VALIDATION_ERROR", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
