import { z } from "zod";

/**
 * Contrato de Dados Corporativos da Empresa Licitante (PRD §4.11 / Anexo 4).
 */
export const configuracaoEmpresaSchema = z.object({
  id: z.string().default("default"),
  razaoSocial: z.string().trim().min(2, "Razão Social é obrigatória").max(255),
  cnpj: z.string().trim().min(14, "CNPJ é obrigatório").max(20),
  inscricaoEstadual: z.string().trim().max(50).optional().nullable(),
  cnae: z.string().trim().max(100).optional().nullable(),
  endereco: z.string().trim().min(5, "Endereço é obrigatório").max(255),
  cidade: z.string().trim().min(2, "Cidade é obrigatória").max(100),
  uf: z.string().trim().length(2, "UF deve ter 2 letras"),
  cep: z.string().trim().min(8, "CEP é obrigatório").max(10),
  representanteNome: z.string().trim().min(2, "Nome do representante é obrigatório").max(255),
  representanteCpf: z.string().trim().min(11, "CPF do representante é obrigatório").max(14),
  representanteRg: z.string().trim().max(50).optional().nullable(),
  representanteCargo: z.string().trim().min(2, "Cargo do representante é obrigatório").max(100),
  bancoNome: z.string().trim().max(100).optional().nullable(),
  agencia: z.string().trim().max(20).optional().nullable(),
  contaCorrente: z.string().trim().max(30).optional().nullable(),
  chavePix: z.string().trim().max(100).optional().nullable(),
  atualizadoEm: z.coerce.date().optional(),
});

export const configuracaoEmpresaAtualizarInputSchema = configuracaoEmpresaSchema.omit({
  id: true,
  atualizadoEm: true,
});

export type ConfiguracaoEmpresa = z.infer<typeof configuracaoEmpresaSchema>;
export type ConfiguracaoEmpresaAtualizarInput = z.infer<typeof configuracaoEmpresaAtualizarInputSchema>;

/**
 * Contrato de Gestão de Equipe & RBAC (PRD Anexo 4).
 */
export const usuarioRoleSchema = z.enum([
  "DIRETORIA",
  "ANALISTA_COMERCIAL",
  "OPERADOR",
  "OPERADOR_TECNICO",
]);
export type UsuarioRole = z.infer<typeof usuarioRoleSchema>;

export const usuarioEquipeItemSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  email: z.string().email(),
  role: usuarioRoleSchema,
  ativo: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const usuarioEquipeCriarInputSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().trim().email("E-mail corporativo inválido"),
  role: usuarioRoleSchema.default("ANALISTA_COMERCIAL"),
  password: z.string().min(6, "Senha provisória deve ter no mínimo 6 caracteres"),
  ativo: z.boolean().default(true),
});

export const usuarioEquipeAtualizarInputSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  role: usuarioRoleSchema.optional(),
  ativo: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export const usuarioEquipeListResponseSchema = z.object({
  ok: z.literal(true),
  total: z.number().int().nonnegative(),
  usuarios: z.array(usuarioEquipeItemSchema),
});

export type UsuarioEquipeItem = z.infer<typeof usuarioEquipeItemSchema>;
export type UsuarioEquipeCriarInput = z.infer<typeof usuarioEquipeCriarInputSchema>;
export type UsuarioEquipeAtualizarInput = z.infer<typeof usuarioEquipeAtualizarInputSchema>;
export type UsuarioEquipeListResponse = z.infer<typeof usuarioEquipeListResponseSchema>;
