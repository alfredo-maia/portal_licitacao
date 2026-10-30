import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import {
  type LoginCredentialsInput,
  type SeedDirectorContract,
  type SessionUserContract,
  SESSION_MAX_AGE_SECONDS,
  loginCredentialsSchema,
  sessionUserSchema,
} from "@/server/schemas/auth.schema";

export const DEFAULT_SEED_DIRECTOR_PASSWORD = "Pncp@2026!Diretoria";

export const DIRECTORS_SEED: readonly SeedDirectorContract[] = [
  {
    name: "Vítor Henrique",
    email: "vitorhenrique018@gmail.com",
    role: "DIRETORIA",
    ativo: true,
  },
  {
    name: "Alfredo Maia",
    email: "alfredosouza100@gmail.com",
    role: "DIRETORIA",
    ativo: true,
  },
] as const;

export interface StoredAuthUser extends SessionUserContract {
  passwordHash: string;
}

const inMemoryUsersByEmail = new Map<string, StoredAuthUser>();

export function upsertInMemoryAuthUser(user: StoredAuthUser): void {
  inMemoryUsersByEmail.set(user.email.trim().toLowerCase(), user);
}

export function getInMemoryAuthUserByEmail(
  email: string,
): StoredAuthUser | undefined {
  return inMemoryUsersByEmail.get(email.trim().toLowerCase());
}

interface StoredOtpRecord {
  code: string;
  expiraEm: Date;
  method: "WHATSAPP_OTP" | "EMAIL_OTP";
}
const inMemoryOtpStore = new Map<string, StoredOtpRecord>();

export function generateAndStoreOtp(
  email: string,
  method: "WHATSAPP_OTP" | "EMAIL_OTP",
): string {
  const normalized = email.trim().toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiraEm = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
  inMemoryOtpStore.set(normalized, { code, expiraEm, method });
  return code;
}

export function verifyOtpCode(email: string, code: string): boolean {
  const normalized = email.trim().toLowerCase();
  const record = inMemoryOtpStore.get(normalized);
  if (!record) return false;
  if (record.expiraEm.getTime() < Date.now()) {
    inMemoryOtpStore.delete(normalized);
    return false;
  }
  if (record.code === code.trim()) {
    inMemoryOtpStore.delete(normalized);
    return true;
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
    const dbUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        tenantMemberships: {
          include: {
            tenant: true,
          },
        },
      },
    });
    if (dbUser) {
      const primaryMembership = dbUser.tenantMemberships?.[0];
      const isSuper =
        (dbUser as any).isSuperAdmin ||
        dbUser.role === "SUPERADMIN" ||
        normalizedEmail === "vitorhenrique018@gmail.com" ||
        normalizedEmail === "alfredosouza100@gmail.com";

      targetUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: isSuper ? "SUPERADMIN" : dbUser.role,
        ativo: dbUser.ativo,
        passwordHash: dbUser.passwordHash,
        activeTenantId: primaryMembership?.tenantId ?? null,
        cnpj: primaryMembership?.tenant?.cnpj ?? null,
        plano: primaryMembership?.tenant?.plano ?? null,
        tenantRole: primaryMembership?.role ?? null,
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
      const fallbackPassword =
        process.env.SEED_DIRECTOR_PASSWORD || DEFAULT_SEED_DIRECTOR_PASSWORD;
      const passwordHash = await bcrypt.hash(fallbackPassword, 10);
      targetUser = {
        id: `user_${randomUUID()}`,
        name: seedMatch.name,
        email: seedMatch.email,
        role: "SUPERADMIN",
        ativo: seedMatch.ativo,
        passwordHash,
        activeTenantId: null,
        cnpj: null,
        plano: null,
        tenantRole: null,
      };
      upsertInMemoryAuthUser(targetUser);
    }
  }

  if (!targetUser || !targetUser.ativo) {
    return null;
  }

  // Se foi fornecido código OTP (WhatsApp ou E-mail)
  if (otpCode) {
    const isOtpValid = verifyOtpCode(normalizedEmail, otpCode);
    if (!isOtpValid) {
      return null;
    }
  } else if (plainPassword) {
    const passwordMatches = await bcrypt.compare(
      plainPassword,
      targetUser.passwordHash,
    );
    if (!passwordMatches) {
      return null;
    }
  } else {
    return null;
  }

  return sessionUserSchema.parse({
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    role: targetUser.role,
    ativo: targetUser.ativo,
    activeTenantId: targetUser.activeTenantId ?? null,
    cnpj: targetUser.cnpj ?? null,
    plano: targetUser.plano ?? null,
    tenantRole: targetUser.tenantRole ?? null,
  });
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
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
      },
      async authorize(credentials) {
        const user = await authorizeCredentials(credentials);
        if (!user) {
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          ativo: user.ativo,
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
        token.sub = typedUser.id;
        token.role = typedUser.role;
        token.ativo = typedUser.ativo;
        token.activeTenantId = typedUser.activeTenantId;
        token.cnpj = typedUser.cnpj;
        token.plano = typedUser.plano;
        token.tenantRole = typedUser.tenantRole;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const mutableUser = session.user as Record<string, unknown>;
        mutableUser.id = token.sub;
        mutableUser.role = token.role ?? "OPERADOR";
        mutableUser.ativo = token.ativo ?? true;
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
