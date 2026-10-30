import { z } from "zod";
import { isValidCnpj } from "@/lib/validations/cnpj";
import { validateCorporateEmail } from "@/lib/validations/email";

export const PlanoAssinaturaEnum = z.enum(["BASICO", "PRO", "ENTERPRISE"]);
export type PlanoAssinatura = z.infer<typeof PlanoAssinaturaEnum>;

export const TenantRoleEnum = z.enum(["TITULAR", "MEMBRO", "CONSULTOR"]);
export type TenantRole = z.infer<typeof TenantRoleEnum>;

/**
 * Limites e cotas oficiais por plano de assinatura (PRD §14 / ADR 0007)
 */
export const PLAN_LIMITS: Record<
  PlanoAssinatura,
  {
    maxCnpjs: number;
    maxUsers: number;
    maxMacroSegmentos: number;
    aiAnalisesMes: number;
    temRelatoriosDiretoria: boolean;
    temChatPregoeiro: boolean;
  }
> = {
  BASICO: {
    maxCnpjs: 1,
    maxUsers: 1,
    maxMacroSegmentos: 1,
    aiAnalisesMes: 0,
    temRelatoriosDiretoria: false,
    temChatPregoeiro: false,
  },
  PRO: {
    maxCnpjs: 2,
    maxUsers: 2,
    maxMacroSegmentos: 3,
    aiAnalisesMes: 20,
    temRelatoriosDiretoria: false,
    temChatPregoeiro: false,
  },
  ENTERPRISE: {
    maxCnpjs: 5,
    maxUsers: 5,
    maxMacroSegmentos: 7,
    aiAnalisesMes: 60,
    temRelatoriosDiretoria: true,
    temChatPregoeiro: true,
  },
} as const;

/**
 * Validação rigorosa de CNPJ em tempo de execução via Módulo 11 da Receita Federal
 */
export const cnpjSchema = z
  .string()
  .min(14, "CNPJ deve conter no mínimo 14 caracteres")
  .max(18, "CNPJ deve conter no máximo 18 caracteres")
  .refine((val) => isValidCnpj(val), {
    message: "CNPJ inválido de acordo com as regras da Receita Federal.",
  });

/**
 * Validação de e-mail corporativo com bloqueio de temporários
 */
export const corporateEmailSchema = z
  .string()
  .min(5, "E-mail muito curto")
  .max(150, "E-mail excede 150 caracteres")
  .refine((val) => validateCorporateEmail(val).isValid, {
    message:
      "E-mail corporativo inválido ou de provedor descartável não permitido.",
  })
  .transform((val) => val.trim().toLowerCase());

/**
 * Schema de criação de novo Tenant
 */
export const createTenantSchema = z.object({
  cnpj: cnpjSchema,
  razaoSocial: z.string().min(3, "Razão Social deve ter no mínimo 3 caracteres").max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  cnaePrincipal: z.string().max(20).optional().nullable(),
  endereco: z.string().max(255).optional().nullable(),
  cidade: z.string().max(100).optional().nullable(),
  uf: z.string().length(2, "UF deve conter exatamente 2 caracteres").optional().nullable(),
  plano: PlanoAssinaturaEnum.default("BASICO"),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

/**
 * Schema de atualização de Tenant
 */
export const updateTenantSchema = z.object({
  razaoSocial: z.string().min(3).max(200).optional(),
  nomeFantasia: z.string().max(200).optional().nullable(),
  cnaePrincipal: z.string().max(20).optional().nullable(),
  endereco: z.string().max(255).optional().nullable(),
  cidade: z.string().max(100).optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

/**
 * Schema para convidar membro para a equipe do Tenant
 */
export const inviteMemberSchema = z.object({
  email: corporateEmailSchema,
  role: TenantRoleEnum.default("MEMBRO"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Schema para aceitar convite de equipe
 */
export const acceptInviteSchema = z.object({
  token: z.string().min(10, "Token de convite inválido"),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/**
 * Schema para troca de Tenant ativo na sessão
 */
export const switchTenantSchema = z.object({
  tenantId: z.string().min(1, "ID do Tenant é obrigatório"),
});
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;

/**
 * Schema para reivindicação/contestação de titularidade de CNPJ
 */
export const disputeClaimCnpjSchema = z.object({
  cnpj: cnpjSchema,
  motivo: z.string().min(10, "Explique o motivo da reivindicação").max(500),
  metodo: z.enum(["EMAIL_RECEITA", "SUPORTE_DOCUMENTAL"]).default("EMAIL_RECEITA"),
});
export type DisputeClaimCnpjInput = z.infer<typeof disputeClaimCnpjSchema>;
