import { z } from "zod";

/**
 * Contrato de gestão de equipe para uma licitação (PRD §4.4.1 B e sprint-2-spec §2.2).
 * Permite definir 1 responsável único e múltiplos membros atribuídos.
 */
export const equipeUpdateSchema = z.object({
  responsavelId: z.string().nullable().optional(),
  atribuidoIds: z.array(z.string()).default([]),
});

export type EquipeUpdateInput = z.infer<typeof equipeUpdateSchema>;
