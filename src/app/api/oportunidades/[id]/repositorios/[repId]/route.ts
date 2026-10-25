import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import { removerRepositorioSimilar } from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string; repId: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, repId } = await context.params;
  const session = await getServerSession(authOptions);
  const user = session?.user as RbacUser | undefined;

  try {
    await removerRepositorioSimilar(id, repId, user, {
      usuarioId: user?.id,
      usuarioNome: user?.name,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
