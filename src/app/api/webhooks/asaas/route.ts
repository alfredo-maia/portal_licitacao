import { NextRequest, NextResponse } from "next/server";
import { processarWebhookAsaas } from "@/server/services/asaas.service";

/**
 * Endpoint de Recepção de Webhooks do Gateway Asaas (PRD §6 / ADR 0010).
 * Valida `asaas-access-token` (quando configurado em `ASAAS_WEBHOOK_TOKEN`) e garante idempotência.
 */
export async function POST(req: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (expectedToken) {
    const providedToken =
      req.headers.get("asaas-access-token")?.trim() ||
      req.headers.get("x-asaas-access-token")?.trim();

    if (!providedToken || providedToken !== expectedToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Token de autenticação do webhook Asaas inválido ou ausente",
        },
        { status: 401 },
      );
    }
  }

  try {
    const rawBody = await req.json();

    const resultado = await processarWebhookAsaas(rawBody);

    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    console.error("[Asaas Webhook Error]:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        {
          ok: false,
          error: "Payload de webhook inválido",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Erro interno ao processar webhook do Asaas",
      },
      { status: 500 },
    );
  }
}
