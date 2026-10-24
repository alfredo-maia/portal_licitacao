import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "@/config/brand";
import { brandConfigSchema } from "@/server/schemas/brand.schema";

const SRC_DIR = path.resolve(process.cwd(), "src");
const BRAND_FILE_RELATIVE = path.normalize("src/config/brand.ts");
const FORBIDDEN_BRAND_LITERAL = ["Portal", "PNCP"].join(" ");

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Sprint 0 — Isolamento de Marca (src/config/brand.ts)", () => {
  it("deve validar APP_CONFIG contra o contrato Zod brandConfigSchema", () => {
    const parsed = brandConfigSchema.safeParse(APP_CONFIG);
    expect(parsed.success).toBe(true);
    expect(APP_CONFIG.brandName).toBeTruthy();
    expect(APP_CONFIG.shortName).toBe("PNCP");
    expect(APP_CONFIG.tagline).toBe(
      "Inteligência e Gestão em Licitações Públicas",
    );
    expect(APP_CONFIG.version).toBe("1.0.0");
  });

  it("deve garantir que a string literal da marca não apareça fora de src/config/brand.ts", () => {
    const allFiles = collectSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const filePath of allFiles) {
      const relativePath = path.normalize(
        path.relative(process.cwd(), filePath),
      );
      if (relativePath === BRAND_FILE_RELATIVE) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes(FORBIDDEN_BRAND_LITERAL)) {
        violations.push(relativePath);
      }
    }

    expect(
      violations,
      `Encontrada ocorrência proibida da string literal da marca fora de src/config/brand.ts: ${violations.join(", ")}`,
    ).toEqual([]);
  });
});
