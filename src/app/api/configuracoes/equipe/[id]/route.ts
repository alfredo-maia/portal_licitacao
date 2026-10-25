import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { usuarioEquipeAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import { atualizarMembroEquipe } from "@/server/services/configuracoes.service";
import { getInMemoryUsuario } from "@/server/services/licitacoes-store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    let user: any;
    try {
      user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, ativo: true },
      });
    } catch {
      user = getInMemoryUsuario(id);
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, usuario: user });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao obter usuário" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const parseResult = usuarioEquipeAtualizarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para atualização de colaborador",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const usuario = await atualizarMembroEquipe(
      id,
      parseResult.data,
      (session?.user as any)?.id,
    );

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, usuario });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar usuário" },
      { status: 500 },
    );
  }
}
