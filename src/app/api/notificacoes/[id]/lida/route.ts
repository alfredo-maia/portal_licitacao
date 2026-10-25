import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { marcarNotificacaoLida } from "@/server/services/notificacoes.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const res = await marcarNotificacaoLida(user.id, id);
    if (res.marcadas === 0) {
      return NextResponse.json(
        { ok: false, error: "NOT_FOUND", message: "Notificação não encontrada para o usuário" },
        { status: 404 },
      );
    }
    return NextResponse.json(res, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: error?.message },
      { status: 500 },
    );
  }
}
