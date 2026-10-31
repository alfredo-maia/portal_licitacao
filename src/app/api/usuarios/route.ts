import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { listarEquipe } from "@/server/services/configuracoes.service";

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
    return NextResponse.json(
      {
        ok: true,
        usuarios: [
          {
            id: "usr_vitor",
            name: "Vítor Henrique",
            email: "vitorhenrique018@gmail.com",
            role: "DIRETORIA",
          },
        ],
      },
      { status: 200 },
    );
  }
}
