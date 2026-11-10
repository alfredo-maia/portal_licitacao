import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { listarCobrancasAssinaturaAsaas } from "@/server/services/asaas.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as
      | { id?: string; activeTenantId?: string }
      | undefined;

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const tenantId =
      (await resolveUserActiveTenantId(user.id, cookieTenant, user.activeTenantId)) ||
      user.activeTenantId ||
      null;

    let subscriptionId: string | null = null;
    let customerId: string | null = null;

    if (tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { asaasSubscriptionId: true, asaasCustomerId: true },
        });
        subscriptionId = tenant?.asaasSubscriptionId ?? null;
        customerId = tenant?.asaasCustomerId ?? null;
      } catch {}
    }

    const res = await listarCobrancasAssinaturaAsaas({
      tenantId,
      subscriptionId,
      customerId,
    });

    return NextResponse.json(res, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao consultar faturas no Asaas." },
      { status: 500 },
    );
  }
}

