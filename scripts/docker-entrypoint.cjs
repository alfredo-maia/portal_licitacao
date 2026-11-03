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

function initUploadDirectories() {
  const dirs = [
    "/data/uploads",
    "/data/uploads/editais",
    "/data/uploads/documentos",
    path.join(process.cwd(), "public", "uploads"),
    path.join(process.cwd(), "public", "uploads", "editais"),
    path.join(process.cwd(), "public", "uploads", "documentos"),
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.chmodSync(dir, 0o777);
    } catch (err) {
      // Ignora erro em ambientes sem privilégio de chmod
    }
  }
  console.log("[entrypoint] Diretórios de uploads verificados e inicializados com sucesso.");
}

async function bootstrapDatabase() {
  initUploadDirectories();

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

    // Prazos: Prazo Fatal de Envio de Proposta (Lei 14.133/2021)
    console.log("[entrypoint] Verificando colunas de Prazo Fatal de Envio de Proposta...");
    const ddlPrazos = [
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`,
      `CREATE INDEX IF NOT EXISTS "Licitacao_dataEncerramentoProposta_idx" ON "Licitacao"("dataEncerramentoProposta");`,
      `CREATE INDEX IF NOT EXISTS "licitacao_dataEncerramentoProposta_idx" ON "licitacao"("dataEncerramentoProposta");`,
      `UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`,
      `UPDATE "licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`,
    ];

    for (const stmt of ddlPrazos) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL Prazos:", err.message);
      });
    }

    // Sprint SaaS Multi-Tenant (PRD §3, §4, §6 / ADR 0007, 0010)
    console.log("[entrypoint] Verificando tabelas e enums SaaS Multi-Tenant...");
    const ddlSaaS = [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanoAssinatura') THEN CREATE TYPE "PlanoAssinatura" AS ENUM ('BASICO', 'PRO', 'ENTERPRISE'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantRole') THEN CREATE TYPE "TenantRole" AS ENUM ('TITULAR', 'MEMBRO', 'CONSULTOR'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantBillingStatus') THEN CREATE TYPE "TenantBillingStatus" AS ENUM ('TRIAL', 'ATIVO', 'GRACE_PERIOD', 'BLOQUEADO', 'CANCELADO'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsAppStatus') THEN CREATE TYPE "WhatsAppStatus" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHA', 'PAUSADO_OPT_OUT'); END IF; END $$;`,
      `CREATE TABLE IF NOT EXISTS "tenant" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "cnpj" TEXT NOT NULL UNIQUE,
        "razaoSocial" TEXT NOT NULL,
        "nomeFantasia" TEXT,
        "cnaePrincipal" TEXT,
        "endereco" TEXT,
        "cidade" TEXT,
        "uf" VARCHAR(2),
        "plano" "PlanoAssinatura" NOT NULL DEFAULT 'BASICO',
        "billingStatus" "TenantBillingStatus" NOT NULL DEFAULT 'TRIAL',
        "storageExtraQuotaMb" INTEGER NOT NULL DEFAULT 0,
        "asaasCustomerId" TEXT,
        "asaasSubscriptionId" TEXT,
        "vencimentoAssinatura" TIMESTAMP(3),
        "ultimoPagamentoEm" TIMESTAMP(3),
        "maxCnpjs" INTEGER NOT NULL DEFAULT 1,
        "maxUsers" INTEGER NOT NULL DEFAULT 1,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "telefone" TEXT,
        "segmentos" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "subsegmentos" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "ufs" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "brasilInteiro" BOOLEAN NOT NULL DEFAULT true,
        "trialFim" TIMESTAMP(3),
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS "tenant_cnpj_idx" ON "tenant"("cnpj");`,
      `CREATE INDEX IF NOT EXISTS "tenant_plano_idx" ON "tenant"("plano");`,
      `DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERADMIN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpf" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telefone" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cep" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "logradouro" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "numero" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "complemento" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bairro" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cidade" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uf" TEXT;`,
      `CREATE TABLE IF NOT EXISTS "TipoSistema" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "codigo" TEXT NOT NULL UNIQUE,
        "nome" TEXT NOT NULL,
        "ordem" INTEGER NOT NULL,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "esfera" TEXT;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "poder" TEXT;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "portalDisputa" TEXT;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "atestadosExigidos" JSONB;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "motivoRecusa" TEXT;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "esfera" TEXT;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "poder" TEXT;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "portalDisputa" TEXT;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "atestadosExigidos" JSONB;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "motivoRecusa" TEXT;`,
      `ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "inscricaoMunicipal" TEXT;`,
      `ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "numero" TEXT;`,
      `ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "complemento" TEXT;`,
      `ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "bairro" TEXT;`,
      `CREATE TABLE IF NOT EXISTS "tenant_user" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "role" "TenantRole" NOT NULL DEFAULT 'MEMBRO',
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tenant_user_tenantId_userId_key" UNIQUE ("tenantId", "userId")
      );`,
      `CREATE INDEX IF NOT EXISTS "tenant_user_userId_idx" ON "tenant_user"("userId");`,
      `CREATE INDEX IF NOT EXISTS "tenant_user_tenantId_idx" ON "tenant_user"("tenantId");`,
      `CREATE TABLE IF NOT EXISTS "tenant_licitacao" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "licitacaoId" TEXT NOT NULL,
        "statusKanban" "LicitacaoStatus" NOT NULL DEFAULT 'PENDENTE',
        "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "notas" TEXT,
        "lanceMinimo" DOUBLE PRECISION,
        "motivoRecusa" TEXT,
        "dataDecisao" TIMESTAMP(3),
        "responsavelId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tenant_licitacao_tenantId_licitacaoId_key" UNIQUE ("tenantId", "licitacaoId")
      );`,
      `CREATE TABLE IF NOT EXISTS "tenant_convite" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "email" TEXT NOT NULL,
        "role" "TenantRole" NOT NULL DEFAULT 'MEMBRO',
        "token" TEXT NOT NULL UNIQUE,
        "expiraEm" TIMESTAMP(3) NOT NULL,
        "aceitoEm" TIMESTAMP(3),
        "criadoPorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tenant_convite_tenantId_email_key" UNIQUE ("tenantId", "email")
      );`,
      `ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "tenantId" TEXT UNIQUE;`,
      `DO $$ BEGIN ALTER TABLE "configuracao_empresa" ADD CONSTRAINT "configuracao_empresa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `ALTER TABLE "documento" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`,
      `DO $$ BEGIN ALTER TABLE "documento" ADD CONSTRAINT "documento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `CREATE INDEX IF NOT EXISTS "documento_tenantId_idx" ON "documento"("tenantId");`,
      `ALTER TABLE "portal" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`,
      `CREATE INDEX IF NOT EXISTS "portal_tenantId_idx" ON "portal"("tenantId");`,
      `DO $$ BEGIN ALTER TABLE "portal" ADD CONSTRAINT "portal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "nomeFantasia" TEXT;`,
      `CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "usuarioId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
        "usuarioNome" TEXT,
        "ip" TEXT,
        "acao" TEXT NOT NULL,
        "entidadeTipo" TEXT NOT NULL,
        "entidadeId" TEXT NOT NULL,
        "antes" JSONB,
        "depois" JSONB,
        "tenantId" TEXT REFERENCES "tenant"("id") ON DELETE SET NULL
      );`,
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`,
      `CREATE INDEX IF NOT EXISTS "audit_log_entidadeTipo_entidadeId_idx" ON "audit_log"("entidadeTipo", "entidadeId");`,
      `CREATE INDEX IF NOT EXISTS "audit_log_ocorridoEm_idx" ON "audit_log"("ocorridoEm");`,
      `CREATE INDEX IF NOT EXISTS "audit_log_tenantId_idx" ON "audit_log"("tenantId");`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "modalidadeCodigo" INTEGER;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "numeroControlePNCP" TEXT;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "segmentoMacro" TEXT;`,
      `ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "subcategorias" JSONB;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "modalidadeCodigo" INTEGER;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "numeroControlePNCP" TEXT;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "segmentoMacro" TEXT;`,
      `ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "subcategorias" JSONB;`,
      `ALTER TABLE "arquivo" ADD COLUMN IF NOT EXISTS "r2Key" TEXT;`,
      `ALTER TABLE "arquivo" ADD COLUMN IF NOT EXISTS "r2Url" TEXT;`,
      `ALTER TABLE "arquivo" ADD COLUMN IF NOT EXISTS "cachedAt" TIMESTAMP(3);`,
      `ALTER TABLE "arquivo" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`,
      `CREATE INDEX IF NOT EXISTS "arquivo_tenantId_idx" ON "arquivo"("tenantId");`,
      `CREATE TABLE IF NOT EXISTS "whatsapp_mensagem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT,
        "destinatario" TEXT NOT NULL,
        "mensagem" TEXT NOT NULL,
        "tipo" TEXT NOT NULL DEFAULT 'ALERTA',
        "status" "WhatsAppStatus" NOT NULL DEFAULT 'PENDENTE',
        "tentativas" INTEGER NOT NULL DEFAULT 0,
        "erro" TEXT,
        "jitterSegundos" INTEGER NOT NULL DEFAULT 4,
        "agendadoPara" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "enviadoEm" TIMESTAMP(3),
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS "whatsapp_opt_out" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "telefone" TEXT NOT NULL UNIQUE,
        "motivo" TEXT DEFAULT 'Solicitação do usuário',
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS "asaas_webhook_event" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "evento" TEXT NOT NULL,
        "tenantId" TEXT,
        "payload" JSONB,
        "processado" BOOLEAN NOT NULL DEFAULT false,
        "processadoEm" TIMESTAMP(3),
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
    ];

    for (const stmt of ddlSaaS) {
      await prisma.$executeRawUnsafe(stmt).catch((err) => {
        console.warn("[entrypoint] Aviso DDL SaaS:", err.message);
      });
    }

    // Garante que o catálogo global de licitações permaneça com status PENDENTE padrão,
    // ficando as deliberações (ACEITA, RECUSADA, etc.) isoladas exclusivamente por tenant na tabela tenant_licitacao
    await prisma.$executeRawUnsafe(`UPDATE "Licitacao" SET "status" = 'PENDENTE' WHERE "status" != 'PENDENTE';`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`UPDATE "licitacao" SET "status" = 'PENDENTE' WHERE "status" != 'PENDENTE';`).catch(() => undefined);

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

    const defaultTenant = await prisma.tenant.upsert({
      where: { cnpj: "12.345.678/0001-90" },
      update: {},
      create: {
        id: "tenant_aponta_matriz",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "APONTA TECNOLOGIA LTDA",
        nomeFantasia: "Aponta Tecnologia",
        plano: "ENTERPRISE",
        billingStatus: "ATIVO",
        brasilInteiro: true,
      },
    });

    for (const director of DIRECTORS_SEED) {
      const u = await prisma.user.findUnique({
        where: { email: director.email },
      });
      if (u) {
        await prisma.tenantUser.upsert({
          where: {
            tenantId_userId: {
              tenantId: defaultTenant.id,
              userId: u.id,
            },
          },
          update: { role: "TITULAR", ativo: true },
          create: {
            tenantId: defaultTenant.id,
            userId: u.id,
            role: "TITULAR",
            ativo: true,
          },
        }).catch(() => undefined);
      }
    }

    // Garante que todos os clientes em Teste Grátis (TRIAL) possuam plano base PRO (até 2 CNPJs e até 2 Colaboradores)
    await prisma.$executeRawUnsafe(
      `UPDATE "tenant" SET "plano" = 'PRO', "maxCnpjs" = GREATEST("maxCnpjs", 2), "maxUsers" = GREATEST("maxUsers", 2) WHERE "billingStatus" = 'TRIAL';`,
    ).catch(() => undefined);

    // Promove a conta opaonossopanificadora@gmail.com para o plano ENTERPRISE (até 5 CNPJs e 10 Colaboradores)
    try {
      const paoNossoUser = await prisma.user.findUnique({
        where: { email: "opaonossopanificadora@gmail.com" },
        include: { tenantMemberships: true },
      });
      if (paoNossoUser && paoNossoUser.tenantMemberships.length > 0) {
        for (const membership of paoNossoUser.tenantMemberships) {
          await prisma.tenant.update({
            where: { id: membership.tenantId },
            data: {
              plano: "ENTERPRISE",
              billingStatus: "ATIVO",
              maxCnpjs: 5,
              maxUsers: 10,
            },
          }).catch(() => undefined);
        }
      }
    } catch {}

    // Sincronização automática das 17 Licitações mineradas no PNCP (Rotina Paperclip 03/11/2026)
    try {
      const licitacoesMineradas = [
    {
        "idPncp": "92773142000100-2026-29",
        "numeroControlePNCP": "92773142000100-2026-29",
        "numeroEdital": "PE 0081/2026",
        "orgaoNome": "ASSOCIACAO SULINA DE CREDITO E ASSISTENCIA RURAL",
        "orgaoCnpj": "92.773.142/0001-00",
        "uf": "RS",
        "municipio": "Porto Alegre",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Compras Eletrônicas RS / Pregão Online Banrisul (compras.rs.gov.br)",
        "miniResumo": "Plataforma SaaS de comunicação multisserviços, gestão de contatos e atendimento",
        "resumo": "Contratação de empresa especializada para o fornecimento de solução como serviço de Plataforma de Comunicação Multisserviços para gerenciamento e encaminhamento de contatos/chamadas e gestão de atendimento e relacionamento na ASCAR, mediante locação mensal, incluídos a instalação, configuração, ativação, suporte técnico, integração com outros sistemas e serviços de customização.",
        "valorEstimado": 0.0,
        "dataAbertura": "2026-11-13T09:00:00Z",
        "dataEncerramentoProposta": "2026-11-13T09:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T00:00:59Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 74/100): Demanda corporativa em modelo SaaS para plataforma de atendimento multisserviço da ASCAR em Porto Alegre/RS. Orçamento sigiloso nos termos do Art. 24 da Lei nº 14.133/2021, o que requer formulação de proposta baseada em custos analíticos de mercado de telefonia VoIP/SaaS. Disputa eletrônica na plataforma Banrisul com sessão marcada para 13/11/2026 09:00 (limite de impugnação/esclarecimento sob o Art. 164: 10/11/2026). Recomendada avaliação estratégica de margem comercial frente a custos de interconexão telecom.",
        "tipoSistemaCodigo": "INFRA_CLOUD_SUPORTE",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica (Art. 67 da Lei 14.133/2021) comprovando fornecimento continuado de solução como serviço (SaaS) de Plataforma de Comunicação Multisserviços ou Contact Center Omnichannel, incluindo telefonia IP/SIP, chat e gerenciamento de contatos com integração a banco de dados corporativo.",
            "Comprovação de infraestrutura em nuvem de alta disponibilidade (99,5%+ SLA) e capacidade técnica para atendimento a chamados de suporte N1, N2 e N3 conforme tempos de resposta estipulados no Termo de Referência."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/92773142000100/2026/29",
        "linkSistemaOrigem": "https://pregaobanrisul.com.br/editais/0081_2026/358820"
    },
    {
        "idPncp": "87530978000143-2026-443",
        "numeroControlePNCP": "87530978000143-2026-443",
        "numeroEdital": "PE 139/2026",
        "orgaoNome": "MUNICIPIO DE CACHOEIRA DO SUL",
        "orgaoCnpj": "87.530.978/0001-43",
        "uf": "RS",
        "municipio": "Cachoeira do Sul",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Portal de Compras Públicas (PCP)",
        "miniResumo": "Locação, implantação e operação de intranet corporativa e infraestrutura em fibra óptica",
        "resumo": "[Portal de Compras Públicas] - CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A LOCAÇÃO, IMPLANTAÇÃO, CONFIGURAÇÃO, OPERAÇÃO, SUPORTE TÉCNICO E MANUTENÇÃO DE SOLUÇÃO COMPLETA DE INTRANET CORPORATIVA BASEADA EM FIBRA ÓPTICA.",
        "valorEstimado": 101100.0,
        "dataAbertura": "2026-11-17T09:00:00Z",
        "dataEncerramentoProposta": "2026-11-17T09:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T08:51:12Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 68/100): Certame eletrônico com valor de R$ 101.100,00 para intranet em fibra óptica no Município de Cachoeira do Sul/RS. Embora tramitando no Portal de Compras Públicas sem exigência presencial na sessão, o objeto demanda implantação física e operação de infraestrutura óptica local no Rio Grande do Sul (~1.400 km de Goiânia/GO). Recomendável participar apenas se viabilizada subcontratação de lançamento/manutenção óptica com provedor regional local licenciado pela Anatel.",
        "tipoSistemaCodigo": "INFRA_CLOUD_SUPORTE",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de Capacidade Técnica (Art. 67 da Lei 14.133/2021) comprovando implantação, operação e manutenção de infraestrutura de intranet ou rede corporativa de comunicação de dados baseada em enlaces de fibra óptica.",
            "Licença / Outorga de Serviço de Comunicação Multimídia (SCM) expedida pela Anatel em nome da licitante ou contrato de parceria com operadora detentora de rede física de telecomunicações no Município de Cachoeira do Sul/RS."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/87530978000143/2026/443",
        "linkSistemaOrigem": "https://www.portaldecompraspublicas.com.br/processos/RS/Prefeitura-Municipal-de-Cachoeira-do-Sul-27/PE-139-2026-2026-519375"
    },
    {
        "idPncp": "13809405000117-2026-88",
        "numeroControlePNCP": "13809405000117-2026-88",
        "numeroEdital": "PE 036/2026",
        "orgaoNome": "MUNICIPIO DE RIBEIRA DO AMPARO",
        "orgaoCnpj": "13.809.405/0001-17",
        "uf": "BA",
        "municipio": "Ribeira do Amparo",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "LicitaNet",
        "miniResumo": "Serviços especializados de digitalização e Gestão Eletrônica de Documentos (GED)",
        "resumo": "[LICITANET] - REGISTRO DE PREÇOS PARA A CONTRATAÇÃO DE EMPRESA ESPECIALIZADA EM SERVIÇOS DE DIGITALIZAÇÃO E GESTÃO ELETRÔNICA DE DOCUMENTOS (GED), PARA ATENDER AS NECESSIDADES DA PREFEITURA MUNICIPAL DE RIBEIRA DO AMPARO E FUNDOS MUNICIPAIS, conforme exigências, quantidades e demais especificações constantes no edital e seus anexos.",
        "valorEstimado": 234000.0,
        "dataAbertura": "2026-11-17T10:30:00Z",
        "dataEncerramentoProposta": "2026-11-17T10:30:00Z",
        "dataPublicacaoPncp": "2026-10-30T09:46:46Z",
        "parecerIA": "GO",
        "justificativaIA": "Parecer 🟢 GO (Score 92/100): Oportunidade 100% aderente ao portfólio de software de processo eletrônico e GED da AV (`PROTOCOLO_PROCESSO_ELETRONICO`). Orçamento divulgado de R$ 234.000,00 estruturado em Lote Único na modalidade Registro de Preços (SRP). Disputa 100% eletrônica na plataforma LicitaNet com sessão marcada para 17/11/2026 10:30 (prazo de impugnação/esclarecimento sob Art. 164: 12/11/2026). Janela operacional confortável de 14 dias corridos e pleno alinhamento tecnológico.",
        "tipoSistemaCodigo": "PROTOCOLO_PROCESSO_ELETRONICO",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica (Art. 67 da Lei 14.133/2021) comprovando fornecimento de software de Gestão Eletrônica de Documentos (GED) em nuvem e prestação de serviços de digitalização, indexação e tratamento documental arquivístico.",
            "Comprovação de conformidade do software GED com as diretrizes do CONARQ (Conselho Nacional de Arquivos) e padrões de segurança de dados/LGPD."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/13809405000117/2026/88",
        "linkSistemaOrigem": "https://licitanet.com.br/sessao/205726"
    },
    {
        "idPncp": "34629547000172-2026-12",
        "numeroControlePNCP": "34629547000172-2026-12",
        "numeroEdital": "PE 008/2026",
        "orgaoNome": "CONSORCIO INTERMUNICIPAL MULTIFINALITARIO DA AMREC - CIM-AMREC",
        "orgaoCnpj": "34.629.547/0001-72",
        "uf": "SC",
        "municipio": "Forquilhinha",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "BNC (Bolsa Nacional de Compras)",
        "miniResumo": "Solução SaaS integrada para gestão de frota pública, rastreamento e manutenção",
        "resumo": "contratação compartilhada de solução tecnológica integrada de gestão de frota pública, em modelo SaaS, incluindo rastreamento veicular, abastecimento, manutenção, gestão de condutores, relatórios, suporte e equipamentos necessários.",
        "valorEstimado": 0.0,
        "dataAbertura": "2026-11-06T08:45:00Z",
        "dataEncerramentoProposta": "2026-11-06T08:45:00Z",
        "dataPublicacaoPncp": "2026-10-30T10:21:01Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 70/100): Contratação compartilhada em modelo SaaS via Consórcio Intermunicipal CIM-AMREC/SC. Orçamento sob sigilo (Art. 24). Requer atenção redobrada quanto ao cronograma de abertura muito próximo (sessão em 06/11/2026 08:45, com limite de impugnação HOJE 03/11/2026). Exige integração de hardware de telemetria veicular e rede credenciada de abastecimento/manutenção em Santa Catarina.",
        "tipoSistemaCodigo": "PATRIMONIO_ALMOXARIFADO_FROTA",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de Capacidade Técnica comprovando implantação e operação de sistema SaaS de gestão integrada de frota pública com rastreamento veicular e telemetria para quantitativo compatível de veículos.",
            "Certificado de homologação junto à Anatel dos módulos rastreadores/telemetria veicular (dispositivos AVL/GPS) ofertados na solução em comodato."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/34629547000172/2026/12",
        "linkSistemaOrigem": "https://bnccompras.com/Process/ProcessView?param1=[gkz]W65zZtesplKHu9yNcMhvTRrFapSCBbEsStlfW_9dKVptH/Q4FYwDXSLgNicHAQNvlVEi0_u30JFOtR7SJzoLDCjZQYty7qCJAVSnvY5WbNI="
    },
    {
        "idPncp": "43060078000104-2026-85",
        "numeroControlePNCP": "43060078000104-2026-85",
        "numeroEdital": "PE 80/2026",
        "orgaoNome": "CONSELHO REGIONAL DE ADMINISTRACAO DE SAO PAULO",
        "orgaoCnpj": "43.060.078/0001-04",
        "uf": "SP",
        "municipio": "São Paulo",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Compras.gov.br (ComprasNet)",
        "miniResumo": "Upgrade, adequação, licenciamento e suporte do sistema BENNER de gestão de pessoas e folha",
        "resumo": "Contratação de empresa para prestação de serviços especializados de upgrade, adequação, configuração, licenciamento, suporte e manutenção do sistema atual BENNER de gestão de pessoas, incluindo análise de utilização, revisão e otimização de processos de folha de pagamento, eSocial, benefícios, controle de cargos e salários, registro de ponto eletrônico, e medicina ocupacional para até 200 (duzentos) empregados, estagiários e conselheiros.",
        "valorEstimado": 1671823.02,
        "dataAbertura": "2026-11-19T10:00:00Z",
        "dataEncerramentoProposta": "2026-11-19T10:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T10:21:12Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 72/100): Certame de porte financeiro atrativo (R$ 1.671.823,02) no Compras.gov.br (UASG 926535 - CRA-SP). Contudo, o objeto técnico é expressamente restrito à sustentação e licenciamento da plataforma proprietária legada 'BENNER'. Sob a ótica técnica e jurídica da Lei 14.133/2021, a participação competitiva exige comprovação de domínio e parceria credenciada com a Benner Sistemas para mitigar risco de desclassificação por ausência de credenciamento oficial da fabricante.",
        "tipoSistemaCodigo": "RH_FOLHA",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica comprovando execução de serviços de sustentação, parametrização, adequação às regras do eSocial e licenciamento do sistema específico BENNER de gestão de pessoas e folha de pagamento.",
            "Declaração ou certificado de parceria técnica credenciada / canal autorizado junto à fabricante BENNER Sistemas S.A. para comercialização de licenças e suporte de 3º nível."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/43060078000104/2026/85",
        "linkSistemaOrigem": "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=92653505000802026"
    },
    {
        "idPncp": "04262432000121-2026-169",
        "numeroControlePNCP": "04262432000121-2026-169",
        "numeroEdital": "PE 085/2026",
        "orgaoNome": "MUNICIPIO DE COARI",
        "orgaoCnpj": "04.262.432/0001-21",
        "uf": "AM",
        "municipio": "Coari",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "BR Conectado (licitacoari.com.br)",
        "miniResumo": "Serviços continuados de TIC para conectividade, internet fibra óptica e solução satelital",
        "resumo": "Registros de preços para eventual contratação de serviços continuado de Tecnologia da Informação e Comunicação – TIC, na comunicação de dados, para fornecimento de acesso à internet por fibra óptica e solução satelital, incluindo equipamentos em cessão de uso, instalação, suporte, manutenção, monitoramento e redundância, visando atender as demandas de conectividade da Secretaria Municipal de Saúde.",
        "valorEstimado": 0.0,
        "dataAbertura": "2026-11-13T09:00:00Z",
        "dataEncerramentoProposta": "2026-11-13T09:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T11:00:43Z",
        "parecerIA": "NO_GO",
        "justificativaIA": "Parecer 🔴 NO_GO (Score 25/100): Inviabilidade operacional e logística extrema. Objeto puramente focado em obras de cabeamento óptico e instalação de antenas satelitais em comunidades remotas da Secretaria de Saúde de Coari/AM (interior do Amazonas, acessível apenas por via fluvial/aérea). Orçamento sob sigilo e escopo fora do core de software da AV, acarretando custos logísticos desproporcionais e alto risco de inadimplemento contratual.",
        "tipoSistemaCodigo": "INFRA_CLOUD_SUPORTE",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de capacidade técnica em telecomunicações para fornecimento de links satelitais em banda Ku/Ka e enlaces de fibra óptica no interior da Amazônia Legal.",
            "Outorga SCM da Anatel e frota/embarcações para atendimento emergencial de manutenção na calha do Rio Solimões."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/04262432000121/2026/169",
        "linkSistemaOrigem": "http://www.licitacoari.com.br"
    },
    {
        "idPncp": "21072657000134-2026-24",
        "numeroControlePNCP": "21072657000134-2026-24",
        "numeroEdital": "PE 017/2026",
        "orgaoNome": "SERVICO AUTONOMO DE AGUA E ESGOTO",
        "orgaoCnpj": "21.072.657/0001-34",
        "uf": "MG",
        "municipio": "Sabinópolis",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Licitar Digital",
        "miniResumo": "Fornecimento de software de registro de ponto eletrônico aderente à Portaria 671 MTE",
        "resumo": "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA O FORNECIMENTO DE SOFTWARE DE REGISTRO DO PONTO ELETRÔNICO, DESENVOLVIDO PARA ATENDER ÀS NORMAS DA PORTARIA N° 671 DO MINISTÉRIO DO TRABALHO E EMPREGO (MTE), PARA ATENDIMENTO AO SAAE DE SABINÓPOLIS/MG",
        "valorEstimado": 4594.8,
        "dataAbertura": "2026-11-17T09:00:00Z",
        "dataEncerramentoProposta": "2026-11-17T09:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T11:08:54Z",
        "parecerIA": "GO",
        "justificativaIA": "Parecer 🟢 GO (Score 88/100): Oportunidade 100% SaaS no segmento de RH/Folha para o SAAE de Sabinópolis/MG. Valor estimado baixo (R$ 4.594,80), porém com esforço marginal praticamente nulo de implantação e entrega 100% eletrônica em nuvem. Disputa eletrônica no portal Licitar Digital em 17/11/2026 09:00 (limite Art. 164: 12/11/2026). Excelente para agregação de atestado de capacitação técnica em compliance com a Portaria 671/MTE.",
        "tipoSistemaCodigo": "RH_FOLHA",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de Capacidade Técnica comprovando fornecimento de software de controle e registro de ponto eletrônico corporativo em nuvem (REP-P).",
            "Comprovação de conformidade do software ofertado com os requisitos técnicos da Portaria nº 671/2021 do Ministério do Trabalho e Emprego (MTE) e emissão de comprovante digital de registro de ponto assinado."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/21072657000134/2026/24",
        "linkSistemaOrigem": "https://app2.licitardigital.com.br/pesquisa/117844"
    },
    {
        "idPncp": "95587648000112-2026-91",
        "numeroControlePNCP": "95587648000112-2026-91",
        "numeroEdital": "PE 48/2026",
        "orgaoNome": "MUNICIPIO DE NOVA LARANJEIRAS",
        "orgaoCnpj": "95.587.648/0001-12",
        "uf": "PR",
        "municipio": "Nova Laranjeiras",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "BLL Compras",
        "miniResumo": "Prestação de serviços de conectividade, link de internet e transporte de dados",
        "resumo": "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A PRESTAÇÃO CONTÍNUA DE SERVIÇOS DE LINK DE INTERNET (FIBRA ÓPTICA E RÁDIO) E REDE DE TRANSPORTE DE DADOS, PARA ATENDER ÀS NECESSIDADES DAS SECRETARIAS E DEPARTAMENTOS DA ADMINISTRAÇÃO MUNICIPAL.",
        "valorEstimado": 125895.36,
        "dataAbertura": "2026-11-18T09:00:00Z",
        "dataEncerramentoProposta": "2026-11-18T09:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T11:20:14Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 65/100): Certame no Município de Nova Laranjeiras/PR com valor de R$ 125.895,36 na plataforma BLL Compras. Trata-se de serviço de ISP / provedor de infraestrutura telecom local (enlaces de rádio e fibra física). Requer avaliação com provedores parceiros do Paraná para verificar se há viabilidade de consórcio ou subcontratação da ponta física local.",
        "tipoSistemaCodigo": "INFRA_CLOUD_SUPORTE",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de Capacidade Técnica comprovando fornecimento de link dedicado de internet e interligação de rede de dados via fibra óptica e radiofrequência licenciada.",
            "Comprovação de Outorga de SCM expedida pela Anatel e registro no CREA da pessoa jurídica e do responsável técnico habilitado."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/95587648000112/2026/91",
        "linkSistemaOrigem": "https://bllcompras.com/Process/ProcessView?param1=[gkz]y3Mha__yI85MT7a3J0Nt8MwslYTLneeYlu3kQsY/jgO68w3Z2NPEl3_H0XTAqqRoDC/YHVZqbbWLZ5YeWT8azP2ZpRTgITaetZyuHojhi/w="
    },
    {
        "idPncp": "76206465000165-2026-174",
        "numeroControlePNCP": "76206465000165-2026-174",
        "numeroEdital": "PE 67/2026",
        "orgaoNome": "MUNICIPIO DE MATELANDIA",
        "orgaoCnpj": "76.206.465/0001-65",
        "uf": "PR",
        "municipio": "Matelândia",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Portal de Compras Elotech / Prefeitura de Matelândia",
        "miniResumo": "Solução pedagógica integrada com plataforma digital de apoio e capacitação docente [MISTO]",
        "resumo": "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A EXECUÇÃO DE AÇÕES PEDAGÓGICAS PRÁTICAS E INTERDISCIPLINARES, COM INTEGRAÇÃO DE GASTRONOMIA E TECNOLOGIA, DESTINADAS A APROXIMADAMENTE 200 (DUZENTOS) ESTUDANTES DA EDUCAÇÃO EM TEMPO INTEGRAL – ETI DA REDE MUNICIPAL DE ENSINO DE MATELÂNDIA/PR, INCLUINDO O FORNECIMENTO DE MATERIAL DIDÁTICO, EQUIPAMENTOS E ACESSÓRIOS, PLATAFORMA DIGITAL DE APOIO PEDAGÓGICO, ASSESSORIA PEDAGÓGICA E FORMAÇÃO INICIAL E CONTINUADA DOS PROFISSIONAIS ENVOLVIDOS EM ATENDIMENTO A SECRETARIA MUNICIPAL DE EDUCAÇÃO E CULTURA.",
        "valorEstimado": 125472.48,
        "dataAbertura": "2026-11-17T08:00:00Z",
        "dataEncerramentoProposta": "2026-11-17T08:00:00Z",
        "dataPublicacaoPncp": "2026-10-30T11:41:17Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 60/100): Objeto híbrido no Município de Matelândia/PR (R$ 125.472,48) que agrega plataforma digital de apoio pedagógico a fornecimento físico de material didático, insumos culinários/gastronômicos e consultoria pedagógica presencial continuada. Desvio significativo da atividade-fim de desenvolvimento de software puro, demandando parceria com editora pedagógica ou assessoria educacional especializada.",
        "tipoSistemaCodigo": "EDUCACAO_PORTAL",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de Capacidade Técnica comprovando execução de projetos pedagógicos de educação tecnológica/interdisciplinar com fornecimento de plataforma digital educacional e materiais paradidáticos.",
            "Comprovação de equipe multidisciplinar com pedagogos e profissionais habilitados para condução de formação continuada presencial de professores."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/76206465000165/2026/174",
        "linkSistemaOrigem": null
    },
    {
        "idPncp": "94704061000183-2026-302",
        "numeroControlePNCP": "94704061000183-2026-302",
        "numeroEdital": "PE Pregão Lei 14.133 Eletronico 49/2026",
        "orgaoNome": "MUNICIPIO DE NOVA BOA VISTA",
        "orgaoCnpj": "94.704.061/0001-83",
        "uf": "RS",
        "municipio": "Nova Boa Vista",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Portal Tchê Informática Ltda (Registro Espelho ERP)",
        "miniResumo": "Implantação e operação de SIGWEB em nuvem integrado ao Cadastro Imobiliário Municipal",
        "resumo": "Constitui objeto da presente licitação a contratação de empresa especializada para a prestação de serviços técnicos de engenharia, geoprocessamento, georreferenciamento e consultoria técnica, compreendendo, de forma integrada, a implantação, disponibilização, operação, manutenção, atualização e suporte técnico de Sistema de Informação Geográfica operante em ambiente web (SIGWEB), integrado ao Cadastro Imobiliário Municipal e aos sistemas de gestão utilizados pela Administração Pública Municipal, incluindo a execução de serviços de cadastramento e recadastramento imobiliário, levantamento, revisão e atualização da base cartográfica municipal, aerolevantamento, imageamento terrestre e aéreo em 360º, bem como o desenvolvimento, implantação, configuração e integração de módulos complementares destinados à gestão do Plano Diretor Municipal e do cadastro habitacional, contemplando funcionalidades de consulta, gerenciamento, edição cartográfica, análise geoespacial, controle de acesso por níveis de permissão, compatibilidade com os principais navegadores web e recursos de importação e exportação de dados em múltiplos formatos, incluindo todos os serviços, recursos tecnológicos, equipamentos, ferramentas, licenças, integrações, treinamentos e demais atividades necessárias à plena operacionalização da solução, visando atender às necessidades da Secretaria Municipal de Finanças de Nova Boa Vista/RS, conforme condições, especificações técnicas, quantitativos e demais exigências estabelecidas no Termo de Referência, no Edital e em seus anexos.",
        "valorEstimado": 0.0,
        "dataAbertura": "2026-11-23T12:59:00Z",
        "dataEncerramentoProposta": "2026-11-23T12:59:00Z",
        "dataPublicacaoPncp": "2026-10-30T14:15:33Z",
        "parecerIA": "NO_GO",
        "justificativaIA": "Parecer 🔴 NO_GO (Score 18/100): Duplicidade secundária de publicação no PNCP: registro gerado pela exportação de dados do sistema ERP interno municipal (Tchê Informática Ltda) para o PE 49/2026 da Prefeitura de Nova Boa Vista/RS sem link de disputa ativo. A sessão pública eletrônica oficial corre no Portal de Compras Públicas sob o controle PNCP 94704061000183-2026-305 (devidamente analisado e qualificado). Descarte técnico para saneamento do funil.",
        "tipoSistemaCodigo": "IMOBILIARIO",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "N/A - Registro espelho do sistema de gestão municipal sem canal oficial de disputa habilitado."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/94704061000183/2026/302",
        "linkSistemaOrigem": ""
    },
    {
        "idPncp": "94704061000183-2026-305",
        "numeroControlePNCP": "94704061000183-2026-305",
        "numeroEdital": "PE 49/2026",
        "orgaoNome": "MUNICIPIO DE NOVA BOA VISTA",
        "orgaoCnpj": "94.704.061/0001-83",
        "uf": "RS",
        "municipio": "Nova Boa Vista",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Portal de Compras Públicas (PCP)",
        "miniResumo": "Implantação e operação de SIGWEB em nuvem integrado ao Cadastro Imobiliário Municipal",
        "resumo": "[Portal de Compras Públicas] - Constitui objeto da presente licitação a contratação de empresa especializada para a prestação de serviços técnicos de engenharia, geoprocessamento, georreferenciamento e consultoria técnica, compreendendo, de forma integrada, a implantação, disponibilização, operação, manutenção, atualização e suporte técnico de Sistema de Informação Geográfica operante em ambiente web (SIGWEB), integrado ao Cadastro Imobiliário Municipal e aos sistemas de gestão utilizados pela Administração Pública Municipal, incluindo a execução de serviços de cadastramento e recadastramento imobiliário, levantamento, revisão e atualização da base cartográfica municipal, aerolevantamento, imageamento terrestre e aéreo em 360º, bem como o desenvolvimento, implantação, configuração e integração de módulos complementares destinados à gestão do Plano Diretor Municipal e do cadastro habitacional, contemplando funcionalidades de consulta, gerenciamento, edição cartográfica, análise geoespacial, controle de acesso por níveis de permissão, compatibilidade com os principais navegadores web e recursos de importação e exportação de dados em múltiplos formatos, incluindo todos os serviços, recursos tecnológicos, equipamentos, ferramentas, licenças, integrações, treinamentos e demais atividades necessárias à plena operacionalização da solução, visando atender às necessidades da Secretaria Municipal de Finanças de Nova Boa Vista/RS, conforme condições, especificações técnicas, quantitativos e demais exigências estabelecidas no Termo de Referência, no Edital e em seus anexos.",
        "valorEstimado": 0.0,
        "dataAbertura": "2026-11-23T12:59:00Z",
        "dataEncerramentoProposta": "2026-11-23T12:59:00Z",
        "dataPublicacaoPncp": "2026-10-30T14:26:08Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 75/100): Publicação oficial ativa do PE 49/2026 no Portal de Compras Públicas (PCP). O software de gestão SIGWEB em ambiente web é plenamente compatível com o domínio imobiliário/tributário da AV. Contudo, o certame exige execução integrada de aerolevantamento, imageamento terrestre/aéreo 360º e ART de engenharia cartográfica. Orçamento sigiloso sob Art. 24. Sessão pública em 23/11/2026 12:59 (prazo limite de impugnação sob Art. 164: 18/11/2026), oferecendo 20 dias corridos para articulação de parceria/consórcio com empresa de geomensura.",
        "tipoSistemaCodigo": "IMOBILIARIO",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica devidamente registrado(s) no CREA, comprovando a execução de serviços técnicos de aerolevantamento fotogramétrico, georreferenciamento urbano e implantação de Sistema de Informação Geográfica (SIGWEB) para gestão cadastral imobiliária municipal.",
            "Comprovação de inscrição da empresa e indicação de responsável técnico engenheiro cartógrafo/agrimensor com Certidão de Registro e Quitação junto ao CREA competente."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/94704061000183/2026/305",
        "linkSistemaOrigem": "https://www.portaldecompraspublicas.com.br/processos/RS/Prefeitura-Municipal-de-Nova-Boa-Vista-2614/PE-49-2026-2026-522342"
    },
    {
        "idPncp": "83009878000115-2026-81",
        "numeroControlePNCP": "83009878000115-2026-81",
        "numeroEdital": "PE PE 22/2026",
        "orgaoNome": "MUNICIPIO DE XAVANTINA",
        "orgaoCnpj": "83.009.878/0001-15",
        "uf": "SC",
        "municipio": "Xavantina",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Portal de Compras Betha Sistemas",
        "miniResumo": "Locação de equipamentos, softwares e serviços integrados de videomonitoramento urbano",
        "resumo": "Contratação de empresa especializada na locação de equipamentos, softwares e serviços destinados ao sistema de videomonitoramento do Município, para utilização em conjunto com as forças de segurança pública.",
        "valorEstimado": 1080000.0,
        "dataAbertura": "2026-10-08T08:15:00Z",
        "dataEncerramentoProposta": "2026-10-08T08:15:00Z",
        "dataPublicacaoPncp": "2026-10-30T14:48:47Z",
        "parecerIA": "NO_GO",
        "justificativaIA": "Parecer 🔴 NO_GO (Score 10/100): Inviabilidade jurídica temporal insanável por preclusão fática: os dados oficiais cadastrados no PNCP indicam que o início de propostas ocorreu em 24/09/2026 e o encerramento da disputa em 08/10/2026 às 08:15. A publicação no PNCP ocorreu de forma intempestiva e extemporânea em 30/10/2026 (22 dias após a sessão de disputa). Certame já concluído/adjudicado na origem, impossibilitando submissão de proposta.",
        "tipoSistemaCodigo": "OUTROS",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "N/A - Licitação preclusa temporalmente na origem."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/83009878000115/2026/81",
        "linkSistemaOrigem": ""
    },
    {
        "idPncp": "02319394000170-2026-87",
        "numeroControlePNCP": "02319394000170-2026-87",
        "numeroEdital": "PE 021/2026",
        "orgaoNome": "CISALP-CONSORCIO PUBLICO INTERMUNICIPAL DE SAUDE A MICRO-REGIAO DO ALTO PARANAIBA",
        "orgaoCnpj": "02.319.394/0001-70",
        "uf": "MG",
        "municipio": "Lagoa Formosa",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "LicitaNet",
        "miniResumo": "Plataforma web em nuvem para gestão de saúde e educação especial com IA e prontuário [MISTO]",
        "resumo": "[LICITANET] - Registro de Preços para futura e eventual contratação de empresa especializada para implantação de Espaço Pedagógico Sensorial (EPS) – Sala Multissensorial, incluindo projeto, fornecimento de equipamentos, mobiliários, materiais, instalação, treinamento e entrega em pleno funcionamento, bem como disponibilização de plataforma web em nuvem para gestão da educação especial, gestão de equipes multiprofissionais para neurodivergentes e teleatendimento, contemplando prontuário eletrônico, gestão de atendimentos, PEI, PTS, teleatendimento, relatórios, dashboards e recursos de inteligência artificial com processamento seguro de dados, destinada à estruturação, ampliação e fortalecimento dos serviços especializados ofertados pelos entes consorciados ao CISALP e pelas unidades geridas pelo consórcio.",
        "valorEstimado": 18540004.65,
        "dataAbertura": "2026-11-16T08:30:00Z",
        "dataEncerramentoProposta": "2026-11-16T08:30:00Z",
        "dataPublicacaoPncp": "2026-10-30T15:52:19Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 78/100): Oportunidade de altíssimo valor financeiro (R$ 18.540.004,65 em Registro de Preços pelo Consórcio Intermunicipal CISALP/MG) via LicitaNet. A solução de software em nuvem (prontuário para neurodivergentes, teleatendimento, PEI, dashboards e IA) possui margem e sinergia técnica excepcionais. No entanto, o termo de referência inclui a implantação física e mobiliário sensorial. Recomendada avaliação urgente da composição dos itens do edital para verificar se há adjudicação por item/lote separado ou formação de consórcio empresarial com fabricante de mobiliário adaptado. Sessão em 16/11/2026 08:30 (impugnação até 11/11/2026).",
        "tipoSistemaCodigo": "SAUDE_ATENCAO_BASICA",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado de Capacidade Técnica comprovando fornecimento/disponibilização de software web em nuvem para gestão de saúde/educação especial, prontuário eletrônico multidisciplinar, teleatendimento e relatórios gerenciais estruturados.",
            "Comprovação de capacidade técnica ou consórcio (Art. 15 da Lei 14.133/2021) para fornecimento de equipamentos físicos, mobiliário sensorial adaptado e instalação de Sala Multissensorial (EPS)."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/02319394000170/2026/87",
        "linkSistemaOrigem": "https://licitanet.com.br/sessao/206644"
    },
    {
        "idPncp": "44544898000134-2026-4",
        "numeroControlePNCP": "44544898000134-2026-4",
        "numeroEdital": "PE 007/2026",
        "orgaoNome": "MUNICIPIO DE OSCAR BRESSANE",
        "orgaoCnpj": "44.544.898/0001-34",
        "uf": "SP",
        "municipio": "Oscar Bressane",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "BLL Compras",
        "miniResumo": "Serviços de telecomunicações, link de internet dedicado e conectividade VLAN para CFTV",
        "resumo": "Contratação de empresa especializada em prestação de serviços de telecomunicações através de fornecimento de link de internet banda larga com fibra óptica, e serviços de conectividade de dados em rede privada virtual (VLAN) destinada à interligação das câmeras de videomonitoramento já existentes da CONTRATANTE, incluindo fornecimento de enlaces, configuração, gerenciamento, monitoramento e suporte técnico.",
        "valorEstimado": 115194.0,
        "dataAbertura": "2026-04-29T08:29:00Z",
        "dataEncerramentoProposta": "2026-04-29T08:29:00Z",
        "dataPublicacaoPncp": "2026-10-31T10:03:03Z",
        "parecerIA": "NO_GO",
        "justificativaIA": "Parecer 🔴 NO_GO (Score 10/100): Inviabilidade jurídica temporal insanável por preclusão fática: os registros oficiais no PNCP atestam que a sessão pública de abertura das propostas ocorreu em 29/04/2026 às 08:29, tendo sido inserido tardiamente no PNCP em 31/10/2026 (mais de 6 meses após a disputa). Certame precluso e encerrado há meses no Município de Oscar Bressane/SP, restando nula qualquer possibilidade de participação comercial.",
        "tipoSistemaCodigo": "INFRA_CLOUD_SUPORTE",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "N/A - Licitação preclusa temporalmente na origem."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/44544898000134/2026/4",
        "linkSistemaOrigem": "https://bllcompras.com/Process/ProcessView?param1=[gkz]vgoPda8QFUenKvNAEkVbWwcGEzBIhRxqEhfREvjNQmLlfxKrH3MfHBGV6UM9zHHv3XUDcRRtJPftvZ3CgAqcvihEbOaXok4d0bVcZYa/4XM="
    },
    {
        "idPncp": "37318510000111-2026-50",
        "numeroControlePNCP": "37318510000111-2026-50",
        "numeroEdital": "PE 35/2026",
        "orgaoNome": "ADAPS",
        "orgaoCnpj": "37.318.510/0001-11",
        "uf": "DF",
        "municipio": "Brasília",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Compras.gov.br (ComprasNet)",
        "miniResumo": "Assinatura anual de licenças do software Autodesk AEC Collection com suporte técnico",
        "resumo": "Registro de preços para futura e eventual contratação de licenças de software, na modalidade de assinatura anual, da solução Autodesk Architecture, Engineering & Construction Collection (AEC Collection), incluindo suporte técnico e atualizações, para atendimento das necessidades institucionais do Programa Especial de Saúde do Rio Doce (PES Rio Doce) e da Unidade de Infraestrutura (UINFRA)",
        "valorEstimado": 699183.5,
        "dataAbertura": "2026-11-17T10:00:00Z",
        "dataEncerramentoProposta": "2026-11-17T10:00:00Z",
        "dataPublicacaoPncp": "2026-11-02T14:19:20Z",
        "parecerIA": "GO",
        "justificativaIA": "Parecer 🟢 GO (Score 94/100): Oportunidade excelente no portal Compras.gov.br (UASG 932133 - ADAPS / Brasília-DF). Orçamento divulgado de R$ 699.183,50 em Registro de Preços para fornecimento de licenças de assinatura anual Autodesk AEC Collection. Objeto padronizado de licenciamento, entrega 100% eletrônica, sem necessidade de alocação presencial ou mão de obra residente. Sessão pública marcada para 17/11/2026 10:00 (limite Art. 164: 12/11/2026). Corredor Brasília/Goiânia altamente estratégico para a AV.",
        "tipoSistemaCodigo": "LICENCA_SOFTWARE",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica (Art. 67 da Lei 14.133/2021) comprovando o fornecimento corporativo de subscrições de licenças de software comercial/técnico ou soluções de engenharia/arquitetura.",
            "Declaração ou credenciamento de revenda autorizada (Partner / Reseller) do fabricante oficial (Autodesk) para ativação direta no tenant da ADAPS."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/37318510000111/2026/50",
        "linkSistemaOrigem": "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=93213305000352026"
    },
    {
        "idPncp": "01067891000166-2026-14",
        "numeroControlePNCP": "01067891000166-2026-14",
        "numeroEdital": "PE 16/2026",
        "orgaoNome": "MUNICIPIO DE MONTE DO CARMO",
        "orgaoCnpj": "01.067.891/0001-66",
        "uf": "TO",
        "municipio": "Monte do Carmo",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "BNC (Bolsa Nacional de Compras)",
        "miniResumo": "Plataforma integrada de gestão pública municipal em nuvem (ERP Municipal)",
        "resumo": "Contratação de empresa especializada para disponibilização de plataforma integrada de gestão pública municipal em ambiente web, mediante licenciamento temporário do direito de uso, pelo período inicial de 12 meses, incluindo implantação, parametrização, migração ou conversão de dados, treinamento dos usuários, hospedagem, manutenção preventiva, corretiva e evolutiva, suporte técnico, atualizações legais e tecnológicas, cópias de segurança, recuperação de dados e demais serviços necessários ao fu",
        "valorEstimado": 113253.24,
        "dataAbertura": "2026-11-16T07:30:00Z",
        "dataEncerramentoProposta": "2026-11-16T07:30:00Z",
        "dataPublicacaoPncp": "2026-11-02T19:44:49Z",
        "parecerIA": "GO",
        "justificativaIA": "Parecer 🟢 GO (Score 95/100): Core absoluto da especialidade da AV (`GESTAO_PUBLICA_ERP`). Licenciamento temporário de ERP web para o Município de Monte do Carmo/TO, contemplando implantação, parametrização, migração de dados e suporte por 12 meses, com valor estimado de R$ 113.253,24. Disputa eletrônica na plataforma BNC com abertura em 16/11/2026 07:30 (limite Art. 164: 11/11/2026). Prazo adequado de 13 dias corridos, escopo técnico perfeitamente dominado e risco de execução mínimo.",
        "tipoSistemaCodigo": "GESTAO_PUBLICA_ERP",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica (Art. 67 da Lei 14.133/2021) comprovando disponibilização, implantação, migração de dados e suporte continuado de sistema integrado de gestão pública municipal (ERP em nuvem) operante 100% em ambiente web.",
            "Comprovação de conformidade do ERP com as exigências dos Tribunais de Contas e leiautes do Sistema Integrado de Informações Fiscais (SICONFI/STN)."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/01067891000166/2026/14",
        "linkSistemaOrigem": "https://bnccompras.com/Process/ProcessView?param1=[gkz]yMu3EpfMmKl5NeklP2RgZxHS4UtNLPmbJ5e9VA8Bz9q6M80nTyqeeX0xU3R8Rgm30VhKl9GTLFWvR6llH4v7ppcGZrln2F0usaQaswU07Pk="
    },
    {
        "idPncp": "30051023000196-2026-229",
        "numeroControlePNCP": "30051023000196-2026-229",
        "numeroEdital": "PE 484/2026",
        "orgaoNome": "TRIBUNAL DE CONTAS DO ESTADO DO RIO DE JANEIRO",
        "orgaoCnpj": "30.051.023/0001-96",
        "uf": "RJ",
        "municipio": "Rio de Janeiro",
        "modalidade": "Pregão Eletrônico",
        "portalDisputa": "Compras.gov.br (ComprasNet)",
        "miniResumo": "Solução de segurança eletrônica integrada, videomonitoramento CFTV, hardware e software",
        "resumo": "Prestação de serviços destinados à implantação de solução de segurança eletrônica, na qual devem ser integrados os sistemas de videomonitoramento (CFTV), controle de acesso e os sistemas de alarmes de incêndios com fornecimento de todos os equipamentos, materiais, hardwares, softwares e as respectivas licenças necessárias a instalação, montagem, manutenção e suporte técnico abrangentes ao treinamento e a operação, pelo prazo de 60 (sessenta) meses.",
        "valorEstimado": 0.0,
        "dataAbertura": "2026-11-17T11:00:00Z",
        "dataEncerramentoProposta": "2026-11-17T11:00:00Z",
        "dataPublicacaoPncp": "2026-11-02T23:25:01Z",
        "parecerIA": "AVALIAR",
        "justificativaIA": "Parecer 🟡 AVALIAR (Score 68/100): Demanda corporativa de longo prazo (60 meses) para o Tribunal de Contas do Estado do Rio de Janeiro (TCE-RJ) no portal Compras.gov.br (UASG 925464). Orçamento sigiloso sob o Art. 24 da Lei 14.133/2021. Embora envolva softwares de supervisão e licenças, o objeto é eminentemente físico/predial, com obras de montagem, cabeamento, portas e alarmes de incêndio na sede do Tribunal no Rio de Janeiro/RJ. Recomendável avaliar somente se houver viabilidade de consórcio ou subcontratação com integrador de segurança física predial credenciado no RJ.",
        "tipoSistemaCodigo": "OUTROS",
        "segmentoMacro": "TECNOLOGIA_TELECOM",
        "subcategorias": [
            "SOFTWARE_SAAS",
            "SISTEMAS_CLOUD"
        ],
        "atestadosExigidos": [
            "Atestado(s) de Capacidade Técnica com registro no CREA comprovando a implantação, instalação e integração de solução predial de segurança eletrônica abrangendo CFTV IP, controle de acesso e detecção de alarmes de incêndio.",
            "Indicação de Responsável Técnico Engenheiro Eletricista / Eletrônico devidamente registrado no CREA com ART de acervo técnico compatível."
        ],
        "quantidadeLotes": 1,
        "loteUnico": true,
        "precoPorLote": true,
        "isPresencial": false,
        "linkPncp": "https://pncp.gov.br/app/editais/30051023000196/2026/229",
        "linkSistemaOrigem": "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=92546405004842026"
    }
];
      console.log('[entrypoint] Verificando e provisionando ' + licitacoesMineradas.length + ' licitações mineradas no PNCP...');
      for (const lic of licitacoesMineradas) {
        await prisma.licitacao.upsert({
          where: { idPncp: lic.idPncp },
          update: {
            numeroControlePNCP: lic.numeroControlePNCP || lic.idPncp,
            numeroEdital: lic.numeroEdital,
            orgaoNome: lic.orgaoNome,
            orgaoCnpj: lic.orgaoCnpj,
            uf: lic.uf,
            municipio: lic.municipio,
            modalidade: lic.modalidade,
            portalDisputa: lic.portalDisputa,
            miniResumo: lic.miniResumo,
            resumo: lic.resumo,
            valorEstimado: lic.valorEstimado,
            dataAbertura: new Date(lic.dataAbertura),
            dataEncerramentoProposta: new Date(lic.dataEncerramentoProposta || lic.dataAbertura),
            dataPublicacaoPncp: new Date(lic.dataPublicacaoPncp || lic.dataAbertura),
            dataUltimaAtualizacao: new Date(lic.dataPublicacaoPncp || lic.dataAbertura),
            parecerIA: lic.parecerIA,
            justificativaIA: lic.justificativaIA,
            tipoSistemaCodigo: lic.tipoSistemaCodigo,
            segmentoMacro: lic.segmentoMacro || 'TECNOLOGIA_TELECOM',
            subcategorias: lic.subcategorias || ['SOFTWARE_SAAS'],
            atestadosExigidos: lic.atestadosExigidos || [],
            quantidadeLotes: lic.quantidadeLotes || 1,
            loteUnico: lic.loteUnico !== false,
            precoPorLote: lic.precoPorLote === true,
            isPresencial: lic.isPresencial === true,
            linkPncp: lic.linkPncp,
            linkSistemaOrigem: lic.linkSistemaOrigem,
          },
          create: {
            idPncp: lic.idPncp,
            numeroControlePNCP: lic.numeroControlePNCP || lic.idPncp,
            numeroEdital: lic.numeroEdital,
            orgaoNome: lic.orgaoNome,
            orgaoCnpj: lic.orgaoCnpj,
            uf: lic.uf,
            municipio: lic.municipio,
            modalidade: lic.modalidade,
            portalDisputa: lic.portalDisputa,
            miniResumo: lic.miniResumo,
            resumo: lic.resumo,
            valorEstimado: lic.valorEstimado,
            dataAbertura: new Date(lic.dataAbertura),
            dataEncerramentoProposta: new Date(lic.dataEncerramentoProposta || lic.dataAbertura),
            dataPublicacaoPncp: new Date(lic.dataPublicacaoPncp || lic.dataAbertura),
            dataUltimaAtualizacao: new Date(lic.dataPublicacaoPncp || lic.dataAbertura),
            status: 'PENDENTE',
            parecerIA: lic.parecerIA,
            justificativaIA: lic.justificativaIA,
            tipoSistemaCodigo: lic.tipoSistemaCodigo,
            segmentoMacro: lic.segmentoMacro || 'TECNOLOGIA_TELECOM',
            subcategorias: lic.subcategorias || ['SOFTWARE_SAAS'],
            atestadosExigidos: lic.atestadosExigidos || [],
            quantidadeLotes: lic.quantidadeLotes || 1,
            loteUnico: lic.loteUnico !== false,
            precoPorLote: lic.precoPorLote === true,
            isPresencial: lic.isPresencial === true,
            linkPncp: lic.linkPncp,
            linkSistemaOrigem: lic.linkSistemaOrigem,
          },
        }).catch((err) => {
          console.warn('[entrypoint] Aviso ao fazer upsert na licitação ' + lic.idPncp + ':', err.message);
        });
      }
      console.log('[entrypoint] Licitações do PNCP sincronizadas com sucesso.');
    } catch (err) {
      console.warn('[entrypoint] Erro ao sincronizar licitações do PNCP:', err.message);
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
