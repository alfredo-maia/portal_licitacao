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

    const tenantInfo = {
      plano: tenantData?.plano || (session.user as any)?.plano || "BASICO",
      billingStatus: tenantData?.billingStatus || "TRIAL",
      trialFim: tenantData?.trialFim || null,
      vencimentoAssinatura: tenantData?.vencimentoAssinatura || null,
      maxCnpjs: tenantData?.maxCnpjs || 1,
      maxUsers: tenantData?.maxUsers || 1,
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

