import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { buscarESincronizarArquivosEditalPncp } from "@/server/services/oportunidades.service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const params = await Promise.resolve(context.params);
    const { id } = params;

    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");

    const resultado = await buscarESincronizarArquivosEditalPncp(id, user, {
      usuarioId: user?.id,
      usuarioNome: user?.name,
      ip,
    });

    return NextResponse.json(resultado);
  } catch (err: any) {
    console.error("[Sync PNCP Error]:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro ao sincronizar arquivos do PNCP" },
      { status: 500 },
    );
  }
}

