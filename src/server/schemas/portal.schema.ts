import { z } from "zod";

/**
 * Contrato de Portais de Licitações (PRD §4.5 / sprint-4-spec §2).
 * Segurança estrita: NUNCA armazenar senhas no banco de dados.
 */

export const PORTAL_STATUS = [
  "NAO_CADASTRADO",
  "PRE_CADASTRO",
  "AGUARDANDO_APROVACAO",
  "CADASTRADO",
  "REJEITADO",
  "VENCIDO",
  "SUSPENSO",
] as const;

export const portalStatusSchema = z.enum(PORTAL_STATUS);
export type PortalStatus = z.infer<typeof portalStatusSchema>;

export const PORTAL_PERIODICIDADE = [
  "MENSAL",
  "TRIMESTRAL",
  "SEMESTRAL",
  "ANUAL",
  "GRATUITO",
] as const;

export const portalPeriodicidadeSchema = z.enum(PORTAL_PERIODICIDADE);
export type PortalPeriodicidade = z.infer<typeof portalPeriodicidadeSchema>;

export const portalCriarInputSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  url: z.preprocess((val) => {
    if (typeof val !== "string") return val;
    const trimmed = val.trim();
    if (!trimmed) return trimmed;
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }, z.string().trim().url("URL do portal deve ser válida")),
  status: portalStatusSchema.default("NAO_CADASTRADO"),
  login: z.string().trim().max(100).nullable().optional(),
  email: z.preprocess((val) => {
    if (typeof val === "string" && !val.trim()) return null;
    return val;
  }, z.string().trim().email("E-mail inválido").nullable().optional()),
  cnpj: z.string().trim().max(30).nullable().optional(),
  usuario: z.string().trim().max(100).nullable().optional(),
  valorAssinatura: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return null;
    return typeof val === "string" ? parseFloat(val) : val;
  }, z.number().nonnegative().nullable().optional()),
  periodicidade: portalPeriodicidadeSchema.default("ANUAL"),
  dataVencimento: z.preprocess((val) => {
    if (!val || val === "") return null;
    return new Date(val as any);
  }, z.date().nullable().optional()),
  aceitaRobo: z.boolean().default(false),
  exigeCertificadoDigital: z.boolean().default(false),
  suporteContato: z.string().trim().max(255).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const portalAtualizarInputSchema = portalCriarInputSchema.partial();

export const portalListQuerySchema = z.object({
  status: portalStatusSchema.optional(),
  busca: z.string().trim().optional(),
  apenasVencendoEmDias: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});

export const portalItemSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  url: z.string(),
  status: portalStatusSchema,
  login: z.string().nullable(),
  email: z.string().nullable(),
  cnpj: z.string().nullable(),
  usuario: z.string().nullable(),
  valorAssinatura: z.number().nullable(),
  periodicidade: portalPeriodicidadeSchema,
  dataVencimento: z.coerce.date().nullable(),
  aceitaRobo: z.boolean(),
  exigeCertificadoDigital: z.boolean(),
  suporteContato: z.string().nullable(),
  observacoes: z.string().nullable(),
  criadoEm: z.coerce.date(),
  atualizadoEm: z.coerce.date(),
});

export const portalListResponseSchema = z.object({
  ok: z.literal(true),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  portais: z.array(portalItemSchema),
});

export const portalDetalheResponseSchema = z.object({
  ok: z.literal(true),
  portal: portalItemSchema,
});

export type PortalCriarInput = z.infer<typeof portalCriarInputSchema>;
export type PortalAtualizarInput = z.infer<typeof portalAtualizarInputSchema>;
export type PortalListQuery = z.infer<typeof portalListQuerySchema>;
export type PortalItem = z.infer<typeof portalItemSchema>;
export type PortalListResponse = z.infer<typeof portalListResponseSchema>;
export type PortalDetalheResponse = z.infer<typeof portalDetalheResponseSchema>;
