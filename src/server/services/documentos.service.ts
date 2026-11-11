import type { Documento, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import { extrairDiaCivil } from "@/lib/date-utils";
import {
  type DocumentoCriarInput,
  type DocumentoAtualizarInput,
  type DocumentoNovaVersaoInput,
  type DocumentoItem,
  type DocumentoListQuery,
  type DocumentoListResponse,
  type DocumentoDetalheResponse,
  documentoCategoriaSchema,
  documentoStatusSchema,
  documentoValidacaoStatusSchema,
  documentoCriarInputSchema,
  documentoAtualizarInputSchema,
  documentoNovaVersaoInputSchema,
  documentoListQuerySchema,
} from "@/server/schemas/documento.schema";
import {
  deleteInMemoryDocumento,
  getInMemoryConfiguracaoEmpresa,
  getInMemoryDocumento,
  insertInMemoryDocumento,
  listInMemoryDocumentos,
  updateInMemoryDocumento,
} from "./licitacoes-store";
import { verificarDisparoImediatoVencimentoDocumento } from "./notificacoes.service";
import { obterConfiguracaoEmpresa } from "./configuracoes.service";
import {
  carregarBufferDocumentoCofre,
  inspecionarArquivoDocumentoCofre,
} from "./inspecao-documento-cofre.service";
import type { LlmTelemetryContext } from "./llm-multimodal.service";

type DocumentoSourceRecord = Omit<
  Partial<Documento>,
  | "categoria"
  | "status"
  | "validacaoStatus"
  | "dataEmissao"
  | "dataVencimento"
  | "validadoEm"
  | "criadoEm"
  | "atualizadoEm"
> & {
  id: string;
  nome: string;
  categoria: string;
  status: string;
  validacaoStatus?: string | null;
  dataEmissao?: Date | string | null;
  dataVencimento?: Date | string | null;
  validadoEm?: Date | string | null;
  criadoEm: Date | string;
  atualizadoEm: Date | string;
  tenantId?: string | null;
};

export function calcularStatusValidade(
  dataVencimento: Date | null,
  semValidade: boolean,
) {
  if (semValidade || !dataVencimento) {
    return {
      vencido: false,
      diasParaVencer: null,
      alertaVencimento: false,
    };
  }

  const agora = new Date();
  const diffMs = dataVencimento.getTime() - agora.getTime();
  const diasParaVencer = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const vencido = diasParaVencer < 0;
  const alertaVencimento = vencido || diasParaVencer <= 30;

  return {
    vencido,
    diasParaVencer,
    alertaVencimento,
  };
}

function mapToDocumentoItem(doc: DocumentoSourceRecord): DocumentoItem {
  const dataVenc = doc.dataVencimento ? new Date(doc.dataVencimento) : null;
  const statusVal = calcularStatusValidade(dataVenc, Boolean(doc.semValidade));
  const possuiAnexo = Boolean(doc.arquivoUrl && String(doc.arquivoUrl).trim());
  const rawValidacaoStatus = possuiAnexo
    ? (doc.validacaoStatus && doc.validacaoStatus !== "PENDENTE_ANEXO"
        ? doc.validacaoStatus
        : "NAO_VERIFICADO")
    : "PENDENTE_ANEXO";
  const parsedCategoria = documentoCategoriaSchema.safeParse(doc.categoria);
  const parsedStatus = documentoStatusSchema.safeParse(doc.status);
  const parsedValidacao = documentoValidacaoStatusSchema.safeParse(rawValidacaoStatus);

  return {
    id: doc.id,
    nome: doc.nome,
    categoria: parsedCategoria.success ? parsedCategoria.data : "OUTROS",
    tipo: doc.tipo ?? null,
    orgaoEmissor: doc.orgaoEmissor ?? null,
    semValidade: Boolean(doc.semValidade),
    dataEmissao: doc.dataEmissao ? new Date(doc.dataEmissao) : null,
    dataVencimento: dataVenc,
    arquivoUrl: doc.arquivoUrl ?? null,
    arquivoNome: doc.arquivoNome ?? null,
    arquivoTamanho: doc.arquivoTamanho ?? null,
    mimeType: doc.mimeType ?? null,
    versao: doc.versao || 1,
    documentoPaiId: doc.documentoPaiId ?? null,
    status: parsedStatus.success ? parsedStatus.data : "ATIVO",
    criadoPorId: doc.criadoPorId ?? null,
    criadoEm: new Date(doc.criadoEm),
    atualizadoEm: new Date(doc.atualizadoEm),
    ...statusVal,
    possuiAnexo,
    validacaoStatus: parsedValidacao.success ? parsedValidacao.data : "NAO_VERIFICADO",
    validacaoResumo: possuiAnexo
      ? (doc.validacaoResumo ?? null)
      : (doc.validacaoResumo || "Salvo apenas como rascunho/metadados sem arquivo anexado em /documentacao."),
    cnpjExtraido: doc.cnpjExtraido ?? null,
    emissaoExtraida: doc.emissaoExtraida ?? null,
    vencimentoExtraido: doc.vencimentoExtraido ?? null,
    tipoDetectado: doc.tipoDetectado ?? null,
    validadoEm: doc.validadoEm ? new Date(doc.validadoEm) : null,
  };
}

let colunasValidacaoGarantidas = false;
async function garantirColunasValidacaoDocumento(): Promise<void> {
  if (colunasValidacaoGarantidas || process.env.VITEST === "true") return;
  try {
    const ddl = [
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "validacaoStatus" TEXT DEFAULT 'NAO_VERIFICADO';`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "validacaoResumo" TEXT;`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "cnpjExtraido" TEXT;`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "emissaoExtraida" TEXT;`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "vencimentoExtraido" TEXT;`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "tipoDetectado" TEXT;`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "validadoEm" TIMESTAMP(3);`,
    ];
    for (const stmt of ddl) {
      await prisma.$executeRawUnsafe(stmt).catch(() => undefined);
    }
    colunasValidacaoGarantidas = true;
  } catch {
    // banco offline ou sem privilégio DDL
  }
}

function filterInMemoryDocs(query: DocumentoListQuery): DocumentoSourceRecord[] {
  let memoria = listInMemoryDocumentos() as DocumentoSourceRecord[];
  if (query.tenantId) {
    memoria = memoria.filter((d) => d.tenantId === query.tenantId);
  }
  if (query.categoria) {
    memoria = memoria.filter((d) => d.categoria === query.categoria);
  }
  if (query.status) {
    memoria = memoria.filter((d) => d.status === query.status);
  }
  if (query.busca) {
    const termo = query.busca.toLowerCase();
    memoria = memoria.filter(
      (d) =>
        d.nome.toLowerCase().includes(termo) ||
        (d.tipo && d.tipo.toLowerCase().includes(termo)) ||
        (d.orgaoEmissor && d.orgaoEmissor.toLowerCase().includes(termo)),
    );
  }
  if (query.apenasVencendoEmDias) {
    const limite = Date.now() + 1000 * 60 * 60 * 24 * query.apenasVencendoEmDias;
    memoria = memoria.filter(
      (d) =>
        !d.semValidade &&
        d.dataVencimento &&
        new Date(d.dataVencimento).getTime() <= limite,
    );
  }
  return memoria;
}

export async function listarDocumentos(
  rawQuery?: Partial<DocumentoListQuery>,
): Promise<DocumentoListResponse> {
  const query = documentoListQuerySchema.parse(rawQuery ?? {});
  const memoriaFiltrada = filterInMemoryDocs(query);
  await garantirColunasValidacaoDocumento();

  try {
    const where: Prisma.DocumentoWhereInput = {};
    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }
    if (query.categoria) {
      where.categoria = query.categoria;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.busca) {
      where.OR = [
        { nome: { contains: query.busca, mode: "insensitive" } },
        { tipo: { contains: query.busca, mode: "insensitive" } },
        { orgaoEmissor: { contains: query.busca, mode: "insensitive" } },
      ];
    }
    if (query.apenasVencendoEmDias) {
      const limite = new Date(Date.now() + 1000 * 60 * 60 * 24 * query.apenasVencendoEmDias);
      where.semValidade = false;
      where.dataVencimento = { lte: limite };
    }

    const [, docsDb] = await Promise.all([
      prisma.documento.count({ where }),
      prisma.documento.findMany({
        where,
        orderBy: [{ dataVencimento: "asc" }, { nome: "asc" }],
      }),
    ]);

    const mergedMap = new Map<string, DocumentoSourceRecord>();
    for (const d of docsDb) {
      mergedMap.set(d.id, d);
    }
    for (const m of memoriaFiltrada) {
      if (!mergedMap.has(m.id)) {
        mergedMap.set(m.id, m);
      }
    }

    const todos = Array.from(mergedMap.values()).map(mapToDocumentoItem);
    const total = todos.length;
    const vencidosOuVencendo = todos.filter((d) => d.alertaVencimento).length;
    const documentos = todos.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    return {
      ok: true,
      total,
      vencidosOuVencendo,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      documentos,
    };
  } catch {
    const total = memoriaFiltrada.length;
    const paginado = memoriaFiltrada.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    const documentos = paginado.map(mapToDocumentoItem);
    const vencidosOuVencendo = documentos.filter((d) => d.alertaVencimento).length;

    return {
      ok: true,
      total,
      vencidosOuVencendo,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      documentos,
    };
  }
}

export async function obterDocumento(
  id: string,
  tenantId?: string | null,
): Promise<DocumentoDetalheResponse | null> {
  const temAcessoTenant = (docTenantId: unknown): boolean => {
    if (!tenantId || !docTenantId) return true;
    return String(docTenantId) === String(tenantId);
  };

  try {
    const doc = await prisma.documento.findUnique({
      where: { id },
    });
    if (doc) {
      if (!temAcessoTenant(doc.tenantId)) {
        return null;
      }
      const raizId = doc.documentoPaiId || doc.id;
      const versoes = await prisma.documento.findMany({
        where: {
          OR: [{ id: raizId }, { documentoPaiId: raizId }],
          ...(tenantId ? { tenantId } : {}),
        },
        orderBy: { versao: "desc" },
      });

      return {
        ok: true,
        documento: mapToDocumentoItem(doc),
        historicoVersoes: versoes.map(mapToDocumentoItem),
      };
    }
  } catch {
    // fallback in-memory below
  }

  const doc = getInMemoryDocumento(id);
  if (!doc || !temAcessoTenant(doc.tenantId)) return null;
  const raizId = doc.documentoPaiId || doc.id;
  const historicoMem = listInMemoryDocumentos()
    .filter(
      (d) =>
        (d.id === raizId || d.documentoPaiId === raizId) &&
        temAcessoTenant(d.tenantId),
    )
    .sort((a, b) => (b.versao || 1) - (a.versao || 1));

  return {
    ok: true,
    documento: mapToDocumentoItem(doc),
    historicoVersoes: (historicoMem.length > 0 ? historicoMem : [doc]).map(
      mapToDocumentoItem,
    ),
  };
}

export async function criarDocumento(
  data: DocumentoCriarInput,
  usuarioId?: string,
  tenantId?: string | null,
): Promise<DocumentoItem> {
  const validado = documentoCriarInputSchema.parse(data);
  await garantirColunasValidacaoDocumento();

  const temAnexo = Boolean(validado.arquivoUrl && validado.arquivoUrl.trim());
  const statusValidacaoInicial = temAnexo
    ? validado.validacaoStatus || "NAO_VERIFICADO"
    : "PENDENTE_ANEXO";
  const resumoValidacaoInicial = temAnexo
    ? validado.validacaoResumo || null
    : validado.validacaoResumo ||
      "Salvo apenas como rascunho/metadados sem arquivo anexado em /documentacao.";

  const baseData = {
    nome: validado.nome,
    categoria: validado.categoria,
    tipo: validado.tipo || null,
    orgaoEmissor: validado.orgaoEmissor || null,
    semValidade: validado.semValidade,
    dataEmissao: validado.dataEmissao || null,
    dataVencimento: validado.dataVencimento || null,
    arquivoUrl: validado.arquivoUrl || null,
    arquivoNome: validado.arquivoNome || null,
    arquivoTamanho: validado.arquivoTamanho || null,
    mimeType: validado.mimeType || null,
    validacaoStatus: statusValidacaoInicial,
    validacaoResumo: resumoValidacaoInicial,
    cnpjExtraido: validado.cnpjExtraido || null,
    emissaoExtraida: validado.emissaoExtraida || null,
    vencimentoExtraido: validado.vencimentoExtraido || null,
    tipoDetectado: validado.tipoDetectado || null,
    validadoEm: validado.validadoEm || null,
    versao: 1,
    status: "ATIVO" as const,
    tenantId: tenantId || null,
  };

  try {
    let doc: Documento;
    try {
      doc = await prisma.documento.create({
        data: {
          ...baseData,
          criadoPorId: usuarioId || null,
        },
      });
    } catch (err) {
      if (usuarioId) {
        doc = await prisma.documento.create({
          data: {
            ...baseData,
            criadoPorId: null,
          },
        });
      } else {
        throw err;
      }
    }

    insertInMemoryDocumento({
      ...doc,
      tenantId: tenantId || null,
    });

    await recordAuditLog({
      acao: "DOCUMENTO_CRIADO",
      entidadeTipo: "DOCUMENTO",
      entidadeId: doc.id,
      usuarioId,
      tenantId: tenantId || null,
      depois: { nome: doc.nome, categoria: doc.categoria, dataVencimento: doc.dataVencimento },
    });

    await verificarDisparoImediatoVencimentoDocumento({
      id: doc.id,
      nome: doc.nome,
      categoria: doc.categoria,
      status: doc.status,
      semValidade: doc.semValidade,
      dataVencimento: doc.dataVencimento,
      tenantId: tenantId || null,
    }).catch(() => undefined);

    return mapToDocumentoItem(doc);
  } catch {
    const memoria = insertInMemoryDocumento({
      ...baseData,
      criadoPorId: usuarioId || null,
    });
    await verificarDisparoImediatoVencimentoDocumento({
      id: memoria.id,
      nome: memoria.nome,
      categoria: memoria.categoria,
      status: memoria.status,
      semValidade: memoria.semValidade,
      dataVencimento: memoria.dataVencimento,
      tenantId: tenantId || null,
    }).catch(() => undefined);
    return mapToDocumentoItem(memoria);
  }
}

export async function criarNovaVersao(
  documentoId: string,
  data: DocumentoNovaVersaoInput,
  usuarioId?: string,
  tenantId?: string | null,
): Promise<DocumentoItem | null> {
  const validado = documentoNovaVersaoInputSchema.parse(data);
  const temAcessoTenant = (docTenantId: unknown): boolean => {
    if (!tenantId || !docTenantId) return true;
    return String(docTenantId) === String(tenantId);
  };

  try {
    const docAtual = await prisma.documento.findUnique({
      where: { id: documentoId },
    });
    if (docAtual) {
      if (!temAcessoTenant(docAtual.tenantId)) return null;

      // Arquivar versão anterior
      await prisma.documento.update({
        where: { id: documentoId },
        data: { status: "SUBSTITUIDO" },
      });
      updateInMemoryDocumento(documentoId, { status: "SUBSTITUIDO" });

      const raizId = docAtual.documentoPaiId || docAtual.id;
      const semValidadeEfetivo =
        validado.semValidade !== undefined ? validado.semValidade : docAtual.semValidade;
      const dataVencimentoEfetiva =
        validado.dataVencimento !== undefined
          ? validado.dataVencimento
          : semValidadeEfetivo
            ? null
            : docAtual.dataVencimento;

      const dadosRaizAtualizada = {
        semValidade: semValidadeEfetivo,
        dataEmissao: validado.dataEmissao || docAtual.dataEmissao,
        dataVencimento: dataVencimentoEfetiva,
        arquivoUrl: validado.arquivoUrl || docAtual.arquivoUrl,
        arquivoNome: validado.arquivoNome || docAtual.arquivoNome,
        arquivoTamanho: validado.arquivoTamanho || docAtual.arquivoTamanho,
        mimeType: validado.mimeType || docAtual.mimeType,
        validacaoStatus: validado.validacaoStatus ?? docAtual.validacaoStatus,
        validacaoResumo: validado.validacaoResumo ?? docAtual.validacaoResumo,
        cnpjExtraido: validado.cnpjExtraido ?? docAtual.cnpjExtraido,
        emissaoExtraida: validado.emissaoExtraida ?? docAtual.emissaoExtraida,
        vencimentoExtraido: validado.vencimentoExtraido ?? docAtual.vencimentoExtraido,
        tipoDetectado: validado.tipoDetectado ?? docAtual.tipoDetectado,
        validadoEm: validado.validadoEm ?? docAtual.validadoEm,
        versao: docAtual.versao + 1,
      };

      // Criar nova versão ativa
      const novoDoc = await prisma.documento.create({
        data: {
          nome: validado.nome || docAtual.nome,
          categoria: docAtual.categoria,
          tipo: docAtual.tipo,
          orgaoEmissor: docAtual.orgaoEmissor,
          ...dadosRaizAtualizada,
          documentoPaiId: raizId,
          status: "ATIVO",
          tenantId: docAtual.tenantId ?? null,
          criadoPorId: usuarioId || null,
        },
      });
      insertInMemoryDocumento({
        ...novoDoc,
        tenantId: docAtual.tenantId ?? null,
      });

      // Atualiza metadados do documento raiz para refletir a nova versão ativa
      if (raizId && raizId !== novoDoc.id) {
        await prisma.documento.update({
          where: { id: raizId },
          data: dadosRaizAtualizada,
        }).catch(() => undefined);
        updateInMemoryDocumento(raizId, dadosRaizAtualizada);
      }

      await recordAuditLog({
        acao: "DOCUMENTO_NOVA_VERSAO",
        entidadeTipo: "DOCUMENTO",
        entidadeId: novoDoc.id,
        usuarioId,
        tenantId: docAtual.tenantId ?? tenantId ?? null,
        depois: { versao: novoDoc.versao, documentoPaiId: raizId },
      });

      return mapToDocumentoItem(novoDoc);
    }
  } catch {
    // Fallback em memória abaixo
  }

  const docAtual = getInMemoryDocumento(documentoId);
  if (!docAtual || !temAcessoTenant(docAtual.tenantId)) return null;

  updateInMemoryDocumento(documentoId, { status: "SUBSTITUIDO" });
  const raizId = docAtual.documentoPaiId || docAtual.id;
  const semValidadeEfetivo =
    validado.semValidade !== undefined ? validado.semValidade : docAtual.semValidade;
  const dataVencimentoEfetiva =
    validado.dataVencimento !== undefined
      ? validado.dataVencimento
      : semValidadeEfetivo
        ? null
        : docAtual.dataVencimento;

  const novoDoc = insertInMemoryDocumento({
    nome: validado.nome || docAtual.nome,
    categoria: docAtual.categoria,
    tipo: docAtual.tipo,
    orgaoEmissor: docAtual.orgaoEmissor,
    semValidade: semValidadeEfetivo,
    dataEmissao: validado.dataEmissao || docAtual.dataEmissao,
    dataVencimento: dataVencimentoEfetiva,
    arquivoUrl: validado.arquivoUrl || docAtual.arquivoUrl,
    arquivoNome: validado.arquivoNome || docAtual.arquivoNome,
    arquivoTamanho: validado.arquivoTamanho || docAtual.arquivoTamanho,
    mimeType: validado.mimeType || docAtual.mimeType,
    validacaoStatus: validado.validacaoStatus ?? docAtual.validacaoStatus,
    validacaoResumo: validado.validacaoResumo ?? docAtual.validacaoResumo,
    cnpjExtraido: validado.cnpjExtraido ?? docAtual.cnpjExtraido,
    emissaoExtraida: validado.emissaoExtraida ?? docAtual.emissaoExtraida,
    vencimentoExtraido: validado.vencimentoExtraido ?? docAtual.vencimentoExtraido,
    tipoDetectado: validado.tipoDetectado ?? docAtual.tipoDetectado,
    validadoEm: validado.validadoEm ?? docAtual.validadoEm,
    versao: (docAtual.versao || 1) + 1,
    documentoPaiId: raizId,
    status: "ATIVO",
    tenantId: docAtual.tenantId ?? null,
    criadoPorId: usuarioId || null,
  });

  if (raizId) {
    updateInMemoryDocumento(raizId, {
      semValidade: semValidadeEfetivo,
      dataEmissao: validado.dataEmissao || docAtual.dataEmissao,
      dataVencimento: dataVencimentoEfetiva,
      arquivoUrl: validado.arquivoUrl || docAtual.arquivoUrl,
      arquivoNome: validado.arquivoNome || docAtual.arquivoNome,
      arquivoTamanho: validado.arquivoTamanho || docAtual.arquivoTamanho,
      mimeType: validado.mimeType || docAtual.mimeType,
      validacaoStatus: validado.validacaoStatus ?? docAtual.validacaoStatus,
      validacaoResumo: validado.validacaoResumo ?? docAtual.validacaoResumo,
      cnpjExtraido: validado.cnpjExtraido ?? docAtual.cnpjExtraido,
      emissaoExtraida: validado.emissaoExtraida ?? docAtual.emissaoExtraida,
      vencimentoExtraido: validado.vencimentoExtraido ?? docAtual.vencimentoExtraido,
      tipoDetectado: validado.tipoDetectado ?? docAtual.tipoDetectado,
      validadoEm: validado.validadoEm ?? docAtual.validadoEm,
      versao: (docAtual.versao || 1) + 1,
    });
  }

  return mapToDocumentoItem(novoDoc);
}

export async function atualizarDocumento(
  id: string,
  data: DocumentoAtualizarInput,
  usuarioId?: string,
  tenantId?: string | null,
): Promise<DocumentoItem | null> {
  const validado = documentoAtualizarInputSchema.parse(data);
  await garantirColunasValidacaoDocumento();
  const payloadPersistir: DocumentoAtualizarInput = { ...validado };
  if (payloadPersistir.arquivoUrl === null && !payloadPersistir.validacaoStatus) {
    payloadPersistir.validacaoStatus = "PENDENTE_ANEXO";
    payloadPersistir.validacaoResumo =
      "Documento sem arquivo anexado em /documentacao.";
  }

  const temAcessoTenant = (docTenantId: unknown): boolean => {
    if (!tenantId || !docTenantId) return true;
    return String(docTenantId) === String(tenantId);
  };

  try {
    const existenteDb = await prisma.documento.findUnique({ where: { id } });
    if (existenteDb && !temAcessoTenant(existenteDb.tenantId)) {
      return null;
    }
    if (existenteDb) {
      const doc = await prisma.documento.update({
        where: { id },
        data: payloadPersistir,
      });
      updateInMemoryDocumento(id, payloadPersistir);

      await recordAuditLog({
        acao: "DOCUMENTO_ATUALIZADO",
        entidadeTipo: "DOCUMENTO",
        entidadeId: doc.id,
        usuarioId,
        tenantId: doc.tenantId ?? tenantId ?? null,
        depois: payloadPersistir,
      });

      await verificarDisparoImediatoVencimentoDocumento({
        id: doc.id,
        nome: doc.nome,
        categoria: doc.categoria,
        status: doc.status,
        semValidade: doc.semValidade,
        dataVencimento: doc.dataVencimento,
        tenantId: doc.tenantId || null,
      }).catch(() => undefined);

      return mapToDocumentoItem(doc);
    }
  } catch {
    // Fallback em memória abaixo
  }

  const memAtual = getInMemoryDocumento(id);
  if (!memAtual || !temAcessoTenant(memAtual.tenantId)) {
    return null;
  }
  const updated = updateInMemoryDocumento(id, payloadPersistir);
  if (updated) {
    await verificarDisparoImediatoVencimentoDocumento({
      id: updated.id,
      nome: updated.nome,
      categoria: updated.categoria,
      status: updated.status,
      semValidade: updated.semValidade,
      dataVencimento: updated.dataVencimento,
      tenantId: updated.tenantId || null,
    }).catch(() => undefined);
  }
  return updated ? mapToDocumentoItem(updated) : null;
}

export async function revalidarAnexoDocumento(
  id: string,
  tenantId?: string | null,
  usuarioId?: string,
  telemetryContext?: Partial<LlmTelemetryContext>,
): Promise<DocumentoItem | null> {
  const detalhe = await obterDocumento(id, tenantId);
  if (!detalhe?.documento) return null;

  const doc = detalhe.documento;
  if (!doc.arquivoUrl) {
    return atualizarDocumento(
      id,
      {
        validacaoStatus: "PENDENTE_ANEXO",
        validacaoResumo:
          "Documento salvo sem arquivo anexado. Envie um PDF, DOCX ou imagem para validação automática.",
        validadoEm: new Date(),
      },
      usuarioId,
      tenantId,
    );
  }

  const buffer = await carregarBufferDocumentoCofre(doc.arquivoUrl);
  if (!buffer) {
    return atualizarDocumento(
      id,
      {
        validacaoStatus: "NAO_VERIFICADO",
        validacaoResumo:
          "Não foi possível localizar o arquivo físico no armazenamento para releitura. Reenvie o anexo se necessário.",
        validadoEm: new Date(),
      },
      usuarioId,
      tenantId,
    );
  }

  const empresa = await obterConfiguracaoEmpresa(tenantId).catch(() =>
    getInMemoryConfiguracaoEmpresa(tenantId),
  );
  const inspecao = await inspecionarArquivoDocumentoCofre({
    buffer,
    nomeArquivo: doc.arquivoNome,
    mimeType: doc.mimeType,
    nomeInformado: doc.nome,
    dataVencimentoInformada: doc.dataVencimento,
    semValidade: doc.semValidade,
    tenantCnpj: empresa?.cnpj,
    telemetryContext: {
      tenantId: tenantId ?? null,
      userId: usuarioId ?? null,
      empresaNome: empresa?.razaoSocial ?? null,
      ...(telemetryContext ?? {}),
    },
  });

  return atualizarDocumento(
    id,
    {
      validacaoStatus: inspecao.validacaoStatus,
      validacaoResumo: inspecao.validacaoResumo,
      cnpjExtraido: inspecao.cnpjExtraido,
      emissaoExtraida: inspecao.emissaoExtraida,
      vencimentoExtraido: inspecao.vencimentoExtraido,
      tipoDetectado: inspecao.tipoDetectado,
      validadoEm: inspecao.validadoEm,
    },
    usuarioId,
    tenantId,
  );
}

export async function excluirDocumento(
  id: string,
  usuarioId?: string,
  tenantId?: string | null,
): Promise<boolean> {
  const temAcessoTenant = (docTenantId: unknown): boolean => {
    if (!tenantId || !docTenantId) return true;
    return String(docTenantId) === String(tenantId);
  };

  try {
    const existenteDb = await prisma.documento.findUnique({ where: { id } });
    if (existenteDb) {
      if (!temAcessoTenant(existenteDb.tenantId)) {
        return false;
      }
      await prisma.documento.delete({ where: { id } });
      deleteInMemoryDocumento(id);
      await recordAuditLog({
        acao: "DOCUMENTO_EXCLUIDO",
        entidadeTipo: "DOCUMENTO",
        entidadeId: id,
        usuarioId,
        tenantId: existenteDb.tenantId ?? tenantId ?? null,
      });
      return true;
    }
  } catch {
    // Fallback em memória abaixo
  }

  const memAtual = getInMemoryDocumento(id);
  if (!memAtual || !temAcessoTenant(memAtual.tenantId)) {
    return false;
  }
  return deleteInMemoryDocumento(id);
}

/**
 * Busca documentos ativos com vencimento no mês informado (America/Sao_Paulo).
 * Alimenta a faixa de alertas documentais no Calendário de Certames (PRD §4.2).
 */
export async function buscarDocumentosVencendoNoMes(
  ano: number,
  mes: number,
  tenantId?: string | null,
): Promise<
  Array<{
    documentoId: string;
    titulo: string;
    dia: number;
    mensagem: string;
    linkDestino: "/documentacao";
  }>
> {
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0)); // 00:00 BRT
  const fimMes = new Date(Date.UTC(ano, mes, 1, 2, 59, 59, 999)); // 23:59:59 BRT

  try {
    const where: Prisma.DocumentoWhereInput = {
      status: "ATIVO",
      semValidade: false,
      dataVencimento: {
        gte: inicioMes,
        lte: fimMes,
      },
    };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const docs = await prisma.documento.findMany({
      where,
      orderBy: { dataVencimento: "asc" },
    });

    return docs.map((d) => {
      const dia = extrairDiaCivil(d.dataVencimento);

      return {
        documentoId: d.id,
        titulo: d.nome,
        dia,
        mensagem: `⚠️ ${d.nome} — Vencimento no dia ${dia}/${String(mes).padStart(2, "0")} (Atualizar)`,
        linkDestino: "/documentacao" as const,
      };
    });
  } catch {
    const memoria = listInMemoryDocumentos() as DocumentoSourceRecord[];
    const docsFiltrados = memoria.filter((d) => {
      if (tenantId && d.tenantId !== tenantId) return false;
      if (d.status !== "ATIVO" || d.semValidade || !d.dataVencimento) return false;
      const t = new Date(d.dataVencimento).getTime();
      return t >= inicioMes.getTime() && t <= fimMes.getTime();
    });

    return docsFiltrados.map((d) => {
      const dia = extrairDiaCivil(d.dataVencimento);
      return {
        documentoId: d.id,
        titulo: d.nome,
        dia,
        mensagem: `⚠️ ${d.nome} — Vencimento no dia ${dia}/${String(mes).padStart(2, "0")} (Atualizar)`,
        linkDestino: "/documentacao" as const,
      };
    });
  }
}
