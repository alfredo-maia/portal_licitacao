-- Sprint 3 — Dashboard, Calendário & Notificações
-- Todas as instruções são idempotentes (espelhadas em scripts/docker-entrypoint.cjs).

-- CorrectiveAlterTable: a migration da Sprint 2 referenciou "licitacao" (minúsculo),
-- mas a tabela real é "Licitacao" (o model não possui @@map). Garante a coluna aqui.
ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;
CREATE INDEX IF NOT EXISTS "Licitacao_responsavelId_idx" ON "Licitacao"("responsavelId");

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificacaoTipo" AS ENUM ('N1_COLETA_CONCLUIDA', 'N2_LICITACAO_ATUALIZADA', 'N3_ABERTURA_AMANHA', 'N4_PRESENCIAL_PROXIMA', 'N5_PENDENTE_CRITICA', 'N6_VENCIMENTO_PORTAL', 'N7_VENCIMENTO_DOCUMENTO', 'N8_PRAZO_IMPUGNACAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificacaoSeveridade" AS ENUM ('INFO', 'ATENCAO', 'CRITICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "valorArrematado" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "Licitacao_createdAt_idx" ON "Licitacao"("createdAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "licitacao_status_historico" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "statusAnterior" "LicitacaoStatus",
    "statusNovo" "LicitacaoStatus" NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_status_historico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notificacao" (
    "id" TEXT NOT NULL,
    "tipo" "NotificacaoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "severidade" "NotificacaoSeveridade" NOT NULL DEFAULT 'INFO',
    "linkDestino" TEXT,
    "licitacaoId" TEXT,
    "chaveIdempotencia" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notificacao_destinatario" (
    "id" TEXT NOT NULL,
    "notificacaoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_destinatario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "licitacao_status_historico_licitacaoId_ocorridoEm_idx" ON "licitacao_status_historico"("licitacaoId", "ocorridoEm");
CREATE INDEX IF NOT EXISTS "licitacao_status_historico_statusNovo_ocorridoEm_idx" ON "licitacao_status_historico"("statusNovo", "ocorridoEm");
CREATE UNIQUE INDEX IF NOT EXISTS "notificacao_chaveIdempotencia_key" ON "notificacao"("chaveIdempotencia");
CREATE INDEX IF NOT EXISTS "notificacao_criadaEm_idx" ON "notificacao"("criadaEm");
CREATE INDEX IF NOT EXISTS "notificacao_tipo_idx" ON "notificacao"("tipo");
CREATE INDEX IF NOT EXISTS "notificacao_licitacaoId_idx" ON "notificacao"("licitacaoId");
CREATE INDEX IF NOT EXISTS "notificacao_destinatario_usuarioId_lidaEm_idx" ON "notificacao_destinatario"("usuarioId", "lidaEm");
CREATE INDEX IF NOT EXISTS "notificacao_destinatario_notificacaoId_idx" ON "notificacao_destinatario"("notificacaoId");
CREATE UNIQUE INDEX IF NOT EXISTS "notificacao_destinatario_notificacaoId_usuarioId_key" ON "notificacao_destinatario"("notificacaoId", "usuarioId");

-- AddForeignKey (idempotente)
DO $$ BEGIN
  ALTER TABLE "licitacao_status_historico" ADD CONSTRAINT "licitacao_status_historico_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "licitacao_status_historico" ADD CONSTRAINT "licitacao_status_historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notificacao_destinatario" ADD CONSTRAINT "notificacao_destinatario_notificacaoId_fkey" FOREIGN KEY ("notificacaoId") REFERENCES "notificacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notificacao_destinatario" ADD CONSTRAINT "notificacao_destinatario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: uma linha de partida por licitação existente (aproximação: usa "updatedAt"
-- como momento em que a licitação atingiu o status atual). Idempotente.
INSERT INTO "licitacao_status_historico" ("id", "licitacaoId", "statusAnterior", "statusNovo", "motivo", "ocorridoEm")
SELECT 'bf_' || md5(l."id"), l."id", NULL, l."status", 'Backfill Sprint 3', l."updatedAt"
FROM "Licitacao" l
WHERE NOT EXISTS (
  SELECT 1 FROM "licitacao_status_historico" h WHERE h."licitacaoId" = l."id"
);
