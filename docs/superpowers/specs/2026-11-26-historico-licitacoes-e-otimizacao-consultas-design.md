# Design: Módulo Histórico de Licitações, Oportunidades Estritamente Vigentes, Paginação/Ordenação SQL e Carga PNCP 2026

- **Data:** 2026-11-26
- **Issue:** `#59`
- **Status:** Pronto para aprovação do parceiro (revisado via Builder Check)

---

## 1. Intenção e Motivação (Why)

Separar definitivamente no produto dois momentos distintos da rotina de uma empresa licitante:

1. **Triagem Operacional (`/dashboard` e `/oportunidades`):** O cliente precisa enxergar **apenas** licitações que ainda estão **com prazo aberto para envio de proposta** e que pertencem aos **Segmentos, Subsegmentos e UFs** cadastrados pela sua empresa. Licitações já vencidas não devem poluir o backlog *"Aguardando Decisão"* nem exigir cliques em *"Não Participar"*.
2. **Pesquisa Histórica, Inteligência e Resgate (`/historico-licitacoes`):** O cliente — **de qualquer plano** — precisa pesquisar livremente todo o acervo de licitações (encerradas ou em aberto, em qualquer UF, em todos os 40 segmentos **e também em `OUTROS`**) para baixar editais/atas sob demanda, consultar histórico, rodar Análise com IA e até resgatar licitações ainda abertas que tenham caído em `OUTROS` ou em outra UF.

Ao escalar a base para cobrir todo o ano de 2026 (`01/01/2026` a `25/11/2026` no piloto, e anos anteriores no lançamento comercial), a arquitetura atual de listagem em memória (`findMany` sem `skip/take` + sort client-side) torna-se inviável. Por isso, este design também migra paginação e ordenação para **100% SQL no PostgreSQL** com índices dedicados e travas contra consultas excessivamente abertas.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
1. **Oportunidades e Dashboard estritamente vigentes:** Exibir e contabilizar como `PENDENTE` apenas licitações com `COALESCE(dataEncerramentoProposta, dataAbertura) >= NOW()`, respeitando automaticamente **Segmentos, Subsegmentos e UFs** do tenant (excluindo `OUTROS`).
2. **Preservação do Kanban (`Minhas Licitações`):** Certames já aceitos pelo cliente (`statusKanban` diferente de `PENDENTE` e `RECUSADA`) permanecem intactos no funil mesmo após o encerramento da data de proposta — jamais são marcados como recusados automaticamente.
3. **Novo módulo `Histórico de Licitações` (`/historico-licitacoes`):**
   - Posicionado no menu lateral entre **Minhas Licitações** (ordem 3) e **Calendário** (passa para ordem 5).
   - Liberado para **todos os planos**, com todos os **40 segmentos + `OUTROS`**, **188 subsegmentos** e **27 UFs** abertos.
   - Inclui editais **encerrados e em aberto** (com filtro de situação do prazo: `Todas`, `Encerradas`, `Em Aberto`), permitindo encontrar também licitações `OUTROS` que ainda estejam abertas.
   - **Abre vazio (Zero Query on Mount):** não executa nenhuma busca ao carregar a tela; a consulta só dispara quando o usuário clica em **"Buscar"** (ou pressiona `Enter`).
4. **Dossiê ciente de prazo encerrado:** Para editais vencidos (quando o cliente não está participando no Kanban), exibe selo **"Prazo Encerrado — Consulta Histórica"** e oculta os botões *Participar / Não Participar*, mantendo 100% ativos **Arquivos do Edital** (download lazy para Cloudflare R2 apenas ao clicar em buscar edital), **Notas** e **Análise de IA**. Para editais ainda abertos encontrados via Histórico (ex.: em `OUTROS`), mantém o botão **Participar** ativo.
5. **Paginação e Ordenação Global em SQL (`[10, 25, 50, 100]`):** Em `/oportunidades` e `/historico-licitacoes`, clicar em qualquer cabeçalho de coluna (*Data Limite*, *Órgão e UF*, *Objeto*, *Valor Estimado*) ordena **todos** os registros que atendem aos filtros no PostgreSQL (`ORDER BY ... LIMIT ... OFFSET`) e retorna apenas a página solicitada, exibindo overlay/modal de carregamento durante a requisição.
6. **Proteção de Banco de Dados:** Mínimo de **3 caracteres** na busca por palavra-chave, janela máxima de **30 dias** no filtro de datas do Histórico, índices B-Tree compostos + índices GIN (`pg_trgm` e JSONB) no PostgreSQL.
7. **Detecção de Reaberturas no Coletor Diário:** Incluir consulta ao endpoint PNCP de propostas em aberto (`/contratacoes/proposta`) para detectar editais antigos reabertos/retificados com nova data futura e recolocá-los automaticamente em **Oportunidades**.
8. **Carga Histórica Inicial (`01/01/2026` a `25/11/2026`):** Script resiliente com checkpoint, ingerindo apenas metadados leves (sem download de PDFs e sem spam de notificações N1).

