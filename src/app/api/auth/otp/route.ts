import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAndStoreOtp, getInMemoryAuthUserByEmail } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { enfileirarMensagemWhatsApp } from "@/server/services/whatsapp.service";

const otpRequestSchema = z.object({
  email: z.string().email("E-mail corporativo inválido."),
  method: z.enum(["EMAIL_OTP", "WHATSAPP_OTP"]).default("EMAIL_OTP"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, method } = otpRequestSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Verifica se o usuário existe no banco ou na memória
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        tenantMemberships: {
          include: { tenant: true },
        },
      },
    }).catch(() => null);

    let telefoneDestino: string | null = null;

    if (user) {
      telefoneDestino = user.tenantMemberships?.[0]?.tenant?.telefone ?? null;
    } else {
      const inMem = getInMemoryAuthUserByEmail(normalizedEmail);
      if (!inMem) {
        return NextResponse.json(
          { ok: false, error: "Nenhum usuário encontrado com este e-mail corporativo." },
          { status: 404 },
        );
      }
    }

    // 2. Gera e armazena o OTP com validade de 10 min
    const code = generateAndStoreOtp(normalizedEmail, method);

    // 3. Se for WhatsApp e tiver número de telefone configurado, enfileira
    if (method === "WHATSAPP_OTP" && telefoneDestino) {
      try {
        await enfileirarMensagemWhatsApp({
          destinatario: telefoneDestino,
          mensagem: `Seu código de acesso ao Portal de Licitações é: ${code}. Válido por 10 minutos.`,
          tipo: "ALERTA",
        });
      } catch (err) {
        console.warn("[OTP Route] Erro ao enfileirar WhatsApp:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      mensagem:
        method === "WHATSAPP_OTP"
          ? "Código enviado com sucesso para o seu WhatsApp cadastrado!"
          : "Código enviado com sucesso para o seu e-mail corporativo!",
      // Em staging/teste, retornamos o código para conferência rápida de homologação
      ...(process.env.NODE_ENV !== "production" || process.env.STAGING === "true"
        ? { devCode: code }
        : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro ao processar solicitação de código." },
      { status: 400 },
    );
  }
}

