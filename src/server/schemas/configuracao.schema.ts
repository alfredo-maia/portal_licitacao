import { z } from "zod";

/**
 * Contrato de Dados Corporativos da Empresa Licitante (PRD §4.11 / Anexo 4).
 */
export const configuracaoEmpresaSchema = z.object({
  id: z.string().default("default"),
  razaoSocial: z.string().trim().min(2, "Razão Social é obrigatória").max(255),
  cnpj: z.string().trim().min(14, "CNPJ é obrigatório").max(20),
  inscricaoEstadual: z.string().trim().max(50).optional().nullable(),
  inscricaoMunicipal: z.string().trim().max(50).optional().nullable(),
  cnae: z.string().trim().max(100).optional().nullable(),
  endereco: z.string().trim().min(5, "Endereço é obrigatório").max(255),
  numero: z.string().trim().max(30).optional().nullable(),
  complemento: z.string().trim().max(100).optional().nullable(),
  bairro: z.string().trim().max(100).optional().nullable(),
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
 * Contrato de Meu Perfil (Dados Pessoais, Endereço e Segurança)
 */
export const meuPerfilSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  email: z.string().email(),
  cpf: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
});

export const meuPerfilAtualizarInputSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter no mínimo 2 caracteres").optional(),
  cpf: z.string().trim().max(20).optional().nullable(),
  telefone: z.string().trim().max(30).optional().nullable(),
  cep: z.string().trim().max(12).optional().nullable(),
  logradouro: z.string().trim().max(255).optional().nullable(),
  numero: z.string().trim().max(30).optional().nullable(),
  complemento: z.string().trim().max(100).optional().nullable(),
  bairro: z.string().trim().max(100).optional().nullable(),
  cidade: z.string().trim().max(100).optional().nullable(),
  uf: z.string().trim().max(2).optional().nullable(),
  novaSenha: z.string().optional().nullable(),
  confirmarNovaSenha: z.string().optional().nullable(),
});

export type MeuPerfil = z.infer<typeof meuPerfilSchema>;
export type MeuPerfilAtualizarInput = z.infer<typeof meuPerfilAtualizarInputSchema>;

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
  role: z.enum(["DIRETORIA", "ANALISTA_COMERCIAL", "OPERADOR", "OPERADOR_TECNICO"]).default("ANALISTA_COMERCIAL"),
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
export type UsuarioEquipeCriarInput = z.input<typeof usuarioEquipeCriarInputSchema>;
export type UsuarioEquipeAtualizarInput = z.infer<typeof usuarioEquipeAtualizarInputSchema>;
export type UsuarioEquipeListResponse = z.infer<typeof usuarioEquipeListResponseSchema>;
