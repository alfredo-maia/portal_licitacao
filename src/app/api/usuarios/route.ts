import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { listarEquipe } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET() {
  let session: any = null;
  try {
    session = await getServerSession(authOptions).catch(() => null);
    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }

    const userId = (session.user as any)?.id;
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const tenantId = await resolveUserActiveTenantId(
      userId,
      cookieTenant || (session.user as any)?.activeTenantId,
    );

    const equipe = await listarEquipe(tenantId || null, {
      id: userId,
      name: session.user.name,
      email: session.user.email,
      role: (session.user as any)?.role,
    });

    const usuarios = (equipe.usuarios || [])
      .filter((m) => m.ativo !== false)
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role === "OPERADOR" ? "ANALISTA_COMERCIAL" : m.role,
      }));

    return NextResponse.json({ ok: true, usuarios }, { status: 200 });
  } catch {
    const fallbackUser = session?.user
      ? [
          {
            id: (session.user as any)?.id || "usr_titular",
            name: session.user.name || "Usuário",
            email: session.user.email || "usuario@empresa.com.br",
            role: "DIRETORIA",
          },
        ]
      : [];
    return NextResponse.json(
      {
        ok: true,
        usuarios: fallbackUser,
      },
      { status: 200 },
    );
  }
}
