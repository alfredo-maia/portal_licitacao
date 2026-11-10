import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/server/auth";
import {
  findInMemoryLicitacaoArquivoByCaminho,
  listInMemoryDocumentos,
} from "@/server/services/licitacoes-store";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

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
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
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

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const resolvedRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + sep);
}

function buildSafeFileResponse(buffer: Buffer, filename: string): NextResponse {
  const ext = filename.split(".").pop()?.toLowerCase();
  const isActiveHtmlOrSvg = ext === "svg" || ext === "html" || ext === "htm";
  const mimeType = getMimeType(filename);
  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    "Content-Disposition": `${isActiveHtmlOrSvg ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"`,
    "Content-Length": buffer.length.toString(),
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  if (isActiveHtmlOrSvg) {
    headers["Content-Security-Policy"] = "sandbox";
  }
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as
    | { id?: string; role?: string; isSuperAdmin?: boolean; activeTenantId?: string }
    | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { path: pathSegments } = await params;

  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ ok: false, error: "CAMINHO_INVALIDO" }, { status: 400 });
  }

  // Bloqueio imediato e estrito contra Path Traversal (bruto e decodificado)
  const decodedSegments: string[] = [];
  for (const seg of pathSegments) {
    if (
      !seg ||
      seg.includes("..") ||
      seg.includes("\0") ||
      seg.startsWith("/") ||
      seg.includes("\\")
    ) {
      return NextResponse.json({ ok: false, error: "ACESSO_NEGADO" }, { status: 403 });
    }
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return NextResponse.json({ ok: false, error: "CAMINHO_INVALIDO" }, { status: 400 });
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("..") ||
      decoded.includes("\0") ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      return NextResponse.json({ ok: false, error: "ACESSO_NEGADO" }, { status: 403 });
    }
    decodedSegments.push(decoded);
  }

  const cleanPath = pathSegments.join("/").replace(/^\/+/, "");
  const decodedCleanPath = decodedSegments.join("/").replace(/^\/+/, "");
  const fileName = pathSegments[pathSegments.length - 1];
  const decodedFileName = decodedSegments[decodedSegments.length - 1];

  // Resolução multi-tenant do usuário autenticado
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = new URL(request.url).searchParams.get("tenantId") || undefined;
  const preferredTenant = headerTenant || cookieTenant || user.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(
    user.id,
    preferredTenant,
    user.activeTenantId,
  );
  const isSuperAdmin = user.role === "SUPERADMIN" || user.isSuperAdmin === true;

  // Verificação estrita de ownership multi-tenant antes de ler arquivo
  const candidateUrls = Array.from(
    new Set([
      `/${cleanPath}`,
      `/${decodedCleanPath}`,
      `/uploads/${cleanPath}`,
      `/uploads/${decodedCleanPath}`,
      `/uploads/documentos/${fileName}`,
      `/uploads/documentos/${decodedFileName}`,
      `/uploads/editais/${fileName}`,
      `/uploads/editais/${decodedFileName}`,
      `/data/uploads/${cleanPath}`,
      `/data/uploads/${decodedCleanPath}`,
    ]),
  );

  let docRecord: { id?: string; tenantId?: string | null } | null = await (prisma as any).documento
    .findFirst({
      where: { arquivoUrl: { in: candidateUrls } },
      select: { id: true, tenantId: true },
    })
    .catch(() => null);

  if (!docRecord) {
    const urlSet = new Set(candidateUrls);
    docRecord = listInMemoryDocumentos().find((d) => d?.arquivoUrl && urlSet.has(d.arquivoUrl)) || null;
  }

  if (docRecord && !isSuperAdmin) {
    if (docRecord.tenantId && docRecord.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "ACESSO_NEGADO" }, { status: 403 });
    }
  }

  let arquivoRecord: { id?: string; tenantId?: string | null } | null = await (prisma as any).arquivo
    .findFirst({
      where: { caminho: { in: candidateUrls } },
      select: { id: true, tenantId: true },
    })
    .catch(() => null);

  if (!arquivoRecord) {
    arquivoRecord = findInMemoryLicitacaoArquivoByCaminho(candidateUrls);
  }

  if (arquivoRecord && !isSuperAdmin) {
    if (arquivoRecord.tenantId && arquivoRecord.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "ACESSO_NEGADO" }, { status: 403 });
    }
  }

  // Namespace /uploads/documentos/ exige vínculo explícito com o tenant ativo (fail-closed)
  if (
    (cleanPath.startsWith("documentos/") || decodedCleanPath.startsWith("documentos/")) &&
    !isSuperAdmin
  ) {
    if (!docRecord || !tenantId || docRecord.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: "ACESSO_NEGADO" }, { status: 403 });
    }
  }

  const allowedRoots = [
    "/data/uploads",
    join(process.cwd(), "public", "uploads"),
    join(process.cwd(), "uploads"),
  ];

  // Busca nos diretórios de persistência (/data/uploads, public/uploads e uploads) com contenção canonical
  const candidateEntries: Array<{ root: string; filePath: string }> = [
    { root: allowedRoots[0], filePath: join(allowedRoots[0], cleanPath) },
    { root: allowedRoots[0], filePath: join(allowedRoots[0], decodedCleanPath) },
    { root: allowedRoots[1], filePath: join(allowedRoots[1], cleanPath) },
    { root: allowedRoots[1], filePath: join(allowedRoots[1], decodedCleanPath) },
    { root: allowedRoots[2], filePath: join(allowedRoots[2], cleanPath) },
    { root: allowedRoots[2], filePath: join(allowedRoots[2], decodedCleanPath) },
    {
      root: allowedRoots[0],
      filePath: join(allowedRoots[0], "editais", cleanPath.replace(/^editais\/?/, "")),
    },
    {
      root: allowedRoots[0],
      filePath: join(allowedRoots[0], "documentos", cleanPath.replace(/^documentos\/?/, "")),
    },
    {
      root: allowedRoots[1],
      filePath: join(allowedRoots[1], "editais", cleanPath.replace(/^editais\/?/, "")),
    },
    {
      root: allowedRoots[1],
      filePath: join(allowedRoots[1], "documentos", cleanPath.replace(/^documentos\/?/, "")),
    },
  ];

  for (const entry of candidateEntries) {
    if (!isPathInsideRoot(entry.filePath, entry.root)) {
      continue;
    }
    if (existsSync(entry.filePath)) {
      try {
        const buffer = await readFile(entry.filePath);
        return buildSafeFileResponse(buffer, decodedFileName);
      } catch (err) {
        console.error(`[UploadsHandler] Erro ao ler arquivo ${entry.filePath}:`, err);
      }
    }
  }

  // Fallback seguro: busca na pasta pai apenas dentro das raízes autorizadas
  const parentSubpath = decodedSegments.slice(0, -1).join("/");
  const candidateFolders: Array<{ root: string; folder: string }> = [
    { root: allowedRoots[0], folder: join(allowedRoots[0], parentSubpath) },
    { root: allowedRoots[1], folder: join(allowedRoots[1], parentSubpath) },
    {
      root: allowedRoots[0],
      folder: join(allowedRoots[0], "editais", parentSubpath.replace(/^editais\/?/, "")),
    },
    {
      root: allowedRoots[1],
      folder: join(allowedRoots[1], "editais", parentSubpath.replace(/^editais\/?/, "")),
    },
  ];

  for (const { root, folder } of candidateFolders) {
    if (!isPathInsideRoot(folder, root)) {
      continue;
    }
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
          if (!isPathInsideRoot(matchedPath, root)) {
            continue;
          }
          const buffer = await readFile(matchedPath);
          return buildSafeFileResponse(buffer, matched);
        }
      } catch {
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
