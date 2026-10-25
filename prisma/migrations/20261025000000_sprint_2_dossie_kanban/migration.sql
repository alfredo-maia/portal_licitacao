-- AlterTable Licitacao
ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;
CREATE INDEX IF NOT EXISTS "licitacao_responsavelId_idx" ON "licitacao"("responsavelId");

-- CreateTable LicitacaoAtribuido
CREATE TABLE IF NOT EXISTS "licitacao_atribuido" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_atribuido_pkey" PRIMARY KEY ("id")
);

-- CreateTable Arquivo
CREATE TABLE IF NOT EXISTS "arquivo" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT,
    "nome" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable RepositorioSimilar
CREATE TABLE IF NOT EXISTS "repositorio_similar" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repositorio_similar_pkey" PRIMARY KEY ("id")
);

-- CreateTable AnaliseStatusParticipacao
CREATE TABLE IF NOT EXISTS "analise_status_participacao" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "scriptPrompt" TEXT NOT NULL,
    "relatorioTexto" TEXT NOT NULL,
    "impedimentos" JSONB,
    "viabilidade" JSONB,
    "custos" JSONB,
    "precoSugerido" JSONB,
    "executadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analise_status_participacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_atribuido_licitacaoId_usuarioId_key" ON "licitacao_atribuido"("licitacaoId", "usuarioId");
CREATE INDEX IF NOT EXISTS "licitacao_atribuido_licitacaoId_idx" ON "licitacao_atribuido"("licitacaoId");
CREATE INDEX IF NOT EXISTS "licitacao_atribuido_usuarioId_idx" ON "licitacao_atribuido"("usuarioId");

CREATE INDEX IF NOT EXISTS "arquivo_licitacaoId_idx" ON "arquivo"("licitacaoId");
CREATE INDEX IF NOT EXISTS "repositorio_similar_licitacaoId_idx" ON "repositorio_similar"("licitacaoId");
CREATE INDEX IF NOT EXISTS "analise_status_participacao_licitacaoId_idx" ON "analise_status_participacao"("licitacaoId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'licitacao_responsavelId_fkey'
    ) THEN
        ALTER TABLE "licitacao" ADD CONSTRAINT "licitacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'licitacao_atribuido_licitacaoId_fkey'
    ) THEN
        ALTER TABLE "licitacao_atribuido" ADD CONSTRAINT "licitacao_atribuido_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'licitacao_atribuido_usuarioId_fkey'
    ) THEN
        ALTER TABLE "licitacao_atribuido" ADD CONSTRAINT "licitacao_atribuido_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'arquivo_licitacaoId_fkey'
    ) THEN
        ALTER TABLE "arquivo" ADD CONSTRAINT "arquivo_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'repositorio_similar_licitacaoId_fkey'
    ) THEN
        ALTER TABLE "repositorio_similar" ADD CONSTRAINT "repositorio_similar_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'analise_status_participacao_licitacaoId_fkey'
    ) THEN
        ALTER TABLE "analise_status_participacao" ADD CONSTRAINT "analise_status_participacao_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
