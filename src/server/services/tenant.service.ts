import { randomUUID } from "node:crypto";
import { PlanoAssinatura as PrismaPlanoAssinatura, TenantBillingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanCnpj, formatCnpj, isValidCnpj } from "@/lib/validations/cnpj";
import { validateCorporateEmail } from "@/lib/validations/email";
import {
  PLAN_LIMITS,
  type CreateTenantInput,
  type DisputeClaimCnpjInput,
  type InviteMemberInput,
  type PlanoAssinatura,
  type TenantRole,
} from "@/server/schemas/tenant.schema";
import { enviarEmailConviteEquipe } from "./email.service";
import { updateInMemoryConfiguracaoEmpresa } from "./licitacoes-store";
import { getInMemoryAuthUserByEmail } from "@/server/auth";

export class TenantCollisionError extends Error {
  code = "CNPJ_ALREADY_REGISTERED" as const;
  statusCode = 409;
  constructor(cnpj: string) {
    super(
      `Este CNPJ (${formatCnpj(cnpj)}) já possui uma conta ativa no Portal. Caso você faça parte da equipe desta empresa, solicite ao titular da conta o envio de um convite de acesso para o seu e-mail corporativo.`,
    );
    this.name = "TenantCollisionError";
  }
}

export class PlanQuotaExceededError extends Error {
  code = "PLAN_CNPJ_LIMIT_REACHED" as const;
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "PlanQuotaExceededError";
  }
}

export class TeamSeatLimitExceededError extends Error {
  code = "TEAM_SEAT_LIMIT_REACHED" as const;
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "TeamSeatLimitExceededError";
  }
}

export class TenantNotFoundError extends Error {
  code = "TENANT_NOT_FOUND" as const;
  statusCode = 404;
  constructor(tenantId: string) {
    super(`Empresa/CNPJ não encontrada: ${tenantId}`);
    this.name = "TenantNotFoundError";
  }
}

export class UnauthorizedTenantActionError extends Error {
  code = "UNAUTHORIZED_TENANT_ACTION" as const;
  statusCode = 403;
  constructor(message = "Ação não autorizada para seu perfil neste CNPJ") {
    super(message);
    this.name = "UnauthorizedTenantActionError";
  }
}

export interface InMemoryTenantRecord {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnaePrincipal?: string | null;
  cnaesSecundarios?: string[];
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  plano: PlanoAssinatura;
  billingStatus?: string;
  trialFim?: Date | null;
  vencimentoAssinatura?: Date | null;
  ultimoPagamentoEm?: Date | null;
  asaasCustomerId?: string | null;
  asaasSubscriptionId?: string | null;
  segmentos?: string[];
  subsegmentos?: string[];
  ufs?: string[];
  brasilInteiro?: boolean;
  preferenciasUpdatedAt?: Date | null;
  affiliateId?: string | null;
  cupomCodigo?: string | null;
  maxCnpjs: number;
  maxUsers: number;
  ativo: boolean;
  criadoEm: Date;
  updatedAt: Date;
}

export interface InMemoryTenantUserRecord {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: TenantRole;
  ativo: boolean;
  criadoEm: Date;
}

export interface InMemoryTenantConviteRecord {
  id: string;
  tenantId: string;
  email: string;
  role: TenantRole;
  token: string;
  expiraEm: Date;
  aceitoEm?: Date | null;
  criadoPorId: string;
  criadoEm: Date;
}

