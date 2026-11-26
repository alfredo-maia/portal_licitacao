# Módulo Histórico de Licitações, Vigência Estrita, Paginação/Ordenação SQL & Carga 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar **Oportunidades Ativas & Dashboard** (estritamente vigentes e filtradas por Segmentos, Subsegmentos e UFs do tenant) de um novo módulo livre **Histórico de Licitações** (`/historico-licitacoes`, entre *Minhas Licitações* e *Calendário*, incluindo `OUTROS`, abrindo vazio até o clique em *Buscar*), migrando paginação/ordenação para **100% SQL no PostgreSQL** (`[10, 25, 50, 100]`), adicionando detecção de reaberturas (`RECUSADA` → `PENDENTE` + badge em `/oportunidades/[id]`) e viabilizando a carga histórica de `01/01/2026` a `25/11/2026`.

**Architecture:** As consultas paginadas de `/oportunidades` e `/historico-licitacoes` passam a executar `count` + `findMany({ where, orderBy, skip, take })` diretamente no PostgreSQL apoiadas por índices B-Tree compostos e GIN (`pg_trgm` + JSONB), com fallback em memória apenas quando o Postgres está indisponível em testes offline. O Dashboard migra para agregações SQL usando `COALESCE(dataPublicacaoPncp, createdAt)` para o volume mensal e vigência ativa para o backlog `PENDENTE`, preservando qualquer licitação deliberada em `tenant_licitacao`. O coletor diário incorpora `/contratacoes/proposta` (sem IA) para capturar prorrogações de prazo e reativar itens `RECUSADA` via tag `"REABERTA_POS_RECUSA"` em `TenantLicitacao.tags`.

