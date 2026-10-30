import { TenantBillingStatusType } from "@/server/schemas/asaas.schema";

/**
 * Rotas essenciais e públicas com acesso irrestrito independente do status financeiro do Tenant (PRD §6 / ADR 0010).
 */
export const ROTAS_WHITELIST_PAYWALL = [
  "/",
  "/login",
  "/recuperar-senha",
  "/faturamento",
  "/checkout",
  "/api/auth",
  "/api/webhooks",
  "/api/suporte",
  "/_next",
  "/favicon.ico",
];

export interface DecisaoPaywall {
  permitido: boolean;
  exibirBannerAviso: boolean;
  redirecionarPara?: string;
  motivo?: string;
}

/**
 * Avalia se o usuário ou requisição atual possui permissão de navegação conforme as regras do Soft Paywall:
 * - TRIAL e ATIVO: Acesso livre total.
 * - GRACE_PERIOD (1 a 3 dias de atraso): Acesso livre total com banner informativo amarelo.
 * - BLOQUEADO / CANCELADO (4+ dias de atraso): Acesso restrito apenas à Whitelist, com redirecionamento suave para /faturamento.
 */
export function verificarAcessoPaywall(params: {
  pathname: string;
  billingStatus?: TenantBillingStatusType | string;
}): DecisaoPaywall {
  const { pathname, billingStatus } = params;

  // 1. Verifica se a rota está na Whitelist liberada
  const isWhitelisted = ROTAS_WHITELIST_PAYWALL.some((rota) =>
    pathname === rota || pathname.startsWith(`${rota}/`) || pathname.startsWith(`${rota}?`),
  );

  if (isWhitelisted) {
    return {
      permitido: true,
      exibirBannerAviso: billingStatus === "GRACE_PERIOD",
    };
  }

  // 2. Se for Trial ou Ativo, libera sem avisos
  if (!billingStatus || billingStatus === "TRIAL" || billingStatus === "ATIVO") {
    return {
      permitido: true,
      exibirBannerAviso: false,
    };
  }

  // 3. Se estiver no Período de Graça (Grace Period de 3 dias), libera e exibe banner
  if (billingStatus === "GRACE_PERIOD") {
    return {
      permitido: true,
      exibirBannerAviso: true,
      motivo: "Sua assinatura venceu recentemente. Regularize para não perder o acesso às oportunidades.",
    };
  }

  // 4. Se estiver bloqueado ou cancelado, bloqueia acesso a rotas operacionais e sugere regularização
  return {
    permitido: false,
    exibirBannerAviso: true,
    redirecionarPara: "/faturamento",
    motivo: "Assinatura pendente. Conclua a regularização para retomar as consultas e alertas.",
  };
}
