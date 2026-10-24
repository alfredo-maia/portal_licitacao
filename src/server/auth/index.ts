import type { NextAuthOptions } from "next-auth";
import type {
  LoginCredentialsInput,
  SeedDirectorContract,
  SessionUserContract,
} from "@/server/schemas/auth.schema";

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

/**
 * Contrato de validação de credenciais (E-mail + Senha bcrypt).
 * A implementação definitiva (GREEN) pertence à Etapa 3A (AV-28 - Backend).
 */
export async function authorizeCredentials(
  _credentials: LoginCredentialsInput | undefined,
): Promise<SessionUserContract | null> {
  // Stub contratual para a Fase RED do TDD (Etapa 2 - QA).
  return null;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [],
};
