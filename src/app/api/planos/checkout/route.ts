import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { can, type RbacUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlanoCheckoutInputSchema } from "@/server/schemas/asaas.schema";
import { criarAssinaturaAsaas } from "@/server/services/asaas.service";
import {
  inMemoryTenants,
  resolveUserActiveTenantId,
} from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as
      | (RbacUser & {
          id?: string;
          activeTenantId?: string;
          cnpj?: string;
          telefone?: string;
        })
      | undefined;

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    if (!can(user, "approve_price", "saas")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Apenas perfis de Diretoria ou Titular podem contratar ou alterar o plano da empresa.",
        },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = PlanoCheckoutInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.errors[0]?.message || "Dados inválidos para contratação do plano.",
          detalhes: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const tenantId =
      (await resolveUserActiveTenantId(user.id, cookieTenant, user.activeTenantId)) ||
      user.activeTenantId ||
      `tnt_${user.id}`;

    let tenantData: { razaoSocial?: string; cnpj?: string; telefone?: string | null } | null = null;
    try {
      tenantData = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { razaoSocial: true, cnpj: true, telefone: true },
      });
    } catch {}

    if (!tenantData) {
      const memTenant = inMemoryTenants.get(tenantId);
      if (memTenant) {
        tenantData = {
          razaoSocial: memTenant.razaoSocial,
          cnpj: memTenant.cnpj,
        };
      }
    }

    const checkout = await criarAssinaturaAsaas({
      tenantId,
      plano: parsed.data.plano,
      billingType: parsed.data.billingType,
      razaoSocial:
        parsed.data.nome || tenantData?.razaoSocial || user.name || "Empresa Licitante",
      cnpj: parsed.data.cpfCnpj || tenantData?.cnpj || user.cnpj || "12345678000190",
      email: parsed.data.email || user.email || "financeiro@licitante.com.br",
      telefone: parsed.data.telefone || tenantData?.telefone || user.telefone || undefined,
    });

    return NextResponse.json(checkout, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao iniciar checkout do plano no Asaas." },
      { status: 500 },
    );
  }
}

