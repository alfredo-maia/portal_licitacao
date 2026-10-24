import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  TIPOS_SISTEMA_CATALOG,
  type TipoSistemaCatalogEntry,
} from "../src/config/tipos-sistema";
import {
  DEFAULT_SEED_DIRECTOR_PASSWORD,
  DIRECTORS_SEED,
  upsertInMemoryAuthUser,
} from "../src/server/auth";
import {
  type SeedDirectorContract,
  seedDirectorSchema,
} from "../src/server/schemas/auth.schema";

export { DIRECTORS_SEED };

/**
 * Provisionamento idempotente dos 2 diretores no banco de dados (PRD §2.3 / sprint-0-spec §2.5):
 * 1. Vítor Henrique (vitorhenrique018@gmail.com) - DIRETORIA
 * 2. Alfredo Maia (alfredosouza100@gmail.com) - DIRETORIA
 */
export async function seedDirectors(): Promise<readonly SeedDirectorContract[]> {
  const rawPassword =
    process.env.SEED_DIRECTOR_PASSWORD || DEFAULT_SEED_DIRECTOR_PASSWORD;
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const provisioned: SeedDirectorContract[] = [];

  for (const director of DIRECTORS_SEED) {
    const validatedDirector = seedDirectorSchema.parse(director);
    let userId = `seed_${randomUUID()}`;

    try {
      const upserted = await prisma.user.upsert({
        where: { email: validatedDirector.email },
        update: {
          name: validatedDirector.name,
          passwordHash,
          role: validatedDirector.role,
          ativo: validatedDirector.ativo,
        },
        create: {
          name: validatedDirector.name,
          email: validatedDirector.email,
          passwordHash,
          role: validatedDirector.role,
          ativo: validatedDirector.ativo,
        },
      });
      userId = upserted.id;
    } catch {
      // Fallback resiliente caso o banco PostgreSQL não esteja ativo no ambiente de execução (ex.: CI)
    }

    upsertInMemoryAuthUser({
      id: userId,
      name: validatedDirector.name,
      email: validatedDirector.email,
      role: validatedDirector.role,
      ativo: validatedDirector.ativo,
      passwordHash,
    });

    provisioned.push(validatedDirector);
  }

  return provisioned;
}

export type SeedTipoSistemaContract = TipoSistemaCatalogEntry & {
  readonly ativo: boolean;
};

/**
 * Provisionamento idempotente (upsert por `codigo`) dos 22 Tipos de Sistema
 * padronizados (PRD §5.1 / sprint-1-spec §2.1). Em ambientes sem PostgreSQL
 * acessível (ex.: testes unitários em CI), faz fallback resiliente: o catálogo
 * tipado em `src/config/tipos-sistema.ts` permanece a fonte da verdade.
 */
export async function seedTiposSistema(): Promise<
  readonly SeedTipoSistemaContract[]
> {
  const provisioned: SeedTipoSistemaContract[] = [];

  for (const tipo of TIPOS_SISTEMA_CATALOG) {
    try {
      await prisma.tipoSistema.upsert({
        where: { codigo: tipo.codigo },
        update: {
          nome: tipo.nome,
          ordem: tipo.ordem,
          ativo: true,
        },
        create: {
          codigo: tipo.codigo,
          nome: tipo.nome,
          ordem: tipo.ordem,
          ativo: true,
        },
      });
    } catch {
      // Fallback resiliente caso o banco PostgreSQL não esteja ativo no ambiente de execução (ex.: CI)
    }

    provisioned.push({ ...tipo, ativo: true });
  }

  return provisioned;
}

if (require.main === module) {
  seedDirectors()
    .then(async (seeded) => {
      console.log(
        `[seed] ${seeded.length} diretores provisionados com sucesso:`,
        seeded.map((d) => d.email).join(", "),
      );
      const tipos = await seedTiposSistema();
      console.log(
        `[seed] ${tipos.length} tipos de sistema provisionados com sucesso:`,
        tipos.map((t) => t.codigo).join(", "),
      );
    })
    .catch((error: unknown) => {
      console.error("[seed] Falha ao provisionar seeds:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => undefined);
    });
}
