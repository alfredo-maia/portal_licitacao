import { z } from "zod";
import { tipoSistemaCodigoNormalizadoSchema } from "./tipos-sistema.schema";

/**
 * Contrato de Ingestão de Dados v2 (`licitacoes_portal.json`) gerado pela
 * esteira de IA do Paperclip para o endpoint `POST /api/ingestao`
 * (PRD §8 / sprint-1-spec §2.2).
 */

/**
 * Parecer da esteira de IA na ingestão. Aceita as grafias `"NO-GO"` (legada)
 * e `"NO_GO"` (canônica do enum `ParecerIA` no Prisma), normalizando sempre
 * para `"NO_GO"` na saída do parse.
 */
export const parecerGoNoGoIngestaoSchema = z
  .enum(["GO", "AVALIAR", "NO-GO", "NO_GO"])
  .transform((value) => (value === "NO-GO" ? "NO_GO" : value));

export const ingestaoOrgaoSchema = z.object({
  cnpj: z.string().default("00.000.000/0001-00"),
  nome: z.string().default("Órgão Licitante"),
  esfera: z.string().nullable().optional(),
  poder: z.string().nullable().optional(),
  uf: z.string().min(2).max(2).default("GO"),
  municipio: z.string().nullable().optional(),
});

const normalizeItemPreprocess = (raw: unknown) => {
  if (!raw || typeof raw !== "object") return raw;
  const copy = { ...(raw as Record<string, any>) };

  // 1. Normalização de Órgão
  if (typeof copy.orgao === "string" || !copy.orgao) {
    const nome = typeof copy.orgao === "string" && copy.orgao.trim() ? copy.orgao.trim() : "Órgão Licitante";
    const cnpj = copy.cnpj || copy.orgaoCnpj || "00.000.000/0001-00";
    const uf = (copy.uf || "GO").slice(0, 2).toUpperCase();
    const municipio = copy.municipio || null;
    copy.orgao = { nome, cnpj, uf, municipio };
  } else if (copy.orgao && typeof copy.orgao === "object") {
    copy.orgao = {
      nome: copy.orgao.nome || copy.orgaoNome || "Órgão Licitante",
      cnpj: copy.orgao.cnpj || copy.cnpj || "00.000.000/0001-00",
      uf: (copy.orgao.uf || copy.uf || "GO").slice(0, 2).toUpperCase(),
      municipio: copy.orgao.municipio || copy.municipio || null,
      esfera: copy.orgao.esfera || copy.esfera,
      poder: copy.orgao.poder || copy.poder,
    };
  }

  // 2. Número do edital
  if (!copy.numeroEdital) {
    if (copy.numeroProcesso) {
      copy.numeroEdital = copy.numeroProcesso;
    } else if (copy.pncpId) {
      const parts = String(copy.pncpId).split("-");
      copy.numeroEdital = `PE-${parts[parts.length - 1]}`;
    } else {
      copy.numeroEdital = "Edital PNCP";
    }
  }

  // 3. Modalidade
  if (!copy.modalidade) {
    copy.modalidade = "Pregão Eletrônico";
  }

  // 4. Portal de Disputa
  if (!copy.portalDisputa && copy.portalEnvio) {
    copy.portalDisputa = copy.portalEnvio;
  }

  // 5. Resumo e Mini Resumo
  if (!copy.resumo && copy.objeto) {
    copy.resumo = copy.objeto;
  }
  if (!copy.miniResumo) {
    copy.miniResumo = copy.resumo ? copy.resumo.slice(0, 50) : "Licitação de Software";
  }

  // 6. Datas
  if (!copy.dataPublicacaoPncp && copy.dataPublicacao) {
    copy.dataPublicacaoPncp = copy.dataPublicacao;
  }
  if (!copy.dataEncerramentoProposta) {
    copy.dataEncerramentoProposta =
      copy.dataEncerramento ||
      copy.dataFimProposta ||
      copy.dataHoraFimRecebimentoPropostas ||
      copy.dataLimiteEnvio ||
      copy.dataLimiteProposta ||
      copy.dataAbertura ||
      null;
  }
  if (!copy.dataAbertura && copy.dataEncerramentoProposta) {
    copy.dataAbertura = copy.dataEncerramentoProposta;
  }

  // 7. Tipo de Sistema Sugerido
  if (!copy.tipoSistemaSugerido) {
    copy.tipoSistemaSugerido = "OUTROS";
  }

  // 8. Parecer
  if (!copy.parecerGoNoGo) {
    copy.parecerGoNoGo = copy.parecer || "AVALIAR";
  }

  // 9. Links: normalização e auto-prefixação com https://
  if (copy.linkSistemaOrigem && typeof copy.linkSistemaOrigem === "string") {
    const trimmed = copy.linkSistemaOrigem.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      copy.linkSistemaOrigem = `https://${trimmed}`;
    } else {
      copy.linkSistemaOrigem = trimmed;
    }
  } else {
    copy.linkSistemaOrigem = "";
  }

  if (copy.linkPncp && typeof copy.linkPncp === "string") {
    const trimmed = copy.linkPncp.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      copy.linkPncp = `https://${trimmed}`;
    } else {
      copy.linkPncp = trimmed;
    }
  } else {
    copy.linkPncp = "";
  }

  return copy;
};

