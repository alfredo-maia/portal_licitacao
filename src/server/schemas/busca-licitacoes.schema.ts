import { z } from "zod";
import { MacroSegmentoEnum } from "./segmentos.schema";

export const buscaLicitacoesQuerySchema = z.object({
  q: z.string().optional().default(""),
  macroSegmentos: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    }),
  subcategorias: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    }),
  modalidades: z
    .union([z.string(), z.array(z.string()), z.number(), z.array(z.number())])
    .optional()
    .transform((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => Number(v)).filter((v) => !isNaN(v));
      return String(val)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
    }),
  ufs: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((s) => s.toUpperCase());
      return val
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }),
  valorMin: z.coerce.number().nonnegative().optional(),
  valorMax: z.coerce.number().nonnegative().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  ordenarPor: z
    .enum(["relevancia", "dataAbertura", "valorEstimado", "dataPublicacao"])
    .default("dataAbertura"),
  ordem: z.enum(["asc", "desc"]).default("asc"),
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().positive().max(100).default(20),
});

export type BuscaLicitacoesQuery = z.infer<typeof buscaLicitacoesQuerySchema>;

export const itemLicitacaoBuscaSchema = z.object({
  id: z.string(),
  idPncp: z.string(),
  numeroEdital: z.string(),
  orgaoNome: z.string(),
  orgaoCnpj: z.string(),
  uf: z.string(),
  municipio: z.string().nullable().optional(),
  modalidade: z.string(),
  modalidadeCodigo: z.number().nullable().optional(),
  segmentoMacro: MacroSegmentoEnum.nullable().optional(),
  subcategorias: z.array(z.string()).default([]),
  miniResumo: z.string(),
  resumo: z.string(),
  valorEstimado: z.number(),
  dataAbertura: z.coerce.date(),
  dataEncerramentoProposta: z.coerce.date().nullable().optional(),
  dataPublicacaoPncp: z.coerce.date().nullable().optional(),
  status: z.string(),
  scoreRelevancia: z.number().optional(),
});

export type ItemLicitacaoBusca = z.infer<typeof itemLicitacaoBuscaSchema>;

export const buscaLicitacoesResultSchema = z.object({
  total: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  limite: z.number().int().positive(),
  totalPaginas: z.number().int().nonnegative(),
  tempoMs: z.number().nonnegative().optional(),
  itens: z.array(itemLicitacaoBuscaSchema),
});

export type BuscaLicitacoesResult = z.infer<typeof buscaLicitacoesResultSchema>;
