import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/server/auth";
import { parseDataCivil } from "@/lib/date-utils";
import { runWithAuditActorContext } from "@/server/audit";
import {
  documentoCategoriaSchema,
  documentoCriarInputSchema,
  documentoStatusSchema,
} from "@/server/schemas/documento.schema";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { getInMemoryConfiguracaoEmpresa } from "@/server/services/licitacoes-store";
import { inspecionarArquivoDocumentoCofre } from "@/server/services/inspecao-documento-cofre.service";
import {
  criarDocumento,
  listarDocumentos,
} from "@/server/services/documentos.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface SessionUserWithTenant {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  activeTenantId?: string | null;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUserWithTenant | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = user.activeTenantId ?? null;
  const tenantId = await resolveUserActiveTenantId(user.id, cookieTenant, sessionTenant);

  const { searchParams } = new URL(request.url);
  const categoriaRaw = searchParams.get("categoria");
  const statusRaw = searchParams.get("status");
  const busca = searchParams.get("busca") || undefined;
  const apenasVencendo = searchParams.get("apenasVencendoEmDias");
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  try {
    const categoria = categoriaRaw
      ? documentoCategoriaSchema.parse(categoriaRaw)
      : undefined;
    const status = statusRaw ? documentoStatusSchema.parse(statusRaw) : undefined;

    const data = await listarDocumentos({
      tenantId: tenantId || undefined,
      categoria,
      status,
      busca,
      apenasVencendoEmDias: apenasVencendo ? parseInt(apenasVencendo, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Consulta inválida";
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUserWithTenant | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const userId = user.id;
  const userName = user.name ?? user.email ?? null;

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = user.activeTenantId ?? null;
  const tenantId = await resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);

  return runWithAuditActorContext(
    {
      usuarioId: userId,
      usuarioNome: userName,
      tenantId,
      ip: request.headers?.get?.("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file") as File | null;

          let arquivoUrl: string | undefined;
          let arquivoNome: string | undefined;
          let arquivoTamanho: number | undefined;
          let mimeType: string | undefined;
          let uploadedBuffer: Buffer | null = null;

          if (file && typeof file.arrayBuffer === "function") {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);
            uploadedBuffer = buffer;
            const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

            // 1. Salvar no volume persistente (/data/uploads)
            try {
              const dataDir = join("/data/uploads", "documentos");
              await mkdir(dataDir, { recursive: true });
              await writeFile(join(dataDir, safeName), buffer);
            } catch {
              // ambiente sem /data/uploads
            }

            // 2. Salvar no diretório public (fallback seguro se somente-leitura)
            try {
              const publicDir = join(process.cwd(), "public", "uploads", "documentos");
              await mkdir(publicDir, { recursive: true });
              await writeFile(join(publicDir, safeName), buffer);
            } catch {
              // ambiente sem permissão de escrita em public/
            }

            arquivoUrl = `/uploads/documentos/${safeName}`;
            arquivoNome = file.name;
            arquivoTamanho = file.size;
            mimeType = file.type || "application/pdf";
          }

          const semValidade = formData.get("semValidade") === "true";
          const dataEmissaoRaw = formData.get("dataEmissao") as string | null;
          const dataVencimentoRaw = formData.get("dataVencimento") as string | null;
          const dataVencimentoParsed =
            semValidade || !dataVencimentoRaw ? null : parseDataCivil(dataVencimentoRaw);
          const nomeDoc = (formData.get("nome") as string) || "";
          const categoria = documentoCategoriaSchema.parse(formData.get("categoria"));

          let inspecao: Awaited<ReturnType<typeof inspecionarArquivoDocumentoCofre>> | null =
            null;
          if (uploadedBuffer) {
            try {
              const emp = await obterConfiguracaoEmpresa(tenantId).catch(() =>
                getInMemoryConfiguracaoEmpresa(tenantId),
              );
              inspecao = await inspecionarArquivoDocumentoCofre({
                buffer: uploadedBuffer,
                nomeArquivo: arquivoNome || file?.name,
                mimeType: mimeType || file?.type,
                nomeInformado: nomeDoc,
                dataVencimentoInformada: dataVencimentoParsed,
                semValidade,
                tenantCnpj: emp?.cnpj,
                telemetryContext: {
                  tenantId: tenantId ?? null,
                  userId,
                  usuarioNome: userName,
                  empresaNome: emp?.razaoSocial ?? null,
                },
              });
            } catch {
              inspecao = null;
            }
          }

          const payload = {
            nome: nomeDoc,
            categoria,
            tipo: (formData.get("tipo") as string) || null,
            orgaoEmissor: (formData.get("orgaoEmissor") as string) || null,
            semValidade,
            dataEmissao: parseDataCivil(dataEmissaoRaw),
            dataVencimento: dataVencimentoParsed,
            arquivoUrl: arquivoUrl || (formData.get("arquivoUrl") as string) || null,
            arquivoNome: arquivoNome || (formData.get("arquivoNome") as string) || null,
            arquivoTamanho,
            mimeType,
            ...(inspecao
              ? {
                  validacaoStatus: inspecao.validacaoStatus,
                  validacaoResumo: inspecao.validacaoResumo,
                  cnpjExtraido: inspecao.cnpjExtraido,
                  emissaoExtraida: inspecao.emissaoExtraida,
                  vencimentoExtraido: inspecao.vencimentoExtraido,
                  tipoDetectado: inspecao.tipoDetectado,
                  validadoEm: inspecao.validadoEm,
                }
              : {}),
          };

          const doc = await criarDocumento(payload, userId, tenantId);
          return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
        }

        // Fluxo JSON padrão
        const body = documentoCriarInputSchema.parse(await request.json());
        const doc = await criarDocumento(body, userId, tenantId);
        return NextResponse.json({ ok: true, documento: doc }, { status: 201 });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erro de validação";
        return NextResponse.json(
          { ok: false, error: "VALIDATION_ERROR", message },
          { status: 400 },
        );
      }
    },
  );
}
