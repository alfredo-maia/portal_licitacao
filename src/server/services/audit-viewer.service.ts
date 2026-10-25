import { prisma } from "@/lib/prisma";
import { getInMemoryAuditLogs } from "@/server/audit";
import {
  type AuditViewerItem,
  type AuditViewerListResponse,
  type AuditViewerQuery,
  auditViewerQuerySchema,
} from "@/server/schemas/audit-viewer.schema";

export async function listarAuditLogs(
  rawQuery?: Partial<AuditViewerQuery>,
): Promise<AuditViewerListResponse> {
  const query = auditViewerQuerySchema.parse(rawQuery ?? {});

  try {
    const where: any = {};
    if (query.entidadeTipo) where.entidadeTipo = query.entidadeTipo;
    if (query.acao) where.acao = query.acao;
    if (query.usuarioId) where.usuarioId = query.usuarioId;
    if (query.busca) {
      where.OR = [
        { acao: { contains: query.busca, mode: "insensitive" } },
        { entidadeTipo: { contains: query.busca, mode: "insensitive" } },
        { entidadeId: { contains: query.busca, mode: "insensitive" } },
        { usuarioNome: { contains: query.busca, mode: "insensitive" } },
      ];
    }

    const [total, doDb] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { ocorridoEm: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const logs: AuditViewerItem[] = doDb.map((l) => ({
      id: l.id,
      ocorridoEm: l.ocorridoEm,
      usuarioId: l.usuarioId,
      usuarioNome: l.usuarioNome,
      ip: l.ip,
      acao: l.acao,
      entidadeTipo: l.entidadeTipo,
      entidadeId: l.entidadeId,
      antes: (l.antes as any) || null,
      depois: (l.depois as any) || null,
    }));

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      logs,
    };
  } catch {
    // Fallback em memória
    let logs = [...getInMemoryAuditLogs()];
    if (query.entidadeTipo) {
      logs = logs.filter((l) => l.entidadeTipo === query.entidadeTipo);
    }
    if (query.acao) {
      logs = logs.filter((l) => l.acao === query.acao);
    }
    if (query.usuarioId) {
      logs = logs.filter((l) => l.usuarioId === query.usuarioId);
    }
    if (query.busca) {
      const termo = query.busca.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.acao.toLowerCase().includes(termo) ||
          l.entidadeTipo.toLowerCase().includes(termo) ||
          l.entidadeId.toLowerCase().includes(termo) ||
          (l.usuarioNome && l.usuarioNome.toLowerCase().includes(termo)),
      );
    }

    // Ordenação desc por data
    logs.sort((a, b) => new Date(b.ocorridoEm).getTime() - new Date(a.ocorridoEm).getTime());

    const total = logs.length;
    const paginado = logs.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    return {
      ok: true,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      logs: paginado.map((l) => ({
        id: l.id,
        ocorridoEm: new Date(l.ocorridoEm),
        usuarioId: l.usuarioId ?? null,
        usuarioNome: l.usuarioNome ?? null,
        ip: l.ip ?? null,
        acao: l.acao,
        entidadeTipo: l.entidadeTipo,
        entidadeId: l.entidadeId,
        antes: (l.antes as any) ?? null,
        depois: (l.depois as any) ?? null,
      })),
    };
  }
}

/**
 * Sanitiza valores para prevenção de CSV Formula Injection (OWASP / RFC 4180).
 */
function sanitizarCelulaCsv(valor: any): string {
  if (valor === null || valor === undefined) return '""';
  let str = typeof valor === "object" ? JSON.stringify(valor) : String(valor);

  // Previne injeção de fórmulas iniciadas com '=', '+', '-', '@'
  if (str.length > 0 && ["=", "+", "-", "@"].includes(str[0])) {
    str = "'" + str;
  }

  // Escapa aspas duplas
  const escapado = str.replace(/"/g, '""');
  return `"${escapado}"`;
}

export async function exportarAuditLogsCsv(
  rawQuery?: Partial<AuditViewerQuery>,
): Promise<string> {
  const query = { ...(rawQuery ?? {}), page: 1, pageSize: 1000 };
  const resultado = await listarAuditLogs(query);

  const colunas = [
    "ID",
    "DATA_HORA",
    "USUARIO",
    "ACAO",
    "ENTIDADE_TIPO",
    "ENTIDADE_ID",
    "ANTES",
    "DEPOIS",
  ];

  const linhas = [colunas.join(",")];

  for (const log of resultado.logs) {
    const dataIso = new Date(log.ocorridoEm).toISOString();
    const linha = [
      sanitizarCelulaCsv(log.id),
      sanitizarCelulaCsv(dataIso),
      sanitizarCelulaCsv(log.usuarioNome || log.usuarioId || "Sistema"),
      sanitizarCelulaCsv(log.acao),
      sanitizarCelulaCsv(log.entidadeTipo),
      sanitizarCelulaCsv(log.entidadeId),
      sanitizarCelulaCsv(log.antes),
      sanitizarCelulaCsv(log.depois),
    ];
    linhas.push(linha.join(","));
  }

  return linhas.join("\r\n");
}
