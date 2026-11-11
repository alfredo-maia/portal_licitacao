import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  type SeedDirectorContract,
  type SessionUserContract,
  SESSION_MAX_AGE_SECONDS,
  sessionUserSchema,
} from "@/server/schemas/auth.schema";

export { SESSION_MAX_AGE_SECONDS };

export const DEFAULT_SEED_DIRECTOR_PASSWORD = "Pncp@2026!Diretoria";
export const MASTER_SUPERADMIN_EMAIL = "vitorhenrique018@gmail.com";

export function isMasterSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === MASTER_SUPERADMIN_EMAIL;
}

export const DIRECTORS_SEED: readonly SeedDirectorContract[] = [
  {
    name: "Vítor Henrique",
    email: "vitorhenrique018@gmail.com",
    role: "SUPERADMIN",
    isSuperAdmin: true,
    adminRole: "SUPERADMIN_MASTER",
    ativo: true,
  },
  {
    name: "Alfredo Maia",
    email: "alfredosouza100@gmail.com",
    role: "DIRETORIA",
    isSuperAdmin: false,
    adminRole: null,
    ativo: true,
  },
] as const;

export interface StoredAuthUser extends SessionUserContract {
  passwordHash: string;
  telefone?: string | null;
}

const inMemoryUsersByEmail = new Map<string, StoredAuthUser>();

export function upsertInMemoryAuthUser(user: StoredAuthUser): void {
  const key = user.email.trim().toLowerCase();
  const existing = inMemoryUsersByEmail.get(key);
  inMemoryUsersByEmail.set(key, {
    ...user,
    telefone: user.telefone !== undefined ? user.telefone : (existing?.telefone ?? null),
  });
}

export function getInMemoryAuthUserByEmail(
  email: string,
): StoredAuthUser | undefined {
  return inMemoryUsersByEmail.get(email.trim().toLowerCase());
}

export interface OtpUserLookup {
  id: string;
  name: string;
  email: string;
  ativo: boolean;
  isSuperAdmin: boolean;
  adminRole: string | null;
  telefone: string | null;
}

/**
 * Localiza usuário para envio de código OTP no banco, memória ou seed (ADM e Cliente).
 */
export async function findAuthUserForOtp(email: string): Promise<OtpUserLookup | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    type DbOtpRow = {
      id: string;
      name: string | null;
      email: string;
      role: string;
      ativo: boolean;
      isSuperAdmin?: boolean;
      adminRole?: string | null;
      telefone?: string | null;
      tenantMemberships?: Array<{
        tenant?: { telefone?: string | null } | null;
      }>;
    };

    let dbUser: DbOtpRow | null = null;
    try {
      dbUser = (await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          tenantMemberships: {
            include: {
              tenant: true,
            },
          },
        },
      })) as unknown as DbOtpRow | null;
    } catch {
      dbUser = (await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })) as unknown as DbOtpRow | null;
    }

    if (dbUser) {
      const isMaster = isMasterSuperAdminEmail(dbUser.email || normalizedEmail);
      const isSuper =
        isMaster ||
        Boolean(dbUser.isSuperAdmin) ||
        dbUser.role === "SUPERADMIN" ||
        Boolean(dbUser.adminRole);
      const inMemFallback = getInMemoryAuthUserByEmail(normalizedEmail);
      const telTenant = isMaster ? null : (dbUser.tenantMemberships?.[0]?.tenant?.telefone ?? null);
      return {
        id: dbUser.id,
        name: dbUser.name ?? dbUser.email,
        email: dbUser.email,
        ativo: dbUser.ativo ?? true,
        isSuperAdmin: isSuper,
        adminRole: isMaster
          ? (dbUser.adminRole ?? "SUPERADMIN_MASTER")
          : (dbUser.adminRole ?? (isSuper ? "ADMIN_OPERACIONAL" : null)),
        telefone: dbUser.telefone ?? inMemFallback?.telefone ?? telTenant ?? null,
      };
    }
  } catch {
    // Fallback em memória quando o banco não estiver ativo
  }

  const inMem = getInMemoryAuthUserByEmail(normalizedEmail);
  if (inMem) {
    const isMaster = isMasterSuperAdminEmail(inMem.email || normalizedEmail);
    const isSuper =
      isMaster ||
      Boolean(inMem.isSuperAdmin) ||
      inMem.role === "SUPERADMIN" ||
      Boolean(inMem.adminRole);
    return {
      id: inMem.id,
      name: inMem.name,
      email: inMem.email,
      ativo: inMem.ativo,
      isSuperAdmin: isSuper,
      adminRole: isMaster
        ? (inMem.adminRole ?? "SUPERADMIN_MASTER")
        : (inMem.adminRole ?? (isSuper ? "ADMIN_OPERACIONAL" : null)),
      telefone: inMem.telefone ?? null,
    };
  }

  const seedMatch = DIRECTORS_SEED.find(
    (director) => director.email.toLowerCase() === normalizedEmail,
  );
  if (seedMatch) {
    const isVitorSeed = isMasterSuperAdminEmail(seedMatch.email);
    return {
      id: isVitorSeed ? "seed_vitor_master" : "seed_director_alfredo",
      name: seedMatch.name,
      email: seedMatch.email,
      ativo: seedMatch.ativo,
      isSuperAdmin: isVitorSeed,
      adminRole: isVitorSeed ? "SUPERADMIN_MASTER" : null,
      telefone: null,
    };
  }

  return null;
}

