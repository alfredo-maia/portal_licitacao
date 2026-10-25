# Especificação Técnica Operacional — Sprint 3 (Dashboard, Calendário & Notificações)

> **Documento Mestre:** `docs/PRD.md` (§4.1, §4.2, §4.10, §6, §7, §9, §10)
> **Decisões e premissas:** `docs/adr/0003-historico-status-notificacoes-dashboard-calendario.md`
> **Contratos Zod:** `src/server/schemas/{status-grupos,dashboard,calendario,notificacao}.schema.ts`

---

## 1. Entregáveis

1. **Dashboard (`/dashboard`):** seletor mês/ano; 4 cards clicáveis com navegação filtrada; painel de desfechos; indicadores (volume em disputa, viabilidade IA, críticas 72h com contagem regressiva); Top 4 tipos (clique filtra `/oportunidades?tipoSistema=`). **Sem mini-calendário** (requisito explícito).
2. **Calendário (`/calendario`):** grade mensal com seletores de mês/ano e botão "Hoje"; chips normais/opacos (40%); clique leva a `/oportunidades/[id]`; faixa de alerta documental (vazia até a Sprint 4).
3. **Notificações:** sino global no Header (badge + 5 mais recentes) e tela `/notificacoes` (cartões com ponto azul, "Marcar como lida", "✔ Marcar todas como lidas"). Emissão de **N1–N5**.
4. **Histórico de status:** toda mutação de status grava `licitacao_status_historico`.

**Fora de escopo (Sprints 4–5):** emissão de N6/N7/N8, `alertasDocumentais` reais, UI para `valorArrematado`.

## 2. Endpoints

| Método e rota | Contrato | Regras |
| :--- | :--- | :--- |
| `GET /api/dashboard?mes&ano` | `dashboardQuerySchema` → `dashboardResponseSchema` | Cálculos definidos no cabeçalho de `dashboard.schema.ts`. Padrão: mês corrente em `America/Sao_Paulo`. |
| `GET /api/calendario?mes&ano` | `calendarioQuerySchema` → `calendarioResponseSchema` | Chips por `dataAbertura` no mês; `PENDENTE`/`RECUSADA` nunca aparecem; perdas/cancelamento `opaco: true`. |
| `GET /api/notificacoes` | `notificacoesListQuerySchema` → `notificacoesListResponseSchema` | Somente notificações do usuário logado; `apenasNaoLidas=false` deve ser respeitado (não usar `z.coerce.boolean`). |
| `GET /api/notificacoes/resumo` | `notificacoesResumoResponseSchema` | Badge + 5 mais recentes. |
| `PATCH /api/notificacoes/[id]/lida` | `notificacaoMarcarLidasResponseSchema` | Marca só para o usuário logado; 404 se ele não é destinatário. |
| `POST /api/notificacoes/marcar-todas` | `notificacaoMarcarLidasResponseSchema` | Todas as não lidas do usuário logado. |
| `POST /api/notificacoes/jobs/diario` | `notificacoesJobInputSchema` → `notificacoesJobResponseSchema` | Header `x-cron-secret` = `CRON_SECRET`; sem/errado → 401. Idempotente. |

Todas as rotas exigem sessão, exceto o job (segredo). Mutações gravam `audit_log` (`NOTIFICACAO_LIDA`, `NOTIFICACAO_MARCAR_TODAS`).

## 3. Motor de notificações

- **Matriz:** `NOTIFICACAO_MATRIZ` (PRD §6.2). Destinatários: `TODOS` = usuários ativos; `RESPONSAVEL_E_ATRIBUIDOS` = `responsavelId` + `LicitacaoAtribuido`; `DIRETORIA_E_COMERCIAL` = roles `DIRETORIA` e `ANALISTA_COMERCIAL`; `DIRETORIA`.
- **Gatilhos de evento (dentro dos serviços existentes):**
  - **N1:** ao concluir `ingestLicitacoesV2` (uma por lote; janela = `executadoEm`).
  - **N2:** na ingestão, quando `hashCritico` difere (janela = novo `hashCritico`). Atualizar `dataAbertura` já reflete no Calendário (lê direto da tabela).
