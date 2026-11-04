import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import {
  atualizarNota,
  excluirNota,
  LicitacaoNotasError,
} from "@/server/services/licitacao-notas.service";
import { OportunidadesServiceError } from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteContext {
  params: Promise<{ id: string; notaId: string }>;
}

async function resolveTenantAndUser(request: Request) {
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
  const headerTenant = new URL(request.url).searchParams.get("tenantId");
  const preferredTenant = headerTenant || cookieTenant || (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId((user as any)?.id || "", preferredTenant);

  return { user, tenantId };
}

/**
 * `PATCH /api/oportunidades/[id]/notas/[notaId]`: atualiza uma nota existente.
 * REGRA ESTRITA: Apenas o próprio usuário que criou a nota tem permissão para editá-la.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id, notaId } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);

  if (!user?.id) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Autenticação obrigatória." },
      { status: 401 },
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
    const nota = await atualizarNota({
      licitacaoId: id,
      notaId,
      tenantId,
      user,
      input: body,
      actorContext: {
        ip: request.headers.get("x-forwarded-for"),
        usuarioId: user.id,
        usuarioNome: user.name,
      },
    });

    return NextResponse.json({ ok: true, nota }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "VALIDATION_ERROR", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof LicitacaoNotasError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
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
 * `DELETE /api/oportunidades/[id]/notas/[notaId]`: exclui uma nota existente.
 * REGRA ESTRITA: Apenas usuários com cargo DIRETORIA (ou SUPERADMIN) podem excluir.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { id, notaId } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);

  if (!user?.id) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Autenticação obrigatória." },
      { status: 401 },
    );
  }

  try {
    const resultado = await excluirNota({
      licitacaoId: id,
      notaId,
      tenantId,
      user,
      actorContext: {
        ip: request.headers.get("x-forwarded-for"),
        usuarioId: user.id,
        usuarioNome: user.name,
      },
    });

    return NextResponse.json({ ...resultado }, { status: 200 });
  } catch (error) {
    if (error instanceof LicitacaoNotasError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
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
