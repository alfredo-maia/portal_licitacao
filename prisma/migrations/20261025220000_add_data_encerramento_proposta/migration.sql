-- AlterTable
ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);

-- Inicializa dataEncerramentoProposta com dataAbertura para registros legados que ainda não possuem dataEncerramentoProposta
UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;