- **Job diário (N3/N4/N5):**
  - **N3:** status em `STATUS_PIPELINE_ATIVO` com abertura em D+1 (data BRT).
  - **N4:** `isPresencial` e status ativo, com abertura em D+7 ou D+1.
  - **N5:** `PENDENTE` com abertura em < `NOTIFICACAO_N5_JANELA_HORAS` (72 h); uma por dia enquanto não houver decisão (janela = data BRT).
- **Idempotência:** `montarChaveIdempotencia`; violação de UK é tratada como "ignorada", nunca como erro.

## 4. Instrumentação obrigatória de código existente

Para o histórico funcionar, o Backend altera (com testes):

| Serviço | Mudança |
| :--- | :--- |
| `oportunidades.service.ts` → `deliberarOportunidade` | Gravar histórico (`PENDENTE → ACEITA/RECUSADA`, `motivo` = `motivoRecusa`). |
| Atualização de status do Kanban (`PATCH /api/oportunidades/[id]/status`) | Gravar histórico com `motivoPerda` quando houver. |
| `ingestao.service.ts` | Gravar histórico inicial (`null → PENDENTE`) na criação; disparar N1/N2. |
| `licitacoes-store.ts` (fallback em memória) | Espelhar histórico e notificações em memória, como já faz para licitações, para os testes unitários rodarem sem PostgreSQL. |

## 5. Critérios de aceite por etapa

### Etapa 1 — Arquitetura (esta entrega)
- [x] Models Prisma e migration idempotente `20261025120000_sprint_3_dashboard_calendario_notificacoes`.
- [x] DDL espelhado em `scripts/docker-entrypoint.cjs` (`ddlSprint3`).
- [x] Schemas Zod reexportados em `src/server/schemas/index.ts`.
- [x] `CRON_SECRET` em `.env.example`.
- [x] `tsc --noEmit` limpo; Vitest 82/82; contratos conferidos por script (17/17).
- [x] ADR 0003.

### Etapa 2 — TDD RED (`QA_ag`)
- [ ] **Dashboard:** cada fórmula de `dashboard.schema.ts`, incluindo `taxaConversaoPercentual = null` com denominador 0, desfecho contado uma única vez por transição, fronteira de mês em BRT (ex.: `2026-12-01T02:59:59Z` ainda é novembro).
- [ ] **Calendário:** chips normais/opacos, ausência de `PENDENTE`/`RECUSADA`, `IMPUGNADA` normal, `alertasDocumentais: []`.
- [ ] **Notificações:** destinatários por regra (N2 ≠ N1), idempotência (reexecutar job não duplica), leitura isolada por usuário, `apenasNaoLidas=false`, job sem segredo → 401.
- [ ] **Histórico:** deliberação, Kanban e ingestão gravam transição; backfill não duplica.
- [ ] **E2E Playwright:** `/dashboard` sem mini-calendário; clique no card 2 → `/oportunidades?status=PENDENTE`; `/calendario` com chip clicável; sino com badge e "Marcar todas".

### Etapa 3A — Backend GREEN (`Desenvolvedor Backend_ag`)
- [ ] Serviços e rotas da §2, instrumentação da §4, todos os testes GREEN, `audit_log` nas mutações.

### Etapa 3B — Frontend GREEN (`Desenvolvedor Frontend_ag`)
- [ ] Telas e sino conforme §1, IBM Carbon (gráficos com `@carbon/charts-react` onde fizer sentido), tema claro/escuro, rótulo honesto em "Contempladas" enquanto `valorArrematado` não for informável (ADR §2.5).

### Etapa 4 — Code Review (Arquiteto)
- [ ] Contratos respeitados, queries com índice, nenhuma lista de status redefinida fora de `status-grupos.schema.ts`.

### Etapa 5 — QA Validation
- [ ] Vitest e Playwright 100% verdes; `npm run lint` sem erros.

### Etapa 6 — DevOps
- [ ] Confirmar `\d "Licitacao"` (coluna `responsavelId`, ADR §4) antes do deploy.
- [ ] Definir `CRON_SECRET` na VPS e agendar `POST /api/notificacoes/jobs/diario` (07:00 BRT).
- [ ] Preview atualizado e validado.
