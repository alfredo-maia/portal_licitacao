import { NextResponse } from "next/server";
import { sincronizarDocumentosLicitacaoPncp } from "@/server/storage/r2-storage.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Endpoint para abrir e sincronizar documentos do edital com Cloudflare R2 e cache de 24h.
 * GET /api/licitacoes/[id]/documentos
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "LICITACAO_ID_OBRIGATORIO" },
        { status: 400 },
      );
    }

    const resultado = await sincronizarDocumentosLicitacaoPncp(id);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "ERRO_SINCRONIZACAO_DOCUMENTOS",
        mensagem: err?.message || "Não foi possível sincronizar os documentos do certame",
      },
      { status: 500 },
    );
  }
}
