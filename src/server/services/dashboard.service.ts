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
  listInMemoryLicitacoes,
  listInMemoryStatusHistorico,
  type LicitacaoRecord,
  type StatusHistoricoRecord,
} from "./licitacoes-store";

export async function getDashboardData(
  rawQuery?: DashboardQuery,
): Promise<DashboardResponse> {
  const query = dashboardQuerySchema.parse(rawQuery ?? {});

  const agora = new Date();
  // Determina mês e ano padrão no fuso de Brasília
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

  let licitacoes: LicitacaoRecord[] = [];
  let historico: StatusHistoricoRecord[] = [];

  const { segmentosTenantAtivo } = query;

  const tenantDeliberacoes = new Map<string, string>();
  if (query.tenantId) {
    try {
      const records = await prisma.tenantLicitacao.findMany({
        where: { tenantId: query.tenantId },
      });
      for (const r of records) {
        tenantDeliberacoes.set(r.licitacaoId, r.statusKanban);
      }
    } catch {}
  }

  const getLicitacaoStatus = (l: LicitacaoRecord): string => {
    if (query.tenantId) {
      return tenantDeliberacoes.get(l.id) || "PENDENTE";
    }
    return l.status;
  };

  try {
    const whereClause: any = {};
    if (segmentosTenantAtivo && segmentosTenantAtivo.length > 0) {
      whereClause.OR = [
        { segmentoMacro: { in: segmentosTenantAtivo } },
        { tipoSistemaCodigo: { in: segmentosTenantAtivo as any } },
      ];
    }
    licitacoes = await prisma.licitacao.findMany({ where: whereClause });
    historico = await prisma.licitacaoStatusHistorico.findMany();
  } catch (err) {
    console.error("[getDashboardData] Erro ao buscar no banco:", err);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      const whereClause: any = {};
      if (segmentosTenantAtivo && segmentosTenantAtivo.length > 0) {
        whereClause.OR = [
          { segmentoMacro: { in: segmentosTenantAtivo } },
          { tipoSistemaCodigo: { in: segmentosTenantAtivo as any } },
        ];
      }
      licitacoes = await prisma.licitacao.findMany({ where: whereClause });
      historico = await prisma.licitacaoStatusHistorico.findMany();
    } catch {
      licitacoes = listInMemoryLicitacoes().filter((l) => {
        if (!segmentosTenantAtivo || segmentosTenantAtivo.length === 0) return true;
        const macro = (l as any).segmentoMacro;
        const tipo = l.tipoSistemaCodigo;
        return (
          (macro && segmentosTenantAtivo.includes(macro)) ||
          (tipo && segmentosTenantAtivo.includes(tipo as any))
        );
      });
      historico = listInMemoryStatusHistorico();
    }
  }

  // 1. Linha 1 — Cards Mensais
  // Recebidas no mês (criadas dentro do intervalo)
  const recebidasTotal = licitacoes.filter(
    (l) => l.createdAt >= inicioUtc && l.createdAt < fimUtc,
  ).length;

  // Backlog total aguardando decisão (independente de data)
  const pendentesTotal = licitacoes.filter((l) => getLicitacaoStatus(l) === "PENDENTE").length;
  // Recebidas no mês que estão pendentes
  const pendentesNoMes = licitacoes.filter(
    (l) =>
      getLicitacaoStatus(l) === "PENDENTE" &&
      l.createdAt >= inicioUtc &&
      l.createdAt < fimUtc,
  ).length;

  // Helper para buscar última transição no mês
  function teveTransicaoNoMes(licId: string, statusAlvo: string): boolean {
    const trans = historico.filter(
      (h) =>
        h.licitacaoId === licId &&
        h.statusNovo === statusAlvo &&
        h.ocorridoEm >= inicioUtc &&
        h.ocorridoEm < fimUtc,
    );
    return trans.length > 0;
  }

  // Em Precificação: atualmente em STATUS_EM_PRECIFICACAO e teve transição para ACEITA no mês
  const emPrecificacaoTotal = licitacoes.filter((l) => {
    const st = getLicitacaoStatus(l);
    if (!(STATUS_EM_PRECIFICACAO as readonly string[]).includes(st)) {
      return false;
    }
    return (
      teveTransicaoNoMes(l.id, "ACEITA") ||
      (l.createdAt >= inicioUtc && l.createdAt < fimUtc)
    );
  }).length;

  // Recusadas no mês
  const recusadasTotal = licitacoes.filter((l) => {
    const st = getLicitacaoStatus(l);
    if (st !== "RECUSADA") return false;
    return (
      teveTransicaoNoMes(l.id, "RECUSADA") ||
      (l.createdAt >= inicioUtc && l.createdAt < fimUtc)
    );
  }).length;

  // 2. Linha 2 — Painel de Desfecho
  const contempladas = licitacoes.filter((l) => {
    const st = getLicitacaoStatus(l);
    if (st !== "CONTEMPLADA") return false;
    return (
      teveTransicaoNoMes(l.id, "CONTEMPLADA") ||
      (l.createdAt >= inicioUtc && l.createdAt < fimUtc)
    );
  });
  const contempladasQtd = contempladas.length;
  const contempladasValor = contempladas.reduce(
    (sum, c) => sum + (c.valorArrematado ?? c.valorEstimado ?? 0),
    0,
  );

  const perdidasPrecoTotal = licitacoes.filter(
    (l) =>
      getLicitacaoStatus(l) === "NAO_CONTEMPLADA_PRECO" &&
      (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_PRECO") ||
        (l.createdAt >= inicioUtc && l.createdAt < fimUtc)),
  ).length;

  const perdidasDocTotal = licitacoes.filter(
    (l) =>
      getLicitacaoStatus(l) === "NAO_CONTEMPLADA_DOCUMENTACAO" &&
      (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_DOCUMENTACAO") ||
        (l.createdAt >= inicioUtc && l.createdAt < fimUtc)),
  ).length;

  const desistenciasTotal = licitacoes.filter(
    (l) =>
      getLicitacaoStatus(l) === "NAO_CONTEMPLADA_DESISTENCIA" &&
      (teveTransicaoNoMes(l.id, "NAO_CONTEMPLADA_DESISTENCIA") ||
        (l.createdAt >= inicioUtc && l.createdAt < fimUtc)),
  ).length;

  const impugnadasTotal = licitacoes.filter(
    (l) =>
      getLicitacaoStatus(l) === "IMPUGNADA" &&
      (teveTransicaoNoMes(l.id, "IMPUGNADA") ||
        (l.createdAt >= inicioUtc && l.createdAt < fimUtc)),
  ).length;

  const denominadorConversao =
    contempladasQtd + perdidasPrecoTotal + perdidasDocTotal;
  const taxaConversaoPercentual =
    denominadorConversao > 0
      ? Math.round((contempladasQtd / denominadorConversao) * 1000) / 10
      : null;

  // 3. Linha 3 — Indicadores Operacionais e Financeiros
  const volumeEmDisputa = licitacoes
    .filter((l) => (STATUS_PIPELINE_ATIVO as readonly string[]).includes(getLicitacaoStatus(l)))
    .reduce((sum, l) => sum + (l.valorEstimado ?? 0), 0);

  const totalAnalisadas = licitacoes.filter((l) => l.parecerIA !== null).length;
  const totalGo = licitacoes.filter((l) => l.parecerIA === "GO").length;
  const totalNoGo = licitacoes.filter((l) => l.parecerIA === "NO_GO").length;

  const goPercentual =
    totalAnalisadas > 0 ? Math.round((totalGo / totalAnalisadas) * 1000) / 10 : null;
  const noGoPercentual =
    totalAnalisadas > 0 ? Math.round((totalNoGo / totalAnalisadas) * 1000) / 10 : null;

  // Críticas < 72h (contagem regressiva baseada no encerramento do prazo de proposta)
  const limite72h = new Date(agora.getTime() + 72 * 3600 * 1000);
  const criticas = licitacoes
    .filter((l) => {
      const dataPrazo = l.dataEncerramentoProposta ? new Date(l.dataEncerramentoProposta) : new Date(l.dataAbertura);
      return (
        dataPrazo >= agora &&
        dataPrazo <= limite72h &&
        (l.status === "PENDENTE" ||
          (STATUS_PIPELINE_ATIVO as readonly string[]).includes(l.status))
      );
    })
    .map((l) => {
      const dataPrazo = l.dataEncerramentoProposta ? new Date(l.dataEncerramentoProposta) : new Date(l.dataAbertura);
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
        status: l.status,
      };
    })
    .sort((a, b) => a.segundosRestantes - b.segundosRestantes);

  // 4. Linha 4 — Top 4 Tipos Histórico Acumulado
  const contagemPorTipo = new Map<string, number>();
  for (const l of licitacoes) {
    if (l.tipoSistemaCodigo) {
      const atual = contagemPorTipo.get(l.tipoSistemaCodigo) ?? 0;
      contagemPorTipo.set(l.tipoSistemaCodigo, atual + 1);
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
    periodo: {
      mes,
      ano,
      inicioUtc,
      fimUtc,
    },
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
