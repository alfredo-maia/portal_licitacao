import { z } from "zod";

export const metodoTituloLicitacaoSchema = z.enum(["IA", "HEURISTICA_V2"]);
export type MetodoTituloLicitacao = z.infer<typeof metodoTituloLicitacaoSchema>;

export const executarIngestaoPncpInputSchema = z.object({
  diasRetroativos: z.coerce.number().int().min(0).max(15).default(1),
  dataInicial: z.string().regex(/^\d{8}$/).optional(),
  dataFinal: z.string().regex(/^\d{8}$/).optional(),
  modalidades: z
    .array(z.coerce.number().int().positive())
    .min(1)
    .max(10)
    .default([6, 8, 5, 9, 1]),
  ufs: z.array(z.string().trim().length(2)).optional(),
  tamanhoPagina: z.coerce.number().int().min(10).max(50).default(50),
  maxPaginasPorModalidade: z.coerce.number().int().min(1).max(20).default(3),
  usarIa: z.boolean().default(true),
  origem: z.enum(["CRON", "MANUAL", "SCRIPT"]).default("CRON"),
});

export type ExecutarIngestaoPncpInput = z.input<typeof executarIngestaoPncpInputSchema>;

export const pncpContratacaoRawSchema = z
  .object({
    numeroControlePNCP: z.string().min(1),
    numeroCompra: z.union([z.string(), z.number()]).optional().nullable(),
    processo: z.string().optional().nullable(),
    anoCompra: z.coerce.number().optional().nullable(),
    sequencialCompra: z.coerce.number().optional().nullable(),
    objetoCompra: z.string().optional().nullable(),
    informacaoComplementar: z.string().optional().nullable(),
    modalidadeId: z.coerce.number().optional().nullable(),
    modalidadeNome: z.string().optional().nullable(),
    valorTotalEstimado: z.coerce.number().optional().nullable(),
    valorTotalHomologado: z.coerce.number().optional().nullable(),
    dataPublicacaoPncp: z.string().optional().nullable(),
    dataAberturaProposta: z.string().optional().nullable(),
    dataEncerramentoProposta: z.string().optional().nullable(),
    dataAtualizacao: z.string().optional().nullable(),
    srp: z.boolean().optional().nullable(),
    linkSistemaOrigem: z.string().optional().nullable(),
    linkProcessoEletronico: z.string().optional().nullable(),
    orgaoEntidade: z
      .object({
        cnpj: z.string().optional().nullable(),
        razaoSocial: z.string().optional().nullable(),
        esferaId: z.string().optional().nullable(),
        poderId: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    unidadeOrgao: z
      .object({
        nomeUnidade: z.string().optional().nullable(),
        ufSigla: z.string().optional().nullable(),
        municipioNome: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
  })
  .passthrough();

export type PncpContratacaoRaw = z.infer<typeof pncpContratacaoRawSchema>;

