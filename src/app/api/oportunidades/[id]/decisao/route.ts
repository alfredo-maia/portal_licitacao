import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  deliberarOportunidade,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * `POST /api/oportunidades/[id]/decisao` (PRD §4.4 / sprint-1-spec §2.3):
 * deliberação rápida `GO` / `NO_GO` com `motivoRecusa` opcional. Exige sessão
 * ativa com `licitacao:decide`; responde `200` com a licitação atualizada,
 * `401` sem sessão, `403` sem permissão, `404` se a licitação não existe e
 * `400` em erro de validação.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const payload = (body ?? {}) as { decisao?: unknown; motivoRecusa?: unknown };

  try {
    const oportunidade = await deliberarOportunidade({
      id,
      decisao: payload.decisao as "GO" | "NO_GO" | "NO-GO",
      motivoRecusa:
        typeof payload.motivoRecusa === "string"
          ? payload.motivoRecusa
          : undefined,
      user,
      actorContext: { ip: request.headers.get("x-forwarded-for") },
    });
    return NextResponse.json({ ok: true, oportunidade }, { status: 200 });
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
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
