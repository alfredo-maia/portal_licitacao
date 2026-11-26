import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTipoSistemaNome } from "@/config/tipos-sistema";
import {
  STATUS_PIPELINE_ATIVO,
  STATUS_EM_PRECIFICACAO,
  OPERACAO_TIMEZONE,
} from "@/server/schemas/status-grupos.schema";
import {
  type DashboardQuery,
  type DashboardResponse,
  dashboardQuerySchema,
} from "@/server/schemas/dashboard.schema";
import {
  CATALOGO_MACRO_SEGMENTOS,
  type MacroSegmento,
} from "@/server/schemas/segmentos.schema";
import {
  listInMemoryLicitacoes,
  listInMemoryStatusHistorico,
  listInMemoryTenantLicitacoes,
  type LicitacaoRecord,
  type StatusHistoricoRecord,
} from "./licitacoes-store";
import {
  buildPrazoAbertoPrismaWhere,
  buildSegmentosSubsegmentosPrismaWhere,
} from "./oportunidades.service";

interface TenantDeliberacaoInfo {
  statusKanban: string;
  dataDecisao: Date | null;
}

function getDataPublicacaoRef(l: {
  dataPublicacaoPncp?: Date | null;
  createdAt: Date;
}): Date {
  return l.dataPublicacaoPncp ? new Date(l.dataPublicacaoPncp) : new Date(l.createdAt);
}

function getDataLimiteRef(l: {
  dataEncerramentoProposta?: Date | null;
  dataAbertura: Date;
}): Date {
  return l.dataEncerramentoProposta
    ? new Date(l.dataEncerramentoProposta)
    : new Date(l.dataAbertura);
}

function passaSubsegmentosPerfil(
  macro: string | null | undefined,
  subs: string[],
  subsegmentosTenant?: string[],
): boolean {
  if (!subsegmentosTenant || subsegmentosTenant.length === 0) return true;
  if (!macro || macro === "OUTROS") return false;
  const def = CATALOGO_MACRO_SEGMENTOS[macro as MacroSegmento];
  if (!def) return false;
  const restringiu = def.subcategorias.some((s) =>
    subsegmentosTenant.includes(s.codigo),
  );
  if (!restringiu) return true;
  if (subs.length === 0) return false;
  return subs.some((codigo) => subsegmentosTenant.includes(codigo));
}

function buildPerfilPrismaWhere(
  segmentosTenantAtivo?: string[],
  subsegmentosTenantAtivo?: string[],
  ufsTenantAtivo?: string[],
): Prisma.LicitacaoWhereInput {
  const and: Prisma.LicitacaoWhereInput[] = [];

  if (segmentosTenantAtivo && segmentosTenantAtivo.length > 0) {
    const segWhere = buildSegmentosSubsegmentosPrismaWhere(
      segmentosTenantAtivo,
      subsegmentosTenantAtivo,
    );
    const hasLegacyTipo = segmentosTenantAtivo.some(
      (s) => !(s in CATALOGO_MACRO_SEGMENTOS),
    );
    if (hasLegacyTipo) {
      and.push({
        OR: [
          segWhere,
          { tipoSistemaCodigo: { in: segmentosTenantAtivo } },
        ],
      });
    } else if (Object.keys(segWhere).length > 0) {
      and.push(segWhere);
    }
  } else if (subsegmentosTenantAtivo && subsegmentosTenantAtivo.length > 0) {
    const subWhere = buildSegmentosSubsegmentosPrismaWhere(
      undefined,
      subsegmentosTenantAtivo,
    );
    if (Object.keys(subWhere).length > 0) {
      and.push(subWhere);
    }
  }

  if (ufsTenantAtivo && ufsTenantAtivo.length > 0) {
    and.push(
      ufsTenantAtivo.length === 1
        ? { uf: ufsTenantAtivo[0] }
        : { uf: { in: ufsTenantAtivo } },
    );
  }

  return and.length > 0 ? { AND: and } : {};
}

