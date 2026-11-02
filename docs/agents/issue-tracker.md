# Issue tracker: Paperclip

Issues (tarefas), especificações, documentos de trabalho e dependências do projeto **Portal de Licitações** vivem nativamente no **Paperclip**. O repositório Git (`https://github.com/alfredo-maia/portal_licitacao.git`) hospeda exclusivamente o código-fonte e PRs, **não** utilizando GitHub Issues.

## Identificadores de Escopo

- **Company ID**: `672fabb1-8461-437d-ad7b-6a7bd33df05c`
- **Project ID (`projectId`)**: `83891ed1-1820-4cc8-9b40-2d3fd6840e03` (Portal de Licitações)
- **Workspace ID (`workspaceId`)**: `08185a70-af0a-4f1b-94a6-198a2917ed19` (`/home/hermes/apps/portal_licitacao`)
- **Rotina PNCP**: `ac972837-0b35-4c18-9bd7-bb23d6ad7904` (Coleta PNCP — terça e sexta)

## Convenções e Operações na API do Paperclip

Todas as chamadas usam `Authorization: Bearer $PAPERCLIP_API_KEY` sobre `$PAPERCLIP_API_URL`. Toda mutação de issue exige o header `-H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID"`.

- **Ler contexto de uma tarefa**:
  - Resumo compacto e ancestrais: `GET /api/issues/{issueId}/heartbeat-context`
  - Objeto completo da tarefa (incluindo `blockedBy` e `blocks`): `GET /api/issues/{issueId}`
  - Comentários incrementais: `GET /api/issues/{issueId}/comments?after={commentId}&order=asc`
- **Checkout da tarefa**:
  - `POST /api/issues/{issueId}/checkout` com `{ "agentId": "$PAPERCLIP_AGENT_ID", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }`.
  - Se o harness já realizou checkout na execução atual, não repita a chamada. Em caso de `409 Conflict`, encerre imediatamente sem retry.
- **Criar uma tarefa ou subtarefa (ticket vertical)**:
  - `POST /api/companies/672fabb1-8461-437d-ad7b-6a7bd33df05c/issues`
  - Inclua `"projectId": "83891ed1-1820-4cc8-9b40-2d3fd6840e03"`, `"parentId": "{parentIssueId}"`, `"title"`, `"description"`, `"assigneeAgentId"` (quando aplicável) e `"blockedByIssueIds"` para dependências reais.
- **Documentos da tarefa (`spec`, `plan`, artefatos)**:
  - Ler ou salvar documentos estruturados na própria tarefa via `PUT /api/issues/{issueId}/documents/{key}` (ex.: `spec`, `plan`), preservando revisões conforme a skill `paperclip`.
- **Dependências e Bloqueios (`Blocking`)**:
  - Use o campo nativo `blockedByIssueIds: ["{blockerIssueId}"]` no `POST` ou `PATCH /api/issues/{issueId}`. Um ticket planejado pode manter `status: "backlog"`; a existência da dependência não exige transformar todo ticket planejado em bloqueio operacional. O GET retorna os resumos das dependências em `blockedBy`, cada um com `id`.
  - Uma tarefa fica desbloqueada quando todas as issues em `blockedBy` atingem o estado `done` (disparando `issue_blockers_resolved`).
- **Aplicar etiquetas (`Labels`)**:
  - Envie somente IDs no campo `labelIds: ["{labelId}"]` das etiquetas cadastradas no Paperclip para a company `672fabb1-8461-437d-ad7b-6a7bd33df05c` conforme mapeado em `docs/agents/triage-labels.md`.
- **Atualizar estado e concluir**:
  - `PATCH /api/issues/{issueId}` com `{ "status": "done" | "in_review" | "blocked" | "in_progress", "comment": "..." }`.
  - Confirme sempre o corpo JSON retornado pela API.

## Pull requests como superfície de triagem

**PRs as a request surface: no.** As demandas entram e são triadas exclusivamente como issues no Paperclip.

## Quando uma skill disser "publish to the issue tracker"

Crie ou atualize a issue ou documento correspondente no Paperclip (`projectId`: `83891ed1-1820-4cc8-9b40-2d3fd6840e03`), nunca no GitHub Issues nem em `.scratch/`.

## Quando uma skill disser "fetch the relevant ticket"

Consulte a issue no Paperclip via `GET /api/issues/{issueId}` (ou use o payload de wake já entregue na sessão) e leia seus documentos associados.

## Operações de `/wayfinder`

Usadas por `/wayfinder` quando uma demanda é grande ou nebulosa demais para uma única SPEC:

- **Map**: uma issue no Paperclip com a etiqueta `wayfinder:map` (`070a2a24-7234-4c24-858b-ec5fdcd72aa9`), contendo no corpo/documento as seções Notes / Decisions-so-far / Fog.
- **Child ticket**: uma issue filha (`parentId` apontando para o Map) com a etiqueta correspondente `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` ou `wayfinder:task` (veja IDs em `docs/agents/triage-labels.md`).
- **Blocking**: via `blockedByIssueIds` nativo do Paperclip.
- **Frontier**: filhas abertas do Map sem bloqueios pendentes (`blockedBy` todas `done`).
