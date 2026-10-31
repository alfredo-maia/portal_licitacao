import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import {
  createTenantForUser,
  listTenantsForUser,
  PlanQuotaExceededError,
  TenantCollisionError,
} from "@/server/services/tenant.service";
import { createTenantSchema } from "@/server/schemas/tenant.schema";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }
    let cookieActiveTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieActiveTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const sessionActiveTenant = (session?.user as any)?.activeTenantId;

    let tenants: any[] = [];

    try {
      const memberships = await prisma.tenantUser.findMany({
        where: { userId, ativo: true },
        include: { tenant: true },
        orderBy: { criadoEm: "asc" },
      });

      tenants = memberships
        .filter((m) => m.tenant && m.tenant.ativo)
        .map((m) => ({
          id: m.tenant.id,
          cnpj: m.tenant.cnpj,
          razaoSocial: m.tenant.razaoSocial,
          nomeFantasia: m.tenant.nomeFantasia,
          plano: m.tenant.plano,
          billingStatus: m.tenant.billingStatus,
          maxCnpjs: m.tenant.maxCnpjs,
          maxUsers: m.tenant.maxUsers,
          role: m.role,
        }));
    } catch {
      const inMemList = await listTenantsForUser(userId);
      tenants = inMemList.map((m) => ({
        id: m.tenant.id,
        cnpj: m.tenant.cnpj,
        razaoSocial: m.tenant.razaoSocial,
        nomeFantasia: m.tenant.nomeFantasia,
        plano: m.tenant.plano,
        billingStatus: "TRIAL",
        maxCnpjs: m.tenant.maxCnpjs,
        maxUsers: m.tenant.maxUsers,
        role: m.role,
      }));
    }

    const activeTenantId =
      cookieActiveTenant ||
      sessionActiveTenant ||
      tenants[0]?.id ||
      null;

    return NextResponse.json({
      ok: true,
      tenants,
      activeTenantId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao listar empresas do usuário" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));

    // Caso 1: Alternância de Empresa Ativa ({ tenantId })
    if (body.tenantId && typeof body.tenantId === "string") {
      const targetTenantId = body.tenantId;

      // Validação de vínculo
      let hasAccess = false;
      try {
        const membership = await prisma.tenantUser.findUnique({
          where: {
            tenantId_userId: {
              tenantId: targetTenantId,
              userId,
            },
          },
        });
        hasAccess = Boolean(membership && membership.ativo);
      } catch {
        hasAccess = true;
      }

      if (!hasAccess) {
        return NextResponse.json(
          { ok: false, error: "Você não possui acesso a esta empresa." },
          { status: 403 },
        );
      }

      const response = NextResponse.json({
        ok: true,
        activeTenantId: targetTenantId,
        message: "Empresa ativa alterada com sucesso.",
      });

      response.cookies.set("portal_licitacao_active_tenant", targetTenantId, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
      });

      return response;
    }

    // Caso 2: Cadastro de Novo CNPJ Vinculado
    const parseResult = createTenantSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parseResult.error.errors[0]?.message || "Dados inválidos para criação do CNPJ.",
        },
        { status: 400 },
      );
    }

    const user = (session?.user || {}) as any;
    const novoTenant = await createTenantForUser({
      userId: user.id,
      userEmail: user.email,
      userName: user.name || "Titular",
      userPlan: user.plano || parseResult.data.plano,
      input: parseResult.data,
    });

    const response = NextResponse.json(
      {
        ok: true,
        tenant: novoTenant,
        activeTenantId: novoTenant.id,
      },
      { status: 201 },
    );

    response.cookies.set("portal_licitacao_active_tenant", novoTenant.id, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    if (error instanceof TenantCollisionError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof PlanQuotaExceededError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao processar requisição" },
      { status: 500 },
    );
  }
}
