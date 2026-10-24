import { z } from "zod";

export const roleSchema = z.enum([
  "DIRETORIA",
  "ANALISTA_COMERCIAL",
  "OPERADOR",
]);

export const rbacActionSchema = z.enum([
  "view",
  "read",
  "create",
  "update",
  "delete",
  "decide_go_nogo",
  "approve_price",
  "discard",
  "manage_team",
  "audit",
  "upload",
  "generate_declaration",
  "impugnar",
  "export",
  "licitacao:decide",
  "licitacao:create",
]);

export const rbacResourceSchema = z.enum([
  "dashboard",
  "oportunidades",
  "minhas-licitacoes",
  "calendario",
  "portais",
  "documentacao",
  "declaracoes",
  "impugnacoes",
  "robo-de-lances",
  "notificacoes",
  "configuracoes",
  "licitacao",
  "audit_log",
  "equipe",
]);

export const rbacUserSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: roleSchema,
  ativo: z.boolean().default(true),
});

export type RoleContract = z.infer<typeof roleSchema>;
export type RbacActionContract = z.infer<typeof rbacActionSchema>;
export type RbacResourceContract = z.infer<typeof rbacResourceSchema>;
export type RbacUserContract = z.infer<typeof rbacUserSchema>;
