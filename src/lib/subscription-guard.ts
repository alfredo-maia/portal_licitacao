export interface TenantSubscriptionInfo {
  plano: string;
  billingStatus: string;
  trialFim?: Date | string | null;
  vencimentoAssinatura?: Date | string | null;
  maxCnpjs?: number;
  maxUsers?: number;
}

export interface TenantAccessEvaluation {
  isReadOnly: boolean;
  isBlocked: boolean;
  inGracePeriod: boolean;
  diasRestantesTrial: number;
  diasRestantesCarencia: number;
  mensagemStatus: string;
  plano: string;
  billingStatus: string;
}

const DIAS_CARENCIA = 3;

export function evaluateTenantAccess(
  tenant: TenantSubscriptionInfo,
  now = new Date(),
): TenantAccessEvaluation {
  const { plano = "BASICO", billingStatus = "TRIAL" } = tenant;

  if (billingStatus === "ATIVO") {
    return {
      isReadOnly: false,
      isBlocked: false,
      inGracePeriod: false,
      diasRestantesTrial: 0,
      diasRestantesCarencia: 0,
      mensagemStatus: "Plano ativo com acesso total.",
      plano,
      billingStatus,
    };
  }

  if (billingStatus === "BLOQUEADO" || billingStatus === "CANCELADO") {
    return {
      isReadOnly: true,
      isBlocked: true,
      inGracePeriod: false,
      diasRestantesTrial: 0,
      diasRestantesCarencia: 0,
      mensagemStatus:
        "Assinatura suspensa ou bloqueada. Escolha um plano para reativar o acesso total.",
      plano,
      billingStatus,
    };
  }

  // Se estiver em TRIAL ou GRACE_PERIOD
  const dataFim = tenant.trialFim
    ? new Date(tenant.trialFim)
    : tenant.vencimentoAssinatura
      ? new Date(tenant.vencimentoAssinatura)
      : null;

  if (!dataFim) {
    // Sem data de término definida, concede acesso padrão trial
    return {
      isReadOnly: false,
      isBlocked: false,
      inGracePeriod: false,
      diasRestantesTrial: 14,
      diasRestantesCarencia: 0,
      mensagemStatus: "Período de avaliação ativo.",
      plano,
      billingStatus,
    };
  }

  const diffMs = dataFim.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs >= 0) {
    return {
      isReadOnly: false,
      isBlocked: false,
      inGracePeriod: false,
      diasRestantesTrial: Math.max(0, diffDays),
      diasRestantesCarencia: 0,
      mensagemStatus: `Período de avaliação: restam ${Math.max(0, diffDays)} dia(s).`,
      plano,
      billingStatus,
    };
  }

  // Trial expirou: calcula carência de 3 dias
  const graceFimMs = dataFim.getTime() + DIAS_CARENCIA * 24 * 60 * 60 * 1000;
  const graceDiffMs = graceFimMs - now.getTime();
  const graceDiffDays = Math.ceil(graceDiffMs / (1000 * 60 * 60 * 24));

  if (graceDiffMs >= 0) {
    return {
      isReadOnly: false,
      isBlocked: false,
      inGracePeriod: true,
      diasRestantesTrial: 0,
      diasRestantesCarencia: Math.max(1, graceDiffDays),
      mensagemStatus: `Seu período de teste terminou. Você tem ${Math.max(1, graceDiffDays)} dia(s) de carência antes do bloqueio das ações.`,
      plano,
      billingStatus,
    };
  }

  // Fim da carência: bloqueio total e modo somente-leitura
  return {
    isReadOnly: true,
    isBlocked: true,
    inGracePeriod: false,
    diasRestantesTrial: 0,
    diasRestantesCarencia: 0,
    mensagemStatus:
      "Seu período de teste expirou. Os módulos operacionais estão bloqueados — escolha um plano para reativar.",
    plano,
    billingStatus,
  };
}

/**
 * Rotas de páginas acessíveis mesmo quando o período de teste + 3 dias de carência
 * tiver encerrado (ou assinatura BLOQUEADO/CANCELADO) — Issue #62.
 */
export const CLIENT_ALLOWED_ROUTES_WHEN_BLOCKED = [
  "/dashboard",
  "/planos",
  "/configuracoes",
  "/notificacoes",
  "/faturamento",
  "/checkout",
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/recuperar-senha",
] as const;

/**
 * Prefixos de APIs acessíveis mesmo com assinatura expirada/bloqueada — Issue #62.
 */
export const CLIENT_ALLOWED_API_PREFIXES_WHEN_BLOCKED = [
  "/api/auth",
  "/api/planos",
  "/api/faturamento",
  "/api/suporte",
  "/api/dashboard",
  "/api/configuracoes",
  "/api/notificacoes",
  "/api/tenants",
  "/api/tenant",
  "/api/avisos",
  "/api/cep",
  "/api/cnae",
  "/api/usuarios",
  "/api/audit",
  "/api/webhooks",
  "/api/cron",
  "/api/admin",
] as const;

function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.split("?")[0]?.split("#")[0] || "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || "/";
}

export function isSubscriptionLocked(
  evaluation:
    | Pick<TenantAccessEvaluation, "isBlocked" | "isReadOnly">
    | null
    | undefined,
): boolean {
  return Boolean(evaluation && (evaluation.isBlocked || evaluation.isReadOnly));
}

export function isRouteAllowedWhenSubscriptionBlocked(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (normalized === "/" || normalized === "/admin" || normalized.startsWith("/admin/")) {
    return true;
  }
  return CLIENT_ALLOWED_ROUTES_WHEN_BLOCKED.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`),
  );
}

export function isApiRouteAllowedWhenSubscriptionBlocked(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return CLIENT_ALLOWED_API_PREFIXES_WHEN_BLOCKED.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`),
  );
}

/**
 * Rotas exclusivas dos planos PRO e ENTERPRISE (ou TRIAL ativo) — bloqueadas no BASICO ativo (Issue #63).
 */
export const BASIC_RESTRICTED_ROUTES = [
  "/inteligencia-precos",
  "/robo-de-lances",
] as const;

export const TOOLTIP_TIMBRADO_PRO_ENTERPRISE =
  "Apenas os planos Pro e Enterprise têm acesso à emissão de documentos com Papel Timbrado ou Logomarca.";

export function isPlanoBasicoRestrito(
  status:
    | { plano?: string | null; billingStatus?: string | null }
    | null
    | undefined,
): boolean {
  if (!status) return false;
  const plano = (status.plano || "").toUpperCase();
  const billingStatus = (status.billingStatus || "").toUpperCase();
  if (billingStatus === "TRIAL") return false;
  return plano === "BASICO";
}

export function isRouteRestrictedForBasicPlan(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return BASIC_RESTRICTED_ROUTES.some(
    (restricted) =>
      normalized === restricted || normalized.startsWith(`${restricted}/`),
  );
}

export function canUseTimbradoOuLogo(
  status:
    | { plano?: string | null; billingStatus?: string | null }
    | null
    | undefined,
): boolean {
  return !isPlanoBasicoRestrito(status);
}



