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
      "Seu período de teste expirou. O sistema está em modo somente-leitura. Escolha um plano para reativar.",
    plano,
    billingStatus,
  };
}

