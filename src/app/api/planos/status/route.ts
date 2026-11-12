import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { prisma } from "@/lib/prisma";
import { evaluateTenantAccess } from "@/lib/subscription-guard";
import {
  inMemoryTenants,
  resolveUserActiveTenantId,
  resolverEstadoFinanceiroUnificadoTitular,
} from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
    if (!guard.ok) return guard.response;

    const userId = guard.user.id;
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const sessionTenant = guard.user.activeTenantId;
    const tenantId = await resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);

    const unificado = await resolverEstadoFinanceiroUnificadoTitular(userId, tenantId);
    let tenantData: any = unificado?.tenantData || null;
    if (!tenantData && tenantId) {
      try {
        tenantData = await prisma.tenant.findUnique({
          where: { id: tenantId },
        });
      } catch {}
      if (!tenantData) {
        tenantData = inMemoryTenants.get(tenantId) || null;
      }
    }

    const userEmail = guard.user.email?.trim().toLowerCase() || "";
    const isEnterpriseAccount = userEmail === "opaonossopanificadora@gmail.com";
    const billingStatusEfetivo = isEnterpriseAccount
      ? "ATIVO"
      : tenantData?.billingStatus || "TRIAL";
    const isTrial = billingStatusEfetivo === "TRIAL";

    const tenantInfo = {
      plano: isEnterpriseAccount
        ? "ENTERPRISE"
        : isTrial
        ? "PRO"
        : tenantData?.plano || guard.user.plano || "PRO",
      billingStatus: billingStatusEfetivo,
      trialFim:
        tenantData?.trialFim ||
        (isTrial
          ? tenantData?.criadoEm
            ? new Date(new Date(tenantData.criadoEm).getTime() + 14 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          : null),
      vencimentoAssinatura: tenantData?.vencimentoAssinatura || null,
      maxCnpjs: isEnterpriseAccount
        ? 5
        : isTrial
        ? Math.max(tenantData?.maxCnpjs || 2, 2)
        : tenantData?.maxCnpjs || 2,
      maxUsers: isEnterpriseAccount
        ? 10
        : isTrial
        ? Math.max(tenantData?.maxUsers || 2, 2)
        : tenantData?.maxUsers || 2,
    };

    const evaluation = evaluateTenantAccess(tenantInfo);

    return NextResponse.json({
      ok: true,
      tenantId: tenantId || null,
      cnpj: tenantData?.cnpj || guard.user.cnpj || null,
      razaoSocial: tenantData?.razaoSocial || null,
      ...evaluation,
      maxCnpjs: tenantInfo.maxCnpjs,
      maxUsers: tenantInfo.maxUsers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao consultar status da assinatura" },
      { status: 500 },
    );
  }
}

