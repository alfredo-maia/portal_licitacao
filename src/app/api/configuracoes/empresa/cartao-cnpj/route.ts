import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/server/auth";
import { can, type RbacUser } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import { importarCartaoCnpjModoSchema } from "@/server/schemas/cartao-cnpj.schema";
import {
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from "@/server/services/configuracoes.service";
import {
  criarDocumento,
  criarNovaVersao,
  listarDocumentos,
} from "@/server/services/documentos.service";
import { extrairDadosCartaoCnpjDeBuffer } from "@/server/services/extrator-cartao-cnpj.service";
import { detectarTipoRealPorBuffer } from "@/server/services/leitor-documentos-certame.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

const MAX_BYTES_CARTAO = 14 * 1024 * 1024;
const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const user = session?.user as (RbacUser & { id?: string; activeTenantId?: string }) | undefined;
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!can(user, "update", "configuracoes")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para importar dados da empresa." },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { ok: false, error: "Selecione o arquivo PDF ou imagem do Cartão CNPJ." },
        { status: 400 },
      );
    }

    const modoParsed = importarCartaoCnpjModoSchema.safeParse(
      (formData.get("modo") as string) || undefined,
    );
    const modo = modoParsed.success ? modoParsed.data : "atualizar_ativo";

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const queryTenant = new URL(req.url).searchParams.get("tenantId");
    const formTenant = (formData.get("tenantId") as string | null) || null;
    const requestedTenant = queryTenant || formTenant || cookieTenant;
    const tenantId = await resolveUserActiveTenantId(
      user.id,
      requestedTenant,
      user.activeTenantId,
    );

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.length === 0 || buffer.length > MAX_BYTES_CARTAO) {
      return NextResponse.json(
        {
          ok: false,
          error: "O arquivo do Cartão CNPJ deve ter entre 1 byte e 14 MB.",
        },
        { status: 400 },
      );
    }

    const mimeReal = detectarTipoRealPorBuffer(buffer, file.name, file.type);
    if (!MIME_PERMITIDOS.has(mimeReal)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Formato não suportado. Envie PDF, PNG, JPG/JPEG ou WEBP do Cartão CNPJ.",
        },
        { status: 400 },
      );
    }

    let extraido;
    try {
      extraido = await extrairDadosCartaoCnpjDeBuffer({
        buffer,
        nomeArquivo: file.name,
        mimeType: mimeReal,
      });
    } catch (errExt: any) {
      return NextResponse.json(
        {
          ok: false,
          error:
            errExt?.message ||
            "Não foi possível extrair os dados do Cartão CNPJ enviado.",
        },
        { status: 422 },
      );
    }

    if (modo === "extracao_preview") {
      return NextResponse.json({
        ok: true,
        extraido,
        activeTenantId: tenantId,
      });
    }

    const atual = await obterConfiguracaoEmpresa(tenantId);
    const dadosMesclados = {
      razaoSocial: extraido.razaoSocial || atual.razaoSocial,
      nomeFantasia: extraido.nomeFantasia ?? atual.nomeFantasia ?? "",
      cnpj: extraido.cnpj || atual.cnpj,
      inscricaoEstadual: atual.inscricaoEstadual ?? "",
      inscricaoMunicipal: atual.inscricaoMunicipal ?? "",
      cnae: extraido.cnaePrincipal || atual.cnae || "",
      cnaesSecundarios:
        extraido.cnaesSecundarios.length > 0
          ? extraido.cnaesSecundarios
          : atual.cnaesSecundarios || [],
      cep: extraido.cep ?? atual.cep ?? "",
      endereco: extraido.endereco ?? atual.endereco ?? "",
      numero: extraido.numero ?? atual.numero ?? "",
      complemento: extraido.complemento ?? atual.complemento ?? "",
      bairro: extraido.bairro ?? atual.bairro ?? "",
      cidade: extraido.cidade ?? atual.cidade ?? "",
      uf: extraido.uf ?? atual.uf ?? "",
      representanteNome: atual.representanteNome ?? "",
      representanteCpf: atual.representanteCpf ?? "",
      representanteRg: atual.representanteRg ?? "",
      representanteCargo: atual.representanteCargo ?? "Sócio-Administrador",
      bancoNome: atual.bancoNome ?? "",
      agencia: atual.agencia ?? "",
      contaCorrente: atual.contaCorrente ?? "",
      chavePix: atual.chavePix ?? "",
      logoUrl: atual.logoUrl ?? null,
      papelTimbradoUrl: atual.papelTimbradoUrl ?? null,
    };

    const empresa = await atualizarConfiguracaoEmpresa(
      dadosMesclados,
      user.id,
      tenantId,
      { preservarPreferencias: true },
    );

    const safeFileName = `${Date.now()}_cartao_cnpj_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      const dataDir = join("/data/uploads", "documentos");
      await mkdir(dataDir, { recursive: true });
      await writeFile(join(dataDir, safeFileName), buffer);
    } catch {}

    try {
      const publicDir = join(process.cwd(), "public", "uploads", "documentos");
      await mkdir(publicDir, { recursive: true });
      await writeFile(join(publicDir, safeFileName), buffer);
    } catch {}

    const arquivoUrl = `/uploads/documentos/${safeFileName}`;
    const agora = new Date();
    const resumoValidacao = `Cartão CNPJ validado automaticamente (${extraido.origemExtracao}) para CNPJ ${extraido.cnpj}.`;

    const existentes = await listarDocumentos({
      tenantId: tenantId || undefined,
      categoria: "JURIDICA",
      status: "ATIVO",
      pageSize: 100,
    });
    const cartaoExistente = existentes.documentos.find((d) =>
      /cart[ãa]o\s*cnpj/i.test(`${d.tipo || ""} ${d.nome || ""}`),
    );

    const documentoCartaoCnpj = cartaoExistente
      ? await criarNovaVersao(
          cartaoExistente.id,
          {
            semValidade: true,
            dataEmissao: agora,
            dataVencimento: null,
            arquivoUrl,
            arquivoNome: file.name,
            arquivoTamanho: buffer.length,
            mimeType: mimeReal,
            validacaoStatus: "VALIDADO",
            validacaoResumo: resumoValidacao,
            cnpjExtraido: extraido.cnpj,
            tipoDetectado: "Cartão CNPJ",
            validadoEm: agora,
          },
          user.id,
        )
      : await criarDocumento(
          {
            nome: "Cartão CNPJ (Comprovante de Inscrição e Situação Cadastral)",
            categoria: "JURIDICA",
            tipo: "Cartão CNPJ",
            orgaoEmissor: "Receita Federal do Brasil",
            semValidade: true,
            dataEmissao: agora,
            dataVencimento: null,
            arquivoUrl,
            arquivoNome: file.name,
            arquivoTamanho: buffer.length,
            mimeType: mimeReal,
            validacaoStatus: "VALIDADO",
            validacaoResumo: resumoValidacao,
            cnpjExtraido: extraido.cnpj,
            tipoDetectado: "Cartão CNPJ",
            validadoEm: agora,
          },
          user.id,
          tenantId,
        );

    await recordAuditLog({
      acao: "CARTAO_CNPJ_IMPORTADO",
      entidadeTipo: "CONFIGURACAO_EMPRESA",
      entidadeId: empresa.id,
      tenantId: tenantId ?? null,
      usuarioId: user.id,
      depois: {
        cnpj: empresa.cnpj,
        razaoSocial: empresa.razaoSocial,
        qtdCnaesSecundarios: empresa.cnaesSecundarios?.length ?? 0,
        documentoId: documentoCartaoCnpj?.id ?? null,
        origemExtracao: extraido.origemExtracao,
      },
    });

    return NextResponse.json({
      ok: true,
      extraido,
      empresa,
      documentoCartaoCnpj,
      activeTenantId: tenantId,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao processar Cartão CNPJ.",
      },
      { status: error?.statusCode || 500 },
    );
  }
}
