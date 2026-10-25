import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  calcularPrazoFatalImpugnacao,
  type ImpugnacaoAtualizarInput,
  type ImpugnacaoCriarInput,
  type ImpugnacaoItem,
  type ImpugnacaoListQuery,
  type ImpugnacaoListResponse,
  impugnacaoAtualizarInputSchema,
  impugnacaoCriarInputSchema,
  impugnacaoListQuerySchema,
} from "@/server/schemas/impugnacao.schema";
import {
  deleteInMemoryImpugnacao,
  getInMemoryImpugnacao,
  insertInMemoryImpugnacao,
  listInMemoryImpugnacoes,
  updateInMemoryImpugnacao,
} from "./licitacoes-store";

function anexarMetricasPrazoFatal(imp: any): ImpugnacaoItem {
  const agora = Date.now();
  const prazoFatalDate = imp.prazoFatal instanceof Date ? imp.prazoFatal : new Date(imp.prazoFatal);
  const diffMs = prazoFatalDate.getTime() - agora;
  const horasRestantes = Math.round(diffMs / (1000 * 60 * 60));
  const prazoVencido = diffMs < 0;

  return {
    id: imp.id,
    licitacaoId: imp.licitacaoId ?? null,
    numeroEdital: imp.numeroEdital,
    orgaoNome: imp.orgaoNome,
    objeto: imp.objeto ?? null,
    status: imp.status as any,
    motivoLegal: imp.motivoLegal,
    dataAberturaSessao: imp.dataAberturaSessao instanceof Date ? imp.dataAberturaSessao : new Date(imp.dataAberturaSessao),
    prazoFatal: prazoFatalDate,
    fundamentacao: imp.fundamentacao,
    pedidos: imp.pedidos,
    numeroProtocolo: imp.numeroProtocolo ?? null,
    dataProtocolo: imp.dataProtocolo ? (imp.dataProtocolo instanceof Date ? imp.dataProtocolo : new Date(imp.dataProtocolo)) : null,
    dataResposta: imp.dataResposta ? (imp.dataResposta instanceof Date ? imp.dataResposta : new Date(imp.dataResposta)) : null,
    decisaoJulgamento: imp.decisaoJulgamento ?? null,
    criadoPorId: imp.criadoPorId ?? null,
    criadoEm: imp.criadoEm instanceof Date ? imp.criadoEm : new Date(imp.criadoEm),
    atualizadoEm: imp.atualizadoEm instanceof Date ? imp.atualizadoEm : new Date(imp.atualizadoEm),
    horasRestantesPrazoFatal: horasRestantes,
    prazoVencido,
  };
}