function matchesPerfilInMemory(
  l: LicitacaoRecord,
  segmentosTenantAtivo?: string[],
  subsegmentosTenantAtivo?: string[],
  ufsTenantAtivo?: string[],
): boolean {
  if (segmentosTenantAtivo && segmentosTenantAtivo.length > 0) {
    const macro = (l as { segmentoMacro?: string | null }).segmentoMacro;
    const tipo = l.tipoSistemaCodigo;
    const bateMacro = Boolean(macro && segmentosTenantAtivo.includes(macro));
    const bateTipoLegado = Boolean(tipo && segmentosTenantAtivo.includes(tipo));
    if (!bateMacro && !bateTipoLegado) {
      return false;
    }
    if (bateMacro) {
      const subs = Array.isArray((l as { subcategorias?: unknown }).subcategorias)
        ? ((l as { subcategorias?: string[] }).subcategorias ?? [])
        : [];
      if (!passaSubsegmentosPerfil(macro, subs, subsegmentosTenantAtivo)) {
        return false;
      }
    }
  } else if (subsegmentosTenantAtivo && subsegmentosTenantAtivo.length > 0) {
    const macro = (l as { segmentoMacro?: string | null }).segmentoMacro;
    const subs = Array.isArray((l as { subcategorias?: unknown }).subcategorias)
      ? ((l as { subcategorias?: string[] }).subcategorias ?? [])
      : [];
    if (!passaSubsegmentosPerfil(macro, subs, subsegmentosTenantAtivo)) {
      return false;
    }
  }

  if (
    ufsTenantAtivo &&
    ufsTenantAtivo.length > 0 &&
    !ufsTenantAtivo.includes(l.uf.toUpperCase())
  ) {
    return false;
  }

  return true;
}

