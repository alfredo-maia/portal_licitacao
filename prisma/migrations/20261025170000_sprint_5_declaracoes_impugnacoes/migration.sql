-- Migration: Sprint 5 — Impugnações e Esclarecimentos (Lei 14.133/2021)
-- Criação de enum ImpugnacaoStatus e tabela impugnacao

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImpugnacaoStatus') THEN
    CREATE TYPE "ImpugnacaoStatus" AS ENUM ('RASCUNHO', 'PROTOCOLADA', 'ACATADA', 'INDEFERIDA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "impugnacao" (
  "id" TEXT NOT NULL PRIMARY KEY,
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

  CONSTRAINT "impugnacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "Licitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "impugnacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "impugnacao_status_idx" ON "impugnacao"("status");
CREATE INDEX IF NOT EXISTS "impugnacao_prazoFatal_idx" ON "impugnacao"("prazoFatal");
CREATE INDEX IF NOT EXISTS "impugnacao_licitacaoId_idx" ON "impugnacao"("licitacaoId");
