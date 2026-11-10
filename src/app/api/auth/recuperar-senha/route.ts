import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  redefinirSenhaComToken,
  validarTokenRecuperacao,
} from "@/server/services/esqueci-senha.service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "";

  const status = await validarTokenRecuperacao(token);
  if (!status.valid) {
    return NextResponse.json(
      {
        ok: false,
        valid: false,
        error: status.code || "TOKEN_INVALIDO",
        message: status.message || "Token de recuperação inválido ou expirado.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      valid: true,
      emailMasked: status.emailMasked,
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Requisição inválida." },
      { status: 400 },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || realIp || "127.0.0.1";

  try {
    const result = await redefinirSenhaComToken(body, clientIp);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.code || "TOKEN_INVALIDO",
          message: result.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message: firstIssue?.message || "Verifique os dados informados.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Ocorreu um erro interno ao redefinir sua senha.",
      },
      { status: 500 },
    );
  }
}

