import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { configuracaoEmpresaAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import {
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from "@/server/services/configuracoes.service";

export const dynamic = "force-dynamic";

export async function GET(_req?: Request) {
  try {
    const empresa = await obterConfiguracaoEmpresa();
    return NextResponse.json({ ok: true, empresa });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao obter configurações da empresa" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const parseResult = configuracaoEmpresaAtualizarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para atualização da empresa",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const empresa = await atualizarConfiguracaoEmpresa(
      parseResult.data,
      (session?.user as any)?.id,
    );

    return NextResponse.json({ ok: true, empresa });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar dados da empresa" },
      { status: 500 },
    );
  }
}
