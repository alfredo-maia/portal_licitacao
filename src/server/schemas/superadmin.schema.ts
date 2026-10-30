import { z } from "zod";

/**
 * Schema para solicitação de expansão de cota de armazenamento R2 com 1 clique (PRD §13 / ADR 0010)
 */
export const ExpansaoCotaStorageSchema = z.object({
  tenantId: z.string().min(1, "ID do Tenant é obrigatório"),
  adicionarMb: z.number().int().positive("Valor a adicionar em MB deve ser positivo"),
  motivo: z.string().optional().default("Expansão solicitada via Suporte / SuperAdmin"),
});

export type ExpansaoCotaStorageInput = z.infer<typeof ExpansaoCotaStorageSchema>;

/**
 * Métricas consolidadas do Backoffice Executivo SuperAdmin
 */
export const SuperAdminMetricsSchema = z.object({
  mrrEstimado: z.number().nonnegative(),
  totalTenants: z.number().int().nonnegative(),
  tenantsAtivos: z.number().int().nonnegative(),
  tenantsTrial: z.number().int().nonnegative(),
  tenantsGracePeriod: z.number().int().nonnegative(),
  tenantsBloqueados: z.number().int().nonnegative(),
  totalVolumeArrematado: z.number().nonnegative(),
  totalLicitacoesContempladas: z.number().int().nonnegative(),
  r2StorageTotalMb: z.number().nonnegative(),
  whatsappFilaPendentes: z.number().int().nonnegative(),
  whatsappInstanciaConectada: z.boolean(),
});

export type SuperAdminMetrics = z.infer<typeof SuperAdminMetricsSchema>;

/**
 * Item individual de Tenant na tabela de gestão do SuperAdmin
 */
export const SuperAdminTenantItemSchema = z.object({
  id: z.string(),
  cnpj: z.string(),
  razaoSocial: z.string(),
  nomeFantasia: z.string().optional().nullable(),
  plano: z.string(),
  billingStatus: z.enum(["TRIAL", "ATIVO", "GRACE_PERIOD", "BLOQUEADO", "CANCELADO"]),
  diasRestantesTrial: z.number().int(),
  diasAtraso: z.number().int(),
  cotaBaseMb: z.number(),
  cotaExtraMb: z.number(),
  cotaTotalMb: z.number(),
  espacoUsadoMb: z.number(),
  percentualUsado: z.number(),
  volumeArrematado: z.number(),
  totalContempladas: z.number().int(),
  criadoEm: z.date(),
});

export type SuperAdminTenantItem = z.infer<typeof SuperAdminTenantItemSchema>;
