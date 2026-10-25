import { z } from "zod";
import { licitacaoStatusSchema } from "./licitacao.schema";

/**
 * Status válidos para o quadro Kanban e pipeline de licitações aceitas
 * (PRD §4.3 e sprint-2-spec §2.2).
 */
export const STATUS_PERDA = [
  "NAO_CONTEMPLADA_PRECO",
  "NAO_CONTEMPLADA_DOCUMENTACAO",
  "NAO_CONTEMPLADA_DESISTENCIA",
  "REVOGADA_ANULADA",
] as const;

export const kanbanStatusUpdateSchema = z
  .object({
    status: licitacaoStatusSchema,
    motivoPerda: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => {
      // Se for movido para status de perda ou desistência, exige motivo
      if (
        (STATUS_PERDA as readonly string[]).includes(data.status)
      ) {
        return Boolean(data.motivoPerda && data.motivoPerda.length > 0);
      }
      return true;
    },
    {
      message:
        "É obrigatório informar o motivo ao mover para não contemplada ou desistência",
      path: ["motivoPerda"],
    },
  );

export type KanbanStatusUpdateInput = z.infer<typeof kanbanStatusUpdateSchema>;
