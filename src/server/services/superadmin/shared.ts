import { randomUUID } from "node:crypto";
import {
  LicitacaoStatus,
  PlanoAssinatura,
  Prisma,
  TenantBillingStatus,
  type Licitacao,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanCnpj, formatCnpj } from "@/lib/validations/cnpj";
import { getAuditActorContext, recordAuditLog } from "@/server/audit";
import {
  ASAAS_PLAN_PRICES_BRL,
  calcularStatusFaturamento,
  type TenantBillingStatusType,
} from "@/server/schemas/asaas.schema";
import { PLAN_STORAGE_QUOTAS_MB } from "@/server/schemas/storage-r2.schema";
import {
  ExpansaoCotaStorageInput,
  ExpansaoCotaStorageSchema,
  OnboardingChecklist,
  SuperAdminTenantItem,
} from "@/server/schemas/superadmin.schema";
import {
  inMemoryCnpjDisputes,
  inMemoryTenants,
  inMemoryTenantUsers,
  type InMemoryTenantRecord,
} from "@/server/services/tenant.service";
import {
  getMemoryTenantExtraAiQuota,
} from "@/server/services/analise-ia-participacao.service";
import {
  getInMemoryConfiguracaoEmpresa,
  getInMemoryLicitacaoById,
  listInMemoryDocumentos,
  listInMemoryImpugnacoes,
  listInMemoryPortais,
  listInMemoryTenantLicitacoes,
} from "@/server/services/licitacoes-store";

/* =========================================================================
   Constantes, Tipos & Helpers de Erro / Persistência
========================================================================= */

export const DEMO_TENANT_ID = "tnt_demo_01";
export const DEMO_USER_ID = "usr_demo_titular";
export const DIA_MS = 86400000;
export const USD_BRL = Number(process.env.USD_BRL_RATE) || 5.5;
export const MASTER_EMAIL = "vitorhenrique018@gmail.com";

export const VALOR_PLANO: Record<string, number> = {
  BASICO: ASAAS_PLAN_PRICES_BRL.BASICO,
  PRO: ASAAS_PLAN_PRICES_BRL.PRO,
  ENTERPRISE: ASAAS_PLAN_PRICES_BRL.ENTERPRISE,
};

export type TypedHttpError = Error & { statusCode: number };

export function typedError(message: string, statusCode: number): TypedHttpError {
  return Object.assign(new Error(message), { statusCode });
}

export function getPrismaErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erro inesperado";
}

export async function dbTry<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

export function ehIdDemo(id?: string | null): boolean {
  return Boolean(id && (id.startsWith("tnt_demo_") || id.startsWith("usr_demo_")));
}

/* =========================================================================
   Stores Tipados em Memória (Fallback Resiliente Postgres -> Memória)
========================================================================= */

export interface MemUser {
  id: string;
  name: string;
  email: string;
  role: string;
  ativo: boolean;
  isSuperAdmin?: boolean;
  adminRole?: string | null;
  sessionVersion: number;
  cpf?: string | null;
  telefone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  ultimoLoginEm?: Date | null;
  criadoEm: Date;
}

export interface MemTenantExtras {
  storageExtraQuotaMb?: number;
  aiExtraQuotaMes?: number;
  affiliateId?: string | null;
  cupomCodigo?: string | null;
  notasInternasAdm?: string | null;
  ultimaAtividadeEm?: Date | null;
  telefone?: string | null;
  billingStatus?: TenantBillingStatusType;
}

export interface MemAffiliate {
  id: string;
  nome: string;
  documento: string | null;
  email: string;
  telefone: string | null;
  chavePix: string | null;
  codigo: string;
  percentualComissao: number;
  tipoComissao: string;
  descontoIndicadosPct: number;
  diasExtrasTrial: number;
  ativo: boolean;
  observacoes: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface MemAffiliateCommission {
  id: string;
  affiliateId: string;
  tenantId: string | null;
  tenantNome: string | null;
  competenciaMes: string;
  valorBasePlano: number;
  percentualAplicado: number;
  valorComissao: number;
  status: string;
  pagoEm: Date | null;
  comprovanteObs: string | null;
  criadoEm: Date;
}

export interface MemCoupon {
  id: string;
  codigo: string;
  descricao: string | null;
  descontoPercentual: number;
  diasExtrasTrial: number;
  affiliateId: string | null;
  maxUsos: number | null;
  usosAtuais: number;
  ativo: boolean;
  expiraEm: Date | null;
  criadoEm: Date;
}

export interface MemAiLog {
  id: string;
  tenantId: string | null;
  userId: string | null;
  usuarioNome: string | null;
  empresaNome: string | null;
  licitacaoId: string | null;
  feature: string;
  provider: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  custoEstimadoUsd: number;
  custoEstimadoBrl: number;
  duracaoMs: number;
  status: string;
  erro: string | null;
  criadoEm: Date;
}

export interface MemBroadcast {
  id: string;
  titulo: string;
  mensagem: string;
  severidade: string;
  formato: string;
  publicoAlvo: string;
  targetIds: string[];
  linkDestino: string | null;
  ativo: boolean;
  expiraEm: Date | null;
  criadoPorId: string | null;
  criadoPorNome: string | null;
  totalDestinatarios: number;
  criadoEm: Date;
}

export interface MemDispute {
  id: string;
  cnpj: string;
  tenantAtualId: string | null;
  requerenteUserId: string | null;
  requerenteNome: string;
  requerenteEmail: string;
  motivo: string;
  metodo: string;
  status: string;
  decididoPorNome: string | null;
  decididoEm: Date | null;
  criadoEm: Date;
}

export interface WhatsAppConfigState {
  minDelaySegundos: number;
  maxDelaySegundos: number;
  limiteDiarioWarmup: number;
  janelaInicio: string;
  janelaFim: string;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfigState = {
  minDelaySegundos: 4,
  maxDelaySegundos: 9,
  limiteDiarioWarmup: 30,
  janelaInicio: "08:00",
  janelaFim: "18:00",
};

export const memoryTenantExtraQuota = new Map<string, number>();
export const memUsers = new Map<string, MemUser>();
export const memTenantExtras = new Map<string, MemTenantExtras>();
export const memAffiliates = new Map<string, MemAffiliate>();
export const memCommissions = new Map<string, MemAffiliateCommission>();
export const memCoupons = new Map<string, MemCoupon>();
export const memAiLogs: MemAiLog[] = [];
export const memBroadcasts = new Map<string, MemBroadcast>();
export const memDisputes = new Map<string, MemDispute>();
export const memAdminUsers = new Map<string, MemUser>();
export const memLicitacoesExcluidas = new Set<string>();
const memSettings = new Map<string, unknown>();

let memWhatsAppConfig: WhatsAppConfigState = { ...DEFAULT_WHATSAPP_CONFIG };

export function getMemWhatsAppConfig(): WhatsAppConfigState {
  return { ...memWhatsAppConfig };
}

export function setMemWhatsAppConfig(next: WhatsAppConfigState): void {
  memWhatsAppConfig = { ...next };
}

/** Semeia o cliente demonstrativo apenas quando o Postgres está indisponível (ou id demo explícito). */
export function garantirSementeDemo(): void {
  if (!inMemoryTenants.has(DEMO_TENANT_ID)) {
    const agora = new Date();
    const rec: InMemoryTenantRecord = {
      id: DEMO_TENANT_ID,
      cnpj: "12.345.678/0001-90",
      razaoSocial: "Alfredo Maia Licitações Ltda",
      nomeFantasia: "Grupo Maia",
      plano: "PRO",
      billingStatus: "ATIVO",
      trialFim: null,
      vencimentoAssinatura: new Date(Date.now() + 20 * DIA_MS),
      ultimoPagamentoEm: new Date(Date.now() - 10 * DIA_MS),
      segmentos: ["TECNOLOGIA_INFORMATICA"],
      ufs: ["GO"],
      brasilInteiro: false,
      uf: "GO",
      cidade: "Goiânia",
      maxCnpjs: 2,
      maxUsers: 2,
      ativo: true,
      criadoEm: new Date(Date.now() - 30 * DIA_MS),
      updatedAt: agora,
    };
    inMemoryTenants.set(DEMO_TENANT_ID, rec);
  }
  if (!memUsers.has(DEMO_USER_ID)) {
    memUsers.set(DEMO_USER_ID, {
      id: DEMO_USER_ID,
      name: "Carlos Silva",
      email: "carlos.silva@grupomaia.com.br",
      role: "DIRETORIA",
      ativo: true,
      sessionVersion: 1,
      telefone: "62999990000",
      cidade: "Goiânia",
      uf: "GO",
      criadoEm: new Date(Date.now() - 30 * DIA_MS),
    });
  }
  if (
    !inMemoryTenantUsers.some(
      (m) => m.tenantId === DEMO_TENANT_ID && m.userId === DEMO_USER_ID,
    )
  ) {
    inMemoryTenantUsers.push({
      id: `tu_${randomUUID()}`,
      tenantId: DEMO_TENANT_ID,
      userId: DEMO_USER_ID,
      userEmail: "carlos.silva@grupomaia.com.br",
      userName: "Carlos Silva",
      role: "TITULAR",
      ativo: true,
      criadoEm: new Date(Date.now() - 30 * DIA_MS),
    });
  }
}

export async function registrarAuditoriaAdm(
  acao: string,
  entidadeTipo: string,
  entidadeId: string,
  depois?: Record<string, unknown>,
  tenantId?: string | null,
  antes?: Record<string, unknown>,
): Promise<void> {
  const actor = getAuditActorContext();
  try {
    await recordAuditLog({
      usuarioId: actor?.usuarioId ?? null,
      usuarioNome: actor?.usuarioNome ?? "SuperAdmin Backoffice",
      acao: `ADMIN_${acao}`,
      entidadeTipo,
      entidadeId,
      tenantId: tenantId ?? null,
      antes: antes ?? null,
      depois: depois ?? null,
    });
  } catch {
    // auditoria nunca deve quebrar a operação administrativa
  }
}

/* =========================================================================
   Persistência de Configurações do ADM (Prisma `adminSetting` + memória)
========================================================================= */

export async function lerSetting<T>(key: string, padrao: T): Promise<T> {
  if (process.env.VITEST !== "true") {
    const row = await dbTry(() =>
      prisma.adminSetting.findUnique({ where: { key } }),
    );
    if (row && row.value !== null && row.value !== undefined) {
      return row.value as T;
    }
  }
  return (memSettings.get(key) as T | undefined) ?? padrao;
}

export async function gravarSetting(key: string, value: unknown): Promise<void> {
  memSettings.set(key, value);
  if (process.env.VITEST === "true") return;
  const jsonValue = value as Prisma.InputJsonValue;
  await dbTry(() =>
    prisma.adminSetting.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue },
    }),
  );
}

