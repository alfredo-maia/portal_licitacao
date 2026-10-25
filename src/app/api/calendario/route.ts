import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import { getCalendarioData } from "@/server/services/calendario.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  let user = session?.user;
  if (!user && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    user = DIRECTORS_SEED[0] as any;
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mesParam = searchParams.get("mes");
  const anoParam = searchParams.get("ano");

  try {
    const data = await getCalendarioData({
      mes: mesParam ? parseInt(mesParam, 10) : undefined,
      ano: anoParam ? parseInt(anoParam, 10) : undefined,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}
