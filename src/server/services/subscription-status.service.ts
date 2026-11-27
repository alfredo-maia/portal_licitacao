import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  isSuperAdminSessionUser,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { prisma } from "@/lib/prisma";
import {
  evaluateTenantAccess,
  isApiRouteAllowedWhenSubscriptionBlocked,
  isSubscriptionLocked,
  type TenantAccessEvaluation,
} from "@/lib/subscription-guard";
import {
  inMemoryTenants,
  resolveUserActiveTenantId,
  resolverEstadoFinanceiroUnificadoTitular,
} from "@/server/services/tenant.service";

export interface ClientSubscriptionStatusResult {
  tenantId: string | null;
  cnpj: string | null;
  razaoSocial: string | null;
  evaluation: TenantAccessEvaluation;
  maxCnpjs: number;
  maxUsers: number;
  hasTenantRecord: boolean;
}

const ENTERPRISE_FIXED_EMAIL = "opaonossopanificadora@gmail.com";

export async function obterStatusAssinaturaCliente(params: {
  user: SessionActorClaims & { id: string };
  cookieTenant?: string;
}): Promise<ClientSubscriptionStatusResult> {
  const { user, cookieTenant } = params;
  const userId = user.id;
  const sessionTenant = user.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(
    userId,
    cookieTenant,
    sessionTenant,
  );

  const unificado = await resolverEstadoFinanceiroUnificadoTitular(
    userId,
    tenantId,
  );
  let tenantData: Record<string, unknown> | null =
    (unificado?.tenantData as Record<string, unknown> | null) || null;

  if (!tenantData && tenantId) {
    try {
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      if (dbTenant) {
        tenantData = dbTenant as unknown as Record<string, unknown>;
      }
    } catch {
      // Fallback para inMemoryTenants em ambientes sem banco ou testes unitários
    }
    if (!tenantData) {
      const memTenant = inMemoryTenants.get(tenantId);
      if (memTenant) {
        tenantData = memTenant as unknown as Record<string, unknown>;
      }
    }
  }

  const userEmail = user.email?.trim().toLowerCase() || "";
  const isEnterpriseAccount = userEmail === ENTERPRISE_FIXED_EMAIL;
  const billingStatusEfetivo = isEnterpriseAccount
    ? "ATIVO"
    : typeof tenantData?.billingStatus === "string"
      ? tenantData.billingStatus
      : "TRIAL";
  const isTrial = billingStatusEfetivo === "TRIAL";

  const rawTrialFim = tenantData?.trialFim as Date | string | null | undefined;
  const rawCriadoEm = tenantData?.criadoEm as Date | string | null | undefined;
  const rawVencimento = tenantData?.vencimentoAssinatura as
    | Date
    | string
    | null
    | undefined;

  const maxCnpjsDb =
    typeof tenantData?.maxCnpjs === "number" ? tenantData.maxCnpjs : 2;
  const maxUsersDb =
    typeof tenantData?.maxUsers === "number" ? tenantData.maxUsers : 2;

  const tenantInfo = {
    plano: isEnterpriseAccount
      ? "ENTERPRISE"
      : isTrial
        ? "PRO"
        : typeof tenantData?.plano === "string"
          ? tenantData.plano
          : user.plano || "PRO",
    billingStatus: billingStatusEfetivo,
    trialFim:
      rawTrialFim ||
      (isTrial
        ? rawCriadoEm
          ? new Date(
              new Date(rawCriadoEm).getTime() + 14 * 24 * 60 * 60 * 1000,
            )
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : null),
    vencimentoAssinatura: rawVencimento || null,
    maxCnpjs: isEnterpriseAccount
      ? 5
      : isTrial
        ? Math.max(maxCnpjsDb, 2)
        : maxCnpjsDb,
    maxUsers: isEnterpriseAccount
      ? 10
      : isTrial
        ? Math.max(maxUsersDb, 2)
        : maxUsersDb,
  };

  const evaluation = evaluateTenantAccess(tenantInfo);

  return {
    tenantId: tenantId || null,
    cnpj:
      (typeof tenantData?.cnpj === "string" ? tenantData.cnpj : null) ||
      user.cnpj ||
      null,
    razaoSocial:
      typeof tenantData?.razaoSocial === "string"
        ? tenantData.razaoSocial
        : null,
    evaluation,
    maxCnpjs: tenantInfo.maxCnpjs,
    maxUsers: tenantInfo.maxUsers,
    hasTenantRecord: Boolean(tenantData),
  };
}

export type SubscriptionApiGuardResult =
  | {
      ok: true;
      evaluation?: TenantAccessEvaluation;
      tenantId?: string | null;
    }
  | { ok: false; response: NextResponse };

export function respostaAssinaturaExpirada(message?: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "SUBSCRIPTION_REQUIRED",
      code: "SUBSCRIPTION_REQUIRED",
      redirectTo: "/planos",
      message:
        message ||
        "Seu período de teste expirou. Escolha um plano em /planos para desbloquear os módulos operacionais.",
    },
    { status: 402 },
  );
}

/**
 * Guard de servidor para APIs operacionais do cliente (Issue #62).
 * Retorna HTTP 402 `SUBSCRIPTION_REQUIRED` quando o tenant ultrapassou o período de teste + 3 dias de carência
 * (ou está BLOQUEADO/CANCELADO) e a rota não está na whitelist.
 */
export async function exigirAssinaturaAtivaEmApi(params: {
  user: SessionActorClaims | null | undefined;
  cookieTenant?: string;
  pathname?: string;
}): Promise<SubscriptionApiGuardResult> {
  const { user, cookieTenant, pathname } = params;

  if (pathname && isApiRouteAllowedWhenSubscriptionBlocked(pathname)) {
    return { ok: true };
  }

  if (!user?.id || isSuperAdminSessionUser(user)) {
    return { ok: true };
  }

  const status = await obterStatusAssinaturaCliente({
    user: { ...user, id: user.id },
    cookieTenant,
  });

  if (status.hasTenantRecord && isSubscriptionLocked(status.evaluation)) {
    return {
      ok: false,
      response: respostaAssinaturaExpirada(status.evaluation.mensagemStatus),
    };
  }

  return {
    ok: true,
    evaluation: status.evaluation,
    tenantId: status.tenantId,
  };
}

/**
 * Atalho para Route Handlers: lê a sessão e o cookie do tenant ativo automaticamente e
 * retorna `NextResponse` (HTTP 402) se o acesso operacional estiver bloqueado, ou `null` se permitido.
 */
export async function verificarBloqueioAssinaturaNaRota(
  request?: Request,
  userOverride?: SessionActorClaims | null,
): Promise<NextResponse | null> {
  const pathname = request ? new URL(request.url).pathname : undefined;
  if (pathname && isApiRouteAllowedWhenSubscriptionBlocked(pathname)) {
    return null;
  }

  let user = userOverride;
  if (user === undefined) {
    const session = await getServerSession(authOptions).catch(() => null);
    user = session?.user as SessionActorClaims | undefined;
  }
  if (!user?.id || isSuperAdminSessionUser(user)) {
    return null;
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {
    // Em ambientes de teste sem request context de cookies()
  }

  const result = await exigirAssinaturaAtivaEmApi({
    user,
    cookieTenant,
    pathname,
  });
  return result.ok ? null : result.response;
}
