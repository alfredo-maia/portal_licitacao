import { NextRequest, NextResponse } from "next/server";
import { processarWebhookAsaas } from "@/server/services/asaas.service";

/**
 * Endpoint de Recepção de Webhooks do Gateway Asaas (PRD §6 / ADR 0010).
 * Garante idempotência atômica através da tabela AsaasWebhookEvent.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    const resultado = await processarWebhookAsaas(rawBody);

    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    console.error("[Asaas Webhook Error]:", error);

    // Se for erro de validação do Zod, responde 400 Bad Request
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
