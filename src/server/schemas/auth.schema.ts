import { z } from "zod";
import { roleSchema } from "./rbac.schema";

/**
 * Validade da sessão JWT: 30 dias (PRD §4.2 / ADR 0007)
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 2.592.000 segundos

export const authMethodSchema = z.enum([
  "PASSWORD",
  "WHATSAPP_OTP",
  "EMAIL_OTP",
]);
export type AuthMethod = z.infer<typeof authMethodSchema>;

export const loginCredentialsSchema = z.object({
  email: z.string().email("E-mail inválido").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(6, "A senha deve possuir ao menos 6 caracteres"),
});

export const requestOtpSchema = z.object({
  email: z.string().email("E-mail corporativo inválido").transform((v) => v.trim().toLowerCase()),
  method: z.enum(["WHATSAPP_OTP", "EMAIL_OTP"]),
});

export const verifyOtpSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  code: z.string().length(6, "O código de validação deve possuir exatamente 6 dígitos numéricos"),
});

export const seedDirectorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  role: z.literal("DIRETORIA"),
  ativo: z.literal(true),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  ativo: z.boolean(),
  activeTenantId: z.string().nullable().optional(),
  cnpj: z.string().nullable().optional(),
  plano: z.string().nullable().optional(),
  tenantRole: z.string().nullable().optional(),
});

export type LoginCredentialsInput = z.infer<typeof loginCredentialsSchema>;
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type SeedDirectorContract = z.infer<typeof seedDirectorSchema>;
export type SessionUserContract = z.infer<typeof sessionUserSchema>;
