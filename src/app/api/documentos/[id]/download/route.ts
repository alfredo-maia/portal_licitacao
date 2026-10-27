import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { obterDocumento } from "@/server/services/documentos.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const detalhe = await obterDocumento(id);

  if (!detalhe || !detalhe.documento) {
    return NextResponse.json({ ok: false, error: "DOCUMENTO_NAO_ENCONTRADO" }, { status: 404 });
  }

  const doc = detalhe.documento;
  const nomeArquivoDownload = doc.arquivoNome || `${doc.nome.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  // 1. Se houver caminho físico em public/uploads ou /data/uploads, tenta servir o arquivo real
  if (doc.arquivoUrl) {
    const possíveisCaminhos = [
      join(process.cwd(), "public", doc.arquivoUrl.replace(/^\//, "")),
      join(process.cwd(), doc.arquivoUrl.replace(/^\//, "")),
      join("/data/uploads", doc.arquivoUrl.replace(/^\/?(uploads\/)?/, "")),
    ];

    for (const caminho of possíveisCaminhos) {
      if (existsSync(caminho)) {
        try {
          const buffer = await readFile(caminho);
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeArquivoDownload)}"`,
              "Content-Type": doc.mimeType || "application/pdf",
              "Content-Length": buffer.length.toString(),
            },
          });
        } catch {
          // Fallback para emissão da certidão oficial
        }
      }
    }
  }

  // 2. Se o arquivo físico não estiver em disco (ex: seed ou mock), gera a Certidão / Espelho Oficial em HTML/PDF
  const dataEmissaoFormatada = doc.dataEmissao
    ? new Date(doc.dataEmissao).toLocaleDateString("pt-BR")
    : "Não informada";
  const dataVencimentoFormatada = doc.semValidade
    ? "Documento com validade indeterminada"
    : doc.dataVencimento
    ? new Date(doc.dataVencimento).toLocaleDateString("pt-BR")
    : "Não informada";

  const certidaoHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${doc.nome} - Espelho Oficial</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #161616;
      background: #ffffff;
      padding: 2.5rem;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid #0f62fe;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { margin: 0; font-size: 1.5rem; color: #0f62fe; }
    .badge {
      background: #e0e0e0;
      padding: 4px 10px;
      font-size: 0.75rem;
      border-radius: 2px;
      font-weight: 600;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 2rem; }
    .field { border-bottom: 1px solid #e0e0e0; padding-bottom: 0.5rem; }
    .field label { font-size: 0.75rem; text-transform: uppercase; color: #525252; font-weight: 600; display: block; }
    .field span { font-size: 0.95rem; font-weight: 500; }
    .stamp {
      background: #f4f4f4;
      border: 1px solid #c6c6c6;
      border-left: 4px solid #24a148;
      padding: 1.25rem;
      font-size: 0.85rem;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Portal de Licitações Públicas</h1>
      <small>Certidão de Registro de Documento de Habilitação</small>
    </div>
    <span class="badge">LEI 14.133/2021</span>
  </div>

  <h2>${doc.nome}</h2>

  <div class="grid">
    <div class="field">
      <label>Categoria</label>
      <span>${doc.categoria}</span>
    </div>
    <div class="field">
      <label>Órgão Emissor</label>
      <span>${doc.orgaoEmissor || "Não informado"}</span>
    </div>
    <div class="field">
      <label>Data de Emissão</label>
      <span>${dataEmissaoFormatada}</span>
    </div>
    <div class="field">
      <label>Validade / Vencimento</label>
      <span>${dataVencimentoFormatada}</span>
    </div>
    <div class="field">
      <label>Versão</label>
      <span>Versão ${doc.versao}</span>
    </div>
    <div class="field">
      <label>Status Cadastral</label>
      <span>${doc.status}</span>
    </div>
  </div>

  <div class="stamp">
    <strong>Autenticidade e Registro Corporativo</strong><br>
    Identificador Único: <code>${doc.id}</code><br>
    Arquivo Vinculado: <code>${doc.arquivoNome || doc.nome}</code><br>
    Registro emitido eletronicamente pela Plataforma de Licitações.
  </div>

  <script>
    // Se aberto no navegador, sugere impressão ou download em PDF
    window.onload = function() {
      // document pronto
    };
  </script>
</body>
</html>`;

  return new NextResponse(certidaoHtml, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeArquivoDownload.replace(/\.[^/.]+$/, ""))}.html"`,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
