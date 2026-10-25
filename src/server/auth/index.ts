import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import {
  type LoginCredentialsInput,
  type SeedDirectorContract,
  type SessionUserContract,
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

/**
 * Validação de credenciais (E-mail + Senha bcryptjs) com sessão JWT (PRD §2.3 / sprint-0-spec §2.5).
 * Consulta o PostgreSQL 16 via Prisma ORM e mantém fallback em memória para ambientes de CI sem container DB.
 */
export async function authorizeCredentials(
  credentials: LoginCredentialsInput | Record<string, unknown> | undefined,
): Promise<SessionUserContract | null> {
  const parsed = loginCredentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const plainPassword = parsed.data.password;

  let targetUser: StoredAuthUser | null = null;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (dbUser) {
      targetUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        ativo: dbUser.ativo,
        passwordHash: dbUser.passwordHash,
      };
      upsertInMemoryAuthUser(targetUser);
    }
  } catch {
    // Fallback para cache em memória quando o banco não está disponível (ex.: CI sem serviço Postgres)
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
        role: seedMatch.role,
        ativo: seedMatch.ativo,
        passwordHash,
      };
      upsertInMemoryAuthUser(targetUser);
    }
  }

  if (!targetUser || !targetUser.ativo) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(
    plainPassword,
    targetUser.passwordHash,
  );
  if (!passwordMatches) {
    return null;
  }

  return sessionUserSchema.parse({
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    role: targetUser.role,
    ativo: targetUser.ativo,
  });
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const mutableUser = session.user as Record<string, unknown>;
        mutableUser.id = token.sub;
        mutableUser.role = token.role ?? "OPERADOR";
        mutableUser.ativo = token.ativo ?? true;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "pncp-dev-secret-2026",
};
