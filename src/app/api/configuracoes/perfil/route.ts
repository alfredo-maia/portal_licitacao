import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { meuPerfilAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import {
  atualizarMeuPerfil,
  obterMeuPerfil,
} from "@/server/services/configuracoes.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }

    const perfil = await obterMeuPerfil(userId);
    return NextResponse.json({ ok: true, perfil });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao obter perfil do usuário" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = meuPerfilAtualizarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para atualização do perfil",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const resultado = await atualizarMeuPerfil(userId, parseResult.data);
    return NextResponse.json(resultado);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar perfil do usuário" },
      { status: 400 },
    );
  }
}
