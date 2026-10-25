# Especificação Técnica Operacional — Sprint 2 (Detalhes do Certame, Análise IA & Minhas Licitações Kanban)

> **Épico no Paperclip:** `AV-44`  
> **Documento Mestre:** `docs/PRD.md` (§4.3, §4.4.1, §7, §9, §10 e §12)  
> **Workspace VPS:** `/home/hermes/apps/portal_licitacao`  
> **Repositório:** `alfredo-maia/portal_licitacao`

---

## 1. Visão Geral da Sprint 2

A Sprint 2 consolida a gestão operacional completa das oportunidades aceitas no Portal PNCP:
1. **Minhas Licitações / Kanban (`/minhas-licitacoes`):**
   - Quadro interativo baseado em `@dnd-kit` com drag-and-drop nativo entre colunas.
   - 9 colunas ativas do funil: `Aceita (GO)`, `Análise Técnica`, `Análise Financeira`, `Revisão da Proposta`, `Enviada`, `Em Disputa / Lances`, `Aguardando Resultado`, `Contemplada 🏆` e `Impugnada ⚖️`.
   - Cards com Órgão, UF, mini-resumo, valor estimado (R$ em `IBM Plex Mono`), contagem regressiva para abertura (< 72h em vermelho), tag do tipo de sistema e avatares do Responsável e Atribuídos.
   - Modal obrigatório de justificativa de perdas/desistências ao mover para `NAO_CONTEMPLADA_*`.
   - Alternador no topo para exibir/ocultar certames arquivados/perdidos.
   - Persistência instantânea no PostgreSQL e gravação no `audit_log`.

2. **Dossiê Completo da Licitação (`/oportunidades/[id]`):**
   - Cabeçalho fixo com tags de parecer IA, status atual, tipo de sistema, botões rápidos [Aceitar (GO)] / [Recusar (No-GO)] e link oficial externo *"Abrir Edital Oficial no PNCP ↗"*.
   - **Gestão de Equipe:** Atribuição de 1 Responsável coordenador e múltiplos membros Atribuídos com salvamento no banco.
   - **Aba 1 (Visão Geral & Dados Técnicos):** Resumo encorpado, estrutura de lotes (preço por lote vs proposta global), logística com cálculo de distância rodoviária em KM a partir de Goiânia/GO (se presencial), datas oficiais e Tipo de Sistema 100% editável com os 22 tipos padronizados.
   - **Aba 2 (Arquivos do Edital):** Upload drag-and-drop manual e gerenciamento dos anexos oficiais (TR, Minutas, Planilhas) com tamanho, data e download/exclusão individual.
   - **Aba 3 (Repositórios Similares):** Cadastro de até no máximo 5 links de repositórios (GitHub/GitLab) para benchmarking de código da solução com validação e bloqueio no 5º link.

3. **🤖 Ferramenta IA: "Verificar Status de Participação" (Deep Dive):**
   - Modal de IA profunda acionado pelo botão em destaque `[ 🤖 Verificar Status de Participação ]` no dossiê.
   - Seleção de arquivos de contexto anexados (com opção de desmarcar arquivos pesados/dispensáveis).
   - Exibição de contexto dos documentos cadastrados da empresa (Balanço, Certidões, Atestados).
   - Perguntas de ausências e campos de refinamento (sistema base próprio, repositório de referência, notas estratégicas).
   - Exibição do prompt estruturado com botão **`[ 📋 Copiar Script ]`** para rodar em LLM externa (ChatGPT/Claude).
   - Geração de parecer analítico estruturado: impedimentos documentais, viabilidade de prazos, estimativa de custos e sugestão de preço de lance.
   - Botão **`[ 💾 Salvar Relatório na Licitação ]`** que grava a análise no banco vinculada ao certame (`AnaliseStatusParticipacao`).

4. **Paginação na Central de Oportunidades (`/oportunidades`):**
   - Inclusão do componente Carbon `Pagination` com opções de 10, 25, 50 itens por página integrado a parâmetros `page` e `pageSize` no endpoint `/api/oportunidades`.

---

## 2. Contratos Técnicos e Modelagem de Dados

### 2.1. Modelos no Prisma Schema (`prisma/schema.prisma`)

```prisma
model LicitacaoAtribuido {
  id          String    @id @default(cuid())
  licitacaoId String
  usuarioId   String
  criadoEm    DateTime  @default(now())

  licitacao   Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  usuario     User      @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@unique([licitacaoId, usuarioId])
  @@index([licitacaoId])
  @@index([usuarioId])
  @@map("licitacao_atribuido")
}

model Arquivo {
  id          String     @id @default(cuid())
  licitacaoId String?
  nome        String
  tamanho     Int
  mimeType    String
  caminho     String
  criadoEm    DateTime   @default(now())

  licitacao   Licitacao? @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)

  @@index([licitacaoId])
  @@map("arquivo")
}

model RepositorioSimilar {
  id          String    @id @default(cuid())
  licitacaoId String
  nome        String
  url         String
  criadoEm    DateTime  @default(now())

  licitacao   Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)

  @@index([licitacaoId])
  @@map("repositorio_similar")
}

model AnaliseStatusParticipacao {
  id             String    @id @default(cuid())
  licitacaoId    String
  scriptPrompt   String    @db.Text
  relatorioTexto String    @db.Text
  impedimentos   Json?
  viabilidade    Json?
  custos         Json?
  precoSugerido  Json?
  executadoPorId String?
  criadoEm       DateTime  @default(now())

  licitacao      Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)

  @@index([licitacaoId])
  @@map("analise_status_participacao")
}
```

