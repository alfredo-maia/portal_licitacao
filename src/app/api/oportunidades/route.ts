import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  criarOportunidadeManual,
  listOportunidades,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";

/**
 * `GET /api/oportunidades` (sprint-1-spec §2.3): listagem ordenada por
 * `dataAbertura ASC` com os filtros operacionais recebidos via query params
 * (`tipoSistema`, `uf`, `faixaValor`, `status`, `parecerIA`, `periodo`,
 * `busca`, `valorMin`, `valorMax`).
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(
    new URL(request.url).searchParams.entries(),
  );

  try {
    const oportunidades = await listOportunidades(params);
    return NextResponse.json(
      { ok: true, total: oportunidades.length, oportunidades },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "VALIDATION_ERROR", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/oportunidades` (sprint-1-spec §2.3): cadastro manual de
 * licitação. Exige sessão ativa com `licitacao:create` (DIRETORIA /
 * ANALISTA_COMERCIAL); responde `201 Created` com o registro criado,
 * `401` sem sessão, `403` sem permissão e `400` em erro de validação.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  try {
    const oportunidade = await criarOportunidadeManual(body, user, {
      ip: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ ok: true, oportunidade }, { status: 201 });
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
