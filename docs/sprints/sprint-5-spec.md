# Especificação da Sprint 5: Os 8 Modelos de Declaração (Anexo 5) & Impugnações

> **Épico no Paperclip:** `AV-70`  
> **Status:** Em Execução (TDD Estrito)  
> **Responsáveis:** Squad de Engenharia  
> **Referências:** PRD §4.7, §4.9, Anexo 5, ADR 0005 e Lei nº 14.133/2021.

---

## 1. Escopo Funcional & Critérios de Aceite

### 1.1. Gerador das 8 Declarações Oficiais (`/declaracoes`)
- **Modelos Suportados:**
  1. `CARTA_CREDENCIAMENTO` (Carta de Credenciamento de Representante Legal / Procurador).
  2. `ELABORACAO_INDEPENDENTE` (Declaração de Elaboração Independente de Proposta — Art. 9º, III da Lei 14.133).
  3. `INEXISTENCIA_FATOS_IMPEDITIVOS` (Declaração de Inexistência de Fatos Impeditivos).
  4. `NAO_TRABALHO_FORCADO` (Declaração de Não Trabalho Forçado ou Degradante).
  5. `RENUNCIA_VISTORIA` (Declaração de Renúncia de Vistoria Presencial com Conhecimento Pleno).
  6. `HABILITACAO_PLENA` (Declaração de Atendimento aos Requisitos Editalícios de Habilitação).
  7. `ME_EPP` (Declaração de Enquadramento como Microempresa ou EPP — LC 123/2006).
  8. `NAO_EMPREGA_MENOR` (Declaração de Não Trabalho de Menores — Art. 7º, XXXIII da CF/88).
- **Split-Screen:** Formulário à esquerda com auto-preenchimento ao vincular certame ativo; Folha A4 à direita com renderização em tempo real.
- **Exportação e Impressão:** Botão de impressão com folha A4 formatada, cabeçalho e campo de assinatura.

### 1.2. Gestão de Impugnações e Esclarecimentos (`/impugnacoes`)
- **Entidade `Impugnacao`:** Vinculada opcionalmente a uma licitação do pipeline.
- **Status do Funil:** `RASCUNHO`, `PROTOCOLADA`, `ACATADA`, `INDEFERIDA`.
- **Cálculo Legal de Prazo Fatal (Art. 164 Lei 14.133):**
  - O prazo fatal expira **3 dias úteis antes da abertura da sessão**.
  - Dias úteis desconsideram sábados e domingos.
  - Alerta visual no card/tabela destacando tempo restante e risco de preclusão.
- **Minuta Jurídica:** Gerador de minuta estruturada contendo Qualificação, Síntese do Edital, Irregularidade Apontada (com fundamentação legal e súmulas do TCU) e Pedidos formais.

---

## 2. Contratos de Dados & Schemas Zod

### 2.1. Declarações
- `declaracaoTipoSchema`: enum dos 8 tipos.
- `declaracaoParametrosSchema`:
  - `tipo`: DeclaracaoTipo
  - `licitacaoId`: string opcional
  - `orgaoNome`: string
  - `numeroEdital`: string
  - `objeto`: string
  - `empresaRazaoSocial`: string
  - `empresaCnpj`: string
  - `empresaEndereco`: string
  - `declaranteNome`: string
  - `declaranteCpf`: string
  - `declaranteCargo`: string
  - `cidadeData`: string (ex.: "Goiânia - GO, 25 de outubro de 2026")

### 2.2. Impugnações
- `impugnacaoStatusSchema`: `RASCUNHO`, `PROTOCOLADA`, `ACATADA`, `INDEFERIDA`.
- `impugnacaoCriarInputSchema`:
  - `licitacaoId`: string opcional
  - `numeroEdital`: string min 1
  - `orgaoNome`: string min 2
  - `objeto`: string opcional
  - `motivoLegal`: string min 3
  - `dataAberturaSessao`: Date
  - `fundamentacao`: string min 10
  - `pedidos`: string min 5
  - `numeroProtocolo`: string opcional
- `impugnacaoAtualizarInputSchema`: partial com atualização de status, dataProtocolo, dataResposta e decisaoJulgamento.

---

## 3. Estratégia de Migração de Banco de Dados

1. Adicionar enum `ImpugnacaoStatus` no Prisma.
2. Adicionar model `Impugnacao` no `prisma/schema.prisma`.
3. Criar migration SQL idempotente `prisma/migrations/20261025170000_sprint_5_declaracoes_impugnacoes/migration.sql`.
4. Incluir `ddlSprint5` no `scripts/docker-entrypoint.cjs` para execução segura na VPS.