const MAX_OTP_ATTEMPTS = 5;

interface StoredOtpRecord {
  code: string;
  expiraEm: Date;
  method: "WHATSAPP_OTP" | "EMAIL_OTP";
  tentativas: number;
}
const inMemoryOtpStore = new Map<string, StoredOtpRecord>();

export function generateAndStoreOtp(
  email: string,
  method: "WHATSAPP_OTP" | "EMAIL_OTP",
): string {
  const normalized = email.trim().toLowerCase();
  const code = randomInt(100000, 1000000).toString();
  const expiraEm = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
  inMemoryOtpStore.set(normalized, { code, expiraEm, method, tentativas: 0 });
  return code;
}

export function verifyOtpCode(email: string, code: string): boolean {
  const normalized = email.trim().toLowerCase();
  const record = inMemoryOtpStore.get(normalized);
  if (!record) return false;
  if (record.expiraEm.getTime() < Date.now() || record.tentativas >= MAX_OTP_ATTEMPTS) {
    inMemoryOtpStore.delete(normalized);
    return false;
  }
  if (record.code === code.trim()) {
    inMemoryOtpStore.delete(normalized);
    return true;
  }
  record.tentativas += 1;
  if (record.tentativas >= MAX_OTP_ATTEMPTS) {
    inMemoryOtpStore.delete(normalized);
  }
  return false;
}

/**
 * Validação de credenciais (E-mail + Senha bcryptjs ou OTP) com sessão JWT de 30 dias (PRD §4 / ADR 0007).
 */
export type AuthCredentialsInput = {
  email?: string;
  password?: string;
  code?: string;
} | Record<string, unknown>;

