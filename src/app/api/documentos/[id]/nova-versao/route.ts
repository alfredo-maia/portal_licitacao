import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/server/auth";
import { criarNovaVersao } from "@/server/services/documentos.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;
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
        const safeName = `${Date.now()}_v_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        try {
          const dataDir = join("/data/uploads", "documentos");
          await mkdir(dataDir, { recursive: true });
          await writeFile(join(dataDir, safeName), buffer);
        } catch {
          // ambiente sem /data/uploads
        }

        const publicDir = join(process.cwd(), "public", "uploads", "documentos");
        await mkdir(publicDir, { recursive: true });
        await writeFile(join(publicDir, safeName), buffer);

        arquivoUrl = `/uploads/documentos/${safeName}`;
        arquivoNome = file.name;
        arquivoTamanho = file.size;
        mimeType = file.type || "application/pdf";
      }

      const dataEmissaoRaw = formData.get("dataEmissao") as string | null;
      const dataVencimentoRaw = formData.get("dataVencimento") as string | null;

      const payload = {
        dataEmissao: dataEmissaoRaw ? new Date(dataEmissaoRaw) : undefined,
        dataVencimento: dataVencimentoRaw ? new Date(dataVencimentoRaw) : undefined,
        arquivoUrl: arquivoUrl || (formData.get("arquivoUrl") as string) || undefined,
        arquivoNome: arquivoNome || (formData.get("arquivoNome") as string) || undefined,
        arquivoTamanho,
        mimeType,
      };

      const doc = await criarNovaVersao(id, payload, user.id);
      if (!doc) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
    }

    const body = await request.json();
    const doc = await criarNovaVersao(id, body, user.id);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: error?.message },
      { status: 400 },
    );
  }
}
