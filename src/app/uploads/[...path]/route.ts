import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
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

  // Bloqueio imediato e estrito contra Path Traversal
  if (
    pathSegments.some(
      (seg) =>
        seg.includes("..") ||
        seg.includes("\0") ||
        seg.startsWith("/") ||
        seg.startsWith("\\"),
    )
  ) {
    return NextResponse.json({ ok: false, error: "ACESSO_NEGADO" }, { status: 403 });
  }

  const cleanPath = pathSegments.join("/").replace(/^\/+/, "");
  const fileName = pathSegments[pathSegments.length - 1];
  const decodedFileName = decodeURIComponent(fileName);

  const allowedRoots = [
    "/data/uploads",
    join(process.cwd(), "public", "uploads"),
    join(process.cwd(), "uploads"),
  ];

  // Busca nos diretórios de persistência (/data/uploads e public/uploads)
  const candidatePaths = [
    join("/data/uploads", cleanPath),
    join("/data/uploads", decodeURIComponent(cleanPath)),
    join(process.cwd(), "public", "uploads", cleanPath),
    join(process.cwd(), "public", "uploads", decodeURIComponent(cleanPath)),
    join(process.cwd(), "uploads", cleanPath),
    join(process.cwd(), "uploads", decodeURIComponent(cleanPath)),
    join("/data/uploads", "editais", cleanPath.replace(/^editais\/?/, "")),
    join("/data/uploads", "documentos", cleanPath.replace(/^documentos\/?/, "")),
    join(process.cwd(), "public", "uploads", "editais", cleanPath.replace(/^editais\/?/, "")),
    join(process.cwd(), "public", "uploads", "documentos", cleanPath.replace(/^documentos\/?/, "")),
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

  // Fallback inteligente: se o arquivo exato não bateu por sanitização de caracteres, busca na pasta pai
  const parentSubpath = pathSegments.slice(0, -1).join("/");
  const candidateFolders = [
    join("/data/uploads", parentSubpath),
    join("/data/uploads", decodeURIComponent(parentSubpath)),
    join(process.cwd(), "public", "uploads", parentSubpath),
    join(process.cwd(), "public", "uploads", decodeURIComponent(parentSubpath)),
    join("/data/uploads", "editais", parentSubpath.replace(/^editais\/?/, "")),
    join(process.cwd(), "public", "uploads", "editais", parentSubpath.replace(/^editais\/?/, "")),
  ];

  for (const folder of candidateFolders) {
    if (existsSync(folder)) {
      try {
        const files = await readdir(folder);
        const matched = files.find(
          (f) =>
            f === fileName ||
            f === decodedFileName ||
            f.toLowerCase() === fileName.toLowerCase() ||
            f.toLowerCase() === decodedFileName.toLowerCase() ||
            f.replace(/[^a-zA-Z0-9._-]/g, "_") === fileName ||
            fileName.replace(/[^a-zA-Z0-9._-]/g, "_") === f,
        );

        if (matched) {
          const matchedPath = join(folder, matched);
          const buffer = await readFile(matchedPath);
          const mimeType = getMimeType(matched);

          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": mimeType,
              "Content-Disposition": `inline; filename="${encodeURIComponent(matched)}"`,
              "Content-Length": buffer.length.toString(),
              "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
            },
          });
        }
      } catch (err) {
        // Ignora erro de leitura do diretório
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
