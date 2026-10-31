import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { evaluateTenantAccess } from "@/lib/subscription-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    let tenantId = cookieTenant || (session.user as any)?.activeTenantId;
    const userId = (session.user as any)?.id;

    if (!tenantId && userId) {
      try {
        const membership = await prisma.tenantUser.findFirst({
          where: { userId },
        });
        if (membership) {
          tenantId = membership.tenantId;
        }
      } catch {}
    }

    let tenantData: any = null;
    if (tenantId) {
      try {
        tenantData = await prisma.tenant.findUnique({
          where: { id: tenantId },
        });
      } catch {}
    }

    const userEmail = session.user.email?.trim().toLowerCase() || "";
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
        : tenantData?.plano || (session.user as any)?.plano || "PRO",
      billingStatus: billingStatusEfetivo,
      trialFim:
        tenantData?.trialFim ||
        (isTrial ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null),
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
      cnpj: tenantData?.cnpj || (session.user as any)?.cnpj || null,
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

