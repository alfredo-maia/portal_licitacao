import { prisma } from "@/lib/prisma";
import {
  STATUS_CALENDARIO_OPACO,
  STATUS_FORA_DO_CALENDARIO,
  OPERACAO_TIMEZONE,
} from "@/server/schemas/status-grupos.schema";
import {
  type CalendarioQuery,
  type CalendarioResponse,
  type CalendarioChip,
  calendarioQuerySchema,
} from "@/server/schemas/calendario.schema";
import {
  listInMemoryLicitacoes,
  listInMemoryTenantLicitacoes,
  type LicitacaoRecord,
} from "./licitacoes-store";

import { buscarDocumentosVencendoNoMes } from "./documentos.service";
import { buscarPortaisVencendoNoMes } from "./portais.service";

export async function getCalendarioData(
  rawQuery?: CalendarioQuery,
  tenantId?: string | null,
): Promise<CalendarioResponse> {
  const query = calendarioQuerySchema.parse(rawQuery ?? {});

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

  // Limites do mês no fuso America/Sao_Paulo (+03:00 UTC)
  const inicioUtc = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fimUtc = new Date(Date.UTC(ano, mes, 1, 3, 0, 0, 0));

  // 1. Mapeamento de certames ativos para o tenant especificado (SaaS Multi-Tenant)
  const tenantActiveMap = new Map<string, string>();
  if (tenantId) {
    try {
      const dbTenantLic = await prisma.tenantLicitacao.findMany({
        where: {
          tenantId,
          statusKanban: { notIn: ["PENDENTE", "RECUSADA"] },
        },
      });
      for (const tl of dbTenantLic) {
        tenantActiveMap.set(tl.licitacaoId, tl.statusKanban);
      }
    } catch {}

    const memTenantLic = listInMemoryTenantLicitacoes(tenantId);
    for (const tl of memTenantLic) {
      if (tl.statusKanban !== "PENDENTE" && tl.statusKanban !== "RECUSADA") {
        tenantActiveMap.set(tl.licitacaoId, tl.statusKanban);
      }
    }

    // Se o tenant ativo não possui nenhuma licitação aceita/ativa, o calendário vem 100% limpo
    if (tenantActiveMap.size === 0) {
      const alertasDocumentais = await buscarDocumentosVencendoNoMes(ano, mes, tenantId);
      const alertasPortais = await buscarPortaisVencendoNoMes(ano, mes, tenantId);
      return {
        ok: true,
        mes,
        ano,
        chips: [],
        alertasDocumentais,
        alertasPortais,
      };
    }
  }

  let licitacoes: LicitacaoRecord[] = [];
  try {
    const baseWhere: any = {
      OR: [
        {
          dataEncerramentoProposta: {
            gte: inicioUtc,
            lt: fimUtc,
          },
        },
        {
          dataEncerramentoProposta: null,
          dataAbertura: {
            gte: inicioUtc,
            lt: fimUtc,
          },
        },
      ],
    };
    if (tenantId && tenantActiveMap.size > 0) {
      baseWhere.id = { in: Array.from(tenantActiveMap.keys()) };
    }

    licitacoes = await prisma.licitacao.findMany({
      where: baseWhere,
      orderBy: { dataAbertura: "asc" },
    });
  } catch (err) {
    console.error("[getCalendarioMensal] Erro ao buscar no banco:", err);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      
      const retryWhere: any = {
        OR: [
          {
            dataEncerramentoProposta: {
              gte: inicioUtc,
              lt: fimUtc,
            },
          },
          {
            dataEncerramentoProposta: null,
            dataAbertura: {
              gte: inicioUtc,
              lt: fimUtc,
            },
          },
        ],
      };
      if (tenantId && tenantActiveMap.size > 0) {
        retryWhere.id = { in: Array.from(tenantActiveMap.keys()) };
      }

      licitacoes = await prisma.licitacao.findMany({
        where: retryWhere,
        orderBy: { dataAbertura: "asc" },
      });
    } catch {
      licitacoes = listInMemoryLicitacoes().filter(
        (l) => {
          if (tenantId && !tenantActiveMap.has(l.id)) return false;
          const d = l.dataEncerramentoProposta ?? l.dataAbertura;
          return d >= inicioUtc && d < fimUtc;
        },
      );
    }
  }

  // Filtra fora status que não poluem o calendário (PENDENTE e RECUSADA)
  const chips: CalendarioChip[] = licitacoes
    .map((l) => {
      const effectiveStatus = tenantId ? (tenantActiveMap.get(l.id) || l.status) : l.status;
      return { ...l, status: effectiveStatus as any };
    })
    .filter(
      (l) =>
        !(STATUS_FORA_DO_CALENDARIO as readonly string[]).includes(l.status),
    )
    .map((l) => {
      // Extrai o dia exato no fuso de Brasília baseado na data limite de proposta
      const dataPrazo = l.dataEncerramentoProposta ? new Date(l.dataEncerramentoProposta) : new Date(l.dataAbertura);
      const dia = parseInt(
        dataPrazo.toLocaleDateString("en-US", {
          day: "numeric",
          timeZone: OPERACAO_TIMEZONE,
        }),
        10,
      );

      const opaco = (STATUS_CALENDARIO_OPACO as readonly string[]).includes(
        l.status,
      );

      return {
        id: l.id,
        numeroEdital: l.numeroEdital,
        orgaoNome: l.orgaoNome,
        titulo: (l as any).objeto || l.miniResumo || l.numeroEdital,
        objeto: (l as any).objeto ?? null,
        miniResumo: l.miniResumo,
        dataAbertura: l.dataAbertura,
        dataEncerramentoProposta: l.dataEncerramentoProposta ?? l.dataAbertura,
        dia,
        status: l.status,
        opaco,
        linkDestino: `/oportunidades/${l.id}`,
      };
    })
    .sort((a, b) => a.dia - b.dia);

  const alertasDocumentais = await buscarDocumentosVencendoNoMes(ano, mes, tenantId);
  const alertasPortais = await buscarPortaisVencendoNoMes(ano, mes, tenantId);

  return {
    ok: true,
    mes,
    ano,
    chips,
    alertasDocumentais,
    alertasPortais,
  };
}
