# ADR 0003 — Histórico de Status, Motor de Notificações, Dashboard e Calendário (Sprint 3)

- **Status:** Aceito
- **Data:** 2026-10-25
- **Autor:** Etapa de Arquitetura (Claude Sonnet 5.5, via Antigravity)
- **Escopo:** Sprint 3 — `docs/sprints/sprint-3-spec.md`

---

## 1. Contexto

A Sprint 3 entrega Dashboard Executivo, Calendário de Certames e o Motor de Notificações (N1–N8, sino global e tela `/notificacoes`). Três requisitos do PRD **não são atendíveis com o modelo de dados atual**:

1. As métricas do Dashboard são **mensais** ("Recusadas no mês", "Contempladas no mês"), mas `Licitacao` só tem `createdAt`/`updatedAt`. `updatedAt` muda a cada edição (upload, equipe, benchmark), então não serve para saber *quando* o status mudou.
2. N2/N3/N4 vão para **Responsável + Atribuídos**; N1 para **toda a equipe**; N5/N6 para **Diretoria/Comercial**. Isso exige estado de leitura **por usuário**.
3. N3/N4/N5 são disparos **temporais** (D−1 às 07:00 BRT etc.), e a aplicação Next.js não tem agendador.

## 2. Decisões

### 2.1. Tabela `licitacao_status_historico` (nova)
Registra toda transição de status (`statusAnterior`, `statusNovo`, `motivo`, `usuarioId`, `ocorridoEm`). É a fonte das métricas mensais do Dashboard e atende o `STATUS_HISTORY` já previsto no ERD do PRD §9.

- **Obrigatório:** toda mutação de status passa a gravar uma linha — deliberação GO/No-GO, movimentação no Kanban e ingestão (criação como `PENDENTE`). Isso altera serviços das Sprints 1–2 (ver spec §4).
- **Backfill:** a migration cria uma linha de partida por licitação existente usando `updatedAt` como momento em que atingiu o status atual. **É uma aproximação**: licitações antigas podem aparecer no mês da última edição, não no da transição real. Aceitável porque a base atual é de homologação; deve ser revisitado antes de dados reais.
- **Índices:** `(licitacaoId, ocorridoEm)` e `(statusNovo, ocorridoEm)` para as consultas por mês.

### 2.2. `Notificacao` + `NotificacaoDestinatario` (fan-out na criação)
- `Notificacao` guarda o conteúdo e `chaveIdempotencia` (**UK**). `NotificacaoDestinatario` guarda `usuarioId` e `lidaEm` (leitura por usuário) com `@@unique([notificacaoId, usuarioId])`.
- **Desvio do PRD:** o ERD cita `NOTIFICACAO_LEITURA`; usamos `NotificacaoDestinatario` porque a linha existe antes da leitura (`lidaEm` nulo = não lida), então "leitura" seria nome enganoso.
- **Chave de idempotência:** `${tipo}:${entidadeId}:${janela}` (`montarChaveIdempotencia`). Reexecutar o job ou reingerir o mesmo lote não duplica. Janela: data BRT (`2026-11-04`) para N3/N4/N5, `hashCritico` para N2, `executadoEm` para N1.
- **Limitação aceita:** o fan-out acontece na criação. Quem for adicionado como Atribuído **depois** não recebe retroativamente avisos já emitidos.
- **"Jurídico" (N8):** não existe como perfil; mapeado para `DIRETORIA`.

### 2.3. Agendamento por endpoint protegido, não por scheduler embutido
`POST /api/notificacoes/jobs/diario` varre N3/N4/N5 e é protegido por header `x-cron-secret` (env `CRON_SECRET`, ≥ 16 caracteres). Quem dispara (cron da VPS, rotina do Paperclip ou GitHub Actions `schedule`) é decisão de DevOps na Etapa 6. A idempotência torna seguro chamar mais de uma vez por dia.

- **Alternativa descartada:** `node-cron`/`setInterval` dentro do Next.js — o processo `standalone` pode reiniciar a qualquer deploy e múltiplas réplicas duplicariam disparos.
- **Horário:** o PRD pede N3 às 07:00 BRT; o endpoint só garante a *janela* (data BRT). O horário real é o do agendador externo.

### 2.4. Agrupamentos de status em um único módulo
`status-grupos.schema.ts` define `STATUS_PIPELINE_ATIVO`, `STATUS_EM_PRECIFICACAO`, `STATUS_CALENDARIO_NORMAL/OPACO`, `STATUS_PERDA_COMPETITIVA` e `STATUS_FORA_DO_CALENDARIO`. Dashboard, Calendário e Notificações importam daqui; nenhum serviço redefine listas de status. Um teste de contrato garante que os 15 status do enum estão cobertos sem duplicidade no calendário.

