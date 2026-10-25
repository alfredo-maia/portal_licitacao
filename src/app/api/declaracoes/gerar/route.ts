import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { declaracaoGerarInputSchema } from "@/server/schemas/declaracao.schema";
import { gerarDeclaracao } from "@/server/services/declaracoes.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const parseResult = declaracaoGerarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para geração de declaração",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const resultado = await gerarDeclaracao(
      parseResult.data,
      (session?.user as any)?.id,
    );

    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Erro ao gerar declaração" },
      { status: 500 },
    );
  }
}
