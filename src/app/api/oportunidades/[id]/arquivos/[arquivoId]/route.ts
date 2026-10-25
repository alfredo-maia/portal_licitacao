import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import { removerArquivoEdital } from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string; arquivoId: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, arquivoId } = await context.params;
  const session = await getServerSession(authOptions);
  const user = session?.user as RbacUser | undefined;

  try {
    await removerArquivoEdital(id, arquivoId, user, {
      usuarioId: user?.id,
      usuarioNome: user?.name,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
