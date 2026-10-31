import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { solicitarRecuperacaoSenha } from "@/server/services/esqueci-senha.service";
import { esqueciSenhaSchema } from "@/server/schemas/esqueci-senha.schema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = esqueciSenhaSchema.safeParse(body);

    if (!parsed.success) {
      const primeiroErro = parsed.error.issues[0]?.message || "E-mail inválido.";
      return NextResponse.json(
        { ok: false, message: primeiroErro },
        { status: 400 },
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : req.headers.get("x-real-ip") || "127.0.0.1";

    const resultado = await solicitarRecuperacaoSenha(parsed.data.email, ip);

    if (!resultado.ok && resultado.code === "RATE_LIMIT_EXCEEDED") {
      return NextResponse.json(resultado, { status: 429 });
    }

    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, message: error.issues[0]?.message || "Dados inválidos." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, message: error?.message || "Erro interno do servidor." },
      { status: 500 },
    );
  }
}
