import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  adicionarArquivoEdital,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uploadDir = join(process.cwd(), "public", "uploads", "editais", id);
    await mkdir(uploadDir, { recursive: true });

    const filePath = join(uploadDir, safeName);
    await writeFile(filePath, buffer);

    const publicPath = `/uploads/editais/${id}/${safeName}`;

    const criado = await adicionarArquivoEdital(
      id,
      {
        nome: file.name,
        tamanho: file.size,
        mimeType: file.type || "application/octet-stream",
        caminho: publicPath,
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
