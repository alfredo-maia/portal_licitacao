import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { criarPortal, listarPortais } from "@/server/services/portais.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const busca = searchParams.get("busca") || undefined;
  const apenasVencendo = searchParams.get("apenasVencendoEmDias");
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  try {
    const data = await listarPortais({
      status: status as any,
      busca,
      apenasVencendoEmDias: apenasVencendo ? parseInt(apenasVencendo, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const portal = await criarPortal(body, user.id);
    return NextResponse.json({ ok: true, portal }, { status: 201 });
  } catch (error: any) {
    const errorMsg = error?.errors?.[0]?.message || error?.message || "Erro de validação ao salvar portal.";
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: errorMsg },
      { status: 400 },
    );
  }
}
