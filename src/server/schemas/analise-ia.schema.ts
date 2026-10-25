import { z } from "zod";

/**
 * Contrato de persistência da análise profunda gerada pela ferramenta de IA
 * "Verificar Status de Participação" (PRD §4.4.1 F e sprint-2-spec §2.2).
 */
export const salvarAnaliseIASchema = z.object({
  scriptPrompt: z.string().min(1, "Script do prompt é obrigatório"),
  relatorioTexto: z.string().min(1, "Texto do relatório é obrigatório"),
  impedimentos: z.any().optional(),
  viabilidade: z.any().optional(),
  custos: z.any().optional(),
  precoSugerido: z.any().optional(),
});

export type SalvarAnaliseIAInput = z.infer<typeof salvarAnaliseIASchema>;
