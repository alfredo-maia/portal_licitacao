import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  validarArquivoUploadSchema,
} from "@/server/schemas/storage-r2.schema";
import {
  adicionarArquivoEdital,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import { fazerUploadStreamingR2 } from "@/server/storage/r2-storage.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Upload de anexo de edital com Princípio Zero-PDF (Sprint SaaS 3 / PRD §10).
 * Faz streaming direto da memória para o Cloudflare R2, sem persistência no disco da VPS.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);
  const user = session?.user as RbacUser | undefined;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_FORM_DATA" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ ok: false, error: "ARQUIVO_OBRIGATORIO" }, { status: 400 });
  }

  // 1. Validação estrita de segurança e tamanho (máx 20 MB, apenas PDF e imagens)
  try {
    validarArquivoUploadSchema.parse({
      nome: file.name,
      tamanho: file.size,
      mimeType: file.type || "application/pdf",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "ARQUIVO_INVALIDO",
        mensagem: err?.issues?.[0]?.message || "Arquivo inválido ou excede o limite de 20 MB",
      },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `editais/${id}/${Date.now()}_${safeName}`;

    // 2. Princípio Zero-PDF: Streaming direto para Cloudflare R2 sem gravação em disco local
    const uploadResult = await fazerUploadStreamingR2({
      chave: r2Key,
      buffer,
      mimeType: file.type || "application/pdf",
      tamanho: file.size,
      metadata: {
        licitacaoId: id,
        nomeOriginal: file.name,
      },
    });

    const criado = await adicionarArquivoEdital(
      id,
      {
        nome: file.name,
        tamanho: file.size,
        mimeType: file.type || "application/pdf",
        caminho: uploadResult.url,
        r2Key: uploadResult.chave,
        r2Url: uploadResult.url,
        cachedAt: new Date(),
      },
      user,
      {
        ip: request.headers.get("x-forwarded-for"),
        usuarioId: user?.id,
        usuarioNome: user?.name,
      },
    );

    return NextResponse.json({ ok: true, arquivo: criado }, { status: 201 });
  } catch (error) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
