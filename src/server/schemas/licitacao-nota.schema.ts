import { z } from "zod";

/**
 * Notas colaborativas do Dossiê (`/oportunidades/[id]` → aba "Notas", Issue #36).
 * Regras: todos os membros criam; apenas o autor edita; apenas DIRETORIA exclui.
 */
export const NOTA_TEXTO_MAX = 4000;

export const criarNotaSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "O texto da nota é obrigatório")
    .max(NOTA_TEXTO_MAX, `A nota deve ter no máximo ${NOTA_TEXTO_MAX} caracteres`),
  mencionadosIds: z.array(z.string().min(1)).max(20).default([]),
});

export const atualizarNotaSchema = criarNotaSchema;

export const notasListQuerySchema = z.object({
  autorId: z.string().min(1).optional(),
  busca: z.string().trim().min(1).optional(),
});

export type CriarNotaInput = z.infer<typeof criarNotaSchema>;
export type AtualizarNotaInput = z.infer<typeof atualizarNotaSchema>;
export type NotasListQuery = z.infer<typeof notasListQuerySchema>;

export interface LicitacaoNotaItem {
  id: string;
  licitacaoId: string;
  tenantId: string | null;
  autorId: string;
  autorNome: string;
  autorCargo: string;
  texto: string;
  mencionadosIds: string[];
  editada: boolean;
  criadaEm: Date;
  atualizadaEm: Date;
  podeEditar: boolean;
  podeExcluir: boolean;
}

