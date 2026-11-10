import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizarModalidade } from "@/server/schemas/modalidades.schema";
import {
  type ExecutarIngestaoPncpInput,
  executarIngestaoPncpInputSchema,
  pncpContratacaoRawSchema,
  type PncpContratacaoRaw,
} from "@/server/schemas/pncp-ingestao.schema";
import type { IngestaoLicitacaoItemInput } from "@/server/schemas/ingestao.schema";
import { ingestLicitacoesV2 } from "./ingestao.service";
import { gerarTitulosEmLotePrioridadeDupla } from "./resumo-objeto-licitacao.service";

export interface PncpIngestRunRecord {
  id: string;
  origem: string;
  dataInicial: string;
  dataFinal: string;
  paginasProcessadas: number;
  totalConsultadoPncp: number;
  totalElegiveis: number;
  criados: number;
  atualizados: number;
  inalterados: number;
  titulosViaIa: number;
  titulosViaHeuristica: number;
  status: "CONCLUIDO" | "PARCIAL" | "ERRO";
  erro: string | null;
  duracaoMs: number;
  executadoEm: Date;
}

export const inMemoryPncpIngestRuns: PncpIngestRunRecord[] = [];

export function formatarDataPncpYYYYMMDD(data: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(data);
    const ano = parts.find((p) => p.type === "year")?.value;
    const mes = parts.find((p) => p.type === "month")?.value;
    const dia = parts.find((p) => p.type === "day")?.value;
    if (ano && mes && dia) return `${ano}${mes}${dia}`;
  } catch {}
  return data.toISOString().slice(0, 10).replace(/-/g, "");
}

function buildLinkPncp(raw: PncpContratacaoRaw): string {
  const cnpj = raw.orgaoEntidade?.cnpj?.replace(/\D/g, "") || "";
  const ano = raw.anoCompra;
  const seq = raw.sequencialCompra;
  if (cnpj && ano && seq) {
    return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
  }
  const match = raw.numeroControlePNCP.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (match) {
    return `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${Number(match[2])}`;
  }
  return `https://pncp.gov.br/app/editais`;
}

function parseDataSeguro(val?: string | null, fallback?: Date): Date {
  if (val) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return fallback ?? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
}

function mapPncpItemParaIngestao(
  raw: PncpContratacaoRaw,
  tituloSintetizado: string,
): IngestaoLicitacaoItemInput {
  const objeto =
    (raw.objetoCompra || raw.informacaoComplementar || "").trim() ||
    "Objeto não detalhado no PNCP";

  const normMod = normalizarModalidade(raw.modalidadeId ?? raw.modalidadeNome ?? 6);
  const numeroCompraStr = raw.numeroCompra ? String(raw.numeroCompra) : null;
  const numeroEdital =
    numeroCompraStr && raw.anoCompra
      ? `${numeroCompraStr}/${raw.anoCompra}`
      : raw.processo || raw.numeroControlePNCP;

  const uf = (raw.unidadeOrgao?.ufSigla || "GO").trim().toUpperCase().slice(0, 2);
  const dataPub = raw.dataPublicacaoPncp
    ? parseDataSeguro(raw.dataPublicacaoPncp)
    : undefined;
  const dataEnc = raw.dataEncerramentoProposta
    ? parseDataSeguro(raw.dataEncerramentoProposta)
    : undefined;
  const dataAbertura = parseDataSeguro(
    raw.dataAberturaProposta || raw.dataEncerramentoProposta || raw.dataPublicacaoPncp,
    dataEnc,
  );
  const isPresencial =
    normMod.codigo === 4 ||
    normMod.codigo === 7 ||
    /presencial/i.test(`${raw.modalidadeNome || ""} ${objeto}`);

  return {
    pncpId: raw.numeroControlePNCP,
    numeroEdital,
    orgao: {
      cnpj: raw.orgaoEntidade?.cnpj || "00.000.000/0001-00",
      nome:
        raw.orgaoEntidade?.razaoSocial ||
        raw.unidadeOrgao?.nomeUnidade ||
        "Órgão Licitante",
      uf: uf.length === 2 ? uf : "GO",
      municipio: raw.unidadeOrgao?.municipioNome ?? null,
      esfera: raw.orgaoEntidade?.esferaId ?? null,
      poder: raw.orgaoEntidade?.poderId ?? null,
    },
    modalidade: normMod.nome,
    portalDisputa: "PNCP",
    valorEstimado: Math.max(0, Number(raw.valorTotalEstimado ?? 0)),
    dataPublicacaoPncp: dataPub,
    dataAbertura,
    dataEncerramentoProposta: dataEnc ?? dataAbertura,
    dataUltimaAtualizacao: raw.dataAtualizacao
      ? parseDataSeguro(raw.dataAtualizacao)
      : undefined,
    isPresencial,
    miniResumo: tituloSintetizado,
    resumo: objeto,
    tipoSistemaSugerido: "OUTROS",
    quantidadeLotes: 1,
    loteUnico: raw.srp !== true,
    precoPorLote: raw.srp === true,
    parecerGoNoGo: "AVALIAR",
    atestadosExigidos: [],
    linkPncp: buildLinkPncp(raw),
    linkSistemaOrigem:
      raw.linkSistemaOrigem || raw.linkProcessoEletronico || "",
  };
}