/* =========================================================================
   Modelo Normalizado de Tenant (Postgres ⇄ Memória)
========================================================================= */

export interface RawTenantUser {
  userId: string;
  name: string;
  email: string;
  telefone?: string | null;
  role: string;
  userRole?: string;
  ativo: boolean;
}

export interface RawTenant {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  plano: string;
  billingStatus?: string | null;
  trialFim?: Date | null;
  vencimentoAssinatura?: Date | null;
  ultimoPagamentoEm?: Date | null;
  maxCnpjs: number;
  maxUsers: number;
  ativo: boolean;
  telefone?: string | null;
  uf?: string | null;
  cidade?: string | null;
  segmentos: string[];
  ufs: string[];
  brasilInteiro: boolean;
  preferenciasUpdatedAt?: Date | null;
  configPreferenciasUpdatedAt?: Date | null;
  storageExtraQuotaMb: number;
  aiExtraQuotaMes: number;
  affiliateId?: string | null;
  cupomCodigo?: string | null;
  notasInternasAdm?: string | null;
  criadoEm: Date;
  ultimaAtividadeEm?: Date | null;
  kanbanStatuses: string[];
  valorContempladas: number;
  totalContempladas: number;
  docBytes: number;
  docCount: number;
  hasConfig: boolean;
  hasCalculadoraOrPrecos: boolean;
  users: RawTenantUser[];
}

