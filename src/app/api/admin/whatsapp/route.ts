import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { can } from "@/lib/rbac";
import {
  obterStatusInstanciaWhatsApp,
  enfileirarMensagemWhatsApp,
  processarFilaWhatsAppComJitter,
} from "@/server/services/whatsapp.service";

/**
 * Gestão do Conector WhatsApp do SuperAdmin.
 * Retorna 404 para não administradores.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user || !can(session.user as any, "superadmin:view", "admin")) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  try {
    const status = await obterStatusInstanciaWhatsApp();
    return NextResponse.json(status, { status: 200 });
  } catch (error: any) {
    console.error("[SuperAdmin WhatsApp Status Error]:", error);
    return NextResponse.json(
      { error: "Erro ao obter status do WhatsApp" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user || !can(session.user as any, "superadmin:manage", "admin")) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json();

    if (body.action === "processar_fila") {
      const res = await processarFilaWhatsAppComJitter({
        limite: body.limite || 10,
        simularDelay: false,
      });
      return NextResponse.json(res, { status: 200 });
    }

    const item = await enfileirarMensagemWhatsApp(body);
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error("[SuperAdmin WhatsApp Action Error]:", error);
    return NextResponse.json(
      { error: error.message || "Erro na ação do WhatsApp" },
      { status: 500 },
    );
  }
}
