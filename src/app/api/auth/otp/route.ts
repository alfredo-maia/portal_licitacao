import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { APP_CONFIG } from "@/config/brand";
import { recordAuditLog } from "@/server/audit";
import { requestOtpSchema } from "@/server/schemas/auth.schema";
import { findAuthUserForOtp, generateAndStoreOtp } from "@/server/auth";
import { enviarEmailCodigoOtp } from "@/server/services/email.service";
import { enfileirarMensagemWhatsApp } from "@/server/services/whatsapp.service";

const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_PER_EMAIL = 5;
const OTP_MAX_PER_IP = 25;

interface RateBucket {
  count: number;
  resetAt: number;
}

const otpRateByEmail = new Map<string, RateBucket>();
const otpRateByIp = new Map<string, RateBucket>();

export function _resetOtpRateLimitForTesting(): void {
  otpRateByEmail.clear();
  otpRateByIp.clear();
}

function consumeRateBucket(
  store: Map<string, RateBucket>,
  key: string,
  limit: number,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + OTP_RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function resolveClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

export async function POST(req: Request) {
  try {
    const clientIp = resolveClientIp(req);
    const ipLimit = consumeRateBucket(otpRateByIp, clientIp, OTP_MAX_PER_IP);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Muitas solicitações de código OTP. Aguarde alguns minutos antes de tentar novamente.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
        },
      );
    }

    const body = await req.json();
    const { email, method, realm } = requestOtpSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    const emailLimit = consumeRateBucket(otpRateByEmail, normalizedEmail, OTP_MAX_PER_EMAIL);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Limite de solicitações de código atingido para este e-mail. Aguarde alguns minutos.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(emailLimit.retryAfterSeconds) },
        },
      );
    }

    // 1. Localiza usuário no banco, memória ou configuração master
    const user = await findAuthUserForOtp(normalizedEmail);

    if (!user || !user.ativo) {
      return NextResponse.json(
        { ok: false, error: "Nenhum usuário ativo encontrado com este e-mail." },
        { status: 404 },
      );
    }

    // 2. Bloqueio estrito cross-realm (ADM não entra no portal do cliente e vice-versa)
    if (realm === "admin" && !user.isSuperAdmin) {
      return NextResponse.json(
        { ok: false, error: "Nenhum usuário administrativo encontrado com este e-mail." },
        { status: 404 },
      );
    }

    if (realm === "client" && user.isSuperAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: "Contas administrativas devem acessar exclusivamente pelo Portal ADM (/admin/login).",
        },
        { status: 403 },
      );
    }

    // 3. Valida WhatsApp antes de emitir OTP quando o canal escolhido for WhatsApp
    const telefoneDestino = user.telefone?.trim() || null;
    if (method === "WHATSAPP_OTP" && !telefoneDestino) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nenhum telefone/WhatsApp cadastrado para receber o código de acesso.",
        },
        { status: 400 },
      );
    }

    // 4. Gera e armazena o OTP com validade de 10 min
    const code = generateAndStoreOtp(normalizedEmail, method);
    const contextoMarca =
      realm === "admin" || user.isSuperAdmin
        ? `${APP_CONFIG.brandName} (Portal ADM)`
        : APP_CONFIG.brandName;

    // 5. Envia pelo canal selecionado
    if (method === "WHATSAPP_OTP" && telefoneDestino) {
      try {
        await enfileirarMensagemWhatsApp({
          destinatario: telefoneDestino,
          mensagem: `Seu código de acesso ao ${contextoMarca} é: ${code}. Válido por 10 minutos.`,
          tipo: "ALERTA",
        });
      } catch (err) {
        console.warn("[OTP Route] Erro ao enfileirar WhatsApp:", err);
      }
    } else if (method === "EMAIL_OTP") {
      await enviarEmailCodigoOtp({
        nome: user.name,
        email: normalizedEmail,
        codigo: code,
        isAdmin: user.isSuperAdmin,
        userId: user.id,
      }).catch(() => undefined);
    }

    if (realm === "admin" || user.isSuperAdmin) {
      await recordAuditLog({
        usuarioNome: user.name,
        ip: clientIp,
        acao: "ADMIN_SOLICITAR_OTP",
        entidadeTipo: "AUTH",
        entidadeId: user.id,
        depois: { email: normalizedEmail, method, realm },
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      mensagem:
        method === "WHATSAPP_OTP"
          ? "Código enviado com sucesso para o seu WhatsApp cadastrado!"
          : "Código enviado com sucesso para o seu e-mail cadastrado!",
      ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const msg = err.issues[0]?.message || "Dados inválidos para solicitação de código.";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Erro ao processar solicitação de código.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

