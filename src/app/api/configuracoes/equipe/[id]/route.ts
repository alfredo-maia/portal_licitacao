import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
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
    const session = await getServerSession(authOptions).catch(() => null);
    const tenantId = (session?.user as any)?.activeTenantId;

    if (tenantId) {
      let membership: any;
      try {
        membership = await prisma.tenantUser.findUnique({
          where: { tenantId_userId: { tenantId, userId: id } },
          include: { user: true },
        });
      } catch {
        const mem = getInMemoryUsuario(id, tenantId);
        if (mem) membership = { user: mem };
      }

      if (!membership || !membership.user) {
        return NextResponse.json(
          { ok: false, error: "Usuário não encontrado" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        usuario: {
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.user.role,
          ativo: membership.ativo !== undefined ? membership.ativo : membership.user.ativo,
        },
      });
    }

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
    const session = await getServerSession(authOptions).catch(() => null);
    const tenantId = (session?.user as any)?.activeTenantId;
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

    const actor = session?.user
      ? { id: (session.user as any).id, role: (session.user as any).role || "DIRETORIA" }
      : undefined;

    const usuario = await atualizarMembroEquipe(
      id,
      parseResult.data,
      (session?.user as any)?.id,
      actor,
      tenantId,
    );

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, usuario });
  } catch (error: any) {
    const isPermissionError =
      error.message?.includes("não pode") ||
      error.message?.includes("Não é permitido") ||
      error.message?.includes("não possui permissão") ||
      error.message?.includes("não pertence");
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar usuário" },
      { status: isPermissionError ? 403 : 500 },
    );
  }
}
