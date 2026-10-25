import { z } from "zod";

/**
 * Contrato do Repositório de Documentação de Habilitação (PRD §4.6 / sprint-4-spec §2).
 * Categorias da Lei 14.133/2021, controle estrito de validade e versionamento.
 */

export const DOCUMENTO_CATEGORIAS = [
  "JURIDICA",
  "FISCAL_TRABALHISTA",
  "QUALIFICACAO_TECNICA",
  "QUALIFICACAO_ECONOMICA",
  "OUTROS",
] as const;

export const documentoCategoriaSchema = z.enum(DOCUMENTO_CATEGORIAS);
export type DocumentoCategoria = z.infer<typeof documentoCategoriaSchema>;

export const DOCUMENTO_STATUS = ["ATIVO", "ARQUIVADO", "SUBSTITUIDO"] as const;
export const documentoStatusSchema = z.enum(DOCUMENTO_STATUS);
export type DocumentoStatus = z.infer<typeof documentoStatusSchema>;

export const documentoCriarInputSchema = z
  .object({
    nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(150),
    categoria: documentoCategoriaSchema,
    tipo: z.string().trim().max(100).nullable().optional(),
    orgaoEmissor: z.string().trim().max(100).nullable().optional(),
    semValidade: z.boolean().default(false),
    dataEmissao: z.coerce.date().nullable().optional(),
    dataVencimento: z.coerce.date().nullable().optional(),
    arquivoUrl: z.string().nullable().optional(),
    arquivoNome: z.string().nullable().optional(),
    arquivoTamanho: z.number().int().nonnegative().nullable().optional(),
    mimeType: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      // Se não for permanente, dataVencimento deve ser informada para controle
      if (!data.semValidade && !data.dataVencimento) {
        return false;
      }
      return true;
    },
    {
      message: "Data de vencimento é obrigatória para documentos que não possuem validade permanente",
      path: ["dataVencimento"],
    },
  );

export const documentoAtualizarInputSchema = z.object({
  nome: z.string().trim().min(2).max(150).optional(),
  categoria: documentoCategoriaSchema.optional(),
  tipo: z.string().trim().max(100).nullable().optional(),
  orgaoEmissor: z.string().trim().max(100).nullable().optional(),
  semValidade: z.boolean().optional(),
  dataEmissao: z.coerce.date().nullable().optional(),
  dataVencimento: z.coerce.date().nullable().optional(),
  status: documentoStatusSchema.optional(),
});

export const documentoNovaVersaoInputSchema = z.object({
  nome: z.string().trim().min(2).max(150).optional(),
  dataEmissao: z.coerce.date().nullable().optional(),
  dataVencimento: z.coerce.date().nullable().optional(),
  arquivoUrl: z.string().nullable().optional(),
  arquivoNome: z.string().nullable().optional(),
  arquivoTamanho: z.number().int().nonnegative().nullable().optional(),
  mimeType: z.string().nullable().optional(),
});

export const documentoListQuerySchema = z.object({
  categoria: documentoCategoriaSchema.optional(),
  status: documentoStatusSchema.default("ATIVO").optional(),
  busca: z.string().trim().optional(),
  apenasVencendoEmDias: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});

export const documentoItemSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  categoria: documentoCategoriaSchema,
  tipo: z.string().nullable(),
  orgaoEmissor: z.string().nullable(),
  semValidade: z.boolean(),
  dataEmissao: z.coerce.date().nullable(),
  dataVencimento: z.coerce.date().nullable(),
  arquivoUrl: z.string().nullable(),
  arquivoNome: z.string().nullable(),
  arquivoTamanho: z.number().nullable(),
  mimeType: z.string().nullable(),
  versao: z.number().int().positive(),
  documentoPaiId: z.string().nullable(),
  status: documentoStatusSchema,
  criadoPorId: z.string().nullable(),
  criadoEm: z.coerce.date(),
  atualizadoEm: z.coerce.date(),
  /** Indicador calculado: vencido ou vencendo em <= 30 dias (deve ter estilo vermelho e negrito) */
  alertaVencimento: z.boolean(),
  vencido: z.boolean(),
  diasParaVencer: z.number().int().nullable(),
});

export const documentoListResponseSchema = z.object({
  ok: z.literal(true),
  total: z.number().int().nonnegative(),
  vencidosOuVencendo: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  documentos: z.array(documentoItemSchema),
});

export const documentoDetalheResponseSchema = z.object({
  ok: z.literal(true),
  documento: documentoItemSchema,
  historicoVersoes: z.array(documentoItemSchema).optional(),
});

export type DocumentoCriarInput = z.infer<typeof documentoCriarInputSchema>;
export type DocumentoAtualizarInput = z.infer<typeof documentoAtualizarInputSchema>;
export type DocumentoNovaVersaoInput = z.infer<typeof documentoNovaVersaoInputSchema>;
export type DocumentoListQuery = z.infer<typeof documentoListQuerySchema>;
export type DocumentoItem = z.infer<typeof documentoItemSchema>;
export type DocumentoListResponse = z.infer<typeof documentoListResponseSchema>;
export type DocumentoDetalheResponse = z.infer<typeof documentoDetalheResponseSchema>;
