import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  type DocumentoCriarInput,
  type DocumentoAtualizarInput,
  type DocumentoNovaVersaoInput,
  type DocumentoItem,
  type DocumentoListQuery,
  type DocumentoListResponse,
  type DocumentoDetalheResponse,
  documentoCriarInputSchema,
  documentoAtualizarInputSchema,
  documentoNovaVersaoInputSchema,
  documentoListQuerySchema,
} from "@/server/schemas/documento.schema";
import {
  deleteInMemoryDocumento,
  getInMemoryDocumento,
  insertInMemoryDocumento,
  listInMemoryDocumentos,
  updateInMemoryDocumento,
} from "./licitacoes-store";

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

function mapToDocumentoItem(doc: any): DocumentoItem {
  const dataVenc = doc.dataVencimento ? new Date(doc.dataVencimento) : null;
  const statusVal = calcularStatusValidade(dataVenc, Boolean(doc.semValidade));

  return {
    id: doc.id,
    nome: doc.nome,
    categoria: doc.categoria as any,
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
    status: doc.status as any,
    criadoPorId: doc.criadoPorId ?? null,
    criadoEm: new Date(doc.criadoEm),
    atualizadoEm: new Date(doc.atualizadoEm),
    ...statusVal,
  };
}

export async function listarDocumentos(
  rawQuery?: Partial<DocumentoListQuery>,
): Promise<DocumentoListResponse> {
  const query = documentoListQuerySchema.parse(rawQuery ?? {});

  try {
    const where: any = {};
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

    const [total, docsDb] = await Promise.all([
      prisma.documento.count({ where }),
      prisma.documento.findMany({
        where,
        orderBy: [{ dataVencimento: "asc" }, { nome: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const documentos = docsDb.map(mapToDocumentoItem);
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
  } catch {
    // Fallback em memória
    let memoria = listInMemoryDocumentos();
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

    const total = memoria.length;
    const paginado = memoria.slice(
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
): Promise<DocumentoDetalheResponse | null> {
  try {
    const doc = await prisma.documento.findUnique({
      where: { id },
    });
    if (!doc) return null;

    const raizId = doc.documentoPaiId || doc.id;
    const versoes = await prisma.documento.findMany({
      where: {
        OR: [{ id: raizId }, { documentoPaiId: raizId }],
      },
      orderBy: { versao: "desc" },
    });

    return {
      ok: true,
      documento: mapToDocumentoItem(doc),
      historicoVersoes: versoes.map(mapToDocumentoItem),
    };
  } catch {
    const doc = getInMemoryDocumento(id);
    if (!doc) return null;
    return {
      ok: true,
      documento: mapToDocumentoItem(doc),
      historicoVersoes: [mapToDocumentoItem(doc)],
    };
  }
}

export async function criarDocumento(
  data: DocumentoCriarInput,
  usuarioId?: string,
): Promise<DocumentoItem> {
  const validado = documentoCriarInputSchema.parse(data);

  try {
    const doc = await prisma.documento.create({
      data: {
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
        versao: 1,
        status: "ATIVO",
        criadoPorId: usuarioId || null,
      },
    });

    await recordAuditLog({
      acao: "DOCUMENTO_CRIADO",
      entidadeTipo: "DOCUMENTO",
      entidadeId: doc.id,
      usuarioId,
      depois: { nome: doc.nome, categoria: doc.categoria, dataVencimento: doc.dataVencimento },
    });

    return mapToDocumentoItem(doc);
  } catch {
    const memoria = insertInMemoryDocumento({
      ...validado,
      versao: 1,
      status: "ATIVO",
      criadoPorId: usuarioId || null,
    });
    return mapToDocumentoItem(memoria);
  }
}

export async function criarNovaVersao(
  documentoId: string,
  data: DocumentoNovaVersaoInput,
  usuarioId?: string,
): Promise<DocumentoItem | null> {
  const validado = documentoNovaVersaoInputSchema.parse(data);

  try {
    const docAtual = await prisma.documento.findUnique({
      where: { id: documentoId },
    });
    if (!docAtual) return null;

    // Arquivar versão anterior
    await prisma.documento.update({
      where: { id: documentoId },
      data: { status: "SUBSTITUIDO" },
    });

    const raizId = docAtual.documentoPaiId || docAtual.id;

    // Criar nova versão ativa
    const novoDoc = await prisma.documento.create({
      data: {
        nome: validado.nome || docAtual.nome,
        categoria: docAtual.categoria,
        tipo: docAtual.tipo,
        orgaoEmissor: docAtual.orgaoEmissor,
        semValidade: docAtual.semValidade,
        dataEmissao: validado.dataEmissao || docAtual.dataEmissao,
        dataVencimento: validado.dataVencimento || docAtual.dataVencimento,
        arquivoUrl: validado.arquivoUrl || docAtual.arquivoUrl,
        arquivoNome: validado.arquivoNome || docAtual.arquivoNome,
        arquivoTamanho: validado.arquivoTamanho || docAtual.arquivoTamanho,
        mimeType: validado.mimeType || docAtual.mimeType,
        versao: docAtual.versao + 1,
        documentoPaiId: raizId,
        status: "ATIVO",
        criadoPorId: usuarioId || null,
      },
    });

    await recordAuditLog({
      acao: "DOCUMENTO_NOVA_VERSAO",
      entidadeTipo: "DOCUMENTO",
      entidadeId: novoDoc.id,
      usuarioId,
      depois: { versao: novoDoc.versao, documentoPaiId: raizId },
    });

    return mapToDocumentoItem(novoDoc);
  } catch {
    const docAtual = getInMemoryDocumento(documentoId);
    if (!docAtual) return null;

    updateInMemoryDocumento(documentoId, { status: "SUBSTITUIDO" });
    const raizId = docAtual.documentoPaiId || docAtual.id;

    const novoDoc = insertInMemoryDocumento({
      nome: validado.nome || docAtual.nome,
      categoria: docAtual.categoria,
      tipo: docAtual.tipo,
      orgaoEmissor: docAtual.orgaoEmissor,
      semValidade: docAtual.semValidade,
      dataEmissao: validado.dataEmissao || docAtual.dataEmissao,
      dataVencimento: validado.dataVencimento || docAtual.dataVencimento,
      arquivoUrl: validado.arquivoUrl || docAtual.arquivoUrl,
      arquivoNome: validado.arquivoNome || docAtual.arquivoNome,
      arquivoTamanho: validado.arquivoTamanho || docAtual.arquivoTamanho,
      mimeType: validado.mimeType || docAtual.mimeType,
      versao: (docAtual.versao || 1) + 1,
      documentoPaiId: raizId,
      status: "ATIVO",
      criadoPorId: usuarioId || null,
    });

    return mapToDocumentoItem(novoDoc);
  }
}

export async function atualizarDocumento(
  id: string,
  data: DocumentoAtualizarInput,
  usuarioId?: string,
): Promise<DocumentoItem | null> {
  const validado = documentoAtualizarInputSchema.parse(data);

  // Se a atualização envolve novo arquivo ou datas de vigência, salvar como nova versão e manter anterior como histórico
  if (
    validado.dataVencimento !== undefined ||
    validado.dataEmissao !== undefined ||
    validado.arquivoNome !== undefined ||
    validado.arquivoUrl !== undefined
  ) {
    const novaVersao = await criarNovaVersao(
      id,
      {
        nome: validado.nome,
        dataEmissao: validado.dataEmissao,
        dataVencimento: validado.dataVencimento,
        arquivoUrl: validado.arquivoUrl,
        arquivoNome: validado.arquivoNome,
        arquivoTamanho: validado.arquivoTamanho,
        mimeType: validado.mimeType,
      },
      usuarioId,
    );
    if (novaVersao) return novaVersao;
  }

  try {
    const doc = await prisma.documento.update({
      where: { id },
      data: validado,
    });

    await recordAuditLog({
      acao: "DOCUMENTO_ATUALIZADO",
      entidadeTipo: "DOCUMENTO",
      entidadeId: doc.id,
      usuarioId,
      depois: validado,
    });

    return mapToDocumentoItem(doc);
  } catch {
    const updated = updateInMemoryDocumento(id, validado);
    return updated ? mapToDocumentoItem(updated) : null;
  }
}

export async function excluirDocumento(
  id: string,
  usuarioId?: string,
): Promise<boolean> {
  try {
    await prisma.documento.delete({ where: { id } });
    await recordAuditLog({
      acao: "DOCUMENTO_EXCLUIDO",
      entidadeTipo: "DOCUMENTO",
      entidadeId: id,
      usuarioId,
    });
    return true;
  } catch {
    return deleteInMemoryDocumento(id);
  }
}

/**
 * Busca documentos ativos com vencimento no mês informado (America/Sao_Paulo).
 * Alimenta a faixa de alertas documentais no Calendário de Certames (PRD §4.2).
 */
export async function buscarDocumentosVencendoNoMes(
  ano: number,
  mes: number,
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
    const docs = await prisma.documento.findMany({
      where: {
        status: "ATIVO",
        semValidade: false,
        dataVencimento: {
          gte: inicioMes,
          lte: fimMes,
        },
      },
      orderBy: { dataVencimento: "asc" },
    });

    return docs.map((d) => {
      const dataVenc = new Date(d.dataVencimento!);
      // Resolver dia em America/Sao_Paulo
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        day: "numeric",
      });
      const dia = parseInt(formatter.format(dataVenc), 10);

      return {
        documentoId: d.id,
        titulo: d.nome,
        dia,
        mensagem: `⚠️ ${d.nome} — Vencimento no dia ${dia}/${String(mes).padStart(2, "0")} (Atualizar)`,
        linkDestino: "/documentacao" as const,
      };
    });
  } catch {
    const memoria = listInMemoryDocumentos();
    const docsFiltrados = memoria.filter((d) => {
      if (d.status !== "ATIVO" || d.semValidade || !d.dataVencimento) return false;
      const t = new Date(d.dataVencimento).getTime();
      return t >= inicioMes.getTime() && t <= fimMes.getTime();
    });

    return docsFiltrados.map((d) => {
      const dataVenc = new Date(d.dataVencimento);
      const dia = dataVenc.getDate();
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