async function persistirRunPncp(record: PncpIngestRunRecord): Promise<void> {
  inMemoryPncpIngestRuns.unshift(record);
  if (inMemoryPncpIngestRuns.length > 100) {
    inMemoryPncpIngestRuns.length = 100;
  }

  try {
    await (prisma as any).pncpIngestRun.create({
      data: {
        id: record.id,
        origem: record.origem,
        dataInicial: record.dataInicial,
        dataFinal: record.dataFinal,
        paginasProcessadas: record.paginasProcessadas,
        totalConsultadoPncp: record.totalConsultadoPncp,
        totalElegiveis: record.totalElegiveis,
        criados: record.criados,
        atualizados: record.atualizados,
        inalterados: record.inalterados,
        titulosViaIa: record.titulosViaIa,
        titulosViaHeuristica: record.titulosViaHeuristica,
        status: record.status,
        erro: record.erro,
        duracaoMs: record.duracaoMs,
        executadoEm: record.executadoEm,
      },
    });
  } catch {
    // Fallback resiliente em memória quando PostgreSQL indisponível
  }
}

export async function listarExecucoesIngestaoPncp(
  limite = 20,
): Promise<PncpIngestRunRecord[]> {
  try {
    const dbRows = await (prisma as any).pncpIngestRun.findMany({
      take: limite,
      orderBy: { executadoEm: "desc" },
    });
    if (Array.isArray(dbRows) && dbRows.length > 0) {
      return dbRows;
    }
  } catch {}
  return inMemoryPncpIngestRuns.slice(0, limite);
}

export async function executarIngestaoDiariaPncp(
  rawInput?: ExecutarIngestaoPncpInput,
): Promise<
  PncpIngestRunRecord & { ok: boolean }
