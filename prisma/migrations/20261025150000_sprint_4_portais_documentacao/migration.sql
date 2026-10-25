-- Sprint 4 — Portais de Licitações & Documentação de Habilitação
-- Todas as instruções são idempotentes (espelhadas em scripts/docker-entrypoint.cjs).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PortalStatus" AS ENUM ('NAO_CADASTRADO', 'PRE_CADASTRO', 'AGUARDANDO_APROVACAO', 'CADASTRADO', 'REJEITADO', 'VENCIDO', 'SUSPENSO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PortalPeriodicidade" AS ENUM ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'GRATUITO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentoCategoria" AS ENUM ('JURIDICA', 'FISCAL_TRABALHISTA', 'QUALIFICACAO_TECNICA', 'QUALIFICACAO_ECONOMICA', 'OUTROS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentoStatus" AS ENUM ('ATIVO', 'ARQUIVADO', 'SUBSTITUIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable Portal
CREATE TABLE IF NOT EXISTS "portal" (
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
);

-- CreateTable Documento
CREATE TABLE IF NOT EXISTS "documento" (
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
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "portal_status_idx" ON "portal"("status");
CREATE INDEX IF NOT EXISTS "portal_dataVencimento_idx" ON "portal"("dataVencimento");

CREATE INDEX IF NOT EXISTS "documento_categoria_status_idx" ON "documento"("categoria", "status");
CREATE INDEX IF NOT EXISTS "documento_dataVencimento_idx" ON "documento"("dataVencimento");
CREATE INDEX IF NOT EXISTS "documento_documentoPaiId_idx" ON "documento"("documentoPaiId");

-- AddForeignKey (idempotente)
DO $$ BEGIN
  ALTER TABLE "documento" ADD CONSTRAINT "documento_documentoPaiId_fkey" FOREIGN KEY ("documentoPaiId") REFERENCES "documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documento" ADD CONSTRAINT "documento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
