import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/server/auth";
import { parseDataCivil } from "@/lib/date-utils";
import { runWithAuditActorContext } from "@/server/audit";
import { documentoNovaVersaoInputSchema } from "@/server/schemas/documento.schema";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { getInMemoryConfiguracaoEmpresa } from "@/server/services/licitacoes-store";
import { inspecionarArquivoDocumentoCofre } from "@/server/services/inspecao-documento-cofre.service";
import {
  atualizarDocumento,
  criarNovaVersao,
  obterDocumento,
} from "@/server/services/documentos.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SessionUserWithTenant {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  activeTenantId?: string | null;
}

export async function POST(request: Request, { params }: RouteParams) {
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
      const { id } = await params;
      const docAtual = await obterDocumento(id, tenantId);
      if (!docAtual?.documento) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
      }

      try {
        const contentType = request.headers.get("content-type") || "";
        const isDraftSemAnexo =
          !docAtual.documento.possuiAnexo && !docAtual.documento.arquivoUrl;

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
            const safeName = `${Date.now()}_v_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

            try {
              const dataDir = join("/data/uploads", "documentos");
              await mkdir(dataDir, { recursive: true });
              await writeFile(join(dataDir, safeName), buffer);
            } catch {
              // ambiente sem /data/uploads
            }

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

          const dataEmissaoRaw = formData.get("dataEmissao") as string | null;
          const dataVencimentoRaw = formData.get("dataVencimento") as string | null;
          const dataVencimentoParsed = dataVencimentoRaw
            ? parseDataCivil(dataVencimentoRaw) ?? undefined
            : undefined;

          let inspecao: Awaited<ReturnType<typeof inspecionarArquivoDocumentoCofre>> | null =
            null;
          if (uploadedBuffer) {
            try {
              const emp = await obterConfiguracaoEmpresa(tenantId).catch(() =>
                getInMemoryConfiguracaoEmpresa(tenantId),
              );
              inspecao = await inspecionarArquivoDocumentoCofre({
                buffer: uploadedBuffer,
                nomeArquivo: arquivoNome || docAtual.documento.arquivoNome,
                mimeType,
                nomeInformado: docAtual.documento.nome,
                dataVencimentoInformada:
                  dataVencimentoParsed ?? docAtual.documento.dataVencimento ?? null,
                semValidade: docAtual.documento.semValidade ?? false,
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
            dataEmissao: dataEmissaoRaw ? (parseDataCivil(dataEmissaoRaw) ?? undefined) : undefined,
            dataVencimento: dataVencimentoParsed,
            arquivoUrl: arquivoUrl || (formData.get("arquivoUrl") as string) || undefined,
            arquivoNome: arquivoNome || (formData.get("arquivoNome") as string) || undefined,
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

          // Primeiro anexo de um rascunho sem arquivo anexa in-place na v1 (200);
          // substituição de documento já existente cria nova versão vN+1 (201) arquivando a anterior como SUBSTITUIDO.
          if (isDraftSemAnexo && (payload.arquivoUrl || payload.arquivoNome)) {
            const doc = await atualizarDocumento(id, payload, userId, tenantId);
            if (!doc) {
              return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
            }
            return NextResponse.json({ ok: true, documento: doc }, { status: 200 });
          }

          const novaVersao = await criarNovaVersao(id, payload, userId, tenantId);
          if (!novaVersao) {
            return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
          }
          return NextResponse.json({ ok: true, documento: novaVersao }, { status: 201 });
        }

        const body = documentoNovaVersaoInputSchema.parse(await request.json());
        const novaVersao = await criarNovaVersao(id, body, userId, tenantId);
        if (!novaVersao) {
          return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
        }
        return NextResponse.json({ ok: true, documento: novaVersao }, { status: 201 });
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
