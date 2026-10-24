import { DIRECTORS_SEED } from "../src/server/auth";
import type { SeedDirectorContract } from "../src/server/schemas/auth.schema";

export { DIRECTORS_SEED };

/**
 * Contrato do script de seed inicial da Diretoria (sprint-0-spec §2.5).
 * A implementação definitiva (GREEN) pertence à Etapa 3A (AV-28 - Backend).
 */
export async function seedDirectors(): Promise<readonly SeedDirectorContract[]> {
  throw new Error(
    "Not implemented: seedDirectors awaits Sprint 0 Stage 3A Backend GREEN implementation (AV-28)",
  );
}

if (require.main === module) {
  seedDirectors().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