export const INCLUDE_TENANT_RAW = {
  licitacoes: {
    select: {
      statusKanban: true,
      lanceMinimo: true,
      valorHomologado: true,
      calculadoraDados: true,
      licitacao: { select: { valorEstimado: true } },
    },
  },
  documentos: { select: { arquivoTamanho: true } },
  configuracao: {
    select: {
      razaoSocial: true,
      cnae: true,
      cnaesSecundarios: true,
      endereco: true,
      cidade: true,
      uf: true,
      cep: true,
      inscricaoEstadual: true,
      inscricaoMunicipal: true,
      representanteCpf: true,
      bancoNome: true,
      chavePix: true,
      preferenciasUpdatedAt: true,
    },
  },
  _count: {
    select: { precosSalvos: true },
  },
  users: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          telefone: true,
          ativo: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.TenantInclude;

type DbTenantWithRaw = Prisma.TenantGetPayload<{ include: typeof INCLUDE_TENANT_RAW }>;

interface StoredDocumentShape {
  id: string;
  tenantId?: string | null;
  nome?: string;
  categoria?: string;
  dataVencimento?: Date | string | null;
  status?: string | null;
  arquivoTamanho?: number | null;
}

interface StoredConfigShape {
  razaoSocial?: string | null;
  cnae?: string | null;
  cnaesSecundarios?: string[];
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  inscricaoEstadual?: string | null;
  inscricaoMunicipal?: string | null;
  representanteCpf?: string | null;
  bancoNome?: string | null;
  chavePix?: string | null;
  preferenciasUpdatedAt?: Date | string | null;
}

function temCamposCorporativosPreenchidos(
  cfg: StoredConfigShape | null | undefined,
  tenantExtra?: {
    cnaePrincipal?: string | null;
    cnaesSecundarios?: string[];
    endereco?: string | null;
  },
): boolean {
  if (
    Boolean(tenantExtra?.cnaePrincipal?.trim()) ||
    (tenantExtra?.cnaesSecundarios?.length ?? 0) > 0 ||
    Boolean(tenantExtra?.endereco?.trim())
  ) {
    return true;
  }
  if (!cfg) return false;
  const cpf = cfg.representanteCpf?.trim() ?? "";
  return Boolean(
    cfg.cnae?.trim() ||
      (Array.isArray(cfg.cnaesSecundarios) && cfg.cnaesSecundarios.length > 0) ||
      cfg.endereco?.trim() ||
      cfg.cidade?.trim() ||
      cfg.cep?.trim() ||
      cfg.inscricaoEstadual?.trim() ||
      cfg.inscricaoMunicipal?.trim() ||
      (cpf.length > 0 && cpf !== "000.000.000-00") ||
      cfg.bancoNome?.trim() ||
      cfg.chavePix?.trim(),
  );
}

export function rawDeDb(t: DbTenantWithRaw): RawTenant {
  let valorContempladas = 0;
  let totalContempladas = 0;
  let hasCalculadora = false;
  const kanbanStatuses: string[] = [];

  for (const l of t.licitacoes) {
    kanbanStatuses.push(String(l.statusKanban));
    if (l.calculadoraDados !== null && l.calculadoraDados !== undefined) {
      hasCalculadora = true;
    }
    if (l.statusKanban === "CONTEMPLADA") {
      totalContempladas++;
      valorContempladas +=
        l.valorHomologado || l.lanceMinimo || l.licitacao?.valorEstimado || 0;
    }
  }

  let docBytes = 0;
  for (const d of t.documentos) docBytes += d.arquivoTamanho || 0;
  const cfg = t.configuracao;

  return {
    id: t.id,
    cnpj: t.cnpj,
    razaoSocial: t.razaoSocial,
    nomeFantasia: t.nomeFantasia,
    plano: String(t.plano),
    billingStatus: t.billingStatus,
    trialFim: t.trialFim,
    vencimentoAssinatura: t.vencimentoAssinatura,
    ultimoPagamentoEm: t.ultimoPagamentoEm,
    maxCnpjs: t.maxCnpjs ?? 1,
    maxUsers: t.maxUsers ?? 1,
    ativo: t.ativo !== false,
    telefone: t.telefone,
    uf: t.uf,
    cidade: t.cidade,
    segmentos: t.segmentos || [],
    ufs: t.ufs || [],
    brasilInteiro: t.brasilInteiro ?? true,
    preferenciasUpdatedAt: t.preferenciasUpdatedAt ?? null,
    configPreferenciasUpdatedAt: cfg?.preferenciasUpdatedAt ?? null,
    storageExtraQuotaMb: t.storageExtraQuotaMb || 0,
    aiExtraQuotaMes: t.aiExtraQuotaMes || 0,
    affiliateId: t.affiliateId,
    cupomCodigo: t.cupomCodigo,
    notasInternasAdm: t.notasInternasAdm,
    criadoEm: t.criadoEm,
    ultimaAtividadeEm: t.ultimaAtividadeEm,
    kanbanStatuses,
    valorContempladas,
    totalContempladas,
    docBytes,
    docCount: t.documentos.length,
    hasConfig: temCamposCorporativosPreenchidos(cfg, {
      cnaePrincipal: t.cnaePrincipal,
      cnaesSecundarios: t.cnaesSecundarios,
      endereco: t.endereco,
    }),
    hasCalculadoraOrPrecos: hasCalculadora || (t._count?.precosSalvos ?? 0) > 0,
    users: t.users.map((tu) => ({
      userId: tu.userId,
      name: tu.user?.name || "—",
      email: tu.user?.email || "—",
      telefone: tu.user?.telefone ?? null,
      role: String(tu.role),
      userRole: tu.user?.role ? String(tu.user.role) : undefined,
      ativo: tu.ativo !== false && tu.user?.ativo !== false,
    })),
  };
}

export function rawDeMemoria(t: InMemoryTenantRecord): RawTenant {
  const extras = memTenantExtras.get(t.id) || {};
  const kanban = listInMemoryTenantLicitacoes(t.id);
  let valorContempladas = 0;
  let totalContempladas = 0;
  let hasCalculadora = false;

  for (const k of kanban) {
    if (k.calculadoraDados !== null && k.calculadoraDados !== undefined) {
      hasCalculadora = true;
    }
    if (k.statusKanban === "CONTEMPLADA") {
      totalContempladas++;
      valorContempladas +=
        k.valorHomologado ||
        k.lanceMinimo ||
        getInMemoryLicitacaoById(k.licitacaoId)?.valorEstimado ||
        0;
    }
  }

  const rawDocs = listInMemoryDocumentos() as StoredDocumentShape[];
  const docs = rawDocs.filter((d) => d.tenantId === t.id);
  const cfg = getInMemoryConfiguracaoEmpresa(t.id) as StoredConfigShape | null;
  const configPrefRaw = cfg?.preferenciasUpdatedAt;
  const configPrefDate = configPrefRaw ? new Date(configPrefRaw) : null;

  return {
    id: t.id,
    cnpj: t.cnpj,
    razaoSocial: t.razaoSocial,
    nomeFantasia: t.nomeFantasia,
    plano: String(t.plano),
    billingStatus: extras.billingStatus ?? t.billingStatus ?? null,
    trialFim: t.trialFim ?? null,
    vencimentoAssinatura: t.vencimentoAssinatura ?? null,
    ultimoPagamentoEm: t.ultimoPagamentoEm ?? null,
    maxCnpjs: t.maxCnpjs,
    maxUsers: t.maxUsers,
    ativo: t.ativo,
    telefone: extras.telefone ?? null,
    uf: t.uf,
    cidade: t.cidade,
    segmentos: t.segmentos || [],
    ufs: t.ufs || [],
    brasilInteiro: t.brasilInteiro ?? true,
    preferenciasUpdatedAt: t.preferenciasUpdatedAt ?? null,
    configPreferenciasUpdatedAt:
      configPrefDate && !Number.isNaN(configPrefDate.getTime()) ? configPrefDate : null,
    storageExtraQuotaMb:
      extras.storageExtraQuotaMb ?? memoryTenantExtraQuota.get(t.id) ?? 0,
    aiExtraQuotaMes: extras.aiExtraQuotaMes ?? getMemoryTenantExtraAiQuota(t.id),
    affiliateId: extras.affiliateId !== undefined ? extras.affiliateId : (t.affiliateId ?? null),
    cupomCodigo: extras.cupomCodigo !== undefined ? extras.cupomCodigo : (t.cupomCodigo ?? null),
    notasInternasAdm: extras.notasInternasAdm ?? null,
    criadoEm: t.criadoEm,
    ultimaAtividadeEm: extras.ultimaAtividadeEm ?? null,
    kanbanStatuses: kanban.map((k) => k.statusKanban),
    valorContempladas,
    totalContempladas,
    docBytes: docs.reduce((acc, d) => acc + (d.arquivoTamanho || 0), 0),
    docCount: docs.length,
    hasConfig: temCamposCorporativosPreenchidos(cfg, {
      cnaePrincipal: t.cnaePrincipal,
      cnaesSecundarios: t.cnaesSecundarios,
      endereco: t.endereco,
    }),
    hasCalculadoraOrPrecos: hasCalculadora,
    users: inMemoryTenantUsers
      .filter((m) => m.tenantId === t.id)
      .map((m) => ({
        userId: m.userId,
        name: memUsers.get(m.userId)?.name || m.userName,
        email: memUsers.get(m.userId)?.email || m.userEmail,
        telefone: memUsers.get(m.userId)?.telefone ?? null,
        role: String(m.role),
        userRole: memUsers.get(m.userId)?.role,
        ativo: m.ativo && memUsers.get(m.userId)?.ativo !== false,
      })),
  };
}

export async function carregarRawTenantsDb(
  where?: Prisma.TenantWhereInput,
): Promise<RawTenant[] | undefined> {
  const rows = await dbTry(() =>
    prisma.tenant.findMany({
      where,
      include: INCLUDE_TENANT_RAW,
      orderBy: { criadoEm: "desc" },
    }),
  );
  if (!Array.isArray(rows)) return undefined;
  return rows.map(rawDeDb);
}

export async function carregarRawTenant(
  tenantId: string,
): Promise<{ raw: RawTenant; origem: "db" | "mem" } | null> {
  if (ehIdDemo(tenantId)) garantirSementeDemo();
  const rows = await carregarRawTenantsDb({ id: tenantId });
  if (rows && rows[0]) return { raw: rows[0], origem: "db" };
  const mem = inMemoryTenants.get(tenantId);
  if (mem) return { raw: rawDeMemoria(mem), origem: "mem" };
  return null;
}

export function statusEfetivo(raw: RawTenant): {
  status: TenantBillingStatusType;
  diasRestantesTrial: number;
  diasAtraso: number;
} {
  if (raw.billingStatus === "CANCELADO") {
    return { status: "CANCELADO", diasRestantesTrial: 0, diasAtraso: 0 };
  }
  const calc = calcularStatusFaturamento({
    plano: raw.plano,
    trialFim: raw.trialFim ?? null,
    vencimentoAssinatura: raw.vencimentoAssinatura ?? null,
    ultimoPagamentoEm: raw.ultimoPagamentoEm ?? null,
  });
  return {
    status: calc.status,
    diasRestantesTrial: calc.diasRestantesTrial,
    diasAtraso: calc.diasAtraso,
  };
}

/* =========================================================================
   Termômetro de Onboarding do Trial (7 marcos)
========================================================================= */

export function calcularOnboardingChecklist(params: {
  cnpjCadastrado?: boolean;
  filtrosConfigurados?: boolean;
  empresaPreenchida?: boolean;
  documentoCofreEnviado?: boolean;
  licitacaoNoKanban?: boolean;
  iaOuCalculadoraUsada?: boolean;
}): OnboardingChecklist {
  const marcos = {
    contaCriada: true,
    cnpjCadastrado: Boolean(params.cnpjCadastrado),
    filtrosConfigurados: Boolean(params.filtrosConfigurados),
    empresaPreenchida: Boolean(params.empresaPreenchida),
    documentoCofreEnviado: Boolean(params.documentoCofreEnviado),
    licitacaoNoKanban: Boolean(params.licitacaoNoKanban),
    iaOuCalculadoraUsada: Boolean(params.iaOuCalculadoraUsada),
  };
  const score = Object.values(marcos).filter(Boolean).length;
  const statusEngajamento: OnboardingChecklist["statusEngajamento"] =
    score <= 2 ? "CADASTROU_E_SAIU" : score >= 6 ? "ENGAJADO" : "EM_CONFIGURACAO";
  return {
    ...marcos,
    score,
    percentual: Math.round((score / 7) * 100),
    statusEngajamento,
  };
}

export function onboardingDeRaw(raw: RawTenant, usosIa: number): OnboardingChecklist {
  const filtrosConfigurados =
    Boolean(raw.preferenciasUpdatedAt || raw.configPreferenciasUpdatedAt) ||
    raw.segmentos.length > 1 ||
    (!raw.brasilInteiro && raw.ufs.length > 1);

  return calcularOnboardingChecklist({
    cnpjCadastrado: Boolean(raw.cnpj && !raw.cnpj.startsWith("00.000.000")),
    filtrosConfigurados,
    empresaPreenchida: raw.hasConfig,
    documentoCofreEnviado: raw.docCount > 0,
    licitacaoNoKanban: raw.kanbanStatuses.length > 0,
    iaOuCalculadoraUsada: usosIa > 0 || raw.hasCalculadoraOrPrecos,
  });
}

/* =========================================================================
   Telemetria de IA — helpers de data e leitura unificada
========================================================================= */

export function precoPorMilhaoUsd(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes("lite")) return { input: 0.1, output: 0.4 };
  if (m.includes("2.0-flash")) return { input: 0.1, output: 0.4 };
  if (m.includes("gemini")) return { input: 0.3, output: 2.5 };
  if (m.includes("gpt-4o-mini")) return { input: 0.15, output: 0.6 };
  if (m.includes("gpt-4o")) return { input: 2.5, output: 10 };
  return { input: 0.3, output: 2.5 };
}

