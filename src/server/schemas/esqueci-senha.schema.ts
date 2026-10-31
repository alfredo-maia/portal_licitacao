import { z } from "zod";

/**
 * Contrato de Esqueci Minha Senha / Recuperação de Acesso (Sprint 8 / PRD §6 / Issue #20)
 */
export const esqueciSenhaSchema = z.object({
  email: z
    .string()
    .min(1, "Informe o seu e-mail corporativo.")
    .email("Informe um e-mail válido."),
});

export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;
