-- AlterTable
ALTER TABLE "Licitacao" ADD COLUMN     "atestadosExigidos" JSONB,
ADD COLUMN     "esfera" TEXT,
ADD COLUMN     "motivoRecusa" TEXT,
ADD COLUMN     "poder" TEXT,
ADD COLUMN     "portalDisputa" TEXT;

-- CreateTable
CREATE TABLE "TipoSistema" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoSistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoSistema_codigo_key" ON "TipoSistema"("codigo");

-- CreateIndex
CREATE INDEX "TipoSistema_ordem_idx" ON "TipoSistema"("ordem");

-- CreateIndex
CREATE INDEX "TipoSistema_ativo_idx" ON "TipoSistema"("ativo");

-- CreateIndex
CREATE INDEX "Licitacao_tipoSistemaCodigo_idx" ON "Licitacao"("tipoSistemaCodigo");
