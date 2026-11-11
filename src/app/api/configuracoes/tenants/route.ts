import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import {
  isSuperAdminSessionUser,
  respostaProibidaAdminEmRotaCliente,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { prisma } from "@/lib/prisma";
import {
  createTenantForUser,
  inMemoryTenantUsers,
  listTenantsForUser,
  PlanQuotaExceededError,
  TenantCollisionError,
  UnauthorizedTenantActionError,
} from "@/server/services/tenant.service";
import { createTenantSchema } from "@/server/schemas/tenant.schema";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const sessionUser = session?.user as SessionActorClaims | undefined;
    const userId = sessionUser?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }
    if (isSuperAdminSessionUser(sessionUser)) {
      return respostaProibidaAdminEmRotaCliente();
    }
    const userEmail = session?.user?.email?.trim().toLowerCase() || "";
    const isEnterpriseAccount = userEmail === "opaonossopanificadora@gmail.com";
    let cookieActiveTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieActiveTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const sessionActiveTenant = (session?.user as any)?.activeTenantId;

    let tenants: any[] = [];

    try {
      let memberships = await prisma.tenantUser.findMany({
        where: { userId, ativo: true },
        include: { tenant: true },
        orderBy: { criadoEm: "asc" },
      });

      if (memberships.length === 0 && userEmail) {
        const dbUser = await prisma.user.findUnique({ where: { email: userEmail } });
        if (dbUser) {
          memberships = await prisma.tenantUser.findMany({
            where: { userId: dbUser.id, ativo: true },
            include: { tenant: true },
            orderBy: { criadoEm: "asc" },
          });
        }
      }

      tenants = memberships
        .filter((m) => m.tenant && m.tenant.ativo)
        .map((m) => {
          const isTrial = !isEnterpriseAccount && m.tenant.billingStatus === "TRIAL";
          const planoEfetivo = isEnterpriseAccount
            ? "ENTERPRISE"
            : isTrial
            ? "PRO"
            : m.tenant.plano;
          const billingEfetivo = isEnterpriseAccount
            ? "ATIVO"
            : m.tenant.billingStatus;
          const maxCnpjsEfetivo = isEnterpriseAccount
            ? 5
            : isTrial
            ? Math.max(m.tenant.maxCnpjs || 2, 2)
            : m.tenant.maxCnpjs;
          const maxUsersEfetivo = isEnterpriseAccount
            ? 10
            : isTrial
            ? Math.max(m.tenant.maxUsers || 2, 2)
            : m.tenant.maxUsers;

          return {
            id: m.tenant.id,
            cnpj: m.tenant.cnpj,
            razaoSocial: m.tenant.razaoSocial,
            nomeFantasia: m.tenant.nomeFantasia,
            plano: planoEfetivo,
            billingStatus: billingEfetivo,
            maxCnpjs: maxCnpjsEfetivo,
            maxUsers: maxUsersEfetivo,
            role: m.role,
            segmentos: m.tenant.segmentos || [],
            subsegmentos: m.tenant.subsegmentos || [],
            ufs: m.tenant.ufs || [],
            brasilInteiro: m.tenant.brasilInteiro ?? true,
          };
        });
    } catch {
      const inMemList = await listTenantsForUser(userId);
      tenants = inMemList.map((m) => ({
        id: m.tenant.id,
        cnpj: m.tenant.cnpj,
        razaoSocial: m.tenant.razaoSocial,
        nomeFantasia: m.tenant.nomeFantasia,
        plano: isEnterpriseAccount ? "ENTERPRISE" : m.tenant.plano || "PRO",
        billingStatus: isEnterpriseAccount ? "ATIVO" : "TRIAL",
        maxCnpjs: isEnterpriseAccount ? 5 : Math.max(m.tenant.maxCnpjs || 2, 2),
        maxUsers: isEnterpriseAccount ? 10 : Math.max(m.tenant.maxUsers || 2, 2),
        role: m.role,
        segmentos: m.tenant.segmentos || [],
        subsegmentos: m.tenant.subsegmentos || [],
        ufs: m.tenant.ufs || [],
        brasilInteiro: m.tenant.brasilInteiro ?? true,
      }));
    }

    const validTenantMatch = cookieActiveTenant && tenants.find((t) => t.id === cookieActiveTenant);
    const activeTenantId = validTenantMatch
      ? validTenantMatch.id
      : (sessionActiveTenant && tenants.find((t) => t.id === sessionActiveTenant)?.id) ||
        tenants[0]?.id ||
        null;

    const response = NextResponse.json({
      ok: true,
      tenants,
      activeTenantId,
    });

    if (activeTenantId && cookieActiveTenant !== activeTenantId) {
      response.cookies.set("portal_licitacao_active_tenant", activeTenantId, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return response;
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
    const sessionUser = session?.user as SessionActorClaims | undefined;
    const userId = sessionUser?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }
    if (isSuperAdminSessionUser(sessionUser)) {
      return respostaProibidaAdminEmRotaCliente();
    }

    const body = await req.json().catch(() => ({}));

    // Caso 1: Alternância de Empresa Ativa ({ tenantId })
    if (body.tenantId && typeof body.tenantId === "string") {
      const targetTenantId = body.tenantId;

      // Validação de vínculo estrita (fail-closed)
      let hasAccess = inMemoryTenantUsers.some(
        (tu) => tu.userId === userId && tu.tenantId === targetTenantId && tu.ativo,
      );
      if (!hasAccess) {
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
          hasAccess = false;
        }
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
        secure: process.env.NODE_ENV === "production",
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
      secure: process.env.NODE_ENV === "production",
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
    if (error instanceof PlanQuotaExceededError || error instanceof UnauthorizedTenantActionError) {
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
