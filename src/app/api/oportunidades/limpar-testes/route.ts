import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { limparTodasOportunidadesTestes } from "@/server/services/oportunidades.service";

/**
 * `POST /api/oportunidades/limpar-testes`: limpa todas as oportunidades testes do portal.
 * Permite acionamento via Diretoria ou via token de autorização.
 */
export async function POST(request: Request) {
  const adminKey = request.headers.get("x-admin-key");
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || "dev-cron-secret-16chars";

  const isKeyAuthorized =
    adminKey === "pncp-limpeza-2026" ||
    authHeader === `Bearer ${cronSecret}` ||
    authHeader === "Bearer pncp-limpeza-2026";

  let isSessionAuthorized = false;
  if (!isKeyAuthorized) {
    const session = await getServerSession(authOptions);
    isSessionAuthorized = session?.user?.role === "DIRETORIA";
  }

  if (!isKeyAuthorized && !isSessionAuthorized) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        message: "Acesso restrito à Diretoria ou credencial de administração.",
      },
      { status: 401 },
    );
  }

  try {
    const { count } = await limparTodasOportunidadesTestes();
    return NextResponse.json(
      {
        ok: true,
        deleted: count,
        message: `Todas as oportunidades testes foram limpas com sucesso. Total removido: ${count}`,
      },
      { status: 200 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: error.message },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  // Permite executar com GET se passado ?key=pncp-limpeza-2026 para facilidade de acionamento
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key !== "pncp-limpeza-2026") {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { count } = await limparTodasOportunidadesTestes();
  return NextResponse.json(
    {
      ok: true,
      deleted: count,
      message: `Todas as oportunidades testes foram limpas com sucesso via GET. Total removido: ${count}`,
    },
    { status: 200 },
  );
}
