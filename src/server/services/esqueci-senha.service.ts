import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import { esqueciSenhaSchema } from "@/server/schemas/esqueci-senha.schema";

export interface EsqueciSenhaResponse {
  ok: boolean;
  code?: string;
  message: string;
}

const rateLimitStore = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 2; // Máximo 2 tentativas por janela

/**
 * Limpa o mapa de rate limit em memória (utilizado em testes unitários)
 */
export function _resetRateLimit(): void {
  rateLimitStore.clear();
}

/**
 * Solicita recuperação de senha com rate limit estrito (2 req/15min) e prevenção de enumeração de contas (Issue #20 / PRD §6).
 */
export async function solicitarRecuperacaoSenha(
  rawEmail: string,
  ip = "127.0.0.1",
): Promise<EsqueciSenhaResponse> {
  const parsed = esqueciSenhaSchema.parse({ email: rawEmail });
  const normalizedEmail = parsed.email.trim().toLowerCase();

  // 1. Verificação de Rate Limit determinístico por Cliente/IP (independente de o e-mail mudar entre tentativas)
  const cleanIp = (ip || "127.0.0.1").split(",")[0].trim() || "127.0.0.1";
  const rateLimitKey = `ip:${cleanIp}`;
  const now = Date.now();
  const history = (rateLimitStore.get(rateLimitKey) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (history.length >= MAX_ATTEMPTS) {
    return {
      ok: false,
      code: "RATE_LIMIT_EXCEEDED",
      message:
        "Limite de 2 tentativas a cada 15 minutos atingido. Aguarde alguns minutos antes de tentar novamente.",
    };
  }

  // Registra nova tentativa
  history.push(now);
  rateLimitStore.set(rateLimitKey, history);

  // 2. Busca usuário no banco com anti-enumeração
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  }).catch(() => null);

  const MENSAGEM_SUCESSO =
    "Enviamos as instruções de recuperação para o seu e-mail. Verifique sua caixa de entrada e spam.";

  if (user) {
    try {
      await recordAuditLog({
        acao: "AUTH_PASSWORD_RESET_REQUESTED",
        entidadeTipo: "USER",
        entidadeId: user.id,
        usuarioId: user.id,
        ip,
        depois: {
          email: normalizedEmail,
          solicitadoEm: new Date().toISOString(),
        },
      });
    } catch {
      // Ignora erro de auditoria para não travar o fluxo do usuário
    }
  }

  // Retorna a mesma mensagem genérica quer o e-mail exista ou não
  return {
    ok: true,
    message: MENSAGEM_SUCESSO,
  };
}