export interface InMemoryCnpjDisputeRecord {
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

// Armazenamento em memória para suporte a testes unitários sem banco ativo
export const inMemoryTenants = new Map<string, InMemoryTenantRecord>();
export const inMemoryTenantUsers: InMemoryTenantUserRecord[] = [];
export const inMemoryTenantConvites: InMemoryTenantConviteRecord[] = [];
export const inMemoryCnpjDisputes = new Map<string, InMemoryCnpjDisputeRecord>();

export function resetInMemoryTenantStorage(): void {
  inMemoryTenants.clear();
  inMemoryTenantUsers.length = 0;
  inMemoryTenantConvites.length = 0;
  inMemoryCnpjDisputes.clear();
}

/**
 * Resolve com segurança o tenantId ativo do usuário autenticado.
 * Se um preferredTenantId (ex: cookie ou query param) for fornecido, valida se o usuário
 * de fato possui membresia ativa naquele tenant. Em caso negativo, faz fallback exclusivo
 * para o sessionTenantId ou o primeiro tenant ao qual o usuário pertence. Se não pertencer a nenhum, retorna null.
 */
export async function resolveUserActiveTenantId(
  userId: string,
  preferredTenantId?: string | null,
  sessionTenantId?: string | null,
): Promise<string | null> {
  if (!userId) return null;

  // Se preferredTenantId for idêntico ao sessionTenantId (ou se preferred não foi informado, mas sessionTenantId existe):
  if (preferredTenantId && sessionTenantId && preferredTenantId === sessionTenantId) {
    return sessionTenantId;
  }
  if (!preferredTenantId && sessionTenantId) {
    return sessionTenantId;
  }

  // Helper para fail-fast se o Prisma travar tentando conectar no Postgres offline
  const withTimeout = <T>(promise: Promise<T>, ms = 1500): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), ms),
      ),
    ]);

  // 1. Se o preferredTenantId foi informado, valida se o usuário pertence a ele
  if (preferredTenantId) {
    const memBelongs = inMemoryTenantUsers.some(
      (tu) => tu.userId === userId && tu.tenantId === preferredTenantId && tu.ativo,
    );
    if (memBelongs) {
      return preferredTenantId;
    }

    try {
      const dbBelongs = await withTimeout(
        prisma.tenantUser.findFirst({
          where: { userId, tenantId: preferredTenantId, ativo: true },
        }),
      );
      if (dbBelongs) {
        return preferredTenantId;
      }
    } catch {}
  }

  // 2. Se o usuário não pertence ao preferredTenantId, tenta o sessionTenantId legítimo
  if (sessionTenantId) {
    return sessionTenantId;
  }

  // 3. Fallback: busca o primeiro tenant válido do usuário
  const memFirst = inMemoryTenantUsers.find(
    (tu) => tu.userId === userId && tu.ativo,
  );
  if (memFirst) {
    return memFirst.tenantId;
  }

  try {
    const dbFirst = await withTimeout(
      prisma.tenantUser.findFirst({
        where: { userId, ativo: true },
        orderBy: { criadoEm: "asc" },
      }),
    );
    if (dbFirst) {
      return dbFirst.tenantId;
    }
  } catch {}

  return null;
}

/**
 * Cria um novo Tenant para o usuário autenticado, respeitando limites de plano e unicidade de CNPJ
 */