> {
  const inicioMs = Date.now();
  const parsed = executarIngestaoPncpInputSchema.parse(rawInput ?? {});
  const hoje = new Date();
  const inicioJanela = new Date(
    hoje.getTime() - parsed.diasRetroativos * 24 * 60 * 60 * 1000,
  );
  const dataInicial = parsed.dataInicial || formatarDataPncpYYYYMMDD(inicioJanela);
  const dataFinal = parsed.dataFinal || formatarDataPncpYYYYMMDD(hoje);

  const porPncpId = new Map<string, PncpContratacaoRaw>();
  const errosModalidade: string[] = [];
  let paginasProcessadas = 0;

  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  const timeoutMs = isTest ? 4000 : 25000;

  for (const modalidadeCod of parsed.modalidades) {
    const ufsLoop =
      parsed.ufs && parsed.ufs.length > 0 ? parsed.ufs : [undefined];

    for (const ufFiltro of ufsLoop) {
      for (let pagina = 1; pagina <= parsed.maxPaginasPorModalidade; pagina++) {
        const qs = new URLSearchParams({
          dataInicial,
          dataFinal,
          codigoModalidadeContratacao: String(modalidadeCod),
          pagina: String(pagina),
          tamanhoPagina: String(parsed.tamanhoPagina),
        });
        if (ufFiltro) qs.set("uf", ufFiltro.toUpperCase());

        const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?${qs.toString()}`;
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (res.status === 204 || res.status === 404) {
            break;
          }
          if (!res.ok) {
            errosModalidade.push(`mod=${modalidadeCod} p=${pagina} status=${res.status}`);
            break;
          }

          const body: any = await res.json();
          const itensRaw = Array.isArray(body?.data) ? body.data : [];
          paginasProcessadas += 1;

          for (const rawItem of itensRaw) {
            const validated = pncpContratacaoRawSchema.safeParse(rawItem);
            if (!validated.success) continue;
            if (!porPncpId.has(validated.data.numeroControlePNCP)) {
              porPncpId.set(validated.data.numeroControlePNCP, validated.data);
            }
          }

          const totalPaginas = Number(body?.totalPaginas ?? 0);
          if (
            itensRaw.length === 0 ||
            (totalPaginas > 0 && pagina >= totalPaginas) ||
            (totalPaginas === 0 && itensRaw.length < parsed.tamanhoPagina)
          ) {
            break;
          }
        } catch (err: any) {
          errosModalidade.push(
            `mod=${modalidadeCod} p=${pagina}: ${err?.message || "erro de rede"}`,
          );
          break;
        }
      }
    }
  }

  const coletados = Array.from(porPncpId.values());
  let criados = 0;
  let atualizados = 0;
  let inalterados = 0;
  let titulosViaIa = 0;
  let titulosViaHeuristica = 0;

  if (coletados.length > 0) {
    const mapaTitulos = await gerarTitulosEmLotePrioridadeDupla(
      coletados.map((c) => ({
        pncpId: c.numeroControlePNCP,
        objeto: (c.objetoCompra || c.informacaoComplementar || "").trim(),
        usarIa: parsed.usarIa,
      })),
    );

    const payloadItens = coletados.map((c) => {
      const gerado = mapaTitulos.get(c.numeroControlePNCP);
      if (gerado?.metodo === "IA") titulosViaIa += 1;
      else titulosViaHeuristica += 1;
      return mapPncpItemParaIngestao(
        c,
        gerado?.titulo || "Aquisição e Contratação Pública",
      );
    });

    const loteRes = await ingestLicitacoesV2(
      {
        versaoContrato: 2,
        executadoEm: new Date().toISOString(),
        totalRegistros: payloadItens.length,
        licitacoes: payloadItens,
      },
      {
        usuarioNome: `PNCP Cron (${parsed.origem})`,
      },
      {
        usarIaTitulos: false,
        titulosPreGerados: mapaTitulos,
      },
    );

    criados = loteRes.criados;
    atualizados = loteRes.atualizados;
    inalterados = loteRes.inalterados;
  }

  const status: PncpIngestRunRecord["status"] =
    errosModalidade.length > 0
      ? coletados.length > 0 || paginasProcessadas > 0
        ? "PARCIAL"
        : "ERRO"
      : "CONCLUIDO";

  const runRecord: PncpIngestRunRecord = {
    id: `pncprun_${randomUUID().slice(0, 12)}`,
    origem: parsed.origem,
    dataInicial,
    dataFinal,
    paginasProcessadas,
    totalConsultadoPncp: coletados.length,
    totalElegiveis: coletados.length,
    criados,
    atualizados,
    inalterados,
    titulosViaIa,
    titulosViaHeuristica,
    status,
    erro: errosModalidade.length > 0 ? errosModalidade.join(" | ") : null,
    duracaoMs: Date.now() - inicioMs,
    executadoEm: new Date(),
  };

  await persistirRunPncp(runRecord);

  return {
    ok: status !== "ERRO",
    ...runRecord,
  };
}