**Tech Stack:** TypeScript, Next.js 15 App Router, Prisma ORM, PostgreSQL 16 (`pg_trgm` + GIN JSONB), Zod, IBM Carbon Design System (`@carbon/react`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-historico-licitacoes-e-otimizacao-consultas-design.md` (Issue `#59`)

## Global Constraints
- `CATALOGO_MACRO_SEGMENTOS` e `MacroSegmentoEnum` mantêm exatamente 40 macro-categorias e 188 subatividades comerciais selecionáveis no cadastro/configurações.
- Zero download automático de PDFs/editais na carga histórica — permanece 100% sob demanda via Cloudflare R2 na aba *Arquivos do Edital*.
- Busca textual (`busca`) exige mínimo de 3 caracteres quando informada; janela de datas no Histórico exige máximo de 30 dias corridos.
- `pageSize` aceita `[10, 25, 50, 100]` (máx. `100`) e ordenação (`sortBy`/`sortDir`) é sempre global no banco, nunca parcial na página atual.
- Licitações já em participação no Kanban (`TenantLicitacao.statusKanban` ≠ `PENDENTE` e ≠ `RECUSADA`) jamais são marcadas como `RECUSADA` ao vencer.
- Todas as telas usam exclusivamente componentes IBM Carbon e tokens semânticos (`var(--cds-*)`), com zero `any` nos novos contratos.

## Review Focus
1. **Trava de 3 caracteres na busca:** `busca = "da"` (2 letras) deve falhar com `400 VALIDATION_ERROR` em `/api/oportunidades` e `/api/historico-licitacoes`; `busca = ""` ou omitida deve ser aceita normalmente (pinned em Task 1 e Task 4).
2. **Janela de 30 dias + `Em Aberto` no Histórico:** `dataInicio`/`dataFim` com 31 dias deve retornar `400 VALIDATION_ERROR`, 30 dias exatos deve passar; ao trocar `Situação` para `ABERTAS` na UI, a janela padrão desloca para `[hoje, hoje + 30d]` sem disparar query automática (pinned em Task 1 e Task 6).
3. **Resgate de `OUTROS`/fora-de-UF no Kanban & proteção pós-vencimento:** Edital `OUTROS` ou de outra UF aceito pelo cliente no Kanban continua aparecendo em `Minhas Licitações` e contabilizado em `emPrecificacao`/`volumeEmDisputa`/`contempladas` no Dashboard mesmo após a data encerrar (pinned em Task 3).
4. **Ciclo completo de reabertura pós-recusa:** Edital marcado como `RECUSADA` pelo tenant cuja `dataEncerramentoProposta` é prorrogada para data futura volta automaticamente para `PENDENTE` com `"REABERTA_POS_RECUSA"` em `TenantLicitacao.tags`, exibe badge em `/oportunidades/[id]` e remove a tag quando o cliente delibera novamente (pinned em Task 5 e Task 6).
5. **Ordenação global real:** Em uma coleção de 15 registros com `pageSize = 10`, ordenar por `valorEstimado` DESC traz o 1º maior valor global na página 1 (e não apenas ordena os 10 primeiros itens da ordenação padrão) (pinned em Task 2 e Task 4).

---

### Task 1: Índices PostgreSQL & Contratos Zod Compartilhados

**Files:**
- Modify: `prisma/schema.prisma` (índices em `model Licitacao`)
- Modify: `scripts/docker-entrypoint.cjs` (extensão `pg_trgm`, índices GIN e backfill `dataEncerramentoProposta`)
- Modify: `src/server/schemas/oportunidades.schema.ts`
- Modify: `src/server/schemas/dashboard.schema.ts`
- Modify: `src/server/schemas/ingestao.schema.ts`
- Create: `src/server/schemas/historico-licitacoes.schema.ts`
- Test: `tests/unit/historico-contratos-issue-59.test.ts`

**Interfaces:**
- Produces:
  - `oportunidadesSortBySchema = z.enum(["dataLimite", "orgaoNome", "miniResumo", "valorEstimado"])` e `sortDirSchema = z.enum(["asc", "desc"])` em `src/server/schemas/oportunidades.schema.ts`
  - `oportunidadesFilterSchema` estendido com `ufsTenantAtivo?: string[]`, `sortBy?: OportunidadesSortBy`, `sortDir?: SortDir`, `busca` com mínimo de 3 chars quando não vazia
  - `dashboardQuerySchema` estendido com `subsegmentosTenantAtivo?: string[]`, `ufsTenantAtivo?: string[]`
  - `historicoLicitacoesQuerySchema` em `src/server/schemas/historico-licitacoes.schema.ts` (`dataInicio`, `dataFim` com validação `<= 30 dias`, `situacaoPrazo: "TODAS" | "ENCERRADAS" | "ABERTAS"`, `segmento?: string` aceitando `"OUTROS"`, `subsegmento?: string`, `uf?: string`, `faixaValor`, `busca` mín. 3 chars, `sortBy`, `sortDir`, `page`, `pageSize` ∈ `10|25|50|100`)
  - `ingestaoPayloadV2Schema` estendido com `silenciarNotificacoes?: boolean`
  - `REABERTA_POS_RECUSA_TAG = "REABERTA_POS_RECUSA"` exportado em `src/server/schemas/oportunidades.schema.ts`

- [ ] **Step 1: Escrever teste RED em `tests/unit/historico-contratos-issue-59.test.ts`**
  Testar: (a) `historicoLicitacoesQuerySchema` aceita janela de 30 dias e `segmento: "OUTROS"`, rejeita 31 dias e `busca: "da"`; (b) `oportunidadesFilterSchema` aceita `sortBy`, `sortDir`, `ufsTenantAtivo`, `pageSize: 25 | 100` e rejeita `busca: "ab"`; (c) `dashboardQuerySchema` aceita `subsegmentosTenantAtivo` e `ufsTenantAtivo`; (d) `ingestaoPayloadV2Schema` aceita `silenciarNotificacoes: true`.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
  Run: `npx vitest run tests/unit/historico-contratos-issue-59.test.ts`
  Expected: FAIL (módulo `historico-licitacoes.schema` inexistente e campos novos ausentes).
- [ ] **Step 3: Implementar os contratos Zod e adicionar os índices em `prisma/schema.prisma` e `scripts/docker-entrypoint.cjs`**
  Adicionar `@@index([dataEncerramentoProposta])`, `@@index([segmentoMacro, uf, dataEncerramentoProposta])`, `@@index([valorEstimado])`, `@@index([orgaoNome])` no `model Licitacao`, mais `CREATE EXTENSION IF NOT EXISTS pg_trgm;` e índices GIN (`resumo`, `miniResumo`, `orgaoNome`, `subcategorias`) + `UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;` em `scripts/docker-entrypoint.cjs`.
- [ ] **Step 4: Rodar Vitest + `npx prisma validate` e confirmar aprovação (GREEN)**
  Run: `npx vitest run tests/unit/historico-contratos-issue-59.test.ts && npx prisma validate`
  Expected: PASS e schema Prisma válido.
- [ ] **Step 5: Commit**
  `git commit -m "feat(schemas): contratos zod do historico, ordenacao sql e indices postgres (issue #59)"`

---

### Task 2: Oportunidades Estritamente Vigentes, UFs Automáticas e Paginação/Ordenação 100% SQL

**Files:**
- Modify: `src/server/services/oportunidades.service.ts`
- Modify: `src/app/api/oportunidades/route.ts`
- Test: `tests/unit/oportunidades-vigencia-ordenacao-issue-59.test.ts`

**Interfaces:**
- Consumes: `oportunidadesFilterSchema`, `OportunidadesSortBy`, `SortDir`, `REABERTA_POS_RECUSA_TAG` (Task 1)
- Produces:
  - `buildSegmentosSubsegmentosPrismaWhere(segmentos, subsegmentos): Prisma.LicitacaoWhereInput` (helper reutilizável para SQL exato de macro + subcategorias JSONB)
  - `buildOrderBySql(sortBy, sortDir): Prisma.LicitacaoOrderByWithRelationInput[]`
  - `listOportunidadesPaginadas(rawFilters, tenantId)` usando `prisma.licitacao.count` + `findMany({ skip, take, orderBy })` no PostgreSQL (e fallback equivalente em memória)
  - `deliberarOportunidade(...)` limpando `"REABERTA_POS_RECUSA"` de `TenantLicitacao.tags` ao deliberar

- [ ] **Step 1: Escrever testes RED em `tests/unit/oportunidades-vigencia-ordenacao-issue-59.test.ts`**
  Testar: (a) licitação `PENDENTE` com `dataEncerramentoProposta` no passado NÃO aparece em `listOportunidadesPaginadas`, enquanto licitação `PENDENTE` futura aparece; (b) `ufsTenantAtivo: ["GO"]` bloqueia editais de `"SP"` quando `uf` não é passado; (c) certame já em `ACEITA` no Kanban continua retornado em `status: "MINHAS"` mesmo após o prazo vencer; (d) 15 registros paginados em `pageSize: 10` com `sortBy: "valorEstimado", sortDir: "desc"` retornam o maior valor global na página 1 (e `sortDir: "asc"` retorna o menor valor global na página 1); (e) `sortBy: "dataLimite"` ordena cronologicamente por timestamp real, não string `"DD/MM/YYYY"`.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
  Run: `npx vitest run tests/unit/oportunidades-vigencia-ordenacao-issue-59.test.ts`
  Expected: FAIL (vencidas retornadas e `sortBy` ignorado).
- [ ] **Step 3: Implementar SQL real (`count` + `findMany` paginado/ordenado), filtro de vigência em `PENDENTE` e repasse automático de `ufsTenantAtivo` em `/api/oportunidades/route.ts`**
  Remover `tenantCriadoEm - 30d` para itens `PENDENTE`, substituir por `COALESCE(dataEncerramentoProposta, dataAbertura) >= NOW()`, repassar `cfg.ufs` quando `!cfg.brasilInteiro` em `GET /api/oportunidades/route.ts` e limpar `REABERTA_POS_RECUSA` em `deliberarOportunidade`.
- [ ] **Step 4: Rodar Vitest (novo + regressão de oportunidades/taxonomia)**
  Run: `npx vitest run tests/unit/oportunidades-vigencia-ordenacao-issue-59.test.ts tests/unit/taxonomia-conlicitacao-40x188.test.ts tests/unit/motor-classificacao-v3-issue-57.test.ts`
  Expected: PASS em todos.
- [ ] **Step 5: Commit**
  `git commit -m "feat(oportunidades): vigencia estrita, filtro automatico de uf e paginacao/ordenacao sql (issue #59)"`

---

### Task 3: Dashboard Agregado em SQL — Volume Mensal por `dataPublicacaoPncp`, Backlog Vigente e Resgatados no Kanban

**Files:**
- Modify: `src/server/services/dashboard.service.ts`
- Modify: `src/app/api/dashboard/route.ts`
- Test: `tests/unit/dashboard-vigencia-sql-issue-59.test.ts`

**Interfaces:**
- Consumes: `dashboardQuerySchema` (Task 1), `buildSegmentosSubsegmentosPrismaWhere` (Task 2)
- Produces: `getDashboardData(rawQuery)` retornando `DashboardResponse` com:
  - `cards.recebidas.total`: volume total de editais do perfil do tenant (segmentos + subsegmentos + UFs) com `COALESCE(dataPublicacaoPncp, createdAt)` dentro do mês selecionado (mesmo que alguns já tenham encerrado)
  - `cards.aguardandoDecisao.total`: apenas `PENDENTE` do perfil do tenant com prazo ainda aberto (`>= NOW()`)
  - `emPrecificacao`, `volumeEmDisputa`, `resultados`, `criticas72h`: sempre incluem qualquer `licitacaoId` ativa/deliberada em `tenant_licitacao`, inclusive editais `OUTROS` ou de outra UF resgatados do Histórico

- [ ] **Step 1: Escrever testes RED em `tests/unit/dashboard-vigencia-sql-issue-59.test.ts`**
  Testar: (a) edital publicado em Nov/2026 já encerrado entra em `cards.recebidas.total` de Nov/2026 mas NÃO entra em `cards.aguardandoDecisao.total`; (b) edital histórico publicado em Jan/2026 inserido hoje (`createdAt` em Nov/2026) NÃO entra em `cards.recebidas.total` de Nov/2026 (entra apenas em Jan/2026); (c) filtro automático de `subsegmentosTenantAtivo` e `ufsTenantAtivo` exclui editais fora do perfil; (d) edital `OUTROS` ou de outra UF aceito pelo tenant em `tenant_licitacao` entra em `emPrecificacao` e `volumeEmDisputa`.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
  Run: `npx vitest run tests/unit/dashboard-vigencia-sql-issue-59.test.ts`
  Expected: FAIL (Dashboard ainda usa `createdAt`, ignora vigência/UF/subsegmento e exclui resgatados `OUTROS`).
- [ ] **Step 3: Refatorar `dashboard.service.ts` para agregações SQL (`count`/`aggregate`/`findMany` restrito aos IDs do Kanban + críticas 72h) e atualizar `GET /api/dashboard/route.ts`**
  Em `GET /api/dashboard/route.ts`, passar `segmentosTenantAtivo`, `subsegmentosTenantAtivo` e `ufsTenantAtivo` (quando `!cfg.brasilInteiro`). Manter fallback em memória idêntico para testes sem Postgres.
- [ ] **Step 4: Rodar Vitest (novo + testes existentes de dashboard)**
  Run: `npx vitest run tests/unit/dashboard-vigencia-sql-issue-59.test.ts tests/unit/sprint-3-dashboard-calendario.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(dashboard): agregacoes sql, volume mensal por dataPublicacaoPncp e backlog vigente (issue #59)"`

---

### Task 4: Serviço & API do Módulo `Histórico de Licitações` (`GET /api/historico-licitacoes`)

**Files:**
- Create: `src/server/services/historico-licitacoes.service.ts`
- Create: `src/app/api/historico-licitacoes/route.ts`
- Test: `tests/unit/historico-licitacoes-service-issue-59.test.ts`

**Interfaces:**
- Consumes: `historicoLicitacoesQuerySchema` (Task 1), `buildOrderBySql` (Task 2), `exigirClienteEmApi` (`src/server/auth/client-guard.ts`)
- Produces:
  - `listHistoricoLicitacoesPaginado(rawQuery, tenantId?)` retornando `{ ok: true, itens, total, page, pageSize, totalPages }` onde cada item inclui `prazoEncerrado: boolean` e `statusTenant: LicitacaoStatus | null`
  - `GET /api/historico-licitacoes` acessível a **qualquer plano de cliente** (bloqueando apenas não autenticados com `401` e contas ADM com `403`), sem restrição de segmentos/UFs do tenant

- [ ] **Step 1: Escrever testes RED em `tests/unit/historico-licitacoes-service-issue-59.test.ts`**
  Testar: (a) retorna editais encerrados, abertos e `OUTROS` de qualquer UF dentro da janela de até 30 dias; (b) `situacaoPrazo: "ENCERRADAS"` traz só vencidos e `"ABERTAS"` traz só vigentes; (c) `segmento: "OUTROS"` filtra exclusivamente `OUTROS`; (d) rejeita janela de 31 dias e busca com 2 letras (`ZodError`); (e) paginação `[10, 25, 50, 100]` e ordenação global por `valorEstimado` e `dataLimite` funcionam sobre todo o conjunto; (f) rota `GET /api/historico-licitacoes` responde `401` sem sessão, `403` para SuperAdmin e `200` para cliente plano `BASICO`/`TRIAL` com `isReadOnly`.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
  Run: `npx vitest run tests/unit/historico-licitacoes-service-issue-59.test.ts`
  Expected: FAIL (serviço e rota ainda não existem).
- [ ] **Step 3: Implementar `src/server/services/historico-licitacoes.service.ts` e `src/app/api/historico-licitacoes/route.ts`**
  Usar `prisma.licitacao.count` + `findMany({ where, orderBy, skip, take })` com fallback em memória equivalente; enriquecer apenas os itens da página atual com `statusKanban` do `tenant_licitacao` (1 query `where: { tenantId, licitacaoId: { in: pageIds } }`).
- [ ] **Step 4: Rodar Vitest e confirmar aprovação (GREEN)**
  Run: `npx vitest run tests/unit/historico-licitacoes-service-issue-59.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(historico): servico e api sql /api/historico-licitacoes com travas de 30 dias e 3 letras (issue #59)"`

---

### Task 5: Reabertura Automática (`RECUSADA` → `PENDENTE` + Tag) e Coletor PNCP `/contratacoes/proposta`

**Files:**
- Modify: `src/server/services/ingestao.service.ts`
- Modify: `src/server/services/pncp-ingestao-diaria.service.ts`
- Modify: `src/server/services/licitacoes-store.ts` (suporte a listar/atualizar `tags` em `tenantLicitacao` em memória)
- Modify: `src/server/services/oportunidades.service.ts` (expor `reabertaPosRecusa: boolean` e `tags` no retorno de `getOportunidadeById`)
- Test: `tests/unit/reabertura-pos-recusa-issue-59.test.ts`

**Interfaces:**
- Consumes: `REABERTA_POS_RECUSA_TAG`, `silenciarNotificacoes` (Task 1)
- Produces:
  - Reativação automática em `ingestLicitacoesV2`: quando `encNovo > encAnt && encNovo > Date.now()`, atualiza todos os `TenantLicitacao` daquela licitação com `statusKanban === "RECUSADA"` para `statusKanban: "PENDENTE"` adicionando `"REABERTA_POS_RECUSA"` em `tags`, preservando `motivoRecusa`, gravando `AuditLog` (`INGESTAO_REABERTURA_POS_RECUSA`) e sem tocar em certames `ACEITA`/Kanban
  - Fase 2 em `executarIngestaoDiariaPncp`: consulta leve a `/api/consulta/v1/contratacoes/proposta` com `usarIa: false` para capturar retificações/reaberturas
  - Campo booleano `reabertaPosRecusa` retornado por `getOportunidadeById` / `GET /api/oportunidades/[id]`

- [ ] **Step 1: Escrever testes RED em `tests/unit/reabertura-pos-recusa-issue-59.test.ts`**
  Testar: (a) tenant recusa edital → nova ingestão com `dataEncerramentoProposta` prorrogada para data futura muda `TenantLicitacao` do tenant para `PENDENTE` com `reabertaPosRecusa: true` e preserva `motivoRecusa`; (b) edital `ACEITA` no Kanban do outro tenant permanece `ACEITA` intacta; (c) nova deliberação do tenant limpa `reabertaPosRecusa`; (d) `silenciarNotificacoes: true` suprime `N1_COLETA_CONCLUIDA`; (e) `executarIngestaoDiariaPncp` consulta também `/contratacoes/proposta` quando habilitado.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
  Run: `npx vitest run tests/unit/reabertura-pos-recusa-issue-59.test.ts`
  Expected: FAIL (`statusKanban` continua `RECUSADA` e `reabertaPosRecusa` é `undefined`).
- [ ] **Step 3: Implementar lógica de reabertura em `ingestao.service.ts`, fase 2 em `pncp-ingestao-diaria.service.ts` e flag `reabertaPosRecusa` em `oportunidades.service.ts`**
- [ ] **Step 4: Rodar Vitest (novo + testes de ingestão/cron)**
  Run: `npx vitest run tests/unit/reabertura-pos-recusa-issue-59.test.ts tests/unit/bloco2-cron-pncp-titulos.test.ts tests/unit/ingestao-periodo-issue-55.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(ingestao): reabertura automatica pos-recusa com tag e coleta pncp /contratacoes/proposta (issue #59)"`

---

### Task 6: Frontend — Menu Lateral, Tela `/historico-licitacoes`, Ordenação Global + Loading em `/oportunidades` e Badges no Dossiê

**Files:**
- Modify: `src/config/routes.ts` (inserir `Histórico de Licitações` na ordem 4 entre `Minhas Licitações` e `Calendário`)
- Modify: `src/components/shell/app-shell.tsx` (registrar ícone `Catalog` para `historico-licitacoes`)
- Create: `src/app/historico-licitacoes/page.tsx`
- Modify: `src/app/oportunidades/page.tsx` (`pageSizes={[10, 25, 50, 100]}`, ordenação server-side real com `sortBy`/`sortDir`, validação mín. 3 letras na busca, overlay de carregamento Carbon)
- Modify: `src/app/oportunidades/[id]/page.tsx` (badge *"Prazo Encerrado — Consulta Histórica"* ocultando Participar/Não Participar quando vencida e não no Kanban; badge *"Reaberta após Recusa — Nova Data no PNCP"* quando `reabertaPosRecusa === true`)
- Test: `tests/unit/historico-ui-e-badges-issue-59.test.tsx`

**Interfaces:**
- Consumes: `GET /api/historico-licitacoes` (Task 4), `GET /api/oportunidades` com `sortBy`/`sortDir`/`pageSize` (Task 2), `reabertaPosRecusa` em `GET /api/oportunidades/[id]` (Task 5)
- Produces:
  - Rota `/historico-licitacoes` (zero fetch no mount; dispara fetch só ao clicar em *Buscar* ou paginar/ordenar após busca; ajuste automático da janela de 30 dias para `[hoje, hoje + 30d]` ao selecionar `Em Aberto`; overlay de carregamento durante ordenação/paginação)
  - Tabela `/oportunidades` com `pageSizes={[10, 25, 50, 100]}` e sort server-side global
  - Badges no Dossiê `/oportunidades/[id]` com `data-testid="badge-prazo-encerrado-historico"` e `data-testid="badge-reaberta-pos-recusa"`

- [ ] **Step 1: Escrever testes RED em `tests/unit/historico-ui-e-badges-issue-59.test.tsx`**
  Testar: (a) `APP_ROUTES` tem `historico-licitacoes` imediatamente entre `minhas-licitacoes` e `calendario`; (b) `HistoricoLicitacoesPage` NÃO chama `fetch("/api/historico-licitacoes...")` ao montar, exibe aviso se usuário digitar 2 letras ou intervalo > 30 dias, ajusta janela para `[hoje, hoje+30d]` ao escolher `ABERTAS`, e dispara requisição com `sortBy`/`sortDir` ao clicar em *Buscar* e ao ordenar coluna; (c) `OportunidadesPage` oferece `10, 25, 50, 100` e dispara nova chamada com `sortBy=valorEstimado` ao clicar no cabeçalho *Valor Estimado*; (d) Dossiê `/oportunidades/[id]` exibe `badge-prazo-encerrado-historico` (sem botões Participar/Não Participar) para edital vencido fora do Kanban, e exibe `badge-reaberta-pos-recusa` quando `reabertaPosRecusa: true`.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
  Run: `npx vitest run tests/unit/historico-ui-e-badges-issue-59.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implementar as alterações de UI em `routes.ts`, `app-shell.tsx`, `historico-licitacoes/page.tsx`, `oportunidades/page.tsx` e `oportunidades/[id]/page.tsx`**
- [ ] **Step 4: Rodar Vitest + verificar regressão de rotas/frontend + `npm run build`**
  Run: `npx vitest run tests/unit/historico-ui-e-badges-issue-59.test.tsx tests/unit/sprint-2-frontend.test.tsx tests/unit/app-shell-banners-issue-56.test.tsx && npm run build`
  Expected: PASS e build limpo.
- [ ] **Step 5: Commit**
  `git commit -m "feat(ui): modulo Historico de Licitacoes, ordenacao sql [10,25,50,100] e badges no dossie (issue #59)"`

---

### Task 7: Script de Carga Histórica 2026 com Checkpoint, Deploy Staging e Validação

**Files:**
- Create: `scripts/backfill-pncp-2026.ts`
- Test: `tests/unit/backfill-pncp-2026-issue-59.test.ts`

**Interfaces:**
- Consumes: `POST /api/ingestao` com `usarIaTitulos: false` e `silenciarNotificacoes: true` (Task 1 & Task 5)
- Produces: Script CLI `npx tsx scripts/backfill-pncp-2026.ts [--de=20260101] [--ate=20261125] [--janelasDias=3] [--maxPaginasPorJanela=20] [--targetUrl=https://staging.aponta.cloud]` com checkpoint JSON retomável em `.cache/backfill-pncp-2026-checkpoint.json`

- [ ] **Step 1: Escrever teste unitário RED em `tests/unit/backfill-pncp-2026-issue-59.test.ts`**
  Testar fatiamento de datas em janelas reversas (`20261125` → `20260101`) e retomada a partir de checkpoint salvo sem repetir janelas concluídas.
- [ ] **Step 2: Rodar Vitest e confirmar falha (RED)**
- [ ] **Step 3: Implementar `scripts/backfill-pncp-2026.ts` (exportando helpers puros de janelamento/checkpoint para teste)**
- [ ] **Step 4: Rodar Vitest, `npm run build`, push para `feat/saas-multi-tenant`, aguardar deploy em `staging.aponta.cloud`, executar carga de `20260101`–`20261125`, validar `/historico-licitacoes`, `/oportunidades` e `/dashboard` no staging via Playwright e fechar a Issue `#59`**
- [ ] **Step 5: Commit**
  `git commit -m "feat(backfill): script resiliente de carga historica pncp 2026 com checkpoint (closes #59)"`