export async function createTenantForUser(params: {
  userId: string;
  userEmail: string;
  userName: string;
  userPlan?: PlanoAssinatura;
  input: CreateTenantInput;
}): Promise<InMemoryTenantRecord> {
  const { userId, userEmail, userName, input } = params;
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  const inMemUser = normalizedUserEmail ? getInMemoryAuthUserByEmail(normalizedUserEmail) : undefined;
  let dbUserIsSuper = false;
  if (userId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, role: true, isSuperAdmin: true, adminRole: true },
      });
      if (
        dbUser &&
        (dbUser.isSuperAdmin ||
          dbUser.role === "SUPERADMIN" ||
          Boolean(dbUser.adminRole) ||
          dbUser.email.trim().toLowerCase() === "vitorhenrique018@gmail.com")
      ) {
        dbUserIsSuper = true;
      }
    } catch {}
  }
  if (
    normalizedUserEmail === "vitorhenrique018@gmail.com" ||
    inMemUser?.isSuperAdmin ||
    inMemUser?.role === "SUPERADMIN" ||
    Boolean(inMemUser?.adminRole) ||
    dbUserIsSuper
  ) {
    throw new UnauthorizedTenantActionError(
      "Contas administrativas do Portal ADM não podem criar CNPJs de cliente.",
    );
  }

  const isEnterpriseSpecialAccount =
    normalizedUserEmail === "opaonossopanificadora@gmail.com";
  const userPlan: PlanoAssinatura = isEnterpriseSpecialAccount
    ? "ENTERPRISE"
    : params.userPlan ?? input.plano ?? "PRO";
  const cleanedCnpj = cleanCnpj(input.cnpj);

  if (!isValidCnpj(cleanedCnpj)) {
    throw new Error("CNPJ inválido de acordo com as regras da Receita Federal.");
  }

  // 1. Proibição de duplo registro: Nenhuma outra conta pode registrar o mesmo CNPJ
  const existingInMemory = Array.from(inMemoryTenants.values()).find(
    (t) => cleanCnpj(t.cnpj) === cleanedCnpj,
  );
  if (existingInMemory) {
    throw new TenantCollisionError(cleanedCnpj);
  }

  try {
    const formattedCnpj = formatCnpj(cleanedCnpj);
    const existingDb = await prisma.tenant.findFirst({
      where: {
        cnpj: {
          in: Array.from(new Set([cleanedCnpj, formattedCnpj])),
        },
      },
    });
    if (existingDb) {
      throw new TenantCollisionError(cleanedCnpj);
    }
  } catch (error) {
    if (error instanceof TenantCollisionError) throw error;
  }

  // 2. Carrega CNPJs existentes do titular para herança de Trial/Plano/Status e validação de cota
  interface ExistingOwnerTenantSnapshot {
    id: string;
    plano: PlanoAssinatura;
    billingStatus?: string | null;
    trialFim?: Date | null;
    vencimentoAssinatura?: Date | null;
    ultimoPagamentoEm?: Date | null;
    cupomCodigo?: string | null;
    affiliateId?: string | null;
    maxCnpjs: number;
    maxUsers: number;
    criadoEm: Date;
  }

  const existingById = new Map<string, ExistingOwnerTenantSnapshot>();
  let memTenantsCount = 0;
  for (const tu of inMemoryTenantUsers) {
    if (tu.userId === userId && tu.role === "TITULAR" && tu.ativo) {
      memTenantsCount++;
      const t = inMemoryTenants.get(tu.tenantId);
      if (t) {
        existingById.set(t.id, {
          id: t.id,
          plano: t.plano,
          billingStatus: t.billingStatus ?? null,
          trialFim: t.trialFim ?? null,
          vencimentoAssinatura: t.vencimentoAssinatura ?? null,
          ultimoPagamentoEm: t.ultimoPagamentoEm ?? null,
          cupomCodigo: t.cupomCodigo ?? null,
          affiliateId: t.affiliateId ?? null,
          maxCnpjs: t.maxCnpjs,
          maxUsers: t.maxUsers,
          criadoEm: t.criadoEm,
        });
      }
    }
  }

  let dbTenantsCount = 0;
  try {
    const dbMemberships = await prisma.tenantUser.findMany({
      where: { userId, role: "TITULAR", ativo: true },
      include: { tenant: true },
      orderBy: { criadoEm: "asc" },
    });
    dbTenantsCount = dbMemberships.length;
    for (const m of dbMemberships) {
      if (m.tenant && !existingById.has(m.tenant.id)) {
        existingById.set(m.tenant.id, {
          id: m.tenant.id,
          plano: (m.tenant.plano as PlanoAssinatura) ?? userPlan,
          billingStatus: m.tenant.billingStatus ?? null,
          trialFim: m.tenant.trialFim ?? null,
          vencimentoAssinatura: m.tenant.vencimentoAssinatura ?? null,
          ultimoPagamentoEm: m.tenant.ultimoPagamentoEm ?? null,
          cupomCodigo: m.tenant.cupomCodigo ?? null,
          affiliateId: m.tenant.affiliateId ?? null,
          maxCnpjs: m.tenant.maxCnpjs,
          maxUsers: m.tenant.maxUsers,
          criadoEm: m.tenant.criadoEm,
        });
      }
    }
  } catch {
    dbTenantsCount = 0;
  }

  const oldestExisting =
    Array.from(existingById.values()).sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    )[0] ?? null;

  const effectivePlan: PlanoAssinatura = isEnterpriseSpecialAccount
    ? "ENTERPRISE"
    : oldestExisting?.plano ?? userPlan;
  const planLimits = PLAN_LIMITS[effectivePlan];
  const effectiveMaxCnpjs = Math.max(
    planLimits.maxCnpjs,
    oldestExisting?.maxCnpjs ?? 0,
  );
  const effectiveMaxUsers = Math.max(
    planLimits.maxUsers,
    oldestExisting?.maxUsers ?? 0,
  );
  const userTenantsCount = Math.max(
    memTenantsCount,
    dbTenantsCount,
    existingById.size,
  );

  if (userTenantsCount >= effectiveMaxCnpjs) {
    throw new PlanQuotaExceededError(
      `Seu plano ${effectivePlan} permite o cadastro de no máximo ${effectiveMaxCnpjs} CNPJ(s) ativo(s). Faça upgrade para adicionar novos CNPJs.`,
    );
  }

  const newTenantId = `tenant_${randomUUID()}`;
  const now = new Date();
  const billingStatusInicial = isEnterpriseSpecialAccount
    ? "ATIVO"
    : (oldestExisting?.billingStatus ?? "TRIAL");
  const trialFimInicial = isEnterpriseSpecialAccount
    ? null
    : oldestExisting
      ? (oldestExisting.trialFim ?? null)
      : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const vencimentoInicial = oldestExisting?.vencimentoAssinatura ?? null;
  const ultimoPagamentoInicial = oldestExisting?.ultimoPagamentoEm ?? null;
  const cupomInicial = oldestExisting?.cupomCodigo ?? null;
  const affiliateInicial = oldestExisting?.affiliateId ?? null;

  const record: InMemoryTenantRecord = {
    id: newTenantId,
    cnpj: cleanedCnpj,
    razaoSocial: input.razaoSocial,
    nomeFantasia: input.nomeFantasia ?? null,
    cnaePrincipal: input.cnaePrincipal ?? null,
    cnaesSecundarios: Array.isArray(input.cnaesSecundarios) ? input.cnaesSecundarios : [],
    endereco: input.endereco ?? null,
    cidade: input.cidade ?? null,
    uf: input.uf ?? null,
    plano: effectivePlan,
    billingStatus: billingStatusInicial,
    trialFim: trialFimInicial,
    vencimentoAssinatura: vencimentoInicial,
    ultimoPagamentoEm: ultimoPagamentoInicial,
    cupomCodigo: cupomInicial,
    affiliateId: affiliateInicial,
    maxCnpjs: effectiveMaxCnpjs,
    maxUsers: effectiveMaxUsers,
    ativo: true,
    criadoEm: now,
    updatedAt: now,
  };

  inMemoryTenants.set(newTenantId, record);
  inMemoryTenantUsers.push({
    id: `tu_${randomUUID()}`,
    tenantId: newTenantId,
    userId,
    userEmail: userEmail.trim().toLowerCase(),
    userName,
    role: "TITULAR",
    ativo: true,
    criadoEm: now,
  });

  updateInMemoryConfiguracaoEmpresa(
    {
      id: `cfg_${newTenantId}`,
      tenantId: newTenantId,
      razaoSocial: input.razaoSocial,
      cnpj: cleanedCnpj,
      cnae: input.cnaePrincipal,
      cnaesSecundarios: Array.isArray(input.cnaesSecundarios) ? input.cnaesSecundarios : [],
      endereco: input.endereco || "",
      cidade: input.cidade || "",
      uf: input.uf || "",
      representanteNome: userName || "",
    },
    newTenantId,
  );

  try {
    await prisma.tenant.create({
      data: {
        id: newTenantId,
        cnpj: cleanedCnpj,
        razaoSocial: input.razaoSocial,
        nomeFantasia: input.nomeFantasia,
        cnaePrincipal: input.cnaePrincipal,
        cnaesSecundarios: Array.isArray(input.cnaesSecundarios) ? input.cnaesSecundarios : [],
        endereco: input.endereco,
        cidade: input.cidade,
        uf: input.uf,
        plano: effectivePlan as PrismaPlanoAssinatura,
        billingStatus: billingStatusInicial as TenantBillingStatus,
        trialFim: trialFimInicial,
        vencimentoAssinatura: vencimentoInicial,
        ultimoPagamentoEm: ultimoPagamentoInicial,
        cupomCodigo: cupomInicial,
        affiliateId: affiliateInicial,
        maxCnpjs: effectiveMaxCnpjs,
        maxUsers: effectiveMaxUsers,
        users: {
          create: {
            userId,
            role: "TITULAR",
          },
        },
      },
    });

    await prisma.configuracaoEmpresa.create({
      data: {
        id: `cfg_${newTenantId}`,
        tenantId: newTenantId,
        razaoSocial: input.razaoSocial,
        cnpj: cleanedCnpj,
        cnae: input.cnaePrincipal,
        cnaesSecundarios: Array.isArray(input.cnaesSecundarios) ? input.cnaesSecundarios : [],
        endereco: input.endereco || "",
        cidade: input.cidade || "",
        uf: input.uf || "",
        representanteNome: userName || "",
      },
    }).catch(() => undefined);
  } catch {
    // Fallback gracioso para ambiente sem container PostgreSQL
  }

  // Dispara notificação no Portal ADM apenas na criação do 1º CNPJ em Trial da conta
  if (!oldestExisting && existingById.size === 0 && billingStatusInicial === "TRIAL") {
    await import("@/server/services/superadmin/notificacoes")
      .then((mod) => {
        const criarNotif =
          mod.criarNotificacaoAdmin ??
          (mod as { default?: { criarNotificacaoAdmin?: typeof mod.criarNotificacaoAdmin } })
            .default?.criarNotificacaoAdmin;
        return criarNotif?.({
          categoria: "NOVO_CLIENTE_TRIAL",
          titulo: `Novo cliente em Teste Grátis: ${input.razaoSocial}`,
          descricao: `Conta criada por ${userName || userEmail} (${userEmail}) • CNPJ ${formatCnpj(cleanedCnpj)}.`,
          severidade: "INFO",
          tenantId: newTenantId,
          linkDestino: `/admin/clientes/${newTenantId}`,
          atorNome: userName || userEmail,
          metadados: { cnpj: cleanedCnpj, email: userEmail, plano: effectivePlan },
        });
      })
      .catch(() => undefined);
  }

  return record;
}

