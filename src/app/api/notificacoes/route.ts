import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { listNotificacoes } from "@/server/services/notificacoes.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");
  const apenasNaoLidasParam = searchParams.get("apenasNaoLidas");
  const tipoParam = searchParams.get("tipo");

  try {
    const data = await listNotificacoes(user.id, {
      page: pageParam ? parseInt(pageParam, 10) : undefined,
      pageSize: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
      apenasNaoLidas: apenasNaoLidasParam !== null ? (apenasNaoLidasParam as any) : undefined,
      tipo: tipoParam !== null ? (tipoParam as any) : undefined,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}