E vincular em `Licitacao`:
```prisma
atribuidos           LicitacaoAtribuido[]
arquivos             Arquivo[]
repositoriosSimilares RepositorioSimilar[]
analisesIA           AnaliseStatusParticipacao[]
```

---

### 2.2. Endpoints e Contratos de API

1. **`PATCH /api/oportunidades/[id]/status`**:
   - Atualiza o status do Kanban (`LicitacaoStatus`).
   - Se o status for de perda (`NAO_CONTEMPLADA_*`), exige `motivoPerda: string`.
   - Grava evento em `audit_log` (`acao: "LICITACAO_STATUS_UPDATE"`).

2. **`PATCH /api/oportunidades/[id]/equipe`**:
   - Atualiza `responsavelId: string | null` e `atribuidoIds: string[]`.
   - Grava evento em `audit_log`.

3. **`POST /api/oportunidades/[id]/arquivos` & `DELETE /api/oportunidades/[id]/arquivos/[arquivoId]`**:
   - Upload de arquivos anexos com validação de tipo e persistência em diretório de storage (`/public/uploads/editais/[id]/` ou serviço de armazenamento).
   - Metadados gravados na tabela `Arquivo`.

4. **`POST /api/oportunidades/[id]/repositorios` & `DELETE /api/oportunidades/[id]/repositorios/[repId]`**:
   - CRUD de repositórios de benchmarking.
   - Valida limite estrito de no máximo 5 links por certame (`count <= 5`).

5. **`POST /api/oportunidades/[id]/analise-ia`**:
   - Salva o relatório e metadados de análise gerados pela ferramenta IA na tabela `AnaliseStatusParticipacao`.

6. **`GET /api/oportunidades` (com Paginação)**:
   - Suporte a `page=1&pageSize=10` retornando `{ ok: true, total: number, page: number, pageSize: number, totalPages: number, oportunidades: [...] }`.

---

## 3. Critérios de Aceite por Etapa (DoR / DoD)

### Etapa 1 — Arquitetura (`Arquiteto de Software_ag`):
- [ ] Modelos Prisma adicionados e migration executada.
- [ ] Schemas Zod criados em `src/server/schemas/` para:
  - Mudança de status do Kanban e motivo de perda.
  - Atribuição de equipe (responsável e múltiplos atribuídos).
  - Repositórios similares (URL válida e limite de 5).
  - Relatório da ferramenta IA.
- [ ] Pacotes `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` adicionados ao `package.json`.

### Etapa 2 — TDD RED (`QA_ag`):
- [ ] Testes unitários para regras de Kanban (transições de status permitidas, motivo obrigatório para perdas).
- [ ] Testes unitários para limite de 5 repositórios similares.
- [ ] Testes unitários para paginação em `GET /api/oportunidades`.
- [ ] Teste E2E Playwright para renderização do Kanban e carregamento do Dossiê com 4 abas.

### Etapa 3A — Backend GREEN (`Desenvolvedor Backend_ag`):
- [ ] Implementação de todos os endpoints e Server Actions com validação Zod e `audit_log`.
- [ ] Todos os testes unitários passando (GREEN).

### Etapa 3B — Frontend GREEN (`Desenvolvedor Frontend_ag`):
- [ ] Implementação do quadro Kanban interativo (`/minhas-licitacoes`) com `@dnd-kit`.
- [ ] Implementação do dossiê com 4 abas completas (`/oportunidades/[id]`).
- [ ] Implementação do modal "Verificar Status de Participação" com botão Copiar Script e Salvar Relatório.
- [ ] Implementação do Carbon `Pagination` na tela `/oportunidades`.

### Etapa 4 — Code Review (`Arquiteto de Software_ag`):
- [ ] Validação arquitetural rigorosa dos contratos, ausência de hardcodes de marca e conformidade com IBM Carbon.

### Etapa 5 — QA Validation (`QA_ag`):
- [ ] 100% da suíte de testes Vitest e Playwright verde.
- [ ] Zero erros de linter e TypeScript (`npm run lint`).

### Etapa 6 — DevOps Deploy (`DevOps_ag`):
- [ ] Migrations aplicadas no banco PostgreSQL na VPS.
- [ ] Build de produção sem warnings.
- [ ] Preview atualizado e validado na VPS.
