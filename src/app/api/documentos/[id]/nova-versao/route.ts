import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { criarNovaVersao } from "@/server/services/documentos.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const doc = await criarNovaVersao(id, body, user.id);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: error?.message },
      { status: 400 },
    );
  }
}