export function inicioDoDia(ref = new Date()): Date {
  const brt = new Date(ref.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  brt.setHours(0, 0, 0, 0);
  const diff =
    ref.getTime() -
    new Date(ref.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getTime();
  return new Date(brt.getTime() + diff);
}

export function inicioDoMes(ref = new Date()): Date {
  const d = inicioDoDia(ref);
  const brtDia = Number(
    d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-")[2],
  );
  return new Date(d.getTime() - (brtDia - 1) * DIA_MS);
}

export async function lerLogsIa(desde: Date): Promise<MemAiLog[]> {
  const out: MemAiLog[] = [];
  const rows = await dbTry(() =>
    prisma.aiUsageLog.findMany({
      where: { criadoEm: { gte: desde } },
      orderBy: { criadoEm: "desc" },
      take: 20000,
    }),
  );
  if (Array.isArray(rows)) out.push(...rows);
  const ids = new Set(out.map((r) => r.id));
  for (const m of memAiLogs) {
    if (!ids.has(m.id) && new Date(m.criadoEm).getTime() >= desde.getTime()) out.push(m);
  }
  return out;
}

export async function agregarIaPorTenant(): Promise<
  Map<string, { usadas: number; gastoDia: number; gastoMes: number }>
> {
  const mapa = new Map<string, { usadas: number; gastoDia: number; gastoMes: number }>();
  const logs = await lerLogsIa(inicioDoMes());
  const dia = inicioDoDia().getTime();
  for (const l of logs) {
    if (!l.tenantId) continue;
    const cur = mapa.get(l.tenantId) || { usadas: 0, gastoDia: 0, gastoMes: 0 };
    if (l.status !== "ERRO") cur.usadas++;
    const custo = Number(l.custoEstimadoBrl) || 0;
    cur.gastoMes += custo;
    if (new Date(l.criadoEm).getTime() >= dia) cur.gastoDia += custo;
    mapa.set(l.tenantId, cur);
  }
  return mapa;
}

export async function listarAfiliadoNomesMap(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const rows = await dbTry(() =>
    prisma.affiliate.findMany({ select: { id: true, nome: true } }),
  );
  if (Array.isArray(rows)) {
    for (const r of rows) mapa.set(r.id, r.nome);
  }
  for (const [id, af] of memAffiliates) {
    if (!mapa.has(id)) mapa.set(id, af.nome);
  }
  return mapa;
}

/* =========================================================================
   Listagem de Tenants (Clientes) & Expansão R2
========================================================================= */

export function construirItemTenant(
  raw: RawTenant,
  aiMes: { usadas: number; gastoDia: number; gastoMes: number },
  affiliateNomesMap?: Map<string, string>,
): SuperAdminTenantItem {
  const calc = statusEfetivo(raw);
  const cotaBaseMb =
    PLAN_STORAGE_QUOTAS_MB[raw.plano as keyof typeof PLAN_STORAGE_QUOTAS_MB] || 500;
  const cotaExtraMb = raw.storageExtraQuotaMb || memoryTenantExtraQuota.get(raw.id) || 0;
  const cotaTotalMb = cotaBaseMb + cotaExtraMb;
  const espacoUsadoMb = Math.round((raw.docBytes / (1024 * 1024)) * 10) / 10;
  const percentualUsado =
    cotaTotalMb > 0 ? Math.min(100, Math.round((espacoUsadoMb / cotaTotalMb) * 100)) : 0;
  const titular =
    raw.users.find((u) => u.role === "TITULAR" && u.ativo !== false) ||
    raw.users.find((u) => u.role === "TITULAR") ||
    raw.users[0];
  const affiliateNome = raw.affiliateId
    ? affiliateNomesMap?.get(raw.affiliateId) ?? memAffiliates.get(raw.affiliateId)?.nome ?? null
    : null;

  return {
    id: raw.id,
    cnpj: raw.cnpj,
    razaoSocial: raw.razaoSocial,
    nomeFantasia: raw.nomeFantasia ?? null,
    plano: raw.plano,
    billingStatus: calc.status,
    diasRestantesTrial: calc.diasRestantesTrial,
    diasAtraso: calc.diasAtraso,
    cotaBaseMb,
    cotaExtraMb,
    cotaTotalMb,
    espacoUsadoMb,
    percentualUsado,
    volumeArrematado: Math.round(raw.valorContempladas * 100) / 100,
    totalContempladas: raw.totalContempladas,
    criadoEm: raw.criadoEm,
    ativo: raw.ativo,
    titularUserId: titular?.userId ?? null,
    titularNome: titular?.name ?? null,
    titularEmail: titular?.email ?? null,
    telefone: raw.telefone ?? titular?.telefone ?? null,
    uf: raw.uf ?? null,
    cidade: raw.cidade ?? null,
    segmentos: raw.segmentos,
    maxCnpjs: raw.maxCnpjs,
    maxUsers: raw.maxUsers,
    totalUsuarios: raw.users.length,
    totalLicitacoesKanban: raw.kanbanStatuses.length,
    totalDocumentosCofre: raw.docCount,
    aiExtraQuotaMes: raw.aiExtraQuotaMes,
    aiUsadasMes: aiMes.usadas,
    gastoIaDiaBrl: Math.round(aiMes.gastoDia * 100) / 100,
    gastoIaMesBrl: Math.round(aiMes.gastoMes * 100) / 100,
    valorMensalidade: VALOR_PLANO[raw.plano] ?? ASAAS_PLAN_PRICES_BRL.PRO,
    vencimentoAssinatura: raw.vencimentoAssinatura ?? null,
    ultimoPagamentoEm: raw.ultimoPagamentoEm ?? null,
    trialFim: raw.trialFim ?? null,
    ultimaAtividadeEm: raw.ultimaAtividadeEm ?? null,
    affiliateId: raw.affiliateId ?? null,
    affiliateNome,
    cupomCodigo: raw.cupomCodigo ?? null,
    notasInternasAdm: raw.notasInternasAdm ?? null,
    onboarding: onboardingDeRaw(raw, aiMes.usadas),
  };
}

export async function listarTenantsSuperAdmin(filtros?: {
  statusFiltro?: string;
  busca?: string;
}): Promise<SuperAdminTenantItem[]> {
  let raws = await carregarRawTenantsDb();
  if (!raws) {
    if (inMemoryTenants.size === 0) {
      garantirSementeDemo();
    }
    raws = Array.from(inMemoryTenants.values()).map(rawDeMemoria);
  } else {
    const ids = new Set(raws.map((r) => r.id));
    for (const t of inMemoryTenants.values()) {
      if (!ids.has(t.id) && !ehIdDemo(t.id)) raws.push(rawDeMemoria(t));
    }
  }

  const [ia, affiliateNomes] = await Promise.all([
    agregarIaPorTenant(),
    listarAfiliadoNomesMap(),
  ]);

  const gruposMap = new Map<string, RawTenant[]>();
  for (const r of raws) {
    const titular = r.users.find((u) => u.role === "TITULAR" && u.ativo !== false);
    const key = titular?.userId
      ? `uid:${titular.userId}`
      : titular?.email
        ? `email:${titular.email.trim().toLowerCase()}`
        : `tenant:${r.id}`;
    const bucket = gruposMap.get(key) || [];
    bucket.push(r);
    gruposMap.set(key, bucket);
  }

  interface GroupedAccountEntry {
    item: SuperAdminTenantItem;
    members: RawTenant[];
  }

  const groupedEntries: GroupedAccountEntry[] = [];
  for (const membersRaw of gruposMap.values()) {
    const members = [...membersRaw].sort((a, b) => {
      const diff = new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
    const primary = members[0];
    const baseItem = construirItemTenant(
      primary,
      ia.get(primary.id) || { usadas: 0, gastoDia: 0, gastoMes: 0 },
      affiliateNomes,
    );

    const totalDocBytes = members.reduce((s, m) => s + m.docBytes, 0);
    const espacoUsadoMb = Math.round((totalDocBytes / (1024 * 1024)) * 10) / 10;
    const baseCotaPorEmpresa =
      PLAN_STORAGE_QUOTAS_MB[primary.plano as keyof typeof PLAN_STORAGE_QUOTAS_MB] || 500;
    const cotaBaseMb = baseCotaPorEmpresa * members.length;
    const cotaExtraMb = members.reduce(
      (s, m) => s + (m.storageExtraQuotaMb || memoryTenantExtraQuota.get(m.id) || 0),
      0,
    );
    const cotaTotalMb = cotaBaseMb + cotaExtraMb;
    const percentualUsado =
      cotaTotalMb > 0 ? Math.min(100, Math.round((espacoUsadoMb / cotaTotalMb) * 100)) : 0;

    const distinctUsers = new Set(members.flatMap((m) => m.users.map((u) => u.userId)));
    const memberChecklists = members.map((m) =>
      onboardingDeRaw(m, ia.get(m.id)?.usadas || 0),
    );
    const onboarding = calcularOnboardingChecklist({
      cnpjCadastrado: memberChecklists.some((c) => c.cnpjCadastrado),
      filtrosConfigurados: memberChecklists.some((c) => c.filtrosConfigurados),
      empresaPreenchida: memberChecklists.some((c) => c.empresaPreenchida),
      documentoCofreEnviado: memberChecklists.some((c) => c.documentoCofreEnviado),
      licitacaoNoKanban: memberChecklists.some((c) => c.licitacaoNoKanban),
      iaOuCalculadoraUsada: memberChecklists.some((c) => c.iaOuCalculadoraUsada),
    });

    const ultimaAtividadeMs = Math.max(
      0,
      ...members.map((m) => (m.ultimaAtividadeEm ? new Date(m.ultimaAtividadeEm).getTime() : 0)),
    );

    const item: SuperAdminTenantItem = {
      ...baseItem,
      qtdCnpjs: members.length,
      cnpjsAdicionaisCount: Math.max(0, members.length - 1),
      cnpjsVinculados: members.map((m) => ({
        id: m.id,
        cnpj: m.cnpj,
        razaoSocial: m.razaoSocial,
        nomeFantasia: m.nomeFantasia ?? null,
      })),
      subCnpjEncontrado: null,
      cotaBaseMb,
      cotaExtraMb,
      cotaTotalMb,
      espacoUsadoMb,
      percentualUsado,
      volumeArrematado:
        Math.round(members.reduce((s, m) => s + m.valorContempladas, 0) * 100) / 100,
      totalContempladas: members.reduce((s, m) => s + m.totalContempladas, 0),
      maxCnpjs: Math.max(...members.map((m) => m.maxCnpjs)),
      maxUsers: Math.max(...members.map((m) => m.maxUsers)),
      totalUsuarios: distinctUsers.size,
      totalLicitacoesKanban: members.reduce((s, m) => s + m.kanbanStatuses.length, 0),
      totalDocumentosCofre: members.reduce((s, m) => s + m.docCount, 0),
      aiExtraQuotaMes: members.reduce((s, m) => s + m.aiExtraQuotaMes, 0),
      aiUsadasMes: members.reduce((s, m) => s + (ia.get(m.id)?.usadas || 0), 0),
      gastoIaDiaBrl:
        Math.round(members.reduce((s, m) => s + (ia.get(m.id)?.gastoDia || 0), 0) * 100) / 100,
      gastoIaMesBrl:
        Math.round(members.reduce((s, m) => s + (ia.get(m.id)?.gastoMes || 0), 0) * 100) / 100,
      ultimaAtividadeEm: ultimaAtividadeMs > 0 ? new Date(ultimaAtividadeMs) : null,
      onboarding,
    };

    groupedEntries.push({ item, members });
  }

  let filtered = groupedEntries;
  const filtro = filtros?.statusFiltro;
  if (filtro && filtro !== "TODOS") {
    filtered = filtered.filter(({ item }) => {
      if (filtro === "ABANDONO_TRIAL") {
        return (
          item.billingStatus === "TRIAL" &&
          item.onboarding?.statusEngajamento === "CADASTROU_E_SAIU"
        );
      }
      return item.billingStatus === filtro;
    });
  }

  const busca = filtros?.busca?.trim().toLowerCase();
  if (busca) {
    const buscaDigitos = busca.replace(/\D/g, "");
    const matchesRaw = (r: RawTenant) =>
      r.razaoSocial.toLowerCase().includes(busca) ||
      (r.nomeFantasia || "").toLowerCase().includes(busca) ||
      (buscaDigitos.length >= 4 && r.cnpj.replace(/\D/g, "").includes(buscaDigitos));

    const matched: GroupedAccountEntry[] = [];
    for (const entry of filtered) {
      const { item, members } = entry;
      const primary = members[0];
      const matchesPrimary =
        matchesRaw(primary) ||
        (item.titularEmail || "").toLowerCase().includes(busca) ||
        (item.titularNome || "").toLowerCase().includes(busca);
      if (matchesPrimary) {
        matched.push({ item: { ...item, subCnpjEncontrado: null }, members });
        continue;
      }
      const subMatch = members.slice(1).find(matchesRaw);
      if (subMatch) {
        matched.push({
          item: {
            ...item,
            subCnpjEncontrado: {
              id: subMatch.id,
              cnpj: subMatch.cnpj,
              razaoSocial: subMatch.razaoSocial,
            },
          },
          members,
        });
      }
    }
    filtered = matched;
  }

  return filtered
    .map((e) => e.item)
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
}

export async function expandirCotaStorageTenant(rawInput: ExpansaoCotaStorageInput): Promise<{
  ok: boolean;
  tenantId: string;
  novaCotaExtraMb: number;
  cotaTotalMb: number;
  mensagem: string;
}> {
  const input = ExpansaoCotaStorageSchema.parse(rawInput);

  let cotaExtraAtual = memoryTenantExtraQuota.get(input.tenantId) || 0;
  let plano = "BASICO";

  const tenant = await dbTry(() =>
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { storageExtraQuotaMb: true, plano: true },
    }),
  );
  if (tenant) {
    cotaExtraAtual = tenant.storageExtraQuotaMb || 0;
    plano = String(tenant.plano);
  } else {
    const mem = inMemoryTenants.get(input.tenantId);
    if (mem) plano = String(mem.plano);
  }

  const novaCotaExtraMb = cotaExtraAtual + input.adicionarMb;
  memoryTenantExtraQuota.set(input.tenantId, novaCotaExtraMb);
  const extras = memTenantExtras.get(input.tenantId) || {};
  extras.storageExtraQuotaMb = novaCotaExtraMb;
  memTenantExtras.set(input.tenantId, extras);

  await dbTry(() =>
    prisma.tenant.update({
      where: { id: input.tenantId },
      data: { storageExtraQuotaMb: novaCotaExtraMb },
    }),
  );

  await registrarAuditoriaAdm(
    "EXPANDIR_COTA_STORAGE",
    "TENANT",
    input.tenantId,
    { adicionadoMb: input.adicionarMb, novaCotaExtraMb, motivo: input.motivo },
    input.tenantId,
  );

  const cotaBase =
    PLAN_STORAGE_QUOTAS_MB[plano as keyof typeof PLAN_STORAGE_QUOTAS_MB] || 500;
  const cotaTotalMb = cotaBase + novaCotaExtraMb;

  return {
    ok: true,
    tenantId: input.tenantId,
    novaCotaExtraMb,
    cotaTotalMb,
    mensagem: `Cota de armazenamento expandida com sucesso em +${input.adicionarMb} MB (Total: ${cotaTotalMb} MB).`,
  };
}

/* =========================================================================
   Helpers de Usuário, Patch de Tenant & Patrimônio Operacional
========================================================================= */

export type UsuarioPublico = {
  id: string;
  name: string;
  email: string;
  role: string;
  ativo: boolean;
  sessionVersion: number;
  cpf: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  ultimoLoginEm: Date | null;
  isSuperAdmin: boolean;
  adminRole: string | null;
};

export interface UsuarioProjectionInput {
  id: string;
  name: string;
  email: string;
  role: string;
  ativo?: boolean | null;
  sessionVersion?: number | null;
  cpf?: string | null;
  telefone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  ultimoLoginEm?: Date | null;
  isSuperAdmin?: boolean | null;
  adminRole?: string | null;
}

/** Projeção pública do usuário — NUNCA expõe `passwordHash`. */
export function usuarioPublico(u: UsuarioProjectionInput): UsuarioPublico {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: String(u.role),
    ativo: u.ativo !== false,
    sessionVersion: u.sessionVersion ?? 1,
    cpf: u.cpf ?? null,
    telefone: u.telefone ?? null,
    cep: u.cep ?? null,
    logradouro: u.logradouro ?? null,
    numero: u.numero ?? null,
    bairro: u.bairro ?? null,
    cidade: u.cidade ?? null,
    uf: u.uf ?? null,
    ultimoLoginEm: u.ultimoLoginEm ?? null,
    isSuperAdmin: Boolean(u.isSuperAdmin),
    adminRole: u.adminRole ?? null,
  };
}

export async function carregarUsuario(
  userId: string,
): Promise<{ origem: "db"; user: UsuarioProjectionInput } | { origem: "mem"; user: MemUser } | null> {
  if (ehIdDemo(userId)) garantirSementeDemo();
  const u = await dbTry(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        ativo: true,
        sessionVersion: true,
        cpf: true,
        telefone: true,
        cep: true,
        logradouro: true,
        numero: true,
        bairro: true,
        cidade: true,
        uf: true,
        ultimoLoginEm: true,
        isSuperAdmin: true,
        adminRole: true,
      },
    }),
  );
  if (u) return { origem: "db", user: u };
  const m = memUsers.get(userId);
  if (m) return { origem: "mem", user: m };
  return null;
}

