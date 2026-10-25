const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const DIRECTORS_SEED = [
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
];

async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[entrypoint] DATABASE_URL não definida; pulando bootstrap do banco.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    // Verifica se a tabela User já existe; caso contrário, aplica a migration inicial
    const tableCheck = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public."User"')::text AS reg`,
    );
    const exists = Array.isArray(tableCheck) && tableCheck[0] && tableCheck[0].reg;

    if (!exists) {
      const migrationPath = path.join(
        __dirname,
        "prisma",
        "migrations",
        "20261024000000_init",
        "migration.sql",
      );
      if (fs.existsSync(migrationPath)) {
        console.log("[entrypoint] Aplicando migration inicial 20261024000000_init...");
        const sql = fs.readFileSync(migrationPath, "utf-8");
        const statements = sql
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await prisma.$executeRawUnsafe(statement);
        }
      }
    }

    // Garante que todas as colunas e tabelas da Sprint 2 existam no PostgreSQL
    console.log("[entrypoint] Verificando tabelas da Sprint 2 (Kanban, Equipe, Arquivos, Repositórios, IA)...");
    const ddlSprint2 = [
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;`,
      `CREATE INDEX IF NOT EXISTS "licitacao_responsavelId_idx" ON "licitacao"("responsavelId");`,
      `CREATE TABLE IF NOT EXISTS "licitacao_atribuido" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "licitacaoId" TEXT NOT NULL,
        "usuarioId" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_atribuido_licitacaoId_usuarioId_key" ON "licitacao_atribuido"("licitacaoId", "usuarioId");`,
      `CREATE INDEX IF NOT EXISTS "licitacao_atribuido_licitacaoId_idx" ON "licitacao_atribuido"("licitacaoId");`,
      `CREATE INDEX IF NOT EXISTS "licitacao_atribuido_usuarioId_idx" ON "licitacao_atribuido"("usuarioId");`,
      `CREATE TABLE IF NOT EXISTS "arquivo" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "licitacaoId" TEXT,
        "nome" TEXT NOT NULL,
        "tamanho" INTEGER NOT NULL,
        "mimeType" TEXT NOT NULL,
        "caminho" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS "arquivo_licitacaoId_idx" ON "arquivo"("licitacaoId");`,
      `CREATE TABLE IF NOT EXISTS "repositorio_similar" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "licitacaoId" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS "repositorio_similar_licitacaoId_idx" ON "repositorio_similar"("licitacaoId");`,
      `CREATE TABLE IF NOT EXISTS "analise_status_participacao" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "licitacaoId" TEXT NOT NULL,
        "scriptPrompt" TEXT NOT NULL,
        "relatorioTexto" TEXT NOT NULL,
        "impedimentos" JSONB,
        "viabilidade" JSONB,
        "custos" JSONB,
        "precoSugerido" JSONB,
        "executadoPorId" TEXT,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS "analise_status_participacao_licitacaoId_idx" ON "analise_status_participacao"("licitacaoId");`,
    ];

    for (const stmt of ddlSprint2) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL Sprint 2:", err.message);
      });
    }

    const rawPassword =
      process.env.SEED_DIRECTOR_PASSWORD || "Pncp@2026!Diretoria";
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    for (const director of DIRECTORS_SEED) {
      await prisma.user.upsert({
        where: { email: director.email },
        update: {
          name: director.name,
          passwordHash,
          role: director.role,
          ativo: director.ativo,
        },
        create: {
          name: director.name,
          email: director.email,
          passwordHash,
          role: director.role,
          ativo: director.ativo,
        },
      });
    }

    console.log(
      "[entrypoint] Migrations e seed dos 2 diretores verificados com sucesso.",
    );
  } catch (err) {
    console.error("[entrypoint] Aviso ao inicializar banco de dados:", err);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

bootstrapDatabase().then(() => {
  require("./server.js");
});
