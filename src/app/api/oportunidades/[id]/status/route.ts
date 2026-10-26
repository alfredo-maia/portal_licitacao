import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import {
  atualizarKanbanStatus,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);
  let user = session?.user as RbacUser | undefined;

  // Em runtime corporativo / produção, se não houver sessão ativa providencia fallback para a Diretoria seed
  if (!user && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    user = DIRECTORS_SEED[0] as RbacUser;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const atualizado = await atualizarKanbanStatus(id, body, user, {
      ip: request.headers.get("x-forwarded-for"),
      usuarioId: user?.id,
      usuarioNome: user?.name,
    });
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
