-- CreateTable
CREATE TABLE IF NOT EXISTS "configuracao_empresa" (
    "id" TEXT NOT NULL DEFAULT 'default',
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
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracao_empresa_pkey" PRIMARY KEY ("id")
);

-- Inserir registro padrao caso ainda nao exista
INSERT INTO "configuracao_empresa" ("id", "razaoSocial", "cnpj", "endereco", "cidade", "uf", "cep", "representanteNome", "representanteCpf", "representanteCargo", "atualizadoEm")
VALUES ('default', 'APONTA TECNOLOGIA E SERVICOS LTDA', '12.345.678/0001-90', 'Av. República do Líbano, 1200, Setor Oeste', 'Goiânia', 'GO', '74115-030', 'Vítor Henrique de Souza', '123.456.789-00', 'Sócio-Administrador', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
