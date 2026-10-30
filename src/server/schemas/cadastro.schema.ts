import { z } from "zod";
import { cnpjSchema, corporateEmailSchema } from "./tenant.schema";
import { sanitizarTelefoneBR } from "./whatsapp.schema";

/**
 * Contrato de Cadastro e Onboarding de Novas Contas (PRD §3, §4, §5 / Issue #13)
 * Criação da conta com 14 dias de Trial gratuito sem cartão de crédito.
 */
export const cadastroSchema = z.object({
  nome: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  email: corporateEmailSchema,
  senha: z.string().min(6, "A senha deve conter ao menos 6 caracteres"),
  cnpj: cnpjSchema,
  razaoSocial: z.string().min(3, "Razão Social deve ter ao menos 3 caracteres"),
  whatsapp: z.string().min(10, "Telefone inválido").transform(sanitizarTelefoneBR),
  segmentoPrincipal: z.string().optional().default("SAUDE_MEDICAMENTOS"),
});

export type CadastroInput = z.input<typeof cadastroSchema>;
export type CadastroOutput = z.infer<typeof cadastroSchema>;