### Não-Objetivos
- Não baixar automaticamente PDFs/editais/atas para o Cloudflare R2 durante a carga histórica (permanece 100% sob demanda ao clicar em buscar documentos no Dossiê).
- Não alterar a árvore comercial de 40 segmentos / 188 subsegmentos no cadastro de empresas (`CATALOGO_MACRO_SEGMENTOS`).
- Não ingerir anos anteriores a 2026 nesta fase piloto (o script deixará o mecanismo pronto para `2024–2025` no lançamento comercial).

### Anti-Objetivos (Falhas Inaceitáveis)
- Carregar milhares de linhas em memória no Node.js para fazer `.slice()` ou `.sort()` em JavaScript.
- Disparar consulta automática pesada assim que o usuário abre `/historico-licitacoes`.
- Marcar licitações em andamento no Kanban como `RECUSADA` quando a data da proposta passa.
- Permitir que editais vencidos ou `OUTROS` inflem os cards do `/dashboard` ou a fila de `/oportunidades`.

---

## 3. Restrições Arquiteturais

- **Schema-First (Zod) & Layered Architecture:** Novos contratos em `src/server/schemas/` (`zero any`), lógica isolada em `src/server/services/`, rotas finas em `src/app/api/`.
- **IBM Carbon Design System:** Exclusivamente componentes Carbon (`DataTable`, `Pagination`, `Loading`, `Tag`, `Dropdown`, `MultiSelect`, `TextInput`, `Button`, `Tile`) e tokens CSS semânticos (`var(--cds-*)`) para temas claro e escuro.
- **Compatibilidade com Testes Offline (Fallback em Memória):** O motor SQL no Prisma é o caminho primário em produção/staging; quando o PostgreSQL está indisponível (CI/Vitest local sem Postgres), o serviço cai de forma transparente para o fallback em memória respeitando exatamente a mesma paginação, ordenação global e filtros.
- **Governança de Auditoria & Segurança:** Isolamento estrito de tenant em `/oportunidades` e `/dashboard`; `/historico-licitacoes` protegido por `exigirClienteEmApi` (bloqueia contas ADM com 403 e não autenticados com 401), liberado para qualquer plano ativo/trial/somente-leitura do cliente.

---

## 4. Abordagens Avaliadas

1. **Abordagem 1 (Escolhida pelo Parceiro) — Catálogo Local 2026 Indexado no PostgreSQL + Paginação/Ordenação 100% SQL (`OFFSET/LIMIT`):**
   - Armazena metadados das licitações de `01/01/2026` até `25/11/2026` no PostgreSQL (sem PDFs), com índices B-Tree + `pg_trgm`, consultas SQL paginadas/ordenadas globalmente e tela `Histórico de Licitações` iniciando vazia.
   - *Trade-off:* Exige carga progressiva com checkpoint e espaço para metadados textuais, mas entrega resposta em milissegundos com os 40 segmentos, 188 subsegmentos, `OUTROS` e ordenação global real.
2. **Abordagem 2 — Consulta Ao Vivo na API Pública do PNCP para Datas Antigas:**
   - Descartada porque a API do PNCP não filtra pelos nossos 40 segmentos/188 subsegmentos, não ordena globalmente por valor/órgão com busca textual livre e fica refém de latência/instabilidade externa.

---

## 5. Desenho Técnico Detalhado