export async function tenantIdsDoUsuario(
  userId: string,
  apenasTitular = false,
): Promise<string[]> {
  const ids = new Set<string>();
  const rows = await dbTry(() =>
    prisma.tenantUser.findMany({
      where: {
        userId,
        ativo: true,
        ...(apenasTitular ? { role: "TITULAR" } : {}),
      },
      select: { tenantId: true },
    }),
  );
  if (Array.isArray(rows)) for (const r of rows) ids.add(r.tenantId);
  for (const m of inMemoryTenantUsers) {
    if (
      m.userId === userId &&
      m.ativo !== false &&
      (!apenasTitular || m.role === "TITULAR")
    ) {
      ids.add(m.tenantId);
    }
  }
  return Array.from(ids);
}

export function datasPorStatus(status: string): {
  trialFim: Date | null;
  vencimentoAssinatura: Date | null;
  ultimoPagamentoEm?: Date | null;
} {
  const agora = Date.now();
  switch (status) {
    case "ATIVO":
      return {
        trialFim: null,
        vencimentoAssinatura: new Date(agora + 30 * DIA_MS),
        ultimoPagamentoEm: new Date(agora),
      };
    case "GRACE_PERIOD":
      return { trialFim: null, vencimentoAssinatura: new Date(agora - 1 * DIA_MS) };
    case "BLOQUEADO":
      return { trialFim: null, vencimentoAssinatura: new Date(agora - 10 * DIA_MS) };
    case "CANCELADO":
      return { trialFim: null, vencimentoAssinatura: null };
    case "TRIAL":
    default:
      return { trialFim: new Date(agora + 7 * DIA_MS), vencimentoAssinatura: null };
  }
}

