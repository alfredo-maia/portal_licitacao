import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { usuarioEquipeCriarInputSchema } from "@/server/schemas/configuracao.schema";
import {
  criarMembroEquipe,
  listarEquipe,
} from "@/server/services/configuracoes.service";

export const dynamic = "force-dynamic";

export async function GET(_req?: Request) {
  try {
    const resultado = await listarEquipe();
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
    const session = await getServerSession().catch(() => null);
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

    const usuario = await criarMembroEquipe(
      parseResult.data,
      (session?.user as any)?.id,
    );

    return NextResponse.json({ ok: true, usuario }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao criar membro da equipe" },
      { status: 500 },
    );
  }
}
