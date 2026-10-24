import { z } from "zod";
import { roleSchema } from "./rbac.schema";

export const loginCredentialsSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve possuir ao menos 6 caracteres"),
});

export const seedDirectorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.literal("DIRETORIA"),
  ativo: z.literal(true),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  ativo: z.boolean(),
});

export type LoginCredentialsInput = z.infer<typeof loginCredentialsSchema>;
export type SeedDirectorContract = z.infer<typeof seedDirectorSchema>;
export type SessionUserContract = z.infer<typeof sessionUserSchema>;
