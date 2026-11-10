import { z } from "zod";

export const cartaoCnpjExtraidoSchema = z.object({
  cnpj: z.string().trim().min(14).max(20),
  razaoSocial: z.string().trim().min(2).max(255),
  nomeFantasia: z.string().trim().max(255).nullable().optional().default(null),
  cnaePrincipal: z.string().trim().max(255).nullable().optional().default(null),
  cnaesSecundarios: z.array(z.string().trim().min(1).max(255)).default([]),
  cep: z.string().trim().max(12).nullable().optional().default(null),
  endereco: z.string().trim().max(255).nullable().optional().default(null),
  numero: z.string().trim().max(30).nullable().optional().default(null),
  complemento: z.string().trim().max(120).nullable().optional().default(null),
  bairro: z.string().trim().max(120).nullable().optional().default(null),
  cidade: z.string().trim().max(120).nullable().optional().default(null),
  uf: z.string().trim().max(2).nullable().optional().default(null),
  situacaoCadastral: z.string().trim().max(80).nullable().optional().default(null),
  origemExtracao: z.enum(["REGEX_RFB", "LLM_MULTIMODAL", "HIBRIDO"]).default("REGEX_RFB"),
});

export type CartaoCnpjExtraido = z.infer<typeof cartaoCnpjExtraidoSchema>;

export const importarCartaoCnpjModoSchema = z
  .enum(["atualizar_ativo", "extracao_preview"])
  .default("atualizar_ativo");

export type ImportarCartaoCnpjModo = z.infer<typeof importarCartaoCnpjModoSchema>;