export interface TenantPatchPayload {
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string | null;
  cnaePrincipal?: string | null;
  cnaesSecundarios?: string[];
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  telefone?: string | null;
  segmentos?: string[];
  ufs?: string[];
  brasilInteiro?: boolean;
  plano?: PlanoAssinatura;
  billingStatus?: TenantBillingStatus;
  ativo?: boolean;
  maxCnpjs?: number;
  maxUsers?: number;
  storageExtraQuotaMb?: number;
  aiExtraQuotaMes?: number;
  affiliateId?: string | null;
  cupomCodigo?: string | null;
  notasInternasAdm?: string | null;
  trialFim?: Date | null;
  vencimentoAssinatura?: Date | null;
  ultimoPagamentoEm?: Date | null;
  ultimaAtividadeEm?: Date | null;
}

export async function verificarCnpjDuplicado(
  rawCnpj: string,
  excludeTenantId?: string,
): Promise<string> {
  const digits = cleanCnpj(rawCnpj);
  const formatted = digits.length === 14 ? formatCnpj(digits) : rawCnpj.trim();
  const candidates = Array.from(new Set([rawCnpj.trim(), digits, formatted].filter(Boolean)));

  for (const t of inMemoryTenants.values()) {
    if (excludeTenantId && t.id === excludeTenantId) continue;
    if (cleanCnpj(t.cnpj) === digits && digits.length >= 11) {
      throw typedError("Já existe um cliente cadastrado com este CNPJ.", 400);
    }
  }

  const dbDup = await dbTry(() =>
    prisma.tenant.findFirst({
      where: {
        ...(excludeTenantId ? { id: { not: excludeTenantId } } : {}),
        cnpj: { in: candidates },
      },
      select: { id: true },
    }),
  );
  if (dbDup) {
    throw typedError("Já existe um cliente cadastrado com este CNPJ.", 400);
  }

  return formatted;
}