export const ingestaoLicitacaoItemSchema = z.preprocess(
  normalizeItemPreprocess,
  z.object({
    pncpId: z.string().min(1),
    numeroEdital: z.string().min(1),
    orgao: ingestaoOrgaoSchema,
    modalidade: z.string().min(1),
    portalDisputa: z.string().optional(),
    valorEstimado: z.number().nonnegative(),
    dataPublicacaoPncp: z.coerce.date().optional(),
    dataAbertura: z.coerce.date(),
    dataEncerramentoProposta: z.coerce.date().optional(),
    dataUltimaAtualizacao: z.coerce.date().optional(),
    isPresencial: z.boolean().default(false),
    distanciaGoianiaKm: z.number().nullable().optional(),
    miniResumo: z.string().min(1),
    resumo: z.string().min(1),
    /**
     * Enum dos 22 códigos (PRD §5.1). Valores desconhecidos ou vazios vindos de
     * sistemas externos são normalizados para `OUTROS` (ver
     * `tipoSistemaCodigoNormalizadoSchema`).
     */
    tipoSistemaSugerido: tipoSistemaCodigoNormalizadoSchema,
    quantidadeLotes: z.number().int().positive().default(1),
    loteUnico: z.boolean().default(true),
    precoPorLote: z.boolean().default(false),
    parecerGoNoGo: parecerGoNoGoIngestaoSchema,
    justificativaTecnica: z.string().optional(),
    atestadosExigidos: z.array(z.string()).default([]),
    linkPncp: z.string().optional().default(""),
    linkSistemaOrigem: z.string().optional().default(""),
  }),
);

export const ingestaoPayloadV2Schema = z.preprocess((val: unknown) => {
  if (Array.isArray(val)) {
    return {
      versaoContrato: 2,
      executadoEm: new Date().toISOString(),
      totalRegistros: val.length,
      licitacoes: val,
    };
  }
  return val;
}, z.object({
  versaoContrato: z.literal(2).default(2),
  executadoEm: z.string().min(1).default(() => new Date().toISOString()),
  totalRegistros: z.number().int().nonnegative().optional(),
  licitacoes: z.array(ingestaoLicitacaoItemSchema),
}).transform((data) => ({
  versaoContrato: 2 as const,
  executadoEm: data.executadoEm,
  totalRegistros: data.totalRegistros ?? data.licitacoes.length,
  licitacoes: data.licitacoes,
})));

export type ParecerGoNoGoIngestao = z.infer<typeof parecerGoNoGoIngestaoSchema>;
export type IngestaoOrgao = z.infer<typeof ingestaoOrgaoSchema>;
export type IngestaoLicitacaoItem = z.infer<typeof ingestaoLicitacaoItemSchema>;
export type IngestaoLicitacaoItemInput = z.input<
  typeof ingestaoLicitacaoItemSchema
>;
export type IngestaoPayloadV2 = z.infer<typeof ingestaoPayloadV2Schema>;
export type IngestaoPayloadV2Input = z.input<typeof ingestaoPayloadV2Schema>;
