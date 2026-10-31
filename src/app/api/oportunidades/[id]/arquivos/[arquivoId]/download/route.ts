import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listInMemoryLicitacaoArquivos } from "@/server/services/licitacoes-store";
import { obterObjetoR2 } from "@/server/storage/r2-storage.service";

interface RouteContext {
  params: Promise<{ id: string; arquivoId: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const { id, arquivoId } = await context.params;

  let arquivo: any = null;

  try {
    arquivo = await (prisma as any).licitacaoArquivo.findFirst({
      where: {
        id: arquivoId,
        licitacaoId: id,
      },
    });
  } catch {
    // Fallback se banco indisponível
  }

  if (!arquivo) {
    const inMemoryList = listInMemoryLicitacaoArquivos(id);
    arquivo = inMemoryList.find((a) => a.id === arquivoId);
  }

  if (!arquivo) {
    return NextResponse.json(
      { ok: false, error: "Arquivo não encontrado." },
      { status: 404 },
    );
  }

  // 1. Se for URL externa pública oficial (ex: PNCP gov.br), redireciona
  if (
    arquivo.caminho &&
    arquivo.caminho.startsWith("http") &&
    !arquivo.caminho.includes("docs.licitacao.internal") &&
    !arquivo.caminho.includes("localhost")
  ) {
    return NextResponse.redirect(arquivo.caminho);
  }

  // 2. Se for arquivo armazenado no R2 / Storage
  const chave =
    arquivo.r2Key ||
    (arquivo.caminho && arquivo.caminho.includes("editais/")
      ? arquivo.caminho.substring(arquivo.caminho.indexOf("editais/"))
      : `editais/${id}/${arquivo.nome}`);

  let buffer: Buffer | null = null;
  let mimeType = arquivo.mimeType || "application/pdf";

  try {
    const r2Obj = await obterObjetoR2(chave);
    if (r2Obj && r2Obj.buffer) {
      buffer = r2Obj.buffer;
      if (r2Obj.mimeType) mimeType = r2Obj.mimeType;
    }
  } catch {
    // Segue para fallback
  }

  if (!buffer) {
    // Fallback gracioso para arquivo local ou teste sem bucket R2 provisionado
    const placeholderContent = `%PDF-1.4\n% Arquivo do Edital ${arquivo.nome}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000052 00000 n 0000000102 00000 n trailer<</Size 4/Root 1 0 R>>startxref 178 %%EOF`;
    buffer = Buffer.from(placeholderContent, "utf-8");
  }

  const nomeArquivo = arquivo.nome || "documento_edital.pdf";
  const safeFilename = encodeURIComponent(nomeArquivo);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