### 2.5. `Licitacao.valorArrematado` (nulo)
O PRD exige "Valor Financeiro total arrematado (R$)" nas Contempladas, mas nada captura esse valor. Adicionada coluna nula; o Dashboard soma `coalesce(valorArrematado, valorEstimado)`.

- **Pendência explícita:** nesta sprint **não há UI para informar** o valor arrematado, então o card mostrará o valor *estimado* das contempladas. O rótulo deve deixar isso claro até a UI existir (candidato a Sprint 4, junto do modal ao mover para `CONTEMPLADA`).

### 2.6. Fronteira com as Sprints 4–5
`N6` (Portal), `N7` (Documento) e `N8` (Impugnação) têm enum, matriz e janelas definidos, mas **não são emitidos** na Sprint 3 (`NOTIFICACAO_TIPOS_SPRINT_3` lista N1–N5). Do mesmo modo, `alertasDocumentais` do Calendário tem contrato final e devolve `[]` até `Documento` existir. Assim as sprints seguintes só plugam a fonte, sem mudar contrato.

## 3. Premissas que o PRD não resolve (decididas aqui — revisar se discordar)

| # | Ambiguidade | Decisão |
| :-: | :--- | :--- |
| 1 | `IMPUGNADA` não consta em nenhuma lista do Calendário (§4.2) | Tratada como **pipeline ativo**: chip normal. |
| 2 | Taxa de Conversão: o que é "perdida"? | Só `NAO_CONTEMPLADA_PRECO` + `NAO_CONTEMPLADA_DOCUMENTACAO`. Desistência e `REVOGADA_ANULADA` ficam fora do denominador. Sem denominador → `null` (UI mostra "—"). |
| 3 | "Desfecho no mês" | Status atual = desfecho **e** última transição para ele ocorreu no mês. Evita contar duas vezes quem mudou de status. |
| 4 | "Em Precificação (GO)" | Status atual em `STATUS_EM_PRECIFICACAO` **e** transição para `ACEITA` no mês. |
| 5 | Fuso do "mês" | `America/Sao_Paulo`. Limites convertidos para UTC com offset −03:00 (o Brasil não adota horário de verão atualmente). |
| 6 | Críticas 72h | Abertura entre agora e agora+72h, status `PENDENTE` ou pipeline ativo. |
| 7 | Top 4 tipos | Histórico acumulado por `tipoSistemaCodigo`, ignorando nulos; desempate por `ordem` do catálogo. |

## 4. Defeito encontrado na Sprint 2 (corrigido de forma aditiva)

A migration `20261025000000_sprint_2_dossie_kanban` e o `ddlSprint2` do entrypoint executam `ALTER TABLE "licitacao"` e `CREATE INDEX ... ON "licitacao"`. A tabela real é **`"Licitacao"`** (o model não tem `@@map`), e identificadores entre aspas diferenciam maiúsculas de minúsculas no PostgreSQL. Pelo código, a coluna `responsavelId` **não deve ter sido criada** nesses ambientes (o erro é engolido por um `console.warn`). As tabelas novas da Sprint 2 (`licitacao_atribuido` etc.) não são afetadas porque têm `@@map` minúsculo.

- **Impacto na Sprint 3:** N2/N3/N4 dependem de `Licitacao.responsavelId`.
- **Tratamento:** a migration e o `ddlSprint3` repetem `ADD COLUMN IF NOT EXISTS "responsavelId"` com o nome correto. Os arquivos da Sprint 2 **não foram editados** (migration já "aplicada").
- **Não verificado em banco real:** conclusão por leitura de código; o Postgres local/VPS não estava acessível nesta etapa. DevOps deve confirmar com `\d "Licitacao"` antes do deploy.

## 5. Consequências

- O `Desenvolvedor Backend_ag` precisa instrumentar `deliberarOportunidade`, a atualização de status do Kanban e a ingestão para gravar histórico e disparar N1/N2.
- O QA escreve a suíte RED contra: schemas desta ADR, matriz N1–N8, regras de cálculo do Dashboard e janelas do job.
- Dívida registrada: DDL duplicado entre `prisma/migrations` e `docker-entrypoint.cjs` (já existia desde a Sprint 2) pode divergir. Sugestão para a Etapa 6: o entrypoint passar a ser a única fonte executada, ou migrar para `prisma migrate deploy` após normalizar o histórico de migrations.