/** Aplica um patch tipado ao Tenant (Postgres primeiro; memória como fallback). */
export async function aplicarPatchTenant(
  tenantId: string,
  patch: TenantPatchPayload,
): Promise<{ raw: RawTenant; origem: "db" | "mem" }> {
  const atual = await carregarRawTenant(tenantId);
  if (!atual) throw typedError("Cliente (Tenant) não encontrado.", 404);

  const normalizedPatch: TenantPatchPayload = { ...patch };
  if (normalizedPatch.cnpj !== undefined) {
    normalizedPatch.cnpj = await verificarCnpjDuplicado(normalizedPatch.cnpj, tenantId);
  }

  if (atual.origem === "db") {
    try {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: normalizedPatch,
      });
    } catch (err: unknown) {
      if (getPrismaErrorCode(err) === "P2002") {
        throw typedError("Já existe um cliente cadastrado com este CNPJ.", 400);
      }
      throw err;
    }
  } else {
    const mem = inMemoryTenants.get(tenantId);
    if (!mem) throw typedError("Cliente (Tenant) não encontrado.", 404);

    const extras: MemTenantExtras = { ...(memTenantExtras.get(tenantId) || {}) };
    if (normalizedPatch.storageExtraQuotaMb !== undefined) {
      extras.storageExtraQuotaMb = normalizedPatch.storageExtraQuotaMb;
    }
    if (normalizedPatch.aiExtraQuotaMes !== undefined) {
      extras.aiExtraQuotaMes = normalizedPatch.aiExtraQuotaMes;
    }
    if (normalizedPatch.affiliateId !== undefined) extras.affiliateId = normalizedPatch.affiliateId;
    if (normalizedPatch.cupomCodigo !== undefined) extras.cupomCodigo = normalizedPatch.cupomCodigo;
    if (normalizedPatch.notasInternasAdm !== undefined) {
      extras.notasInternasAdm = normalizedPatch.notasInternasAdm;
    }
    if (normalizedPatch.ultimaAtividadeEm !== undefined) {
      extras.ultimaAtividadeEm = normalizedPatch.ultimaAtividadeEm;
    }
    if (normalizedPatch.telefone !== undefined) extras.telefone = normalizedPatch.telefone;
    if (normalizedPatch.billingStatus !== undefined) {
      extras.billingStatus = normalizedPatch.billingStatus;
    }

    if (normalizedPatch.cnpj !== undefined) mem.cnpj = normalizedPatch.cnpj;
    if (normalizedPatch.razaoSocial !== undefined) mem.razaoSocial = normalizedPatch.razaoSocial;
    if (normalizedPatch.nomeFantasia !== undefined) mem.nomeFantasia = normalizedPatch.nomeFantasia;
    if (normalizedPatch.cnaePrincipal !== undefined) mem.cnaePrincipal = normalizedPatch.cnaePrincipal;
    if (normalizedPatch.cnaesSecundarios !== undefined) {
      mem.cnaesSecundarios = normalizedPatch.cnaesSecundarios;
    }
    if (normalizedPatch.endereco !== undefined) mem.endereco = normalizedPatch.endereco;
    if (normalizedPatch.cidade !== undefined) mem.cidade = normalizedPatch.cidade;
    if (normalizedPatch.uf !== undefined) mem.uf = normalizedPatch.uf;
    if (normalizedPatch.segmentos !== undefined) mem.segmentos = normalizedPatch.segmentos;
    if (normalizedPatch.ufs !== undefined) mem.ufs = normalizedPatch.ufs;
    if (normalizedPatch.brasilInteiro !== undefined) mem.brasilInteiro = normalizedPatch.brasilInteiro;
    if (normalizedPatch.plano !== undefined) mem.plano = normalizedPatch.plano;
    if (normalizedPatch.billingStatus !== undefined) mem.billingStatus = normalizedPatch.billingStatus;
    if (normalizedPatch.ativo !== undefined) mem.ativo = normalizedPatch.ativo;
    if (normalizedPatch.maxCnpjs !== undefined) mem.maxCnpjs = normalizedPatch.maxCnpjs;
    if (normalizedPatch.maxUsers !== undefined) mem.maxUsers = normalizedPatch.maxUsers;
    if (normalizedPatch.affiliateId !== undefined) mem.affiliateId = normalizedPatch.affiliateId;
    if (normalizedPatch.cupomCodigo !== undefined) mem.cupomCodigo = normalizedPatch.cupomCodigo;
    if (normalizedPatch.trialFim !== undefined) mem.trialFim = normalizedPatch.trialFim;
    if (normalizedPatch.vencimentoAssinatura !== undefined) {
      mem.vencimentoAssinatura = normalizedPatch.vencimentoAssinatura;
    }
    if (normalizedPatch.ultimoPagamentoEm !== undefined) {
      mem.ultimoPagamentoEm = normalizedPatch.ultimoPagamentoEm;
    }
    mem.updatedAt = new Date();

    memTenantExtras.set(tenantId, extras);
    inMemoryTenants.set(tenantId, mem);
  }

  const depois = await carregarRawTenant(tenantId);
  if (!depois) throw typedError("Falha ao recarregar cliente atualizado.", 500);
  return { raw: depois.raw, origem: atual.origem };
}

export interface ItemLicitacaoCliente {
  id: string;
  tenantId: string;
  tenantNome: string;
  licitacaoId: string;
  numeroEdital: string;
  orgaoNome: string;
  statusKanban: string;
  valorEstimado: number;
  lanceMinimo: number | null;
  dataAbertura: string | null;
  notas: string | null;
}

