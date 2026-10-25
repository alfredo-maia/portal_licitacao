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
  type LicitacaoRecord,
} from "./licitacoes-store";

import { buscarDocumentosVencendoNoMes } from "./documentos.service";

export async function getCalendarioData(
  rawQuery?: CalendarioQuery,
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

  let licitacoes: LicitacaoRecord[] = [];
  try {
    licitacoes = await prisma.licitacao.findMany({
      where: {
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
      },
      orderBy: { dataAbertura: "asc" },
    });
  } catch (err) {
    console.error("[getCalendarioMensal] Erro ao buscar no banco:", err);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      licitacoes = await prisma.licitacao.findMany({
        where: {
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
        },
        orderBy: { dataAbertura: "asc" },
      });
    } catch {
      licitacoes = listInMemoryLicitacoes().filter(
        (l) => {
          const d = l.dataEncerramentoProposta ?? l.dataAbertura;
          return d >= inicioUtc && d < fimUtc;
        },
      );
    }
  }

  // Filtra fora status que não poluem o calendário (PENDENTE e RECUSADA)
  const chips: CalendarioChip[] = licitacoes
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
        dataAbertura: l.dataAbertura,
        dataEncerramentoProposta: l.dataEncerramentoProposta ?? l.dataAbertura,
        dia,
        status: l.status,
        opaco,
        linkDestino: `/oportunidades/${l.id}`,
      };
    })
    .sort((a, b) => a.dia - b.dia);

  const alertasDocumentais = await buscarDocumentosVencendoNoMes(ano, mes);

  return {
    ok: true,
    mes,
    ano,
    chips,
    alertasDocumentais,
  };
}
