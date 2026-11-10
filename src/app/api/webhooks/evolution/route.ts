import { NextRequest, NextResponse } from "next/server";
import { isWhatsAppOptOutMessage, sanitizarTelefoneBR } from "@/server/schemas/whatsapp.schema";
import { registrarOptOutWhatsApp } from "@/server/services/whatsapp.service";

export const dynamic = "force-dynamic";

function extractIncomingPhone(body: any): string {
  const rawJid =
    body?.data?.key?.remoteJid ||
    body?.data?.remoteJid ||
    body?.key?.remoteJid ||
    body?.sender ||
    body?.phone ||
    body?.number ||
    "";
  const withoutDomain = String(rawJid).split("@")[0];
  return sanitizarTelefoneBR(withoutDomain);
}

function extractIncomingText(body: any): string {
  const msg = body?.data?.message || body?.message || {};
  return String(
    msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      body?.data?.text ||
      body?.text ||
      body?.body ||
      "",
  ).trim();
}

/**
 * Webhook Evolution API v2 para processar respostas de usuários (opt-out: SAIR / PARAR / PAUSAR).
 */
export async function POST(req: NextRequest) {
  const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN?.trim();
  if (expectedToken) {
    const provided =
      req.headers.get("apikey")?.trim() ||
      req.headers.get("x-webhook-token")?.trim() ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

    if (!provided || provided !== expectedToken) {
      return NextResponse.json(
        { ok: false, error: "Token de webhook Evolution inválido ou ausente" },
        { status: 401 },
      );
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const event = String(body?.event || "messages.upsert").toLowerCase();
    const fromMe = Boolean(body?.data?.key?.fromMe ?? body?.key?.fromMe ?? false);

    if (fromMe) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "Mensagem enviada pela própria instância",
        optOutRegistrado: false,
      });
    }

    const phone = extractIncomingPhone(body);
    const text = extractIncomingText(body);

    if (phone && text && isWhatsAppOptOutMessage(text)) {
      const opt = await registrarOptOutWhatsApp(
        phone,
        `Solicitação via webhook Evolution (${event}): ${text.slice(0, 80)}`,
      );
      return NextResponse.json({
        ok: true,
        optOutRegistrado: true,
        telefone: opt.telefone,
      });
    }

    return NextResponse.json({
      ok: true,
      optOutRegistrado: false,
      event,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao processar webhook Evolution" },
      { status: 500 },
    );
  }
}