export async function carregarPatrimonio(
  tenantIds: string[],
  nomes: Map<string, string>,
) {
  const licMap = new Map<string, ItemLicitacaoCliente>();

  const rows = await dbTry(() =>
    prisma.tenantLicitacao.findMany({
      where: { tenantId: { in: tenantIds } },
      include: {
        licitacao: {
          select: {
            numeroEdital: true,
            orgaoNome: true,
            valorEstimado: true,
            dataAbertura: true,
          },
        },
      },
      orderBy: { dataDecisao: "desc" },
      take: 500,
    }),
  );
  if (Array.isArray(rows)) {
    for (const r of rows) {
      licMap.set(`${r.tenantId}__${r.licitacaoId}`, {
        id: r.id,
        tenantId: r.tenantId,
        tenantNome: nomes.get(r.tenantId) || r.tenantId,
        licitacaoId: r.licitacaoId,
        numeroEdital: r.licitacao?.numeroEdital || "—",
        orgaoNome: r.licitacao?.orgaoNome || "—",
        statusKanban: String(r.statusKanban),
        valorEstimado: r.licitacao?.valorEstimado || 0,
        lanceMinimo: r.lanceMinimo ?? null,
        dataAbertura: r.licitacao?.dataAbertura
          ? new Date(r.licitacao.dataAbertura).toISOString()
          : null,
        notas: r.notas ?? null,
      });
    }
  }
  for (const tid of tenantIds) {
    for (const k of listInMemoryTenantLicitacoes(tid)) {
      const key = `${tid}__${k.licitacaoId}`;
      if (licMap.has(key)) continue;
      const lic = getInMemoryLicitacaoById(k.licitacaoId);
      licMap.set(key, {
        id: k.id,
        tenantId: tid,
        tenantNome: nomes.get(tid) || tid,
        licitacaoId: k.licitacaoId,
        numeroEdital: lic?.numeroEdital || "—",
        orgaoNome: lic?.orgaoNome || "—",
        statusKanban: k.statusKanban,
        valorEstimado: lic?.valorEstimado || 0,
        lanceMinimo: k.lanceMinimo ?? null,
        dataAbertura: lic?.dataAbertura ? new Date(lic.dataAbertura).toISOString() : null,
        notas: k.notas ?? null,
      });
    }
  }
  const licitacoes = Array.from(licMap.values());
  const kanbanPorColuna: Record<string, number> = {};
  for (const l of licitacoes) {
    kanbanPorColuna[l.statusKanban] = (kanbanPorColuna[l.statusKanban] || 0) + 1;
  }

  const docsDb = await dbTry(() =>
    prisma.documento.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        id: true,
        tenantId: true,
        nome: true,
        categoria: true,
        dataVencimento: true,
        status: true,
        arquivoTamanho: true,
      },
      take: 500,
    }),
  );
  const documentosLista: Array<{
    id: string;
    tenantId?: string;
    nome: string;
    categoria: string;
    dataVencimento: string | null;
    status: string;
    vencido: boolean;
    tamanhoBytes: number;
  }> = [];
  const idsDoc = new Set<string>();
  const pushDoc = (d: StoredDocumentShape) => {
    if (idsDoc.has(d.id)) return;
    idsDoc.add(d.id);
    const venc = d.dataVencimento ? new Date(d.dataVencimento) : null;
    documentosLista.push({
      id: d.id,
      ...(d.tenantId ? { tenantId: d.tenantId } : {}),
      nome: d.nome || "Documento",
      categoria: String(d.categoria ?? "OUTROS"),
      dataVencimento: venc ? venc.toISOString() : null,
      status: String(d.status ?? "ATIVO"),
      vencido: Boolean(venc && venc.getTime() < Date.now()),
      tamanhoBytes: d.arquivoTamanho || 0,
    });
  };
  if (Array.isArray(docsDb)) {
    for (const d of docsDb) {
      pushDoc({
        id: d.id,
        tenantId: d.tenantId,
        nome: d.nome,
        categoria: String(d.categoria),
        dataVencimento: d.dataVencimento,
        status: String(d.status),
        arquivoTamanho: d.arquivoTamanho,
      });
    }
  }
  const rawMemDocs = listInMemoryDocumentos() as StoredDocumentShape[];
  for (const d of rawMemDocs) {
    if (d.tenantId && tenantIds.includes(d.tenantId)) pushDoc(d);
  }

  const [dbPortais, dbImpugnacoes, dbPrecosSalvos] = await Promise.all([
    dbTry(() => prisma.portal.count({ where: { tenantId: { in: tenantIds } } })),
    dbTry(() => prisma.impugnacao.count({ where: { tenantId: { in: tenantIds } } })),
    dbTry(() => prisma.tenantPrecoSalvo.count({ where: { tenantId: { in: tenantIds } } })),
  ]);

  const memPortais = (listInMemoryPortais() as Array<{ tenantId?: string | null }>).filter(
    (p) => p.tenantId && tenantIds.includes(p.tenantId),
  ).length;
  const memImpugnacoes = (
    listInMemoryImpugnacoes() as Array<{ tenantId?: string | null }>
  ).filter((i) => i.tenantId && tenantIds.includes(i.tenantId)).length;

  const portais = (typeof dbPortais === "number" ? dbPortais : 0) || memPortais;
  const impugnacoes = (typeof dbImpugnacoes === "number" ? dbImpugnacoes : 0) || memImpugnacoes;
  const precosSalvos = typeof dbPrecosSalvos === "number" ? dbPrecosSalvos : 0;

  return {
    licitacoes,
    kanbanPorColuna,
    documentos: {
      total: documentosLista.length,
      vencidos: documentosLista.filter((d) => d.vencido).length,
      bytes: documentosLista.reduce((a, d) => a + d.tamanhoBytes, 0),
      lista: documentosLista,
    },
    portais,
    impugnacoes,
    precosSalvos,
  };
}

export function empresaPublica(raw: RawTenant) {
  const calc = statusEfetivo(raw);
  return {
    id: raw.id,
    cnpj: raw.cnpj,
    razaoSocial: raw.razaoSocial,
    nomeFantasia: raw.nomeFantasia ?? null,
    uf: raw.uf ?? null,
    cidade: raw.cidade ?? null,
    telefone: raw.telefone ?? null,
    plano: raw.plano,
    billingStatus: calc.status,
    ativo: raw.ativo,
    segmentos: raw.segmentos,
    ufs: raw.ufs,
    trialFim: raw.trialFim ?? null,
    vencimentoAssinatura: raw.vencimentoAssinatura ?? null,
  };
}

export interface LicitacaoResumoInput {
  id: string;
  idPncp: string;
  numeroEdital: string;
  orgaoNome: string;
  orgaoCnpj: string;
  uf: string;
  municipio: string | null;
  modalidade: string;
  segmentoMacro: string | null;
  portalDisputa: string | null;
  miniResumo: string;
  resumo: string;
  valorEstimado: number;
  dataAbertura: Date;
  dataEncerramentoProposta: Date | null;
  linkPncp: string | null;
  linkSistemaOrigem: string | null;
  parecerIA: string;
  status: LicitacaoStatus | string;
}

export function licitacaoResumo(l: Licitacao | LicitacaoResumoInput) {
  return {
    id: l.id,
    idPncp: l.idPncp,
    numeroEdital: l.numeroEdital,
    orgaoNome: l.orgaoNome,
    orgaoCnpj: l.orgaoCnpj,
    uf: l.uf,
    municipio: l.municipio ?? null,
    modalidade: l.modalidade,
    segmentoMacro: l.segmentoMacro ?? null,
    portalDisputa: l.portalDisputa ?? null,
    miniResumo: l.miniResumo,
    resumo: l.resumo,
    valorEstimado: l.valorEstimado,
    dataAbertura: l.dataAbertura,
    dataEncerramentoProposta: l.dataEncerramentoProposta ?? null,
    linkPncp: l.linkPncp ?? null,
    linkSistemaOrigem: l.linkSistemaOrigem ?? null,
    parecerIA: l.parecerIA,
    status: String(l.status),
    manual: String(l.idPncp || "").startsWith("MANUAL-"),
  };
}

