import type { LicitacaoStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  historicoLicitacoesQuerySchema,
  type HistoricoLicitacoesQueryInput,
} from "@/server/schemas/historico-licitacoes.schema";
import {
  getInMemoryTenantLicitacao,
  listInMemoryLicitacoes,
  type LicitacaoRecord,
} from "./licitacoes-store";
import {
  buildOrderBySql,
  buildPrazoAbertoPrismaWhere,
  buildPrazoEncerradoPrismaWhere,
  compareLicitacoesGlobal,
} from "./oportunidades.service";

export type HistoricoLicitacaoItem = LicitacaoRecord & {
  prazoEncerrado: boolean;
  statusTenant: LicitacaoStatus | null;
};

export interface PaginatedHistoricoResult {
  ok: true;
  itens: HistoricoLicitacaoItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const LIMITE_ATE_500K = 500_000;
const LIMITE_2M = 2_000_000;

function parseInicioDiaBrt(iso: string): Date {
  return new Date(`${iso}T00:00:00.000-03:00`);
}

function parseFimDiaBrt(iso: string): Date {
  return new Date(`${iso}T23:59:59.999-03:00`);
}

function getDataLimite(rec: {
  dataEncerramentoProposta?: Date | null;
  dataAbertura: Date;
}): Date {
  return rec.dataEncerramentoProposta
    ? new Date(rec.dataEncerramentoProposta)
    : new Date(rec.dataAbertura);
}

export async function listHistoricoLicitacoesPaginado(
  rawQuery: HistoricoLicitacoesQueryInput | Record<string, unknown>,
  tenantId?: string | null,
): Promise<PaginatedHistoricoResult> {
  const query = historicoLicitacoesQuerySchema.parse(rawQuery);
  const agora = new Date();
  const dataInicioDt = parseInicioDiaBrt(query.dataInicio);
  const dataFimDt = parseFimDiaBrt(query.dataFim);

  const and: Prisma.LicitacaoWhereInput[] = [
    {
      OR: [
        {
          dataEncerramentoProposta: {
            gte: dataInicioDt,
            lte: dataFimDt,
          },
        },
        {
          AND: [
            { dataEncerramentoProposta: null },
            { dataAbertura: { gte: dataInicioDt, lte: dataFimDt } },
          ],
        },
      ],
    },
  ];

  if (query.situacaoPrazo === "ENCERRADAS") {
    and.push(buildPrazoEncerradoPrismaWhere(agora));
  } else if (query.situacaoPrazo === "ABERTAS") {
    and.push(buildPrazoAbertoPrismaWhere(agora));
  }

  if (query.segmento) {
    const segs = query.segmento
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segs.length === 1) {
      and.push({ segmentoMacro: segs[0] });
    } else if (segs.length > 1) {
      and.push({ segmentoMacro: { in: segs } });
    }
  }

  if (query.subsegmento) {
    and.push({ subcategorias: { array_contains: [query.subsegmento] } });
  }

  if (query.uf) {
    const ufs = query.uf
      .split(",")
      .map((u) => u.trim().toUpperCase())
      .filter(Boolean);
    if (ufs.length === 1) {
      and.push({ uf: ufs[0] });
    } else if (ufs.length > 1) {
      and.push({ uf: { in: ufs } });
    }
  }

  const valorCondition: Prisma.FloatFilter = {};
  if (query.faixaValor === "ATE_100K") {
    valorCondition.lte = 100_000;
  } else if (query.faixaValor === "100K_A_200K") {
    valorCondition.gt = 100_000;
    valorCondition.lte = 200_000;
  } else if (query.faixaValor === "200K_A_500K") {
    valorCondition.gt = 200_000;
    valorCondition.lte = 500_000;
  } else if (query.faixaValor === "500K_A_1M") {
    valorCondition.gt = 500_000;
    valorCondition.lte = 1_000_000;
  } else if (query.faixaValor === "1M_A_2M") {
    valorCondition.gt = 1_000_000;
    valorCondition.lte = 2_000_000;
  } else if (query.faixaValor === "ACIMA_2M") {
    valorCondition.gt = 2_000_000;
  } else if (query.faixaValor === "ATE_500K") {
    valorCondition.lte = LIMITE_ATE_500K;
  } else if (query.faixaValor === "500K_A_2M") {
    valorCondition.gt = LIMITE_ATE_500K;
    valorCondition.lte = LIMITE_2M;
  }
  if (query.valorMin !== undefined) {
    valorCondition.gte = query.valorMin;
  }
  if (query.valorMax !== undefined) {
    valorCondition.lte = query.valorMax;
  }
  if (Object.keys(valorCondition).length > 0) {
    and.push({ valorEstimado: valorCondition });
  }

  if (query.busca) {
    const busca = query.busca;
    and.push({
      OR: [
        { orgaoNome: { contains: busca, mode: "insensitive" } },
        { miniResumo: { contains: busca, mode: "insensitive" } },
        { resumo: { contains: busca, mode: "insensitive" } },
        { numeroEdital: { contains: busca, mode: "insensitive" } },
      ],
    });
  }