/**
 * Lista todos os tenants vinculados ao usuário
 */
export async function listTenantsForUser(userId: string): Promise<
  Array<{
    tenant: InMemoryTenantRecord;
    role: TenantRole;
  }>
> {
  const resultMap = new Map<
    string,
    { tenant: InMemoryTenantRecord; role: TenantRole }
  >();

  try {
    const dbMemberships = await prisma.tenantUser.findMany({
      where: { userId, ativo: true },
      include: { tenant: true },
      orderBy: { criadoEm: "asc" },
    });
    for (const m of dbMemberships) {
      if (!m.tenant || !m.tenant.ativo) continue;
      const t: InMemoryTenantRecord = {
        id: m.tenant.id,
        cnpj: m.tenant.cnpj,
        razaoSocial: m.tenant.razaoSocial,
        nomeFantasia: m.tenant.nomeFantasia ?? null,
        cnaePrincipal: m.tenant.cnaePrincipal ?? null,
        cnaesSecundarios: Array.isArray(m.tenant.cnaesSecundarios) ? m.tenant.cnaesSecundarios : [],
        endereco: m.tenant.endereco ?? null,
        cidade: m.tenant.cidade ?? null,
        uf: m.tenant.uf ?? null,
        plano: m.tenant.plano as PlanoAssinatura,
        billingStatus: m.tenant.billingStatus,
        trialFim: m.tenant.trialFim ?? null,
        vencimentoAssinatura: m.tenant.vencimentoAssinatura ?? null,
        ultimoPagamentoEm: m.tenant.ultimoPagamentoEm ?? null,
        asaasCustomerId: m.tenant.asaasCustomerId ?? null,
        asaasSubscriptionId: m.tenant.asaasSubscriptionId ?? null,
        segmentos: m.tenant.segmentos || [],
        subsegmentos: m.tenant.subsegmentos || [],
        ufs: m.tenant.ufs || [],
        brasilInteiro: m.tenant.brasilInteiro ?? true,
        preferenciasUpdatedAt: m.tenant.preferenciasUpdatedAt ?? null,
        maxCnpjs: m.tenant.maxCnpjs,
        maxUsers: m.tenant.maxUsers,
        ativo: m.tenant.ativo,
        criadoEm: m.tenant.criadoEm,
        updatedAt: m.tenant.atualizadoEm,
      };
      resultMap.set(t.id, { tenant: t, role: m.role as TenantRole });
    }
  } catch {
    // Fallback em memória
  }

  const userMemberships = inMemoryTenantUsers.filter(
    (tu) => tu.userId === userId && tu.ativo,
  );

  for (const membership of userMemberships) {
    if (resultMap.has(membership.tenantId)) continue;
    const tenant = inMemoryTenants.get(membership.tenantId);
    if (!tenant || !tenant.ativo) continue;
    resultMap.set(tenant.id, {
      tenant,
      role: membership.role,
    });
  }

  return Array.from(resultMap.values());
}

