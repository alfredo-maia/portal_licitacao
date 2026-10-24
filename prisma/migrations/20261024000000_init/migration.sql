-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DIRETORIA', 'ANALISTA_COMERCIAL', 'OPERADOR');

-- CreateEnum
CREATE TYPE "LicitacaoStatus" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'ANALISE_TECNICA', 'ANALISE_FINANCEIRA', 'REVISAO_PROPOSTA', 'ENVIADA', 'EM_DISPUTA', 'AGUARDANDO_RESULTADO', 'CONTEMPLADA', 'IMPUGNADA', 'NAO_CONTEMPLADA_PRECO', 'NAO_CONTEMPLADA_DOCUMENTACAO', 'NAO_CONTEMPLADA_DESISTENCIA', 'REVOGADA_ANULADA');

-- CreateEnum
CREATE TYPE "ParecerIA" AS ENUM ('GO', 'AVALIAR', 'NO_GO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Licitacao" (
    "id" TEXT NOT NULL,
    "idPncp" TEXT NOT NULL,
    "numeroEdital" TEXT NOT NULL,
    "orgaoNome" TEXT NOT NULL,
    "orgaoCnpj" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "municipio" TEXT,
    "modalidade" TEXT NOT NULL,
    "miniResumo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "valorEstimado" DOUBLE PRECISION NOT NULL,
    "dataAbertura" TIMESTAMP(3) NOT NULL,
    "dataPublicacaoPncp" TIMESTAMP(3),
    "dataUltimaAtualizacao" TIMESTAMP(3),
    "status" "LicitacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "parecerIA" "ParecerIA" NOT NULL DEFAULT 'AVALIAR',
    "justificativaIA" TEXT,
    "tipoSistemaCodigo" TEXT,
    "quantidadeLotes" INTEGER NOT NULL DEFAULT 1,
    "loteUnico" BOOLEAN NOT NULL DEFAULT true,
    "precoPorLote" BOOLEAN NOT NULL DEFAULT false,
    "isPresencial" BOOLEAN NOT NULL DEFAULT false,
    "distanciaGoianiaKm" INTEGER,
    "linkPncp" TEXT,
    "linkSistemaOrigem" TEXT,
    "hashCritico" TEXT,
    "responsavelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Licitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "ip" TEXT,
    "acao" TEXT NOT NULL,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Licitacao_idPncp_key" ON "Licitacao"("idPncp");

-- CreateIndex
CREATE INDEX "Licitacao_dataAbertura_idx" ON "Licitacao"("dataAbertura");

-- CreateIndex
CREATE INDEX "Licitacao_status_idx" ON "Licitacao"("status");

-- CreateIndex
CREATE INDEX "Licitacao_idPncp_idx" ON "Licitacao"("idPncp");

-- CreateIndex
CREATE INDEX "audit_log_entidadeTipo_entidadeId_idx" ON "audit_log"("entidadeTipo", "entidadeId");

-- CreateIndex
CREATE INDEX "audit_log_ocorridoEm_idx" ON "audit_log"("ocorridoEm");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Licitacao" ADD CONSTRAINT "Licitacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
