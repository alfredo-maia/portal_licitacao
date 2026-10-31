import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { executarJobNotificacoesDiarias } from "@/server/services/notificacoes.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const referencia = body?.referencia ? new Date(body.referencia) : undefined;
    const resultado = await executarJobNotificacoesDiarias(referencia);

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao verificar notificações" },
      { status: 500 },
    );
  }
}
