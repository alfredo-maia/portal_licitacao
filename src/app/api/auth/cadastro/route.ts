import { NextRequest, NextResponse } from "next/server";
import { realizarCadastroConta } from "@/server/services/cadastro.service";

/**
 * Endpoint público de Cadastro e Onboarding com 14 dias de Trial gratuito (Issue #13).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const resultado = await realizarCadastroConta(rawBody);

    const res = NextResponse.json(resultado, { status: 201 });
    if (resultado.tenantId) {
      res.cookies.set("portal_licitacao_active_tenant", resultado.tenantId, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60, // 30 dias
      });
    }

    return res;
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