### 5.1. Navegação e Rotas (`src/config/routes.ts` e `src/components/shell/app-shell.tsx`)
Inserir nova rota oficial em `APP_ROUTES` na posição **4** (entre `Minhas Licitações` e `Calendário`), renumerando os módulos seguintes (`Calendário` → 5 até `Configurações` → 13):
- `id`: `"historico-licitacoes"`
- `path` / `href`: `"/historico-licitacoes"`
- `label` / `name` / `title`: `"Histórico de Licitações"`
- `description`: `"Base geral de licitações encerradas e em aberto (todos os segmentos, inclusive Outros) para consulta de editais e análise com IA."`
- Ícone Carbon no `AppShell` (`ROUTE_ICONS`): `Catalog` (ou `Archive`) de `@carbon/icons-react`.

### 5.2. Regras de Vigência, Métricas do Dashboard e Perfil do Tenant em `/oportunidades` e `/dashboard`
1. **Filtro de Vigência (`PENDENTE`) vs. Volume Mensal (`Oportunidades Recebidas`):**
   - Em `buildPrismaWhere` ([oportunidades.service.ts](file:///Users/vitorhenrique/Desktop/Profissional/Programacao/AV%20System/Portais%20Gerenciais/Portal%20de%20Licitacoes/portal_licitacao/src/server/services/oportunidades.service.ts)) e `getDashboardData` ([dashboard.service.ts](file:///Users/vitorhenrique/Desktop/Profissional/Programacao/AV%20System/Portais%20Gerenciais/Portal%20de%20Licitacoes/portal_licitacao/src/server/services/dashboard.service.ts)):
   - **Fila de Triagem (`/oportunidades` status `PENDENTE`) e card `Aguardando Decisão` (Dashboard):** aplicam obrigatoriamente vigência ativa:
     ```sql
     (dataEncerramentoProposta >= NOW())
     OR (dataEncerramentoProposta IS NULL AND dataAbertura >= NOW())
     ```
   - **Card `Oportunidades Recebidas` no Dashboard (Decisão do Parceiro):** exibe o **volume total do mês** selecionado — todas as licitações do perfil do cliente (Segmentos + Subsegmentos + UFs) cuja data de publicação (`COALESCE(dataPublicacaoPncp, createdAt)`) pertence àquele mês, mesmo que parte delas já tenha encerrado durante o próprio mês. Isso também evita que a carga retroativa de 2026 infle o mês atual com editais antigos de janeiro–outubro.
   - **Agregação SQL no Dashboard:** `getDashboardData` deixa de carregar toda a tabela `Licitacao` via `findMany()` sem limite em memória e passa a usar consultas agregadas SQL (`count` / `aggregate` / `groupBy` com `where` indexado), mantendo suporte seguro ao volume completo de 2026.
   - **Certames resgatados do Histórico (`OUTROS` / fora da UF) no Kanban:** qualquer `licitacaoId` presente em `tenant_licitacao` com deliberação ativa do cliente (`emPrecificacao`, `volumeEmDisputa`, `contempladas`, `resultados`, `criticas72h`) é **sempre incluída** nas métricas do Kanban no Dashboard, mesmo que o edital seja `OUTROS` ou de outra UF.
   - A cláusula legada `tenantCriadoEm - 30 dias` deixa de ser usada para puxar itens vencidos; itens cujo prazo expirou saem automaticamente de `PENDENTE` na triagem.
   - Itens já deliberados no Kanban (`statusKanban` ≠ `PENDENTE` e ≠ `RECUSADA`) **não** sofrem filtro de vigência e jamais são marcados como recusados ao vencer.
2. **Alinhamento Completo do Perfil do Tenant (Segmentos + Subsegmentos + UFs):**
   - Em `GET /api/oportunidades` e `GET /api/dashboard`:
     - Carregar `cfg.segmentos`, `cfg.subsegmentos`, `cfg.ufs` e `cfg.brasilInteiro` do tenant ativo.
     - Quando `!cfg.brasilInteiro && cfg.ufs.length > 0`, enviar `ufsTenantAtivo: cfg.ufs` para ambos os serviços (evitando que o backend retorne UFs fora da área de atuação do cliente quando o filtro da tela está vazio).
     - No Dashboard, passar também `subsegmentosTenantAtivo: cfg.subsegmentos` e `ufsTenantAtivo` para que o backlog `Aguardando Decisão` bata **exatamente** com os números de `/oportunidades`.
   - `segmentoMacro = "OUTROS"` continua bloqueado na fila automática de `/oportunidades` e no card `Oportunidades Recebidas` / `Aguardando Decisão` do `/dashboard`.

### 5.3. Paginação e Ordenação 100% SQL (`[10, 25, 50, 100]`)
1. **Contrato Zod (`oportunidadesFilterSchema` e novo `historicoLicitacoesQuerySchema`):**
   - `page`: inteiro positivo (padrão `1`).
   - `pageSize`: enum/int restrito a `10 | 25 | 50 | 100` (padrão `10`, máximo `100`).
   - `sortBy`: `z.enum(["dataLimite", "orgaoNome", "miniResumo", "valorEstimado"]).default("dataLimite")`.
   - `sortDir`: `z.enum(["asc", "desc"]).default("desc")`.
   - `busca`: se não vazia após `trim()`, exige `length >= 3` (rejeita 1 ou 2 letras com erro amigável `VALIDATION_ERROR`).
2. **Execução SQL Eficiente (Zero Full-Load em Memória):**
   - Em `listOportunidadesPaginadas` e `listHistoricoLicitacoesPaginado`:
     - Quando conectado ao PostgreSQL, executar em paralelo `prisma.licitacao.count({ where })` e `prisma.licitacao.findMany({ where, orderBy, skip, take })`.
     - **Filtro de subsegmentos do tenant no SQL:** Para cada macro em que o tenant restringiu subsegmentos, gerar condição `OR` no Prisma (`{ AND: [{ segmentoMacro: macro }, { OR: subsDaMacro.map(c => ({ subcategorias: { array_contains: [c] } })) }] }`), enquanto macros sem restrição de subsegmento usam `{ segmentoMacro: macro }`. Assim, o `COUNT(*)` e o `OFFSET/LIMIT` acontecem **inteiramente dentro do PostgreSQL**, retornando apenas `10/25/50/100` linhas para o Node.js!
     - **Mapeamento de `orderBy` SQL:**
       - `dataLimite`: `[{ dataEncerramentoProposta: sortDir }, { dataAbertura: sortDir }, { id: "asc" }]`
       - `orgaoNome`: `[{ orgaoNome: sortDir }, { uf: sortDir }, { id: "asc" }]`
       - `miniResumo`: `[{ miniResumo: sortDir }, { id: "asc" }]`
       - `valorEstimado`: `[{ valorEstimado: sortDir }, { id: "asc" }]`
     - *Nota sobre `dataEncerramentoProposta` nula:* Na migração/auto-healing, garantimos `UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL`, mantendo a ordenação por `dataEncerramentoProposta` 100% consistente com a coluna exibida.
3. **UX de Ordenação e Carregamento no Frontend (`/oportunidades` e `/historico-licitacoes`):**
   - `Pagination` com `pageSizes={[10, 25, 50, 100]}`.
   - Interceptar clique nos cabeçalhos de coluna (`TableHeader` com `isSortable`, `isSortHeader={sortBy === header.key}`, `sortDirection`) para disparar nova requisição server-side (`sortBy`, `sortDir`, `page=1`) em vez de ordenar apenas os itens da página atual no Carbon `DataTable`.
   - Exibir **overlay/modal de carregamento Carbon (`Loading withOverlay` ou overlay dedicado sobre a tabela com mensagem *"Ordenando e carregando licitações..."*)** durante toda troca de ordenação, página ou busca.

### 5.4. Nova Tela `Histórico de Licitações` (`/historico-licitacoes` e `GET /api/historico-licitacoes`)
1. **Estado Inicial Vazio (Zero Query on Mount):**
   - Ao abrir `/historico-licitacoes`, `buscouUmaVez === false`: nenhuma requisição `GET /api/historico-licitacoes` é disparada.
   - Os filtros de data vêm pré-preenchidos por conveniência com os **últimos 30 dias** (`hoje - 30 dias` até `hoje`), editáveis pelo usuário.
   - Exibe um `Tile` de estado inicial: *"Defina os filtros acima (período de até 30 dias, segmento, UF ou palavra-chave com mínimo de 3 letras) e clique em **Buscar** para consultar o Histórico de Licitações."*
2. **Filtros Liberados para Todos os Planos:**
   - **Período (`Data Limite De` / `Data Limite Até`):** Obrigatório; diferença máxima de **30 dias corridos** (`(dataFim - dataInicio) <= 30 dias`). Se exceder 30 dias, bloqueia no front-end e no Zod com mensagem clara. Ao trocar **Situação do Prazo** para **`Em Aberto` (`ABERTAS`)**, a UI ajusta automaticamente a janela sugerida para **`[hoje, hoje + 30 dias]`** (e ao voltar para `Todas` ou `Encerradas`, sugere `[hoje - 30 dias, hoje]`), mantendo a regra de máximo 30 dias sem zerar a busca de editais futuros.
   - **Situação do Prazo (`situacaoPrazo`):** `TODAS` (padrão), `ENCERRADAS` (`dataEncerramentoProposta < NOW()`), `ABERTAS` (`dataEncerramentoProposta >= NOW()`).
   - **Segmento:** `Todos (incl. Outros)` + todos os **40 segmentos oficiais** + **`OUTROS` ("Outros / Sem segmento definido")**.
   - **Subsegmento:** Todos os subsegmentos da macro escolhida (188 ao todo).
   - **UF:** `Todas as UFs` + todos os **27 estados** (sem restrição do cadastro da empresa).
   - **Faixa de Valor:** Mesmas faixas de `/oportunidades`.
   - **Palavra-chave (`busca`):** Opcional; quando preenchida, exige **mínimo de 3 caracteres** (bloqueando termos de 1–2 letras como `"da"`, `"de"`).
3. **Ações na Tabela e Comportamento do Dossiê (`/oportunidades/[id]`):**
   - Colunas da tabela do Histórico: `Data Limite (Proposta)`, `Situação` (Tag `Em Aberto` verde ou `Encerrada` cinza), `Órgão e UF`, `Objeto`, `Segmento` (exibindo nome do segmento ou `Outros`), `Valor Estimado`.
   - Clicar na linha navega para `/oportunidades/[id]?origem=/historico-licitacoes`.
   - No Dossiê (`/oportunidades/[id]`):
     - Calcular `prazoEncerrado = new Date(oportunidade.dataEncerramentoProposta || oportunidade.dataAbertura).getTime() < Date.now()`.
     - Verificar `emParticipacaoKanban = !["PENDENTE", "RECUSADA"].includes(oportunidade.status)`.
     - Se `prazoEncerrado && !emParticipacaoKanban`:
       - Exibir `Tag` / aviso em destaque **"Prazo Encerrado — Consulta Histórica"**.
       - Ocultar os botões **Participar** e **Não Participar**.
       - Manter 100% habilitados: botão **Verificar Status de Participação (IA)**, aba **Arquivos do Edital** (com botão *Buscar Arquivos no PNCP* → cache lazy no Cloudflare R2), aba **Notas** e aba **Histórico Análise IA**.
     - Se `!prazoEncerrado` (edital ainda aberto encontrado via Histórico, ex.: `OUTROS` ou outra UF): mantém o botão **Participar** visível e funcional para enviar diretamente ao Kanban do cliente!
     - **Badge de Reabertura após Recusa (Decisão do Parceiro):** se o registro do tenant possuir a tag `"REABERTA_POS_RECUSA"` em `TenantLicitacao.tags` (definida quando um edital previamente recusado teve o prazo prorrogado no PNCP e voltou automaticamente para `PENDENTE`), o Dossiê `/oportunidades/[id]` exibe um badge Carbon em destaque (**`Reaberta após Recusa — Nova Data no PNCP`**) acompanhado de aviso informando a prorrogação (e exibindo o motivo anterior da recusa para contexto). Quando o cliente delibera novamente (`Participar` ou `Não Participar`), a tag `"REABERTA_POS_RECUSA"` é limpa.

### 5.5. Índices PostgreSQL (`prisma/schema.prisma` + SQL de Índices)
1. Adicionar no `model Licitacao` em `prisma/schema.prisma`:
   - `@@index([dataEncerramentoProposta])`
   - `@@index([segmentoMacro, uf, dataEncerramentoProposta])`
   - `@@index([valorEstimado])`
   - `@@index([orgaoNome])`
2. No startup/migração do banco (`scripts/docker-entrypoint.cjs` + migration SQL idempotente):
   - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
   - `CREATE INDEX IF NOT EXISTS idx_licitacao_resumo_trgm ON "Licitacao" USING gin ("resumo" gin_trgm_ops);`
   - `CREATE INDEX IF NOT EXISTS idx_licitacao_miniresumo_trgm ON "Licitacao" USING gin ("miniResumo" gin_trgm_ops);`
   - `CREATE INDEX IF NOT EXISTS idx_licitacao_orgao_trgm ON "Licitacao" USING gin ("orgaoNome" gin_trgm_ops);`
   - `CREATE INDEX IF NOT EXISTS idx_licitacao_subcategorias_gin ON "Licitacao" USING gin ("subcategorias");`

### 5.6. Coletor Diário de Reaberturas & Carga Histórica 2026
1. **Reaberturas no Coletor Diário (`pncp-ingestao-diaria.service.ts` + `ingestao.service.ts`):**
   - Além da coleta padrão em `/api/consulta/v1/contratacoes/publicacao` (novas publicações), adicionar segunda fase leve consultando `/api/consulta/v1/contratacoes/proposta` (propostas atualmente em aberto, com paginação controlada e `usarIaTitulos: false` para zero custo de LLM e sem risco de timeout HTTP) focada em atualizar `dataEncerramentoProposta` de editais existentes retificados/reabertos e capturar eventuais editais em aberto perdidos.
   - **Reativação automática `RECUSADA` → `PENDENTE` (Decisão do Parceiro):** Em `ingestLicitacoesV2`, sempre que um edital existente tiver `dataEncerramentoProposta` estendida para uma data **posterior** à data anterior e **futura (`> NOW()`)**, o serviço verifica os registros em `tenant_licitacao` daquela licitação com `statusKanban === "RECUSADA"` e os atualiza automaticamente para `statusKanban: "PENDENTE"`, adicionando `"REABERTA_POS_RECUSA"` em `tags` (preservando `motivoRecusa` anterior para contexto até nova deliberação), gravando `AuditLog` e notificando o tenant (`N2` / `N10`). Certames já em participação no Kanban (`ACEITA`, `EM_DISPUTA`, etc.) permanecem intactos e recebem apenas a notificação de retificação de data.
2. **Script de Carga Histórica 2026 (`scripts/backfill-pncp-2026.ts`):**
   - Percorre `20260101` até `20261125` em janelas controladas (ex.: de 3 em 3 dias ou dia a dia, de trás para frente — começando pelos meses mais recentes até janeiro/2026).
   - Grava checkpoint em arquivo local (`.cache/backfill-pncp-2026-checkpoint.json`) permitindo pausar e retomar sem repetir páginas já coletadas.
   - Envia lotes com `usarIaTitulos: false` e novo campo opcional `silenciarNotificacoes: true` em `ingestaoPayloadV2Schema` (para não disparar centenas de notificações `N1_COLETA_CONCLUIDA` no sininho dos clientes durante a carga histórica) e preserva `dataPublicacaoPncp` oficial de cada certame.
   - **Zero download de PDFs:** apenas metadados + classificação V3 + título fiel no PostgreSQL.

---

## 6. Decisões Assumidas pelo Construtor (Para Conferência)

1. **Campo de data do filtro de 30 dias no Histórico + ajuste automático em `Em Aberto`:** Filtra sobre `COALESCE(dataEncerramentoProposta, dataAbertura)` (mesma coluna *"Data Limite (Proposta)"* da tabela). Ao selecionar `Situação = Em Aberto`, o front-end desloca automaticamente a janela padrão de `[hoje - 30d, hoje]` para `[hoje, hoje + 30d]` para que licitações futuras apareçam imediatamente.
2. **Métrica mensal baseada em `dataPublicacaoPncp` + SQL no Dashboard:** Para impedir que a carga histórica de 2026 distorça o mês atual ou estoure memória, o Dashboard usa `COALESCE(dataPublicacaoPncp, createdAt)` e consultas agregadas SQL, incluindo sempre nas métricas de Kanban qualquer licitação que o cliente tenha resgatado do Histórico (`OUTROS` ou outra UF).
3. **Armazenamento da marcação de reabertura sem migração destrutiva:** Reutiliza a coluna existente `TenantLicitacao.tags` (`"REABERTA_POS_RECUSA"`) para acionar o badge em `/oportunidades/[id]` e limpa a tag assim que o cliente delibera novamente.
4. **Fase 2 do coletor (`/contratacoes/proposta`) sem IA:** Roda com síntese determinística V3 (`usarIaTitulos: false`) para manter o cron rápido e sem gasto extra de tokens.
5. **Notificações silenciadas no backfill:** Flag opcional `silenciarNotificacoes?: boolean` na ingestão em lote evita flood no sininho durante cargas retroativas.
6. **Validação de 3 caracteres na busca textual:** Aplicada em `/oportunidades` e `/historico-licitacoes` quando o campo de busca textual não está vazio.
