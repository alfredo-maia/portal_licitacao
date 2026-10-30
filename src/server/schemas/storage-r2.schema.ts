import { z } from "zod";

/**
 * Contratos de Armazenamento Cloudflare R2 e Política de Uso Justo (Sprint SaaS 3 / PRD §10)
 */

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;

/** Teto máximo por arquivo individual: 20 MB */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Cotas silenciosas de uso justo de cofre por plano de assinatura */
export const COTAS_STORAGE_POR_PLANO: Record<string, number> = {
  BASICO: 500 * 1024 * 1024,       // 500 MB
  PRO: 2 * 1024 * 1024 * 1024,     // 2 GB
  ENTERPRISE: 5 * 1024 * 1024 * 1024, // 5 GB
};

export const TTL_CACHE_EDITAIS_MS = 24 * 60 * 60 * 1000; // 24 horas

export const validarArquivoUploadSchema = z.object({
  nome: z.string().min(1).max(255),
  tamanho: z
    .number()
    .int()
    .positive("Tamanho do arquivo deve ser maior que 0")
    .max(MAX_FILE_SIZE_BYTES, "Arquivo excede o limite máximo permitido de 20 MB"),
  mimeType: z
    .string()
    .refine(
      (mime) => (ALLOWED_MIME_TYPES as readonly string[]).includes(mime),
      {
        message: "Tipo de arquivo não permitido. Apenas PDFs (.pdf) e imagens (.jpg, .png) são aceitos.",
      },
    ),
});

export type ValidarArquivoUploadInput = z.infer<typeof validarArquivoUploadSchema>;

export const r2ItemDocumentoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  tamanho: z.number().int().nonnegative(),
  mimeType: z.string(),
  r2Key: z.string(),
  r2Url: z.string().nullable().optional(),
  cachedAt: z.coerce.date().nullable().optional(),
  statusCache: z.enum(["CACHE_HIT", "CACHE_MISS", "SINCRONIZADO"]),
  urlDownload: z.string(),
});

export type R2ItemDocumento = z.infer<typeof r2ItemDocumentoSchema>;

export const sincronizarDocumentosPncpResponseSchema = z.object({
  ok: z.literal(true),
  licitacaoId: z.string(),
  numeroEdital: z.string(),
  totalArquivos: z.number().int().nonnegative(),
  arquivos: z.array(r2ItemDocumentoSchema),
  origem: z.enum(["R2_CACHE", "PNCP_SYNC"]),
  sincronizadoEm: z.string(),
});

export type SincronizarDocumentosPncpResponse = z.infer<
  typeof sincronizarDocumentosPncpResponseSchema
>;

export const cotaUsoJustoStatusSchema = z.object({
  tenantId: z.string(),
  plano: z.string(),
  usadoBytes: z.number().int().nonnegative(),
  limiteBytes: z.number().int().nonnegative(),
  percentualUsado: z.number().min(0).max(100),
  excedeuLimite: z.boolean(),
  mensagemAviso: z.string().nullable(),
});

export type CotaUsoJustoStatus = z.infer<typeof cotaUsoJustoStatusSchema>;

/**
 * Valida se a adição de novos bytes viola a cota silenciosa do plano do cliente.
 */
export function calcularCotaUsoJusto(params: {
  tenantId: string;
  plano: string;
  usadoAtualBytes: number;
  novosBytes?: number;
}): CotaUsoJustoStatus {
  const limiteBytes = COTAS_STORAGE_POR_PLANO[params.plano] || COTAS_STORAGE_POR_PLANO.BASICO;
  const novos = params.novosBytes || 0;
  const totalPrevisto = params.usadoAtualBytes + novos;
  const percentualUsado = Math.min(100, Math.round((totalPrevisto / limiteBytes) * 100));
  const excedeuLimite = totalPrevisto > limiteBytes;

  let mensagemAviso: string | null = null;
  if (excedeuLimite) {
    mensagemAviso =
      "📁 Você atingiu a capacidade recomendada do seu cofre de documentos. " +
      "Para garantir a máxima segurança dos seus arquivos e liberar espaço adicional gratuitamente para a sua empresa, " +
      "converse com a nossa equipe de suporte.";
  }

  return {
    tenantId: params.tenantId,
    plano: params.plano,
    usadoBytes: totalPrevisto,
    limiteBytes,
    percentualUsado,
    excedeuLimite,
    mensagemAviso,
  };
}
