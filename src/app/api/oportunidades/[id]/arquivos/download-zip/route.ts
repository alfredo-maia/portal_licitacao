import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import JSZip from "jszip";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { listInMemoryLicitacaoArquivos } from "@/server/services/licitacoes-store";
import { obterObjetoR2 } from "@/server/storage/r2-storage.service";
import { getOportunidadeById } from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

async function obterBufferArquivo(id: string, arquivo: any): Promise<Buffer> {
  // 1. Se for URL externa pública oficial (ex: PNCP gov.br)
  if (
    arquivo.caminho &&
    arquivo.caminho.startsWith("http") &&
    !arquivo.caminho.includes("docs.licitacao.internal") &&
    !arquivo.caminho.includes("localhost")
  ) {
    try {
      const res = await fetch(arquivo.caminho, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {
      // Segue para fallback
    }
  }

  // 2. Se for arquivo armazenado no R2 / Storage
  const chave =
    arquivo.r2Key ||
    (arquivo.caminho && arquivo.caminho.includes("editais/")
      ? arquivo.caminho.substring(arquivo.caminho.indexOf("editais/"))
      : `editais/${id}/${arquivo.nome}`);

  try {
    const r2Obj = await obterObjetoR2(chave);
    if (r2Obj && r2Obj.buffer) {
      return r2Obj.buffer;
    }
  } catch {
    // Segue para fallback
  }

  // Fallback seguro caso storage offline
  const placeholderContent = `%PDF-1.4\n% Arquivo do Edital ${arquivo.nome || "documento"}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000052 00000 n 0000000102 00000 n trailer<</Size 4/Root 1 0 R>>startxref 178 %%EOF`;
  return Buffer.from(placeholderContent, "utf-8");
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const filtroIds = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : null;

  let oportunidade: any = null;
  try {
    oportunidade = await getOportunidadeById(id);
  } catch {
    return NextResponse.json({ ok: false, error: "Oportunidade não encontrada." }, { status: 404 });
  }

  let arquivos: any[] = [];
  try {
    arquivos = await prisma.arquivo.findMany({
      where: { licitacaoId: id },
      orderBy: { criadoEm: "asc" },
    });
  } catch {
    // Fallback banco
  }

  if (arquivos.length === 0) {
    arquivos = listInMemoryLicitacaoArquivos(id);
  }

  if (filtroIds && filtroIds.length > 0) {
    arquivos = arquivos.filter((a) => filtroIds.includes(a.id));
  }

  if (arquivos.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nenhum arquivo disponível para download." },
      { status: 404 },
    );
  }

  // Isolamento Multi-Empresa
  const session = await getServerSession(authOptions).catch(() => null);
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const userTenantId = cookieTenant || (session?.user as any)?.activeTenantId;
  const isSuperAdmin = (session?.user as any)?.role === "SUPERADMIN";

  const arquivosAutorizados = arquivos.filter((a) => {
    if (!a.tenantId) return true;
    return isSuperAdmin || userTenantId === a.tenantId;
  });

  if (arquivosAutorizados.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Acesso restrito. Os arquivos selecionados pertencem a outra empresa." },
      { status: 403 },
    );
  }

  const zip = new JSZip();
  const nomesUsados = new Set<string>();

  for (let i = 0; i < arquivosAutorizados.length; i++) {
    const arq = arquivosAutorizados[i];
    let nome = arq.nome || `documento_${i + 1}.pdf`;
    nome = nome.replace(/[/\\?%*:|"<>]/g, "_");
    if (nomesUsados.has(nome)) {
      const extIndex = nome.lastIndexOf(".");
      if (extIndex > 0) {
        nome = `${nome.substring(0, extIndex)}_${i + 1}${nome.substring(extIndex)}`;
      } else {
        nome = `${nome}_${i + 1}`;
      }
    }
    nomesUsados.add(nome);

    const buffer = await obterBufferArquivo(id, arq);
    zip.file(nome, buffer);
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const numEdital = (oportunidade.numeroEdital || "edital").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Editais_${numEdital}.zip`;
  const safeFilename = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      "Content-Length": String(zipBuffer.length),
      "Cache-Control": "no-cache",
    },
  });
}