export async function getDashboardData(
  rawQuery?: DashboardQuery,
): Promise<DashboardResponse> {
  const query = dashboardQuerySchema.parse(rawQuery ?? {});

  const agora = new Date();
  const anoPadrao = parseInt(
    agora.toLocaleDateString("en-US", { year: "numeric", timeZone: OPERACAO_TIMEZONE }),
    10,
  );
  const mesPadrao = parseInt(
    agora.toLocaleDateString("en-US", { month: "numeric", timeZone: OPERACAO_TIMEZONE }),
    10,
  );

  const mes = query.mes ?? mesPadrao;
  const ano = query.ano ?? anoPadrao;

  // Limites do mês (00:00:00 BRT do dia 1 até 00:00:00 BRT do dia 1 do próximo mês = +03:00 UTC)
  const inicioUtc = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fimUtc = new Date(Date.UTC(ano, mes, 1, 3, 0, 0, 0));
  const limite72h = new Date(agora.getTime() + 72 * 3600 * 1000);

  const { segmentosTenantAtivo, subsegmentosTenantAtivo, ufsTenantAtivo } = query;
  const tenantSemSegmentos =
    Boolean(query.tenantId) &&
    (!segmentosTenantAtivo || segmentosTenantAtivo.length === 0);

  const tenantDeliberacoes = new Map<string, TenantDeliberacaoInfo>();
  if (query.tenantId) {
    try {
      const records = await prisma.tenantLicitacao.findMany({
        where: { tenantId: query.tenantId },
        select: {
          licitacaoId: true,
          statusKanban: true,
          dataDecisao: true,
          atualizadoEm: true,
        },
      });
      for (const r of records) {
        tenantDeliberacoes.set(r.licitacaoId, {
          statusKanban: r.statusKanban,
          dataDecisao: r.dataDecisao ?? r.atualizadoEm ?? null,
        });
      }
    } catch {}

    for (const r of listInMemoryTenantLicitacoes(query.tenantId)) {
      tenantDeliberacoes.set(r.licitacaoId, {
        statusKanban: r.statusKanban,
        dataDecisao: r.dataDecisao ?? null,
      });
    }
  }

  const deliberatedIds = Array.from(tenantDeliberacoes.entries())
    .filter(([, info]) => info.statusKanban !== "PENDENTE")
    .map(([id]) => id);
  const kanbanAtivoIds = Array.from(tenantDeliberacoes.entries())
    .filter(([, info]) =>
      (STATUS_PIPELINE_ATIVO as readonly string[]).includes(info.statusKanban),
    )
    .map(([id]) => id);

  const publicadoNoMesWhere: Prisma.LicitacaoWhereInput = {
    OR: [
      { dataPublicacaoPncp: { gte: inicioUtc, lt: fimUtc } },
      {
        AND: [
          { dataPublicacaoPncp: null },
          { createdAt: { gte: inicioUtc, lt: fimUtc } },
        ],
      },
    ],
  };

  const prazoAbertoWhere = buildPrazoAbertoPrismaWhere(agora);
  const perfilWhere = buildPerfilPrismaWhere(
    segmentosTenantAtivo,
    subsegmentosTenantAtivo,
    ufsTenantAtivo,
  );

  // Tenta caminho 100% SQL agregado no PostgreSQL
  try {
    const pendenteBaseWhere: Prisma.LicitacaoWhereInput = {
      AND: [
        perfilWhere,
        prazoAbertoWhere,
        ...(query.tenantId
          ? deliberatedIds.length > 0
            ? [{ id: { notIn: deliberatedIds } }]
            : []
          : [{ status: "PENDENTE" as const }]),
      ],
    };

    const criticasPrazoWhere: Prisma.LicitacaoWhereInput = {
      OR: [
        { dataEncerramentoProposta: { gte: agora, lte: limite72h } },
        {
          AND: [
            { dataEncerramentoProposta: null },
            { dataAbertura: { gte: agora, lte: limite72h } },
          ],
        },
      ],
    };

    const [
      recebidasTotal,
      pendentesTotal,
      pendentesNoMes,
      deliberadasRows,
      historicoMes,
      viabilidadeGroups,
      topTipoGroups,
      criticasRows,
    ] = await Promise.all([
      tenantSemSegmentos
        ? Promise.resolve(0)
        : prisma.licitacao.count({
            where: { AND: [perfilWhere, publicadoNoMesWhere] },
          }),
      tenantSemSegmentos
        ? Promise.resolve(0)
        : prisma.licitacao.count({ where: pendenteBaseWhere }),
      tenantSemSegmentos
        ? Promise.resolve(0)
        : prisma.licitacao.count({
            where: { AND: [pendenteBaseWhere, publicadoNoMesWhere] },
          }),
      query.tenantId
        ? deliberatedIds.length > 0
          ? prisma.licitacao.findMany({
              where: { id: { in: deliberatedIds } },
              select: {
                id: true,
                numeroEdital: true,
                orgaoNome: true,
                dataAbertura: true,
                dataEncerramentoProposta: true,
                dataPublicacaoPncp: true,
                createdAt: true,
                valorEstimado: true,
                valorArrematado: true,
                status: true,
              },
            })
          : Promise.resolve([])
        : prisma.licitacao.findMany({
            where: {
              AND: [perfilWhere, { status: { not: "PENDENTE" } }],
            },
            select: {
              id: true,
              numeroEdital: true,
              orgaoNome: true,
              dataAbertura: true,
              dataEncerramentoProposta: true,
              dataPublicacaoPncp: true,
              createdAt: true,
              valorEstimado: true,
              valorArrematado: true,
              status: true,
            },
          }),
      query.tenantId
        ? deliberatedIds.length > 0
          ? prisma.licitacaoStatusHistorico.findMany({
              where: {
                licitacaoId: { in: deliberatedIds },
                ocorridoEm: { gte: inicioUtc, lt: fimUtc },
              },
            })
          : Promise.resolve([])
        : prisma.licitacaoStatusHistorico.findMany({
            where: { ocorridoEm: { gte: inicioUtc, lt: fimUtc } },
          }),
      tenantSemSegmentos
        ? Promise.resolve([])
        : prisma.licitacao.groupBy({
            by: ["parecerIA"],
            where: { AND: [perfilWhere, prazoAbertoWhere] },
            _count: { _all: true },
          }),
      tenantSemSegmentos
        ? Promise.resolve([])
        : prisma.licitacao.groupBy({
            by: ["tipoSistemaCodigo"],
            where: {
              AND: [
                perfilWhere,
                prazoAbertoWhere,
                { tipoSistemaCodigo: { not: null } },
              ],
            },
            _count: { tipoSistemaCodigo: true },
            orderBy: { _count: { tipoSistemaCodigo: "desc" } },
            take: 4,
          }),
      tenantSemSegmentos && kanbanAtivoIds.length === 0
        ? Promise.resolve([])
        : prisma.licitacao.findMany({
            where: {
              AND: [
                criticasPrazoWhere,
                query.tenantId
                  ? {
                      OR: [
                        ...(!tenantSemSegmentos ? [pendenteBaseWhere] : []),
                        ...(kanbanAtivoIds.length > 0
                          ? [{ id: { in: kanbanAtivoIds } }]
                          : []),
                      ],
                    }
                  : {
                      AND: [
                        perfilWhere,
                        {
                          status: {
                            in: [
                              "PENDENTE",
                              ...(STATUS_PIPELINE_ATIVO as readonly string[]),
                            ] as any,
                          },
                        },
                      ],
                    },
              ],
            },
            select: {
              id: true,
              numeroEdital: true,
              orgaoNome: true,
              dataAbertura: true,
              dataEncerramentoProposta: true,
              status: true,
            },
            orderBy: [{ dataEncerramentoProposta: "asc" }, { dataAbertura: "asc" }],
            take: 50,
          }),
    ]);

    const getStatusRow = (row: { id: string; status: string }): string =>
      query.tenantId
        ? (tenantDeliberacoes.get(row.id)?.statusKanban ?? "PENDENTE")
        : row.status;

    const teveTransicaoNoMes = (licId: string, statusAlvo: string): boolean => {
      if (query.tenantId) {
        // Isolamento estrito por tenant: licitacao_status_historico não tem tenantId,
        // portanto avaliamos exclusivamente dataDecisao do tenant_licitacao.
        const info = tenantDeliberacoes.get(licId);
        return Boolean(
          info?.dataDecisao &&
            info.dataDecisao >= inicioUtc &&
            info.dataDecisao < fimUtc,
        );
      }
      return historicoMes.some(
        (h) =>
          h.licitacaoId === licId &&
          h.statusNovo === statusAlvo &&
          h.ocorridoEm >= inicioUtc &&
          h.ocorridoEm < fimUtc,
      );
    };

    const publicadoNoMes = (row: {
      dataPublicacaoPncp: Date | null;
      createdAt: Date;
    }): boolean => {
      const ref = getDataPublicacaoRef(row);
      return ref >= inicioUtc && ref < fimUtc;
    };

    const emPrecificacaoTotal = deliberadasRows.filter((l) => {
      const st = getStatusRow(l);
      if (!(STATUS_EM_PRECIFICACAO as readonly string[]).includes(st)) {
        return false;
      }
      return teveTransicaoNoMes(l.id, "ACEITA") || publicadoNoMes(l);
    }).length;

    const recusadasTotal = deliberadasRows.filter((l) => {
      const st = getStatusRow(l);
      if (st !== "RECUSADA") return false;
      return teveTransicaoNoMes(l.id, "RECUSADA") || publicadoNoMes(l);
    }).length;

    const contempladas = deliberadasRows.filter((l) => {
      const st = getStatusRow(l);
      if (st !== "CONTEMPLADA") return false;
      return teveTransicaoNoMes(l.id, "CONTEMPLADA") || publicadoNoMes(l);
    });
    const contempladasQtd = contempladas.length;
    const contempladasValor = contempladas.reduce(
      (sum, c) => sum + (c.valorArrematado ?? c.valorEstimado ?? 0),
      0,
    );

    const perdidasPrecoTotal = deliberadasRows.filter(
      (l) =>
        getStatusRow(l) === "NAO_CONTEMPLADA_PRECO" &&
        (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_PRECO") || publicadoNoMes(l)),
    ).length;

    const perdidasDocTotal = deliberadasRows.filter(
      (l) =>
        getStatusRow(l) === "NAO_CONTEMPLADA_DOCUMENTACAO" &&
        (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_DOCUMENTACAO") ||
          publicadoNoMes(l)),
    ).length;

    const desistenciasTotal = deliberadasRows.filter(
      (l) =>
        getStatusRow(l) === "NAO_CONTEMPLADA_DESISTENCIA" &&
        (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_DESISTENCIA") ||
          publicadoNoMes(l)),
    ).length;

    const impugnadasTotal = deliberadasRows.filter(
      (l) =>
        getStatusRow(l) === "IMPUGNADA" &&
        (teveTransicaoNoMes(l.id, "IMPUGNADA") || publicadoNoMes(l)),
    ).length;

    const denominadorConversao =
      contempladasQtd + perdidasPrecoTotal + perdidasDocTotal;
    const taxaConversaoPercentual =
      denominadorConversao > 0
        ? Math.round((contempladasQtd / denominadorConversao) * 1000) / 10
        : null;

    const volumeEmDisputa = deliberadasRows
      .filter((l) =>
        (STATUS_PIPELINE_ATIVO as readonly string[]).includes(getStatusRow(l)),
      )
      .reduce((sum, l) => sum + (l.valorEstimado ?? 0), 0);

    let totalAnalisadas = 0;
    let totalGo = 0;
    let totalNoGo = 0;
    for (const grp of viabilidadeGroups) {
      const cnt = grp._count._all;
      totalAnalisadas += cnt;
      if (grp.parecerIA === "GO") totalGo += cnt;
      if (grp.parecerIA === "NO_GO") totalNoGo += cnt;
    }

    const goPercentual =
      totalAnalisadas > 0
        ? Math.round((totalGo / totalAnalisadas) * 1000) / 10
        : null;
    const noGoPercentual =
      totalAnalisadas > 0
        ? Math.round((totalNoGo / totalAnalisadas) * 1000) / 10
        : null;

    const criticas = criticasRows
      .map((l) => {
        const dataPrazo = getDataLimiteRef(l);
        const diffSegundos = Math.max(
          0,
          Math.floor((dataPrazo.getTime() - agora.getTime()) / 1000),
        );
        return {
          id: l.id,
          numeroEdital: l.numeroEdital,
          orgaoNome: l.orgaoNome,
          dataAbertura: l.dataAbertura,
          dataEncerramentoProposta: l.dataEncerramentoProposta ?? l.dataAbertura,
          segundosRestantes: diffSegundos,
          status: getStatusRow(l),
        };
      })
      .sort((a, b) => a.segundosRestantes - b.segundosRestantes);

    const topTipos = topTipoGroups
      .filter((g) => Boolean(g.tipoSistemaCodigo) && (g._count.tipoSistemaCodigo ?? 0) > 0)
      .slice(0, 4)
      .map((g, idx) => ({
        posicao: idx + 1,
        tipoSistemaCodigo: g.tipoSistemaCodigo as any,
        nome: getTipoSistemaNome(g.tipoSistemaCodigo as any),
        total: g._count.tipoSistemaCodigo,
      }));

    return {
      ok: true,
      periodo: { mes, ano, inicioUtc, fimUtc },
      cards: {
        recebidas: { total: recebidasTotal },
        aguardandoDecisao: {
          total: pendentesTotal,
          recebidasNoMes: pendentesNoMes,
        },
        emPrecificacao: { total: emPrecificacaoTotal },
        recusadas: { total: recusadasTotal },
      },
      resultados: {
        contempladas: { total: contempladasQtd, valorTotal: contempladasValor },
        perdidasPreco: { total: perdidasPrecoTotal },
        perdidasDocumentacao: { total: perdidasDocTotal },
        desistencias: { total: desistenciasTotal },
        impugnadas: { total: impugnadasTotal },
        taxaConversaoPercentual,
      },
      indicadores: {
        volumeEmDisputa,
        viabilidadeIA: {
          totalAnalisadas,
          goPercentual,
          noGoPercentual,
        },
        criticas72h: criticas,
      },
      topTipos,
    };
  } catch {
    // PostgreSQL indisponível: fallback em memória com semântica idêntica (CI/testes)
  }

  const allMemory = listInMemoryLicitacoes();
  const historico: StatusHistoricoRecord[] = listInMemoryStatusHistorico();

  const getLicitacaoStatus = (l: LicitacaoRecord): string => {
    if (query.tenantId) {
      return tenantDeliberacoes.get(l.id)?.statusKanban || "PENDENTE";
    }
    return l.status;
  };

  const isPrazoAberto = (l: LicitacaoRecord): boolean =>
    getDataLimiteRef(l).getTime() >= agora.getTime();

  const publicadoNoMes = (l: LicitacaoRecord): boolean => {
    const ref = getDataPublicacaoRef(l);
    return ref >= inicioUtc && ref < fimUtc;
  };

  const licitacoesPerfil = tenantSemSegmentos
    ? []
    : allMemory.filter((l) =>
        matchesPerfilInMemory(
          l,
          segmentosTenantAtivo,
          subsegmentosTenantAtivo,
          ufsTenantAtivo,
        ),
      );

  // Deliberadas pelo tenant (inclui OUTROS / outras UFs resgatadas via Histórico)
  const licitacoesDeliberadas = query.tenantId
    ? allMemory.filter((l) => {
        const info = tenantDeliberacoes.get(l.id);
        return Boolean(info && info.statusKanban !== "PENDENTE");
      })
    : licitacoesPerfil.filter((l) => l.status !== "PENDENTE");

  const recebidasTotal = licitacoesPerfil.filter(publicadoNoMes).length;

  const pendentesVigentes = licitacoesPerfil.filter(
    (l) => getLicitacaoStatus(l) === "PENDENTE" && isPrazoAberto(l),
  );
  const pendentesTotal = pendentesVigentes.length;
  const pendentesNoMes = pendentesVigentes.filter(publicadoNoMes).length;

  function teveTransicaoNoMes(licId: string, statusAlvo: string): boolean {
    if (query.tenantId) {
      const info = tenantDeliberacoes.get(licId);
      return Boolean(
        info?.dataDecisao &&
          info.dataDecisao >= inicioUtc &&
          info.dataDecisao < fimUtc,
      );
    }
    return historico.some(
      (h) =>
        h.licitacaoId === licId &&
        h.statusNovo === statusAlvo &&
        h.ocorridoEm >= inicioUtc &&
        h.ocorridoEm < fimUtc,
    );
  }

  const emPrecificacaoTotal = licitacoesDeliberadas.filter((l) => {
    const st = getLicitacaoStatus(l);
    if (!(STATUS_EM_PRECIFICACAO as readonly string[]).includes(st)) {
      return false;
    }
    return teveTransicaoNoMes(l.id, "ACEITA") || publicadoNoMes(l);
  }).length;

  const recusadasTotal = licitacoesDeliberadas.filter((l) => {
    const st = getLicitacaoStatus(l);
    if (st !== "RECUSADA") return false;
    return teveTransicaoNoMes(l.id, "RECUSADA") || publicadoNoMes(l);
  }).length;

  const contempladas = licitacoesDeliberadas.filter((l) => {
    const st = getLicitacaoStatus(l);
    if (st !== "CONTEMPLADA") return false;
    return teveTransicaoNoMes(l.id, "CONTEMPLADA") || publicadoNoMes(l);
  });
  const contempladasQtd = contempladas.length;
  const contempladasValor = contempladas.reduce(
    (sum, c) => sum + (c.valorArrematado ?? c.valorEstimado ?? 0),
    0,
  );

  const perdidasPrecoTotal = licitacoesDeliberadas.filter(
    (l) =>
      getLicitacaoStatus(l) === "NAO_CONTEMPLADA_PRECO" &&
      (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_PRECO") || publicadoNoMes(l)),
  ).length;

  const perdidasDocTotal = licitacoesDeliberadas.filter(
    (l) =>
      getLicitacaoStatus(l) === "NAO_CONTEMPLADA_DOCUMENTACAO" &&
      (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_DOCUMENTACAO") ||
        publicadoNoMes(l)),
  ).length;

  const desistenciasTotal = licitacoesDeliberadas.filter(
    (l) =>
      getLicitacaoStatus(l) === "NAO_CONTEMPLADA_DESISTENCIA" &&
      (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_DESISTENCIA") ||
        publicadoNoMes(l)),
  ).length;

  const impugnadasTotal = licitacoesDeliberadas.filter(
    (l) =>
      getLicitacaoStatus(l) === "IMPUGNADA" &&
      (teveTransicaoNoMes(l.id, "IMPUGNADA") || publicadoNoMes(l)),
  ).length;

  const denominadorConversao =
    contempladasQtd + perdidasPrecoTotal + perdidasDocTotal;
  const taxaConversaoPercentual =
    denominadorConversao > 0
      ? Math.round((contempladasQtd / denominadorConversao) * 1000) / 10
      : null;

  const volumeEmDisputa = licitacoesDeliberadas
    .filter((l) =>
      (STATUS_PIPELINE_ATIVO as readonly string[]).includes(getLicitacaoStatus(l)),
    )
    .reduce((sum, l) => sum + (l.valorEstimado ?? 0), 0);

  const vigentesPerfil = licitacoesPerfil.filter(isPrazoAberto);
  const totalAnalisadas = vigentesPerfil.filter((l) => l.parecerIA !== null).length;
  const totalGo = vigentesPerfil.filter((l) => l.parecerIA === "GO").length;
  const totalNoGo = vigentesPerfil.filter((l) => l.parecerIA === "NO_GO").length;

  const goPercentual =
    totalAnalisadas > 0
      ? Math.round((totalGo / totalAnalisadas) * 1000) / 10
      : null;
  const noGoPercentual =
    totalAnalisadas > 0
      ? Math.round((totalNoGo / totalAnalisadas) * 1000) / 10
      : null;

  const criticasMap = new Map<string, LicitacaoRecord>();
  for (const l of [...pendentesVigentes, ...licitacoesDeliberadas]) {
    const st = getLicitacaoStatus(l);
    const dataPrazo = getDataLimiteRef(l);
    if (
      dataPrazo >= agora &&
      dataPrazo <= limite72h &&
      (st === "PENDENTE" ||
        (STATUS_PIPELINE_ATIVO as readonly string[]).includes(st))
    ) {
      criticasMap.set(l.id, l);
    }
  }

  const criticas = Array.from(criticasMap.values())
    .map((l) => {
      const dataPrazo = getDataLimiteRef(l);
      const diffSegundos = Math.max(
        0,
        Math.floor((dataPrazo.getTime() - agora.getTime()) / 1000),
      );
      return {
        id: l.id,
        numeroEdital: l.numeroEdital,
        orgaoNome: l.orgaoNome,
        dataAbertura: l.dataAbertura,
        dataEncerramentoProposta: l.dataEncerramentoProposta ?? l.dataAbertura,
        segundosRestantes: diffSegundos,
        status: getLicitacaoStatus(l),
      };
    })
    .sort((a, b) => a.segundosRestantes - b.segundosRestantes);

  const contagemPorTipo = new Map<string, number>();
  for (const l of vigentesPerfil) {
    if (l.tipoSistemaCodigo) {
      contagemPorTipo.set(
        l.tipoSistemaCodigo,
        (contagemPorTipo.get(l.tipoSistemaCodigo) ?? 0) + 1,
      );
    }
  }

  const topTipos = Array.from(contagemPorTipo.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([codigo, total], idx) => ({
      posicao: idx + 1,
      tipoSistemaCodigo: codigo as any,
      nome: getTipoSistemaNome(codigo as any),
      total,
    }));

  return {
    ok: true,
    periodo: { mes, ano, inicioUtc, fimUtc },
    cards: {
      recebidas: { total: recebidasTotal },
      aguardandoDecisao: {
        total: pendentesTotal,
        recebidasNoMes: pendentesNoMes,
      },
      emPrecificacao: { total: emPrecificacaoTotal },
      recusadas: { total: recusadasTotal },
    },
    resultados: {
      contempladas: { total: contempladasQtd, valorTotal: contempladasValor },
      perdidasPreco: { total: perdidasPrecoTotal },
      perdidasDocumentacao: { total: perdidasDocTotal },
      desistencias: { total: desistenciasTotal },
      impugnadas: { total: impugnadasTotal },
      taxaConversaoPercentual,
    },
    indicadores: {
      volumeEmDisputa,
      viabilidadeIA: {
        totalAnalisadas,
        goPercentual,
        noGoPercentual,
      },
      criticas72h: criticas,
    },
    topTipos,
  };
}
