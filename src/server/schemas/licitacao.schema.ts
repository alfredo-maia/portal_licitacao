import { z } from "zod";

export const licitacaoStatusSchema = z.enum([
  "PENDENTE",
  "ACEITA",
  "RECUSADA",
  "ANALISE_TECNICA",
  "ANALISE_FINANCEIRA",
  "REVISAO_PROPOSTA",
  "ENVIADA",
  "EM_DISPUTA",
  "AGUARDANDO_RESULTADO",
  "CONTEMPLADA",
  "IMPUGNADA",
  "NAO_CONTEMPLADA_PRECO",
  "NAO_CONTEMPLADA_DOCUMENTACAO",
  "NAO_CONTEMPLADA_DESISTENCIA",
  "REVOGADA_ANULADA",
]);

export const parecerIASchema = z.enum(["GO", "AVALIAR", "NO_GO"]);

export const licitacaoBaseSchema = z.object({
  idPncp: z.string().min(1),
  numeroEdital: z.string().min(1),
  orgaoNome: z.string().min(1),
  orgaoCnpj: z.string().min(11).max(18),
  uf: z.string().length(2),
  municipio: z.string().nullable().optional(),
  modalidade: z.string().min(1),
  miniResumo: z.string().min(1),
  resumo: z.string().min(1),
  valorEstimado: z.number().nonnegative(),
  dataAbertura: z.coerce.date(),
  status: licitacaoStatusSchema.default("PENDENTE"),
  parecerIA: parecerIASchema.default("AVALIAR"),
});

export type LicitacaoStatusContract = z.infer<typeof licitacaoStatusSchema>;
export type ParecerIAContract = z.infer<typeof parecerIASchema>;
export type LicitacaoBaseInput = z.infer<typeof licitacaoBaseSchema>;
