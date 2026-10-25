import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { impugnacaoAtualizarInputSchema } from "@/server/schemas/impugnacao.schema";
import {
  atualizarImpugnacao,
  excluirImpugnacao,
  obterImpugnacao,
} from "@/server/services/impugnacoes.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const impugnacao = await obterImpugnacao(id);

    if (!impugnacao) {
      return NextResponse.json(
        { ok: false, error: "Impugnação não encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, impugnacao });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao obter impugnação" },
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
    const parseResult = impugnacaoAtualizarInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Dados inválidos para atualização de impugnação",
          detalhes: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const impugnacao = await atualizarImpugnacao(
      id,
      parseResult.data,
      (session?.user as any)?.id,
    );

    if (!impugnacao) {
      return NextResponse.json(
        { ok: false, error: "Impugnação não encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, impugnacao });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao atualizar impugnação" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession().catch(() => null);
    const sucesso = await excluirImpugnacao(id, (session?.user as any)?.id);

    if (!sucesso) {
      return NextResponse.json(
        { ok: false, error: "Impugnação não encontrada para exclusão" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao excluir impugnação" },
      { status: 500 },
    );
  }
}
