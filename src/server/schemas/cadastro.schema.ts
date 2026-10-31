import { z } from "zod";
import { cnpjSchema, corporateEmailSchema } from "./tenant.schema";
import { sanitizarTelefoneBR } from "./whatsapp.schema";
import { MacroSegmentoEnum } from "./segmentos.schema";

/**
 * Contrato de Cadastro e Onboarding de Novas Contas (Sprint 6 / PRD §3, §4, §5)
 * Suporte a fluxo de 2 etapas com seleção de Macro-Segmentos, Sub-segmentos e UFs.
 */
export const cadastroContaSchema = z.object({
  cnpj: cnpjSchema,
  razaoSocial: z.string().min(3, "Razão Social deve ter ao menos 3 caracteres"),
  nomeResponsavel: z.string().min(2, "Nome do responsável deve ter ao menos 2 caracteres").optional(),
  nome: z.string().min(2, "Nome deve ter ao menos 2 caracteres").optional(),
  email: corporateEmailSchema,
  senha: z.string().min(6, "A senha deve conter ao menos 6 caracteres"),
  whatsapp: z.string().min(10, "Informe um telefone válido com DDD").transform(sanitizarTelefoneBR),
  segmentos: z
    .array(z.string())
    .min(1, "Selecione pelo menos um segmento de atuação."),
  subsegmentos: z.array(z.string()).default([]),
  ufs: z.array(z.string().length(2, "UF deve ter 2 letras")).default([]),
  brasilInteiro: z.boolean().default(true),
  segmentoPrincipal: z.string().optional(),
}).refine((data) => data.nomeResponsavel || data.nome, {
  message: "Informe o nome do responsável.",
  path: ["nomeResponsavel"],
});

export const cadastroSchema = cadastroContaSchema;

export type CadastroInput = z.input<typeof cadastroContaSchema>;
export type CadastroOutput = z.infer<typeof cadastroContaSchema>;
