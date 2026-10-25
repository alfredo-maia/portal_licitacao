import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  adicionarRepositorioSimilar,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);
  const user = session?.user as RbacUser | undefined;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const criado = await adicionarRepositorioSimilar(id, body, user, {
      ip: request.headers.get("x-forwarded-for"),
      usuarioId: user?.id,
      usuarioNome: user?.name,
    });
    return NextResponse.json({ ok: true, repositorio: criado }, { status: 201 });
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
