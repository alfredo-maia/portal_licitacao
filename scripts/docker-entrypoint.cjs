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

    // Sprint 3 — Dashboard, Calendário & Notificações (espelha a migration
    // 20261025120000_sprint_3_dashboard_calendario_notificacoes; tudo idempotente).
    console.log("[entrypoint] Verificando tabelas da Sprint 3 (Histórico de status, Notificações)...");
    const ddlSprint3 = [
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;`,
      `CREATE INDEX IF NOT EXISTS "Licitacao_responsavelId_idx" ON "Licitacao"("responsavelId");`,
      `DO $$ BEGIN CREATE TYPE "NotificacaoTipo" AS ENUM ('N1_COLETA_CONCLUIDA', 'N2_LICITACAO_ATUALIZADA', 'N3_ABERTURA_AMANHA', 'N4_PRESENCIAL_PROXIMA', 'N5_PENDENTE_CRITICA', 'N6_VENCIMENTO_PORTAL', 'N7_VENCIMENTO_DOCUMENTO', 'N8_PRAZO_IMPUGNACAO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE "NotificacaoSeveridade" AS ENUM ('INFO', 'ATENCAO', 'CRITICA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "valorArrematado" DOUBLE PRECISION;`,
      `CREATE INDEX IF NOT EXISTS "Licitacao_createdAt_idx" ON "Licitacao"("createdAt");`,
      `CREATE TABLE IF NOT EXISTS "licitacao_status_historico" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "licitacaoId" TEXT NOT NULL,
        "statusAnterior" "LicitacaoStatus",
        "statusNovo" "LicitacaoStatus" NOT NULL,
        "motivo" TEXT,
        "usuarioId" TEXT,
        "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS "notificacao" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tipo" "NotificacaoTipo" NOT NULL,
        "titulo" TEXT NOT NULL,
        "descricao" TEXT NOT NULL,
        "severidade" "NotificacaoSeveridade" NOT NULL DEFAULT 'INFO',
        "linkDestino" TEXT,
        "licitacaoId" TEXT,
        "chaveIdempotencia" TEXT NOT NULL,
        "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS "notificacao_destinatario" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "notificacaoId" TEXT NOT NULL,
        "usuarioId" TEXT NOT NULL,
        "lidaEm" TIMESTAMP(3),
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS "licitacao_status_historico_licitacaoId_ocorridoEm_idx" ON "licitacao_status_historico"("licitacaoId", "ocorridoEm");`,
      `CREATE INDEX IF NOT EXISTS "licitacao_status_historico_statusNovo_ocorridoEm_idx" ON "licitacao_status_historico"("statusNovo", "ocorridoEm");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "notificacao_chaveIdempotencia_key" ON "notificacao"("chaveIdempotencia");`,
      `CREATE INDEX IF NOT EXISTS "notificacao_criadaEm_idx" ON "notificacao"("criadaEm");`,
      `CREATE INDEX IF NOT EXISTS "notificacao_tipo_idx" ON "notificacao"("tipo");`,
      `CREATE INDEX IF NOT EXISTS "notificacao_licitacaoId_idx" ON "notificacao"("licitacaoId");`,
      `CREATE INDEX IF NOT EXISTS "notificacao_destinatario_usuarioId_lidaEm_idx" ON "notificacao_destinatario"("usuarioId", "lidaEm");`,
      `CREATE INDEX IF NOT EXISTS "notificacao_destinatario_notificacaoId_idx" ON "notificacao_destinatario"("notificacaoId");`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "notificacao_destinatario_notificacaoId_usuarioId_key" ON "notificacao_destinatario"("notificacaoId", "usuarioId");`,
      `DO $$ BEGIN ALTER TABLE "licitacao_status_historico" ADD CONSTRAINT "licitacao_status_historico_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "licitacao_status_historico" ADD CONSTRAINT "licitacao_status_historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "notificacao_destinatario" ADD CONSTRAINT "notificacao_destinatario_notificacaoId_fkey" FOREIGN KEY ("notificacaoId") REFERENCES "notificacao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "notificacao_destinatario" ADD CONSTRAINT "notificacao_destinatario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `INSERT INTO "licitacao_status_historico" ("id", "licitacaoId", "statusAnterior", "statusNovo", "motivo", "ocorridoEm")
        SELECT 'bf_' || md5(l."id"), l."id", NULL, l."status", 'Backfill Sprint 3', l."updatedAt"
        FROM "Licitacao" l
        WHERE NOT EXISTS (SELECT 1 FROM "licitacao_status_historico" h WHERE h."licitacaoId" = l."id");`,
    ];

    for (const stmt of ddlSprint3) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL Sprint 3:", err.message);
      });
    }

    const ddlSprint4 = [
      `DO $$ BEGIN CREATE TYPE "PortalStatus" AS ENUM ('NAO_CADASTRADO', 'PRE_CADASTRO', 'AGUARDANDO_APROVACAO', 'CADASTRADO', 'REJEITADO', 'VENCIDO', 'SUSPENSO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE "PortalPeriodicidade" AS ENUM ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'GRATUITO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE "DocumentoCategoria" AS ENUM ('JURIDICA', 'FISCAL_TRABALHISTA', 'QUALIFICACAO_TECNICA', 'QUALIFICACAO_ECONOMICA', 'OUTROS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE "DocumentoStatus" AS ENUM ('ATIVO', 'ARQUIVADO', 'SUBSTITUIDO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `CREATE TABLE IF NOT EXISTS "portal" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "status" "PortalStatus" NOT NULL DEFAULT 'NAO_CADASTRADO',
        "login" TEXT,
        "email" TEXT,
        "cnpj" TEXT,
        "usuario" TEXT,
        "valorAssinatura" DOUBLE PRECISION,
        "periodicidade" "PortalPeriodicidade" NOT NULL DEFAULT 'ANUAL',
        "dataVencimento" TIMESTAMP(3),
        "aceitaRobo" BOOLEAN NOT NULL DEFAULT false,
        "exigeCertificadoDigital" BOOLEAN NOT NULL DEFAULT false,
        "suporteContato" TEXT,
        "observacoes" TEXT,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "portal_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE TABLE IF NOT EXISTS "documento" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "categoria" "DocumentoCategoria" NOT NULL,
        "tipo" TEXT,
        "orgaoEmissor" TEXT,
        "semValidade" BOOLEAN NOT NULL DEFAULT false,
        "dataEmissao" TIMESTAMP(3),
        "dataVencimento" TIMESTAMP(3),
        "arquivoUrl" TEXT,
        "arquivoNome" TEXT,
        "arquivoTamanho" INTEGER,
        "mimeType" TEXT,
        "versao" INTEGER NOT NULL DEFAULT 1,
        "documentoPaiId" TEXT,
        "status" "DocumentoStatus" NOT NULL DEFAULT 'ATIVO',
        "criadoPorId" TEXT,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "documento_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "portal_status_idx" ON "portal"("status");`,
      `CREATE INDEX IF NOT EXISTS "portal_dataVencimento_idx" ON "portal"("dataVencimento");`,
      `CREATE INDEX IF NOT EXISTS "documento_categoria_status_idx" ON "documento"("categoria", "status");`,
      `CREATE INDEX IF NOT EXISTS "documento_dataVencimento_idx" ON "documento"("dataVencimento");`,
      `CREATE INDEX IF NOT EXISTS "documento_documentoPaiId_idx" ON "documento"("documentoPaiId");`,
      `DO $$ BEGIN ALTER TABLE "documento" ADD CONSTRAINT "documento_documentoPaiId_fkey" FOREIGN KEY ("documentoPaiId") REFERENCES "documento"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "documento" ADD CONSTRAINT "documento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ];

    for (const stmt of ddlSprint4) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL Sprint 4:", err.message);
      });
    }

    // Sprint 5 — Impugnações e Esclarecimentos (PRD §4.9 / Art. 164 Lei 14.133/2021)
    const ddlSprint5 = [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImpugnacaoStatus') THEN CREATE TYPE "ImpugnacaoStatus" AS ENUM ('RASCUNHO', 'PROTOCOLADA', 'ACATADA', 'INDEFERIDA'); END IF; END $$;`,
      `CREATE TABLE IF NOT EXISTS "impugnacao" (
        "id" TEXT NOT NULL,
        "licitacaoId" TEXT,
        "numeroEdital" TEXT NOT NULL,
        "orgaoNome" TEXT NOT NULL,
        "objeto" TEXT,
        "status" "ImpugnacaoStatus" NOT NULL DEFAULT 'RASCUNHO',
        "motivoLegal" TEXT NOT NULL,
        "dataAberturaSessao" TIMESTAMP(3) NOT NULL,
        "prazoFatal" TIMESTAMP(3) NOT NULL,
        "fundamentacao" TEXT NOT NULL,
        "pedidos" TEXT NOT NULL,
        "numeroProtocolo" TEXT,
        "dataProtocolo" TIMESTAMP(3),
        "dataResposta" TIMESTAMP(3),
        "decisaoJulgamento" TEXT,
        "criadoPorId" TEXT,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "impugnacao_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "impugnacao_status_idx" ON "impugnacao"("status");`,
      `CREATE INDEX IF NOT EXISTS "impugnacao_prazoFatal_idx" ON "impugnacao"("prazoFatal");`,
      `CREATE INDEX IF NOT EXISTS "impugnacao_licitacaoId_idx" ON "impugnacao"("licitacaoId");`,
      `DO $$ BEGIN ALTER TABLE "impugnacao" ADD CONSTRAINT "impugnacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN ALTER TABLE "impugnacao" ADD CONSTRAINT "impugnacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ];

    for (const stmt of ddlSprint5) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL Sprint 5:", err.message);
      });
    }

    console.log("[entrypoint] Verificando tabelas da Sprint 6 (Configurações Corporativas)...");
    const ddlSprint6 = [
      `CREATE TABLE IF NOT EXISTS "configuracao_empresa" (
        "id" TEXT NOT NULL DEFAULT 'default' PRIMARY KEY,
        "razaoSocial" TEXT NOT NULL DEFAULT 'APONTA TECNOLOGIA E SERVICOS LTDA',
        "cnpj" TEXT NOT NULL DEFAULT '12.345.678/0001-90',
        "inscricaoEstadual" TEXT,
        "cnae" TEXT,
        "endereco" TEXT NOT NULL DEFAULT 'Av. República do Líbano, 1200, Setor Oeste',
        "cidade" TEXT NOT NULL DEFAULT 'Goiânia',
        "uf" TEXT NOT NULL DEFAULT 'GO',
        "cep" TEXT NOT NULL DEFAULT '74115-030',
        "representanteNome" TEXT NOT NULL DEFAULT 'Vítor Henrique de Souza',
        "representanteCpf" TEXT NOT NULL DEFAULT '123.456.789-00',
        "representanteRg" TEXT,
        "representanteCargo" TEXT NOT NULL DEFAULT 'Sócio-Administrador',
        "bancoNome" TEXT DEFAULT 'Banco do Brasil',
        "agencia" TEXT DEFAULT '1234-5',
        "contaCorrente" TEXT DEFAULT '98765-4',
        "chavePix" TEXT DEFAULT '12.345.678/0001-90',
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `INSERT INTO "configuracao_empresa" ("id", "razaoSocial", "cnpj", "endereco", "cidade", "uf", "cep", "representanteNome", "representanteCpf", "representanteCargo", "atualizadoEm")
       VALUES ('default', 'APONTA TECNOLOGIA E SERVICOS LTDA', '12.345.678/0001-90', 'Av. República do Líbano, 1200, Setor Oeste', 'Goiânia', 'GO', '74115-030', 'Vítor Henrique de Souza', '123.456.789-00', 'Sócio-Administrador', CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING;`,
    ];

    for (const stmt of ddlSprint6) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL Sprint 6:", err.message);
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