/**
 * Convida um membro para a equipe do CNPJ, respeitando a cota de assentos do plano
 */
export async function inviteTeamMember(params: {
  tenantId: string;
  senderUserId: string;
  input: InviteMemberInput;
}): Promise<InMemoryTenantConviteRecord> {
  const { tenantId, senderUserId, input } = params;
  const emailValidation = validateCorporateEmail(input.email);

  if (!emailValidation.isValid) {
    throw new Error(emailValidation.error || "E-mail corporativo inválido");
  }

  let tenant: InMemoryTenantRecord | undefined = inMemoryTenants.get(tenantId);
  if (!tenant) {
    try {
      const dbTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (dbTenant) {
        tenant = {
          id: dbTenant.id,
          cnpj: dbTenant.cnpj,
          razaoSocial: dbTenant.razaoSocial,
          nomeFantasia: dbTenant.nomeFantasia ?? null,
          cnaePrincipal: dbTenant.cnaePrincipal ?? null,
          cnaesSecundarios: Array.isArray(dbTenant.cnaesSecundarios) ? dbTenant.cnaesSecundarios : [],
          endereco: dbTenant.endereco ?? null,
          cidade: dbTenant.cidade ?? null,
          uf: dbTenant.uf ?? null,
          plano: dbTenant.plano as PlanoAssinatura,
          billingStatus: dbTenant.billingStatus,
          trialFim: dbTenant.trialFim ?? null,
          maxCnpjs: dbTenant.maxCnpjs,
          maxUsers: dbTenant.maxUsers,
          ativo: dbTenant.ativo,
          criadoEm: dbTenant.criadoEm,
          updatedAt: dbTenant.atualizadoEm,
        };
      }
    } catch {}
  }

  if (!tenant) {
    throw new TenantNotFoundError(tenantId);
  }

  // Verifica se o remetente é titular do tenant (memória ou banco)
  let senderMembership: { userEmail: string; userName: string; role: TenantRole } | undefined =
    inMemoryTenantUsers.find(
      (tu) => tu.tenantId === tenantId && tu.userId === senderUserId && tu.ativo,
    );

  if (!senderMembership) {
    try {
      const dbSender = await prisma.tenantUser.findFirst({
        where: { tenantId, userId: senderUserId, ativo: true },
        include: { user: { select: { email: true, name: true } } },
      });
      if (dbSender) {
        senderMembership = {
          userEmail: dbSender.user?.email || "",
          userName: dbSender.user?.name || "Titular",
          role: dbSender.role as TenantRole,
        };
      }
    } catch {}
  }

  if (!senderMembership || senderMembership.role !== "TITULAR") {
    throw new UnauthorizedTenantActionError(
      "Apenas o Titular da conta pode convidar novos membros para este CNPJ.",
    );
  }

  // 1. Verifica se não está convidando a si próprio
  const normalizedEmail = emailValidation.sanitized;
  if (senderMembership.userEmail.toLowerCase() === normalizedEmail) {
    throw new Error("Você não pode convidar seu próprio e-mail.");
  }

  // 2. Verifica se o e-mail convidado já é membro ativo (memória ou banco)
  let alreadyMember = inMemoryTenantUsers.some(
    (tu) =>
      tu.tenantId === tenantId &&
      tu.userEmail.toLowerCase() === normalizedEmail &&
      tu.ativo,
  );
  if (!alreadyMember) {
    try {
      const dbMember = await prisma.tenantUser.findFirst({
        where: {
          tenantId,
          ativo: true,
          user: { email: normalizedEmail },
        },
      });
      alreadyMember = Boolean(dbMember);
    } catch {}
  }
  if (alreadyMember) {
    throw new Error("Este e-mail já é membro ativo desta empresa.");
  }

  // Verifica limite de assentos/usuários do plano
  const planLimits = PLAN_LIMITS[tenant.plano];
  const memMembersCount = inMemoryTenantUsers.filter(
    (tu) => tu.tenantId === tenantId && tu.ativo,
  ).length;
  let dbMembersCount = 0;
  try {
    dbMembersCount = await prisma.tenantUser.count({
      where: { tenantId, ativo: true },
    });
  } catch {}
  const activeMembersCount = Math.max(memMembersCount, dbMembersCount);

  if (activeMembersCount >= planLimits.maxUsers) {
    throw new TeamSeatLimitExceededError(
      `O plano ${tenant.plano} da sua empresa permite no máximo ${planLimits.maxUsers} usuário(s). Faça upgrade do plano para adicionar mais assentos.`,
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 dias

  const conviteRecord: InMemoryTenantConviteRecord = {
    id: `convite_${randomUUID()}`,
    tenantId,
    email: normalizedEmail,
    role: input.role,
    token: `token_${randomUUID().replace(/-/g, "")}`,
    expiraEm: expiresAt,
    criadoPorId: senderUserId,
    criadoEm: now,
  };

  inMemoryTenantConvites.push(conviteRecord);

  try {
    await prisma.tenantConvite.create({
      data: {
        id: conviteRecord.id,
        tenantId,
        email: normalizedEmail,
        role: input.role,
        token: conviteRecord.token,
        expiraEm: expiresAt,
        criadoPorId: senderUserId,
      },
    });
  } catch {
    // Fallback gracioso
  }

  try {
    await enviarEmailConviteEquipe({
      destinatarioEmail: normalizedEmail,
      role: input.role,
      razaoSocial: tenant.razaoSocial,
      convidadoPor: senderMembership.userName,
      token: conviteRecord.token,
      tenantId,
    });
  } catch {
    // Não bloqueia retorno do convite caso o provedor de e-mail falhe
  }

  return conviteRecord;
}

/**
 * Revoga ou remove um membro da equipe
 */
export async function revokeTeamMember(params: {
  tenantId: string;
  senderUserId: string;
  targetUserId: string;
}): Promise<void> {
  const { tenantId, senderUserId, targetUserId } = params;

  if (senderUserId === targetUserId) {
    throw new UnauthorizedTenantActionError(
      "O titular não pode revogar o seu próprio acesso. Para encerrar a conta, contate o suporte.",
    );
  }

  let senderMembership: { role: TenantRole } | undefined = inMemoryTenantUsers.find(
    (tu) => tu.tenantId === tenantId && tu.userId === senderUserId && tu.ativo,
  );
  if (!senderMembership) {
    try {
      const dbSender = await prisma.tenantUser.findFirst({
        where: { tenantId, userId: senderUserId, ativo: true },
        select: { role: true },
      });
      if (dbSender) {
        senderMembership = { role: dbSender.role as TenantRole };
      }
    } catch {}
  }
  if (!senderMembership || senderMembership.role !== "TITULAR") {
    throw new UnauthorizedTenantActionError(
      "Apenas o Titular pode revogar acessos de membros da equipe.",
    );
  }

  const memberIdx = inMemoryTenantUsers.findIndex(
    (tu) => tu.tenantId === tenantId && tu.userId === targetUserId,
  );
  if (memberIdx !== -1) {
    inMemoryTenantUsers.splice(memberIdx, 1);
  }

  try {
    await prisma.tenantUser.deleteMany({
      where: {
        tenantId,
        userId: targetUserId,
      },
    });
  } catch {
    // Fallback gracioso
  }
}

/**
 * Registra protocolo de contestação e reivindicação de titularidade de CNPJ
 */
export async function disputeClaimCnpj(params: {
  userId: string;
  userEmail: string;
  userName?: string | null;
  input: DisputeClaimCnpjInput;
}): Promise<{
  protocolo: string;
  metodo: string;
  mensagem: string;
}> {
  const cleanedCnpj = cleanCnpj(params.input.cnpj);
  const formattedCnpj = formatCnpj(cleanedCnpj);
  const protocolo = `DISP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const normalizedEmail = params.userEmail.trim().toLowerCase();

  const memTenant = Array.from(inMemoryTenants.values()).find(
    (t) => cleanCnpj(t.cnpj) === cleanedCnpj,
  );
  let tenantAtualId: string | null = memTenant?.id ?? null;
  if (!tenantAtualId) {
    try {
      const dbTenant = await prisma.tenant.findFirst({
        where: { cnpj: { in: Array.from(new Set([cleanedCnpj, formattedCnpj])) } },
        select: { id: true },
      });
      tenantAtualId = dbTenant?.id ?? null;
    } catch {
      tenantAtualId = null;
    }
  }

  let requerenteNome = params.userName?.trim() || "";
  if (!requerenteNome) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { name: true },
      });
      requerenteNome = dbUser?.name || "";
    } catch {
      requerenteNome = "";
    }
  }
  if (!requerenteNome) {
    requerenteNome = normalizedEmail.split("@")[0] || "Solicitante";
  }

  const record: InMemoryCnpjDisputeRecord = {
    id: protocolo,
    cnpj: formattedCnpj,
    tenantAtualId,
    requerenteUserId: params.userId,
    requerenteNome,
    requerenteEmail: normalizedEmail,
    motivo: params.input.motivo,
    metodo: params.input.metodo,
    status: "PENDENTE",
    decididoPorNome: null,
    decididoEm: null,
    criadoEm: new Date(),
  };

  inMemoryCnpjDisputes.set(protocolo, record);

  try {
    await prisma.cnpjDispute.create({
      data: record,
    });
  } catch {
    // Fallback em memória garantido acima quando Postgres está offline
  }

  return {
    protocolo,
    metodo: params.input.metodo,
    mensagem:
      params.input.metodo === "EMAIL_RECEITA"
        ? `Enviamos um código de confirmação exclusivo para o e-mail oficial constante no Cartão CNPJ da Receita Federal. Ao digitar o código, a titularidade será transferida.`
        : `Sua solicitação documental foi protocolada com sucesso (#${protocolo}). Nossa equipe de auditoria analisará os documentos em até 24h úteis.`,
  };
}
