import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  type PortalCriarInput,
  type PortalAtualizarInput,
  type PortalItem,
  type PortalListQuery,
  type PortalListResponse,
  portalCriarInputSchema,
  portalAtualizarInputSchema,
  portalListQuerySchema,
} from "@/server/schemas/portal.schema";
import {
  deleteInMemoryPortal,
  getInMemoryPortal,
  insertInMemoryPortal,
  listInMemoryPortais,
  updateInMemoryPortal,
} from "./licitacoes-store";

export async function listarPortais(
  rawQuery?: Partial<PortalListQuery>,
): Promise<PortalListResponse> {
  const query = portalListQuerySchema.parse(rawQuery ?? {});

  try {
    const where: any = {};
    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.busca) {
      where.OR = [
        { nome: { contains: query.busca, mode: "insensitive" } },
        { login: { contains: query.busca, mode: "insensitive" } },
        { cnpj: { contains: query.busca, mode: "insensitive" } },
      ];
    }
    if (query.apenasVencendoEmDias) {
      const limite = new Date(Date.now() + 1000 * 60 * 60 * 24 * query.apenasVencendoEmDias);
      where.dataVencimento = { lte: limite, gte: new Date() };
    }

    const [total, portaisDb] = await Promise.all([
      prisma.portal.count({ where }),
      prisma.portal.findMany({
        where,
        orderBy: [{ dataVencimento: "asc" }, { nome: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const portais: PortalItem[] = portaisDb.map((p) => ({
      id: p.id,
      nome: p.nome,
      url: p.url,
      status: p.status as any,
      login: p.login,
      email: p.email,
      cnpj: p.cnpj,
      usuario: p.usuario,
      valorAssinatura: p.valorAssinatura,
      periodicidade: p.periodicidade as any,
      dataVencimento: p.dataVencimento,
      aceitaRobo: p.aceitaRobo,
      exigeCertificadoDigital: p.exigeCertificadoDigital,
      suporteContato: p.suporteContato,
      observacoes: p.observacoes,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    }));

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      portais,
    };
  } catch {
    // Fallback resiliente em memória
    let memoria = listInMemoryPortais();
    if (query.tenantId) {
      memoria = memoria.filter((p) => (p as any).tenantId === query.tenantId);
    }
    if (query.status) {
      memoria = memoria.filter((p) => p.status === query.status);
    }
    if (query.busca) {
      const termo = query.busca.toLowerCase();
      memoria = memoria.filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          (p.login && p.login.toLowerCase().includes(termo)) ||
          (p.cnpj && p.cnpj.includes(termo)),
      );
    }

    const total = memoria.length;
    const paginado = memoria.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      portais: paginado,
    };
  }
}

export async function obterPortal(id: string): Promise<PortalItem | null> {
  try {
    const p = await prisma.portal.findUnique({ where: { id } });
    if (!p) return null;
    return {
      id: p.id,
      nome: p.nome,
      url: p.url,
      status: p.status as any,
      login: p.login,
      email: p.email,
      cnpj: p.cnpj,
      usuario: p.usuario,
      valorAssinatura: p.valorAssinatura,
      periodicidade: p.periodicidade as any,
      dataVencimento: p.dataVencimento,
      aceitaRobo: p.aceitaRobo,
      exigeCertificadoDigital: p.exigeCertificadoDigital,
      suporteContato: p.suporteContato,
      observacoes: p.observacoes,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    };
  } catch {
    return getInMemoryPortal(id);
  }
}

export async function criarPortal(
  data: PortalCriarInput,
  usuarioId?: string,
  tenantId?: string | null,
): Promise<PortalItem> {
  const validado = portalCriarInputSchema.parse(data);

  try {
    const p = await prisma.portal.create({
      data: {
        nome: validado.nome,
        url: validado.url,
        status: validado.status,
        login: validado.login || null,
        email: validado.email || null,
        cnpj: validado.cnpj || null,
        usuario: validado.usuario || null,
        valorAssinatura: validado.valorAssinatura ?? null,
        periodicidade: validado.periodicidade,
        dataVencimento: validado.dataVencimento || null,
        aceitaRobo: validado.aceitaRobo,
        exigeCertificadoDigital: validado.exigeCertificadoDigital,
        suporteContato: validado.suporteContato || null,
        observacoes: validado.observacoes || null,
        tenantId: tenantId || null,
      },
    });

    insertInMemoryPortal({
      ...p,
      tenantId: tenantId || null,
    });

    await recordAuditLog({
      acao: "PORTAL_CRIADO",
      entidadeTipo: "PORTAL",
      entidadeId: p.id,
      usuarioId,
      tenantId: tenantId || null,
      depois: { nome: p.nome, url: p.url, status: p.status },
    });

    return {
      id: p.id,
      nome: p.nome,
      url: p.url,
      status: p.status as any,
      login: p.login,
      email: p.email,
      cnpj: p.cnpj,
      usuario: p.usuario,
      valorAssinatura: p.valorAssinatura,
      periodicidade: p.periodicidade as any,
      dataVencimento: p.dataVencimento,
      aceitaRobo: p.aceitaRobo,
      exigeCertificadoDigital: p.exigeCertificadoDigital,
      suporteContato: p.suporteContato,
      observacoes: p.observacoes,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    };
  } catch {
    const memoria = insertInMemoryPortal({
      ...validado,
      tenantId: tenantId || null,
    });
    return memoria;
  }
}

export async function atualizarPortal(
  id: string,
  data: PortalAtualizarInput,
  usuarioId?: string,
): Promise<PortalItem | null> {
  const validado = portalAtualizarInputSchema.parse(data);

  try {
    const p = await prisma.portal.update({
      where: { id },
      data: {
        ...(validado.nome !== undefined ? { nome: validado.nome } : {}),
        ...(validado.url !== undefined ? { url: validado.url } : {}),
        ...(validado.status !== undefined ? { status: validado.status } : {}),
        ...(validado.login !== undefined ? { login: validado.login || null } : {}),
        ...(validado.email !== undefined ? { email: validado.email || null } : {}),
        ...(validado.cnpj !== undefined ? { cnpj: validado.cnpj || null } : {}),
        ...(validado.usuario !== undefined ? { usuario: validado.usuario || null } : {}),
        ...(validado.valorAssinatura !== undefined ? { valorAssinatura: validado.valorAssinatura } : {}),
        ...(validado.periodicidade !== undefined ? { periodicidade: validado.periodicidade } : {}),
        ...(validado.dataVencimento !== undefined ? { dataVencimento: validado.dataVencimento } : {}),
        ...(validado.aceitaRobo !== undefined ? { aceitaRobo: validado.aceitaRobo } : {}),
        ...(validado.exigeCertificadoDigital !== undefined ? { exigeCertificadoDigital: validado.exigeCertificadoDigital } : {}),
        ...(validado.suporteContato !== undefined ? { suporteContato: validado.suporteContato || null } : {}),
        ...(validado.observacoes !== undefined ? { observacoes: validado.observacoes || null } : {}),
      },
    });

    await recordAuditLog({
      acao: "PORTAL_ATUALIZADO",
      entidadeTipo: "PORTAL",
      entidadeId: p.id,
      usuarioId,
      depois: validado,
    });

    return {
      id: p.id,
      nome: p.nome,
      url: p.url,
      status: p.status as any,
      login: p.login,
      email: p.email,
      cnpj: p.cnpj,
      usuario: p.usuario,
      valorAssinatura: p.valorAssinatura,
      periodicidade: p.periodicidade as any,
      dataVencimento: p.dataVencimento,
      aceitaRobo: p.aceitaRobo,
      exigeCertificadoDigital: p.exigeCertificadoDigital,
      suporteContato: p.suporteContato,
      observacoes: p.observacoes,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    };
  } catch {
    return updateInMemoryPortal(id, validado);
  }
}

export async function excluirPortal(
  id: string,
  usuarioId?: string,
): Promise<boolean> {
  try {
    await prisma.portal.delete({ where: { id } });
    await recordAuditLog({
      acao: "PORTAL_EXCLUIDO",
      entidadeTipo: "PORTAL",
      entidadeId: id,
      usuarioId,
    });
    return true;
  } catch {
    return deleteInMemoryPortal(id);
  }
}

export async function buscarPortaisVencendoNoMes(
  ano: number,
  mes: number,
  tenantId?: string | null,
): Promise<
  Array<{
    portalId: string;
    nome: string;
    dia: number;
    mensagem: string;
    linkDestino: "/portais";
  }>
> {
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0));
  const fimMes = new Date(Date.UTC(ano, mes, 1, 2, 59, 59, 999));

  try {
    const where: any = {
      dataVencimento: {
        gte: inicioMes,
        lte: fimMes,
      },
    };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const portais = await prisma.portal.findMany({
      where,
      orderBy: { dataVencimento: "asc" },
    });

    return portais.map((p) => {
      const dataVenc = new Date(p.dataVencimento!);
      const dia = parseInt(
        dataVenc.toLocaleDateString("en-US", {
          day: "numeric",
          timeZone: "America/Sao_Paulo",
        }),
        10,
      );
      return {
        portalId: p.id,
        nome: p.nome,
        dia,
        mensagem: `Vencimento da anuidade do portal ${p.nome}`,
        linkDestino: "/portais" as const,
      };
    });
  } catch {
    return listInMemoryPortais()
      .filter((p) => {
        if (tenantId && (p as any).tenantId !== tenantId) return false;
        if (!p.dataVencimento) return false;
        const d = new Date(p.dataVencimento);
        return d >= inicioMes && d <= fimMes;
      })
      .map((p) => {
        const dataVenc = new Date(p.dataVencimento!);
        const dia = parseInt(
          dataVenc.toLocaleDateString("en-US", {
            day: "numeric",
            timeZone: "America/Sao_Paulo",
          }),
          10,
        );
        return {
          portalId: p.id,
          nome: p.nome,
          dia,
          mensagem: `Vencimento da anuidade do portal ${p.nome}`,
          linkDestino: "/portais" as const,
        };
      });
  }
}
