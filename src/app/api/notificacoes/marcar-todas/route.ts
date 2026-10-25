import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { marcarTodasLidas } from "@/server/services/notificacoes.service";

export async function POST() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const res = await marcarTodasLidas(user.id);
    return NextResponse.json(res, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: error?.message },
      { status: 500 },
    );
  }
}
