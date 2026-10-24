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
