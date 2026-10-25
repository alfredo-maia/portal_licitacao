import { NextResponse } from "next/server";
import { notificacoesJobHeaderSchema } from "@/server/schemas/notificacao.schema";
import { executarJobNotificacoesDiarias } from "@/server/services/notificacoes.service";

export async function POST(request: Request) {
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const expectedSecret =
    process.env.CRON_SECRET || "change-me-in-production-min-16";

  if (!cronSecretHeader || cronSecretHeader !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Header x-cron-secret inválido ou ausente" },
      { status: 401 },
    );
  }

  try {
    notificacoesJobHeaderSchema.parse({ "x-cron-secret": cronSecretHeader });
  } catch {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Header x-cron-secret com formato inválido" },
      { status: 401 },
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // Body é opcional
  }

  try {
    const referencia = body?.referencia ? new Date(body.referencia) : undefined;
    const resultado = await executarJobNotificacoesDiarias(referencia);
    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: error?.message },
      { status: 500 },
    );
  }
}
