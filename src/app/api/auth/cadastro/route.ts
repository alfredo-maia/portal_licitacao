import { NextRequest, NextResponse } from "next/server";
import { realizarCadastroConta } from "@/server/services/cadastro.service";

/**
 * Endpoint público de Cadastro e Onboarding com 14 dias de Trial gratuito (Issue #13).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const resultado = await realizarCadastroConta(rawBody);

    return NextResponse.json(resultado, { status: 201 });
  } catch (error: any) {
    console.error("[Cadastro Error]:", error);

    if (error.name === "ZodError") {
      const primeiroErro = error.issues?.[0]?.message || "Dados de cadastro inválidos";
      return NextResponse.json(
        { ok: false, error: primeiroErro, issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || "Erro interno ao realizar cadastro" },
      { status: 400 },
    );
  }
}
