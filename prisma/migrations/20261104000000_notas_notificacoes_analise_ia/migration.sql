-- Issue #36 — Notas do Dossiê, novas notificações (N9–N11) e análise de participação assíncrona
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'N9_MENCAO_NOTA';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'N10_MOVIMENTACAO_LICITACAO';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'N11_RELATORIO_IA_PRONTO';

ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONCLUIDO';
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "origem" TEXT;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "parecer" TEXT;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "relatorioJson" JSONB;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "pdfBase64" TEXT;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "pdfNome" TEXT;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "erroMensagem" TEXT;
ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "concluidoEm" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "analise_status_participacao_tenantId_criadoEm_idx" ON "analise_status_participacao"("tenantId", "criadoEm");

CREATE TABLE IF NOT EXISTS "licitacao_nota" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "tenantId" TEXT,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "autorCargo" TEXT NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL,
    "mencionadosIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editada" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "licitacao_nota_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "licitacao_nota_licitacaoId_criadaEm_idx" ON "licitacao_nota"("licitacaoId", "criadaEm");
CREATE INDEX IF NOT EXISTS "licitacao_nota_tenantId_idx" ON "licitacao_nota"("tenantId");
DO $$ BEGIN ALTER TABLE "licitacao_nota" ADD CONSTRAINT "licitacao_nota_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
