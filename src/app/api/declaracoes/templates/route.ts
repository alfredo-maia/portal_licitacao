import { NextResponse } from "next/server";
import { obterTemplatesDeclaracoes } from "@/server/services/declaracoes.service";
import { verificarBloqueioAssinaturaNaRota } from "@/server/services/subscription-status.service";

export const dynamic = "force-dynamic";

export async function GET(_req?: Request) {
  const bloqueioAssinatura = await verificarBloqueioAssinaturaNaRota();
  if (bloqueioAssinatura) return bloqueioAssinatura;

  try {
    const templates = obterTemplatesDeclaracoes();
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Falha ao obter templates de declarações" },
      { status: 500 },
    );
  }
}
