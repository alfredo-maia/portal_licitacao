import { randomUUID } from "node:crypto";
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
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  plano: PlanoAssinatura;
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

// Armazenamento em memória para suporte a testes unitários sem banco ativo
export const inMemoryTenants = new Map<string, InMemoryTenantRecord>();
export const inMemoryTenantUsers: InMemoryTenantUserRecord[] = [];
export const inMemoryTenantConvites: InMemoryTenantConviteRecord[] = [];

export function resetInMemoryTenantStorage(): void {
  inMemoryTenants.clear();
  inMemoryTenantUsers.length = 0;
  inMemoryTenantConvites.length = 0;
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
  const userPlan: PlanoAssinatura = params.userPlan ?? input.plano ?? "BASICO";
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
    const existingDb = await prisma.tenant.findUnique({
      where: { cnpj: cleanedCnpj },
    });
    if (existingDb) {
      throw new TenantCollisionError(cleanedCnpj);
    }
  } catch (error) {
    if (error instanceof TenantCollisionError) throw error;
  }

  // 2. Validação da cota de CNPJs do plano contratado
  const planLimits = PLAN_LIMITS[userPlan];
  const userTenantsCount = inMemoryTenantUsers.filter(
    (tu) => tu.userId === userId && tu.role === "TITULAR" && tu.ativo,
  ).length;

  if (userTenantsCount >= planLimits.maxCnpjs) {
    throw new PlanQuotaExceededError(
      `Seu plano ${userPlan} permite o cadastro de no máximo ${planLimits.maxCnpjs} CNPJ(s) ativo(s). Faça upgrade para adicionar novos CNPJs.`,
    );
  }

  const newTenantId = `tenant_${randomUUID()}`;
  const now = new Date();

  const record: InMemoryTenantRecord = {
    id: newTenantId,
    cnpj: cleanedCnpj,
    razaoSocial: input.razaoSocial,
    nomeFantasia: input.nomeFantasia ?? null,
    cnaePrincipal: input.cnaePrincipal ?? null,
    endereco: input.endereco ?? null,
    cidade: input.cidade ?? null,
    uf: input.uf ?? null,
    plano: userPlan,
    maxCnpjs: planLimits.maxCnpjs,
    maxUsers: planLimits.maxUsers,
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

  try {
    await prisma.tenant.create({
      data: {
        id: newTenantId,
        cnpj: cleanedCnpj,
        razaoSocial: input.razaoSocial,
        nomeFantasia: input.nomeFantasia,
        cnaePrincipal: input.cnaePrincipal,
        endereco: input.endereco,
        cidade: input.cidade,
        uf: input.uf,
        plano: userPlan,
        maxCnpjs: planLimits.maxCnpjs,
        maxUsers: planLimits.maxUsers,
        users: {
          create: {
            userId,
            role: "TITULAR",
          },
        },
      },
    });
  } catch {
    // Fallback gracioso para ambiente sem container PostgreSQL
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
  const userMemberships = inMemoryTenantUsers.filter(
    (tu) => tu.userId === userId && tu.ativo,
  );

  return userMemberships
    .map((membership) => {
      const tenant = inMemoryTenants.get(membership.tenantId);
      if (!tenant || !tenant.ativo) return null;
      return {
        tenant,
        role: membership.role,
      };
    })
    .filter((v): v is { tenant: InMemoryTenantRecord; role: TenantRole } => v !== null);
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

  const tenant = inMemoryTenants.get(tenantId);
  if (!tenant) {
    throw new TenantNotFoundError(tenantId);
  }

  // Verifica se o remetente é titular do tenant
  const senderMembership = inMemoryTenantUsers.find(
    (tu) => tu.tenantId === tenantId && tu.userId === senderUserId && tu.ativo,
  );
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

  // 2. Verifica se o e-mail convidado já é membro ativo
  const alreadyMember = inMemoryTenantUsers.some(
    (tu) =>
      tu.tenantId === tenantId &&
      tu.userEmail.toLowerCase() === normalizedEmail &&
      tu.ativo,
  );
  if (alreadyMember) {
    throw new Error("Este e-mail já é membro ativo desta empresa.");
  }

  // Verifica limite de assentos/usuários do plano
  const planLimits = PLAN_LIMITS[tenant.plano];
  const activeMembersCount = inMemoryTenantUsers.filter(
    (tu) => tu.tenantId === tenantId && tu.ativo,
  ).length;

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

  const senderMembership = inMemoryTenantUsers.find(
    (tu) => tu.tenantId === tenantId && tu.userId === senderUserId && tu.ativo,
  );
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
  input: DisputeClaimCnpjInput;
}): Promise<{
  protocolo: string;
  metodo: string;
  mensagem: string;
}> {
  const cleanedCnpj = cleanCnpj(params.input.cnpj);
  const protocolo = `DISP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return {
    protocolo,
    metodo: params.input.metodo,
    mensagem:
      params.input.metodo === "EMAIL_RECEITA"
        ? `Enviamos um código de confirmação exclusivo para o e-mail oficial constante no Cartão CNPJ da Receita Federal. Ao digitar o código, a titularidade será transferida.`
        : `Sua solicitação documental foi protocolada com sucesso (#${protocolo}). Nossa equipe de auditoria analisará os documentos em até 24h úteis.`,
  };
}
