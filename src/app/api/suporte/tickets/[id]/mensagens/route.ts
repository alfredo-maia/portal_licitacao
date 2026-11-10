import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { can, type RbacUser } from "@/lib/rbac";
import { responderTicketSuporteInputSchema } from "@/server/schemas/suporte.schema";
import { adicionarMensagemTicketSuporte } from "@/server/services/suporte.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as (RbacUser & { id?: string; activeTenantId?: string }) | undefined;
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!can(user, "update", "suporte")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = await Promise.resolve(context.params);
    const body = await req.json().catch(() => ({}));
    const parseResult = responderTicketSuporteInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Mensagem inválida.",
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
      cookieTenant,
      user.activeTenantId,
    );

    const isSuperAdmin = user.isSuperAdmin === true || user.role === "SUPERADMIN";
    const ticket = await adicionarMensagemTicketSuporte(id, parseResult.data, {
      id: user.id,
      name: user.name,
      email: user.email,
      tenantId,
      isSuperAdmin,
      autorTipo: isSuperAdmin && body.comoSuporte === true ? "SUPORTE" : "CLIENTE",
    });

    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: "Chamado de suporte não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, ticket });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao registrar mensagem no chamado." },
      { status: 500 },
    );
  }
}

