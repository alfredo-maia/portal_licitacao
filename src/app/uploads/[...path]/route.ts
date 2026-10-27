import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "json":
      return "application/json";
    case "txt":
      return "text/plain; charset=utf-8";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { path: pathSegments } = await params;

  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ ok: false, error: "CAMINHO_INVALIDO" }, { status: 400 });
  }

  // Sanitização estrita contra path traversal
  const cleanPath = pathSegments
    .join("/")
    .replace(/\.\./g, "")
    .replace(/^\/+/, "");

  const fileName = pathSegments[pathSegments.length - 1];

  // Busca nos diretórios de persistência (/data/uploads e public/uploads)
  const candidatePaths = [
    join("/data/uploads", cleanPath),
    join(process.cwd(), "public", "uploads", cleanPath),
    join(process.cwd(), "uploads", cleanPath),
    // Caso o path venha prefixado ou sem prefixo editais/documentos
    join("/data/uploads", "editais", cleanPath),
    join("/data/uploads", "documentos", cleanPath),
    join(process.cwd(), "public", "uploads", "editais", cleanPath),
    join(process.cwd(), "public", "uploads", "documentos", cleanPath),
  ];

  for (const filePath of candidatePaths) {
    if (existsSync(filePath)) {
      try {
        const buffer = await readFile(filePath);
        const mimeType = getMimeType(fileName);

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
          },
        });
      } catch (err) {
        console.error(`[UploadsHandler] Erro ao ler arquivo ${filePath}:`, err);
      }
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "ARQUIVO_NAO_ENCONTRADO",
      message: `O arquivo solicitado '${cleanPath}' não foi localizado no servidor de arquivos.`,
    },
    { status: 404 },
  );
}