export async function authorizeCredentials(
  credentials: AuthCredentialsInput | undefined,
): Promise<SessionUserContract | null> {
  const credsRecord = (credentials ?? {}) as Record<string, unknown>;
  const rawEmail = typeof credsRecord.email === "string" ? credsRecord.email : "";
  const normalizedEmail = rawEmail.trim().toLowerCase();
  const plainPassword = typeof credsRecord.password === "string" ? credsRecord.password : "";
  const otpCode = typeof credsRecord.code === "string" ? credsRecord.code : "";

  if (!normalizedEmail) {
    return null;
  }

  let targetUser: StoredAuthUser | null = null;

  try {
    type DbUserAuthRow = {
      id: string;
      name: string | null;
      email: string;
      role: string;
      ativo: boolean;
      isSuperAdmin?: boolean;
      adminRole?: string | null;
      telefone?: string | null;
      sessionVersion?: number;
      passwordHash: string | null;
      tenantMemberships?: Array<{
        tenantId: string;
        role: string;
        tenant?: { cnpj?: string | null; plano?: string | null; telefone?: string | null } | null;
      }>;
    };

    let dbUser: DbUserAuthRow | null = null;
    try {
      dbUser = (await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          tenantMemberships: {
            include: {
              tenant: true,
            },
          },
        },
      })) as unknown as DbUserAuthRow | null;
    } catch {
      // Fallback: busca o usuário diretamente se a tabela de relacionamento falhar no join
      dbUser = (await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })) as unknown as DbUserAuthRow | null;
    }

    if (dbUser) {
      let primaryMembership = dbUser.tenantMemberships?.[0];
      if (!primaryMembership) {
        try {
          const directMembership = await prisma.tenantUser.findFirst({
            where: { userId: dbUser.id },
            include: { tenant: true },
          });
          if (directMembership) {
            primaryMembership = directMembership;
          }
        } catch {}
      }

      const isMaster = isMasterSuperAdminEmail(dbUser.email || normalizedEmail);
      const isSuper =
        isMaster ||
        Boolean(dbUser.isSuperAdmin) ||
        dbUser.role === "SUPERADMIN" ||
        Boolean(dbUser.adminRole);
      const inMemFallback = getInMemoryAuthUserByEmail(normalizedEmail);
      const resolvedRole = isSuper
        ? "SUPERADMIN"
        : dbUser.role ?? inMemFallback?.role ?? "OPERADOR";
      const resolvedAdminRole = isMaster
        ? (dbUser.adminRole ?? "SUPERADMIN_MASTER")
        : (dbUser.adminRole ?? null);
      targetUser = {
        id: dbUser.id,
        name: dbUser.name ?? dbUser.email,
        email: dbUser.email,
        role: resolvedRole as SessionUserContract["role"],
        ativo: dbUser.ativo ?? true,
        isSuperAdmin: isSuper,
        adminRole: (resolvedAdminRole ?? null) as SessionUserContract["adminRole"],
        sessionVersion: Number(dbUser.sessionVersion ?? 1),
        passwordHash: dbUser.passwordHash ?? inMemFallback?.passwordHash ?? "",
        telefone: isSuper
          ? (dbUser.telefone ?? inMemFallback?.telefone ?? null)
          : (dbUser.telefone ??
            primaryMembership?.tenant?.telefone ??
            inMemFallback?.telefone ??
            null),
        activeTenantId: isSuper
          ? null
          : (primaryMembership?.tenantId ?? inMemFallback?.activeTenantId ?? null),
        cnpj: isSuper ? null : (primaryMembership?.tenant?.cnpj ?? inMemFallback?.cnpj ?? null),
        plano: isSuper ? null : (primaryMembership?.tenant?.plano ?? inMemFallback?.plano ?? null),
        tenantRole: isSuper ? null : (primaryMembership?.role ?? inMemFallback?.tenantRole ?? null),
      };
      upsertInMemoryAuthUser(targetUser);
    }
  } catch {
    // Fallback para cache em memória quando o banco não está disponível (ex.: CI)
  }

  if (!targetUser) {
    targetUser = getInMemoryAuthUserByEmail(normalizedEmail) ?? null;
  }

  if (!targetUser) {
    const seedMatch = DIRECTORS_SEED.find(
      (director) => director.email.toLowerCase() === normalizedEmail,
    );
    if (seedMatch) {
      const isVitorSeed = seedMatch.email.toLowerCase() === "vitorhenrique018@gmail.com";
      const allowOfflineTestSeed =
        process.env.VITEST === "true" || process.env.NODE_ENV !== "production";
      const fallbackPassword = isVitorSeed
        ? process.env.SUPERADMIN_MASTER_PASSWORD || (allowOfflineTestSeed ? "123456" : "")
        : process.env.SEED_DIRECTOR_PASSWORD ||
          (allowOfflineTestSeed ? DEFAULT_SEED_DIRECTOR_PASSWORD : "");
      if (fallbackPassword) {
        const passwordHash = await bcrypt.hash(fallbackPassword, 10);
        targetUser = {
          id: `user_${randomUUID()}`,
          name: seedMatch.name,
          email: seedMatch.email,
          role: isVitorSeed ? "SUPERADMIN" : seedMatch.role,
          ativo: seedMatch.ativo,
          isSuperAdmin: isVitorSeed,
          adminRole: isVitorSeed ? "SUPERADMIN_MASTER" : null,
          sessionVersion: 1,
          passwordHash,
          activeTenantId: null,
          cnpj: null,
          plano: null,
          tenantRole: null,
        };
        upsertInMemoryAuthUser(targetUser);
      }
    }
  }

  if (!targetUser || !targetUser.ativo) {
    return null;
  }

  const realm =
    credsRecord.realm === "admin" || credsRecord.realm === "client"
      ? credsRecord.realm
      : undefined;
  const isMaster = isMasterSuperAdminEmail(targetUser.email || normalizedEmail);
  const finalRole = isMaster ? "SUPERADMIN" : targetUser.role;
  const finalIsSuperAdmin =
    isMaster ||
    Boolean(targetUser.isSuperAdmin) ||
    finalRole === "SUPERADMIN" ||
    Boolean(targetUser.adminRole);
  const finalAdminRole = isMaster
    ? (targetUser.adminRole ?? "SUPERADMIN_MASTER")
    : (targetUser.adminRole ?? null);

  // Isolamento estrito de realms quando o login veio explicitamente de /admin/login ou /login
  if (realm === "admin" && !finalIsSuperAdmin) {
    return null;
  }
  if (realm === "client" && finalIsSuperAdmin) {
    return null;
  }

  // Se foi fornecido código OTP (WhatsApp ou E-mail)
  if (otpCode) {
    const isOtpValid = verifyOtpCode(normalizedEmail, otpCode);
    if (!isOtpValid) {
      return null;
    }
  } else if (plainPassword) {
    if (!targetUser.passwordHash) {
      return null;
    }
    const passwordMatches = await bcrypt.compare(plainPassword, targetUser.passwordHash);
    if (!passwordMatches) {
      return null;
    }
  } else {
    return null;
  }

  if (process.env.VITEST !== "true") {
    prisma.user
      .update({
        where: { email: targetUser.email },
        data: { ultimoLoginEm: new Date() },
      })
      .catch(() => undefined);
  }

  if (finalIsSuperAdmin) {
    await recordAuditLog({
      usuarioNome: targetUser.name,
      acao: "ADMIN_LOGIN",
      entidadeTipo: "AUTH",
      entidadeId: targetUser.id,
      depois: {
        email: targetUser.email,
        realm: realm ?? "direct",
        metodo: otpCode ? "OTP" : "PASSWORD",
        adminRole: finalAdminRole,
      },
    }).catch(() => undefined);
  }

  return sessionUserSchema.parse({
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    role: finalIsSuperAdmin ? "SUPERADMIN" : finalRole,
    ativo: targetUser.ativo,
    isSuperAdmin: finalIsSuperAdmin,
    adminRole: finalAdminRole,
    sessionVersion: targetUser.sessionVersion ?? 1,
    activeTenantId: finalIsSuperAdmin ? null : (targetUser.activeTenantId ?? null),
    cnpj: finalIsSuperAdmin ? null : (targetUser.cnpj ?? null),
    plano: finalIsSuperAdmin ? null : (targetUser.plano ?? null),
    tenantRole: finalIsSuperAdmin ? null : (targetUser.tenantRole ?? null),
  });
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS, // 30 dias de persistência
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS, // 30 dias de persistência
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        code: { label: "Código OTP", type: "text" },
        realm: { label: "Realm", type: "text" },
      },
      async authorize(credentials) {
        const resolvedRealm: "admin" | "client" =
          credentials?.realm === "admin" || credentials?.realm === "client"
            ? credentials.realm
            : "client";
        const user = await authorizeCredentials({
          ...credentials,
          realm: resolvedRealm,
        });
        if (!user) {
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          ativo: user.ativo,
          isSuperAdmin: user.isSuperAdmin ?? false,
          adminRole: user.adminRole ?? null,
          sessionVersion: user.sessionVersion ?? 1,
          activeTenantId: user.activeTenantId ?? null,
          cnpj: user.cnpj ?? null,
          plano: user.plano ?? null,
          tenantRole: user.tenantRole ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return url;
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          return parsed.pathname + parsed.search;
        }
        return url;
      } catch {
        return "/dashboard";
      }
    },
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as unknown as SessionUserContract;
        const isMaster = isMasterSuperAdminEmail(typedUser.email);
        const isSuper =
          isMaster ||
          Boolean(typedUser.isSuperAdmin) ||
          typedUser.role === "SUPERADMIN" ||
          Boolean(typedUser.adminRole);
        token.sub = typedUser.id;
        token.role = isSuper ? "SUPERADMIN" : typedUser.role;
        token.ativo = typedUser.ativo;
        token.isSuperAdmin = isSuper;
        token.adminRole = isMaster
          ? (typedUser.adminRole ?? "SUPERADMIN_MASTER")
          : (typedUser.adminRole ?? null);
        token.sessionVersion = typedUser.sessionVersion ?? 1;
        token.activeTenantId = isSuper ? null : typedUser.activeTenantId;
        token.cnpj = isSuper ? null : typedUser.cnpj;
        token.plano = isSuper ? null : typedUser.plano;
        token.tenantRole = isSuper ? null : typedUser.tenantRole;
      } else if (token.sub) {
        const tokenEmail = typeof token.email === "string" ? token.email.toLowerCase() : "";
        const hasTokenVersion = typeof token.sessionVersion === "number";
        if (process.env.VITEST === "true" && tokenEmail) {
          const inMemCurrent = getInMemoryAuthUserByEmail(tokenEmail);
          if (
            inMemCurrent &&
            (!inMemCurrent.ativo ||
              (hasTokenVersion &&
                typeof inMemCurrent.sessionVersion === "number" &&
                inMemCurrent.sessionVersion !== token.sessionVersion))
          ) {
            token.ativo = false;
            token.sessionRevoked = true;
            token.isSuperAdmin = false;
            token.adminRole = null;
            token.role = "OPERADOR";
          } else if (inMemCurrent) {
            const isMasterMem = isMasterSuperAdminEmail(tokenEmail);
            const memIsSuper =
              isMasterMem ||
              Boolean(inMemCurrent.isSuperAdmin) ||
              inMemCurrent.role === "SUPERADMIN" ||
              Boolean(inMemCurrent.adminRole);
            token.role = memIsSuper ? "SUPERADMIN" : inMemCurrent.role;
            token.isSuperAdmin = memIsSuper;
            token.adminRole = isMasterMem
              ? (inMemCurrent.adminRole ?? "SUPERADMIN_MASTER")
              : (inMemCurrent.adminRole ?? null);
          } else if (isMasterSuperAdminEmail(tokenEmail)) {
            token.role = "SUPERADMIN";
            token.isSuperAdmin = true;
            token.adminRole = (token.adminRole as string | null) ?? "SUPERADMIN_MASTER";
          }
        } else {
          // Killswitch de sessão: valida ativo e sessionVersion no banco
          try {
            const current = await prisma.user.findUnique({
              where: { id: token.sub },
              select: { ativo: true, sessionVersion: true, role: true, isSuperAdmin: true, adminRole: true },
            });
            if (current) {
              if (!current.ativo || (hasTokenVersion && current.sessionVersion !== token.sessionVersion)) {
                token.ativo = false;
                token.sessionRevoked = true;
                token.isSuperAdmin = false;
                token.adminRole = null;
                token.role = "OPERADOR";
              } else if (isMasterSuperAdminEmail(tokenEmail)) {
                token.role = "SUPERADMIN";
                token.isSuperAdmin = true;
                token.adminRole = current.adminRole ?? "SUPERADMIN_MASTER";
              } else {
                const currentIsSuper =
                  Boolean(current.isSuperAdmin) ||
                  current.role === "SUPERADMIN" ||
                  Boolean(current.adminRole);
                token.role = currentIsSuper ? "SUPERADMIN" : current.role;
                token.isSuperAdmin = currentIsSuper;
                token.adminRole = current.adminRole ?? null;
              }
            }
          } catch {
            // Mantém token atual em caso de indisponibilidade transitória
          }
        }
      }

      if (
        !token.sessionRevoked &&
        token.ativo !== false &&
        (token.isSuperAdmin === true ||
          token.role === "SUPERADMIN" ||
          Boolean(token.adminRole))
      ) {
        token.role = "SUPERADMIN";
        token.isSuperAdmin = true;
        token.activeTenantId = null;
        token.cnpj = null;
        token.plano = null;
        token.tenantRole = null;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sessionRevoked || token.ativo === false) {
        return { ...session, user: undefined, expires: new Date(0).toISOString() } as typeof session;
      }
      if (session.user) {
        const mutableUser = session.user as Record<string, unknown>;
        mutableUser.id = token.sub;
        mutableUser.role = token.role ?? "OPERADOR";
        mutableUser.ativo = token.ativo ?? true;
        mutableUser.isSuperAdmin = token.isSuperAdmin ?? false;
        mutableUser.adminRole = token.adminRole ?? null;
        mutableUser.sessionVersion = token.sessionVersion ?? 1;
        mutableUser.activeTenantId = token.activeTenantId ?? null;
        mutableUser.cnpj = token.cnpj ?? null;
        mutableUser.plano = token.plano ?? null;
        mutableUser.tenantRole = token.tenantRole ?? null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "pncp-dev-secret-2026",
};
