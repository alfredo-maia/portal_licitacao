import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { usuarioEquipeCriarInputSchema } from "@/server/schemas/configuracao.schema";
import {
  criarMembroEquipe,
  listarEquipe,
} from "@/server/services/configuracoes.service";

export const dynamic = "force-dynamic";

export async function GET(_req?: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const tenantId = (session?.user as any)?.activeTenantId;

    const resultado = await listarEquipe(tenantId);
    return NextResponse.json(resultado);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao listar equipe" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const tenantId = (session?.user as any)?.activeTenantId;
    const body = await req.json().catch(() => ({}));
    const parseResult = usuarioEquipeCriarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para criação de colaborador",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const actor = session?.user
      ? { id: (session.user as any).id, role: (session.user as any).role || "DIRETORIA" }
      : undefined;

    const usuario = await criarMembroEquipe(
      parseResult.data,
      (session?.user as any)?.id,
      actor,
      tenantId,
    );

    return NextResponse.json({ ok: true, usuario }, { status: 201 });
  } catch (error: any) {
    const isPermissionError =
      error.message?.includes("não pode") ||
      error.message?.includes("não possui permissão") ||
      error.message?.includes("não pertence");
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao criar membro da equipe" },
      { status: isPermissionError ? 403 : 500 },
    );
  }
}
