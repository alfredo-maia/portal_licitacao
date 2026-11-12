import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  isSuperAdminSessionUser,
  respostaProibidaAdminEmRotaCliente,
} from "@/server/auth/client-guard";
import { can, type RbacUser } from "@/lib/rbac";
import {
  criarTicketSuporteInputSchema,
  supportTicketStatusSchema,
} from "@/server/schemas/suporte.schema";
import {
  criarTicketSuporte,
  listarTicketsSuporte,
} from "@/server/services/suporte.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as (RbacUser & { id?: string; activeTenantId?: string }) | undefined;
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (isSuperAdminSessionUser(user)) {
      return respostaProibidaAdminEmRotaCliente();
    }

    if (!can(user, "read", "suporte")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const { searchParams } = new URL(req.url);
    const queryTenant = searchParams.get("tenantId");
    const statusRaw = searchParams.get("status");
    const statusParsed = statusRaw ? supportTicketStatusSchema.safeParse(statusRaw) : null;
    const resumo = searchParams.get("resumo") === "1" || searchParams.get("resumo") === "true";

    const tenantId = await resolveUserActiveTenantId(
      user.id,
      queryTenant || cookieTenant,
      user.activeTenantId,
    );

    const tickets = await listarTicketsSuporte(tenantId, user.id, {
      isSuperAdmin: user.isSuperAdmin === true || user.role === "SUPERADMIN",
      status: statusParsed?.success ? statusParsed.data : undefined,
      resumo,
    });

    const totalMensagensNaoLidas = tickets.reduce(
      (acc, t) => acc + (t.mensagensNaoLidasCliente || 0),
      0,
    );

    return NextResponse.json({
      ok: true,
      tickets,
      totalMensagensNaoLidas,
      activeTenantId: tenantId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao listar chamados de suporte." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as
      | (RbacUser & { id?: string; activeTenantId?: string; telefone?: string })
      | undefined;
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (isSuperAdminSessionUser(user)) {
      return respostaProibidaAdminEmRotaCliente();
    }

    if (!can(user, "create", "suporte")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = criarTicketSuporteInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para abertura do chamado.",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const tenantId = await resolveUserActiveTenantId(
      user.id,
      body.tenantId || cookieTenant,
      user.activeTenantId,
    );

    const ticket = await criarTicketSuporte(parseResult.data, {
      id: user.id,
      name: user.name,
      email: user.email,
      telefone: user.telefone ?? null,
      tenantId,
    });

    return NextResponse.json({ ok: true, ticket }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao abrir chamado de suporte." },
      { status: 500 },
    );
  }
}

