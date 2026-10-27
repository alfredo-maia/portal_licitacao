import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/server/auth";
import {
  criarDocumento,
  listarDocumentos,
} from "@/server/services/documentos.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoria = searchParams.get("categoria") || undefined;
  const status = searchParams.get("status") || undefined;
  const busca = searchParams.get("busca") || undefined;
  const apenasVencendo = searchParams.get("apenasVencendoEmDias");
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  try {
    const data = await listarDocumentos({
      categoria: categoria as any,
      status: status as any,
      busca,
      apenasVencendoEmDias: apenasVencendo ? parseInt(apenasVencendo, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      let arquivoUrl: string | undefined;
      let arquivoNome: string | undefined;
      let arquivoTamanho: number | undefined;
      let mimeType: string | undefined;

      if (file && typeof file.arrayBuffer === "function") {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        // 1. Salvar no volume persistente (/data/uploads)
        try {
          const dataDir = join("/data/uploads", "documentos");
          await mkdir(dataDir, { recursive: true });
          await writeFile(join(dataDir, safeName), buffer);
        } catch {
          // ambiente sem /data/uploads
        }

        // 2. Salvar no diretório public
        const publicDir = join(process.cwd(), "public", "uploads", "documentos");
        await mkdir(publicDir, { recursive: true });
        await writeFile(join(publicDir, safeName), buffer);

        arquivoUrl = `/uploads/documentos/${safeName}`;
        arquivoNome = file.name;
        arquivoTamanho = file.size;
        mimeType = file.type || "application/pdf";
      }

      const semValidade = formData.get("semValidade") === "true";
      const dataEmissaoRaw = formData.get("dataEmissao") as string | null;
      const dataVencimentoRaw = formData.get("dataVencimento") as string | null;

      const payload = {
        nome: (formData.get("nome") as string) || "",
        categoria: formData.get("categoria") as any,
        tipo: (formData.get("tipo") as string) || null,
        orgaoEmissor: (formData.get("orgaoEmissor") as string) || null,
        semValidade,
        dataEmissao: dataEmissaoRaw ? new Date(dataEmissaoRaw) : null,
        dataVencimento: semValidade || !dataVencimentoRaw ? null : new Date(dataVencimentoRaw),
        arquivoUrl: arquivoUrl || (formData.get("arquivoUrl") as string) || null,
        arquivoNome: arquivoNome || (formData.get("arquivoNome") as string) || null,
        arquivoTamanho,
        mimeType,
      };

      const doc = await criarDocumento(payload, user.id);
      return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
    }

    // Fluxo JSON padrão
    const body = await request.json();
    const doc = await criarDocumento(body, user.id);
    return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: error?.message },
      { status: 400 },
    );
  }
}