export async function listarImpugnacoes(
  rawQuery?: Partial<ImpugnacaoListQuery>,
): Promise<ImpugnacaoListResponse> {
  const query = impugnacaoListQuerySchema.parse(rawQuery ?? {});

  try {
    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.busca) {
      where.OR = [
        { numeroEdital: { contains: query.busca, mode: "insensitive" } },
        { orgaoNome: { contains: query.busca, mode: "insensitive" } },
        { motivoLegal: { contains: query.busca, mode: "insensitive" } },
        { numeroProtocolo: { contains: query.busca, mode: "insensitive" } },
      ];
    }

    const [total, doDb] = await Promise.all([
      prisma.impugnacao.count({ where }),
      prisma.impugnacao.findMany({
        where,
        orderBy: [{ prazoFatal: "asc" }, { criadoEm: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    let impugnacoes = doDb.map(anexarMetricasPrazoFatal);
    if (query.apenasCriticas) {
      impugnacoes = impugnacoes.filter(
        (i) => i.status === "RASCUNHO" && (i.horasRestantesPrazoFatal ?? 999) <= 48,
      );
    }

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      impugnacoes,
    };
  } catch {
    // Fallback em memória resiliente
    let memoria = listInMemoryImpugnacoes();
    if (query.status) {
      memoria = memoria.filter((i) => i.status === query.status);
    }
    if (query.busca) {
      const termo = query.busca.toLowerCase();
      memoria = memoria.filter(
        (i) =>
          i.numeroEdital.toLowerCase().includes(termo) ||
          i.orgaoNome.toLowerCase().includes(termo) ||
          i.motivoLegal.toLowerCase().includes(termo) ||
          (i.numeroProtocolo && i.numeroProtocolo.toLowerCase().includes(termo)),
      );
    }

    let calculadas = memoria.map(anexarMetricasPrazoFatal);
    if (query.apenasCriticas) {
      calculadas = calculadas.filter(
        (i) => i.status === "RASCUNHO" && (i.horasRestantesPrazoFatal ?? 999) <= 48,
      );
    }

    const total = calculadas.length;
    const paginado = calculadas.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      impugnacoes: paginado,
    };
  }
}

export async function obterImpugnacao(id: string): Promise<ImpugnacaoItem | null> {
  try {
    const item = await prisma.impugnacao.findUnique({ where: { id } });
    if (!item) return null;
    return anexarMetricasPrazoFatal(item);
  } catch {
    const item = getInMemoryImpugnacao(id);
    return item ? anexarMetricasPrazoFatal(item) : null;
  }
}

export async function criarImpugnacao(
  data: ImpugnacaoCriarInput,
  usuarioId?: string | null,
): Promise<ImpugnacaoItem> {
  const validado = impugnacaoCriarInputSchema.parse(data);
  const dataAbertura = new Date(validado.dataAberturaSessao);
  const prazoFatal = calcularPrazoFatalImpugnacao(dataAbertura);

  try {
    const criada = await prisma.impugnacao.create({
      data: {
        licitacaoId: validado.licitacaoId || null,
        numeroEdital: validado.numeroEdital,
        orgaoNome: validado.orgaoNome,
        objeto: validado.objeto || null,
        status: validado.status,
        motivoLegal: validado.motivoLegal,
        dataAberturaSessao: dataAbertura,
        prazoFatal,
        fundamentacao: validado.fundamentacao,
        pedidos: validado.pedidos,
        numeroProtocolo: validado.numeroProtocolo || null,
        dataProtocolo: validado.dataProtocolo || null,
        criadoPorId: usuarioId || null,
      },
    });

    await recordAuditLog({
      acao: "IMPUGNACAO_CRIADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: criada.id,
      usuarioId: usuarioId ?? null,
      depois: {
        numeroEdital: criada.numeroEdital,
        status: criada.status,
        prazoFatal: criada.prazoFatal.toISOString(),
      },
    });

    return anexarMetricasPrazoFatal(criada);
  } catch {
    const memoria = insertInMemoryImpugnacao({
      ...validado,
      prazoFatal,
      criadoPorId: usuarioId ?? null,
    });

    await recordAuditLog({
      acao: "IMPUGNACAO_CRIADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: memoria.id,
      usuarioId: usuarioId ?? null,
      depois: {
        numeroEdital: memoria.numeroEdital,
        status: memoria.status,
        prazoFatal: memoria.prazoFatal.toISOString(),
      },
    });

    return anexarMetricasPrazoFatal(memoria);
  }
}

export async function atualizarImpugnacao(
  id: string,
  data: ImpugnacaoAtualizarInput,
  usuarioId?: string | null,
): Promise<ImpugnacaoItem | null> {
  const validado = impugnacaoAtualizarInputSchema.parse(data);

  try {
    const atualizada = await prisma.impugnacao.update({
      where: { id },
      data: {
        ...(validado.status !== undefined ? { status: validado.status } : {}),
        ...(validado.motivoLegal !== undefined ? { motivoLegal: validado.motivoLegal } : {}),
        ...(validado.fundamentacao !== undefined ? { fundamentacao: validado.fundamentacao } : {}),
        ...(validado.pedidos !== undefined ? { pedidos: validado.pedidos } : {}),
        ...(validado.numeroProtocolo !== undefined ? { numeroProtocolo: validado.numeroProtocolo } : {}),
        ...(validado.dataProtocolo !== undefined ? { dataProtocolo: validado.dataProtocolo } : {}),
        ...(validado.dataResposta !== undefined ? { dataResposta: validado.dataResposta } : {}),
        ...(validado.decisaoJulgamento !== undefined ? { decisaoJulgamento: validado.decisaoJulgamento } : {}),
      },
    });

    await recordAuditLog({
      acao: "IMPUGNACAO_ATUALIZADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: atualizada.id,
      usuarioId: usuarioId ?? null,
      depois: validado,
    });

    return anexarMetricasPrazoFatal(atualizada);
  } catch {
    const memoria = updateInMemoryImpugnacao(id, validado);
    if (!memoria) return null;

    await recordAuditLog({
      acao: "IMPUGNACAO_ATUALIZADA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: id,
      usuarioId: usuarioId ?? null,
      depois: validado,
    });

    return anexarMetricasPrazoFatal(memoria);
  }
}

export async function excluirImpugnacao(
  id: string,
  usuarioId?: string | null,
): Promise<boolean> {
  try {
    await prisma.impugnacao.delete({ where: { id } });
    await recordAuditLog({
      acao: "IMPUGNACAO_EXCLUIDA",
      entidadeTipo: "IMPUGNACAO",
      entidadeId: id,
      usuarioId: usuarioId ?? null,
    });
    return true;
  } catch {
    const deletado = deleteInMemoryImpugnacao(id);
    if (deletado) {
      await recordAuditLog({
        acao: "IMPUGNACAO_EXCLUIDA",
        entidadeTipo: "IMPUGNACAO",
        entidadeId: id,
        usuarioId: usuarioId ?? null,
      });
    }
    return deletado;
  }
}
export { gerarMinutaJuridica } from "@/lib/minuta-juridica";

