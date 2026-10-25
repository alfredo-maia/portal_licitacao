import { z } from "zod";

/**
 * Contrato para cadastro de repositório de benchmarking (PRD §4.4.1 E e sprint-2-spec §2.2).
 * Limite estrito de 5 links por certame validado na camada de serviço.
 */
export const criarRepositorioSchema = z.object({
  nome: z.string().trim().min(1, "Nome do repositório é obrigatório").max(100),
  url: z.string().trim().url("URL do repositório deve ser válida"),
});

export type CriarRepositorioInput = z.infer<typeof criarRepositorioSchema>;
