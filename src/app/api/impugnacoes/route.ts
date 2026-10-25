import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import {
  impugnacaoCriarInputSchema,
  impugnacaoListQuerySchema,
} from "@/server/schemas/impugnacao.schema";
import {
  criarImpugnacao,
  listarImpugnacoes,
} from "@/server/services/impugnacoes.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = impugnacaoListQuerySchema.parse({
      status: searchParams.get("status") || undefined,
      busca: searchParams.get("busca") || undefined,
      apenasCriticas: searchParams.get("apenasCriticas") === "true",
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 10,
    });

    const resultado = await listarImpugnacoes(query);
    return NextResponse.json(resultado);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao listar impugnações" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const parseResult = impugnacaoCriarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para cadastro de impugnação",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const impugnacao = await criarImpugnacao(
      parseResult.data,
      (session?.user as any)?.id,
    );

    return NextResponse.json(
      { ok: true, impugnacao },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao criar impugnação" },
      { status: 500 },
    );
  }
}
