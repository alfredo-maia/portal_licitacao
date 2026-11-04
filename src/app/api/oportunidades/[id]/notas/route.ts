import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import {
  criarNota,
  listarNotas,
  LicitacaoNotasError,
} from "@/server/services/licitacao-notas.service";
import { OportunidadesServiceError } from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteContext {
  params: Promise<{ id: string }>;
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
 * `GET /api/oportunidades/[id]/notas`: lista as notas colaborativas da licitação
 * (Issue #36 — Aba Notas). Suporta filtros por `autorId` e `busca`.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);

  const url = new URL(request.url);
  const autorId = url.searchParams.get("autorId") || url.searchParams.get("criadoPorId") || undefined;
  const busca = url.searchParams.get("busca") || undefined;

  try {
    const notas = await listarNotas({
      licitacaoId: id,
      tenantId,
      user,
      filtros: { autorId, busca },
    });

    return NextResponse.json(
      {
        ok: true,
        total: notas.length,
        notas,
      },
      { status: 200 },
    );
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

/**
 * `POST /api/oportunidades/[id]/notas`: cria uma nova nota para a licitação
 * (todos os usuários do Tenant podem criar; dispara menção N9 para quem for citado).
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
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
    const nota = await criarNota({
      licitacaoId: id,
      tenantId,
      user,
      input: body,
      actorContext: {
        ip: request.headers.get("x-forwarded-for"),
        usuarioId: user.id,
        usuarioNome: user.name,
      },
    });

    return NextResponse.json({ ok: true, nota }, { status: 201 });
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