  const where: Prisma.LicitacaoWhereInput = { AND: and };
  const orderBy = buildOrderBySql(query.sortBy, query.sortDir);
  const { page, pageSize } = query;

  try {
    const [totalDb, dbPage] = await Promise.all([
      prisma.licitacao.count({ where }),
      prisma.licitacao.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const statusTenantPorId = new Map<string, LicitacaoStatus>();
    if (tenantId && dbPage.length > 0) {
      const pageIds = dbPage.map((r) => r.id);
      const tRows = await prisma.tenantLicitacao
        .findMany({
          where: { tenantId, licitacaoId: { in: pageIds } },
          select: { licitacaoId: true, statusKanban: true },
        })
        .catch(() => []);
      for (const tr of tRows) {
        statusTenantPorId.set(tr.licitacaoId, tr.statusKanban);
      }
    }

    const itens: HistoricoLicitacaoItem[] = dbPage.map((rec) => {
      const prazoEncerrado = getDataLimite(rec).getTime() < agora.getTime();
      return {
        ...rec,
        prazoEncerrado,
        statusTenant: statusTenantPorId.get(rec.id) ?? null,
      };
    });

    return {
      ok: true,
      itens,
      total: totalDb,
      page,
      pageSize,
      totalPages: Math.ceil(totalDb / pageSize) || 1,
    };
  } catch {
    // PostgreSQL indisponível: fallback equivalente em memória (CI/testes)
    const filtrados = listInMemoryLicitacoes().filter((rec) => {
      const limite = getDataLimite(rec);
      if (
        limite.getTime() < dataInicioDt.getTime() ||
        limite.getTime() > dataFimDt.getTime()
      ) {
        return false;
      }

      const encerrado = limite.getTime() < agora.getTime();
      if (query.situacaoPrazo === "ENCERRADAS" && !encerrado) return false;
      if (query.situacaoPrazo === "ABERTAS" && encerrado) return false;

      if (query.segmento) {
        const segs = query.segmento
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const macro = (rec as { segmentoMacro?: string | null }).segmentoMacro;
        if (segs.length > 0 && (!macro || !segs.includes(macro))) {
          return false;
        }
      }

      if (query.subsegmento) {
        const subs = Array.isArray((rec as { subcategorias?: unknown }).subcategorias)
          ? ((rec as { subcategorias?: string[] }).subcategorias ?? [])
          : [];
        if (!subs.includes(query.subsegmento)) return false;
      }

      if (query.uf) {
        const ufs = query.uf
          .split(",")
          .map((u) => u.trim().toUpperCase())
          .filter(Boolean);
        if (ufs.length > 0 && !ufs.includes(rec.uf.toUpperCase())) {
          return false;
        }
      }

      const val = rec.valorEstimado;
      if (query.faixaValor === "ATE_100K" && val > 100_000) return false;
      if (query.faixaValor === "100K_A_200K" && (val <= 100_000 || val > 200_000)) return false;
      if (query.faixaValor === "200K_A_500K" && (val <= 200_000 || val > 500_000)) return false;
      if (query.faixaValor === "500K_A_1M" && (val <= 500_000 || val > 1_000_000)) return false;
      if (query.faixaValor === "1M_A_2M" && (val <= 1_000_000 || val > 2_000_000)) return false;
      if (query.faixaValor === "ACIMA_2M" && val <= 2_000_000) return false;
      if (query.faixaValor === "ATE_500K" && val > LIMITE_ATE_500K) return false;
      if (query.faixaValor === "500K_A_2M" && (val <= LIMITE_ATE_500K || val > LIMITE_2M)) return false;
      if (query.valorMin !== undefined && val < query.valorMin) return false;
      if (query.valorMax !== undefined && val > query.valorMax) return false;

      if (query.busca) {
        const termo = query.busca.toLowerCase();
        const texto = [
          rec.orgaoNome,
          rec.miniResumo,
          rec.resumo,
          rec.numeroEdital,
        ]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();
        if (!texto.includes(termo)) return false;
      }

      return true;
    });

    filtrados.sort((a, b) =>
      compareLicitacoesGlobal(a, b, query.sortBy, query.sortDir),
    );

    const total = filtrados.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const slice = filtrados.slice(startIndex, startIndex + pageSize);

    const itens: HistoricoLicitacaoItem[] = slice.map((rec) => {
      const tl = tenantId ? getInMemoryTenantLicitacao(tenantId, rec.id) : null;
      return {
        ...rec,
        prazoEncerrado: getDataLimite(rec).getTime() < agora.getTime(),
        statusTenant: (tl?.statusKanban as LicitacaoStatus) ?? null,
      };
    });

    return {
      ok: true,
      itens,
      total,
      page,
      pageSize,
      totalPages,
    };
  }
}
