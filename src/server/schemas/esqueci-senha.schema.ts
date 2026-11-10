import { z } from "zod";

/**
 * Contrato de Esqueci Minha Senha / Recuperação de Acesso (Sprint 8 / PRD §6 / Issue #20 & #42)
 */
export const esqueciSenhaSchema = z.object({
  email: z
    .string()
    .min(1, "Informe o seu e-mail corporativo.")
    .email("Informe um e-mail válido."),
});

export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;

export const recuperarSenhaTokenQuerySchema = z.object({
  token: z
    .string()
    .trim()
    .min(6, "Token de recuperação inválido ou incompleto.")
    .max(256, "Token de recuperação inválido."),
});

export type RecuperarSenhaTokenQuery = z.infer<typeof recuperarSenhaTokenQuerySchema>;

export const recuperarSenhaSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(6, "Informe o código/token de recuperação recebido por e-mail.")
      .max(256, "Token de recuperação inválido."),
    novaSenha: z
      .string()
      .min(6, "A nova senha deve ter pelo menos 6 caracteres.")
      .max(128, "A nova senha não pode exceder 128 caracteres."),
    confirmarSenha: z
      .string()
      .min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.novaSenha === data.confirmarSenha, {
    message: "As senhas informadas não coincidem.",
    path: ["confirmarSenha"],
  });

export type RecuperarSenhaInput = z.infer<typeof recuperarSenhaSchema>;
