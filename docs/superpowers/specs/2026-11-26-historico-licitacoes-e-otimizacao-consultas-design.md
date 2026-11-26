# Design: Módulo Histórico de Licitações, Oportunidades Estritamente Vigentes, Paginação/Ordenação SQL e Carga PNCP 2026

- **Data:** 2026-11-26
- **Issue:** `#59`
- **Status:** Em revisão técnica (Builder Check) antes da aprovação final

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

### 5.2. Regras de Vigência e Perfil do Tenant em `/oportunidades` e `/dashboard`
1. **Filtro de Vigência (`PENDENTE`):**
   - Em `buildPrismaWhere` ([oportunidades.service.ts](file:///Users/vitorhenrique/Desktop/Profissional/Programacao/AV%20System/Portais%20Gerenciais/Portal%20de%20Licitacoes/portal_licitacao/src/server/services/oportunidades.service.ts)) e `getDashboardData` ([dashboard.service.ts](file:///Users/vitorhenrique/Desktop/Profissional/Programacao/AV%20System/Portais%20Gerenciais/Portal%20de%20Licitacoes/portal_licitacao/src/server/services/dashboard.service.ts)):
   - Quando listando/contabilizando oportunidades `PENDENTE` na fila de triagem (ou `aguardandoDecisao` no Dashboard), aplicar obrigatoriamente:
     ```sql
     (dataEncerramentoProposta >= NOW())
     OR (dataEncerramentoProposta IS NULL AND dataAbertura >= NOW())
     ```
   - A cláusula legada `tenantCriadoEm - 30 dias` deixa de ser usada para puxar itens vencidos; itens cujo prazo expirou saem automaticamente de `PENDENTE` na triagem.
   - Itens já deliberados no Kanban (`statusKanban` ≠ `PENDENTE` e ≠ `RECUSADA`) **não** sofrem filtro de vigência e jamais são marcados como recusados ao vencer.
2. **Alinhamento Completo do Perfil do Tenant (Segmentos + Subsegmentos + UFs):**
   - Em `GET /api/oportunidades` e `GET /api/dashboard`:
     - Carregar `cfg.segmentos`, `cfg.subsegmentos`, `cfg.ufs` e `cfg.brasilInteiro` do tenant ativo.
     - Quando `!cfg.brasilInteiro && cfg.ufs.length > 0`, enviar `ufsTenantAtivo: cfg.ufs` para ambos os serviços (evitando que o backend retorne UFs fora da área de atuação do cliente quando o filtro da tela está vazio).
     - No Dashboard, passar também `subsegmentosTenantAtivo: cfg.subsegmentos` e `ufsTenantAtivo` para que os cards do Dashboard batam **exatamente** com os números da tela de Oportunidades.
   - `segmentoMacro = "OUTROS"` continua bloqueado em `/oportunidades` e `/dashboard` (pois `segmentosTenantAtivo` contém apenas códigos dentre os 40 comerciais).

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
   - **Período (`Data Limite De` / `Data Limite Até`):** Obrigatório; diferença máxima de **30 dias corridos** (`(dataFim - dataInicio) <= 30 dias`). Se exceder 30 dias, bloqueia no front-end e no Zod com mensagem clara.
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
1. **Reaberturas no Coletor Diário (`pncp-ingestao-diaria.service.ts`):**
   - Além da coleta padrão em `/api/consulta/v1/contratacoes/publicacao` (novas publicações), adicionar segunda fase leve consultando `/api/consulta/v1/contratacoes/proposta` (propostas atualmente em aberto) para atualizar `dataEncerramentoProposta` de editais antigos retificados/reabertos.
   - Como `ingestLicitacoesV2` já compara `hashCritico` (que inclui `dataEncerramentoProposta`), qualquer reabertura atualiza o registro no PostgreSQL, gera notificação de retificação e torna o edital elegível em `/oportunidades`.
2. **Script de Carga Histórica 2026 (`scripts/backfill-pncp-2026.ts`):**
   - Percorre `20260101` até `20261125` em janelas controladas (ex.: de 3 em 3 dias ou dia a dia, de trás para frente — começando pelos meses mais recentes até janeiro/2026).
   - Grava checkpoint em arquivo local (`.cache/backfill-pncp-2026-checkpoint.json`) permitindo pausar e retomar sem repetir páginas já coletadas.
   - Envia lotes com `usarIaTitulos: false` e novo campo opcional `silenciarNotificacoes: true` em `ingestaoPayloadV2Schema` (para não disparar centenas de notificações `N1_COLETA_CONCLUIDA` no sininho dos clientes durante a carga histórica).
   - **Zero download de PDFs:** apenas metadados + classificação V3 + título fiel no PostgreSQL.

---

## 6. Decisões Assumidas pelo Construtor (Para Conferência)

1. **Campo de data do filtro de 30 dias no Histórico:** Filtra sobre `dataEncerramentoProposta` (com fallback para `dataAbertura` quando nulo), mantendo 100% de coerência visual com a coluna *"Data Limite (Proposta)"* exibida na tabela.
2. **Notificações silenciadas no backfill:** Adição do flag opcional `silenciarNotificacoes?: boolean` na ingestão em lote para evitar flood no sininho de notificações durante cargas históricas de meses anteriores.
3. **Filtro de prazo padrão no Histórico:** Abre com `Data Limite De = hoje - 30 dias`, `Data Limite Até = hoje` e `Situação = Todas` (trazendo encerradas e abertas dentro da janela), mas **sem disparar a query** até o clique em **"Buscar"**.
4. **Limpeza de `GET /api/oportunidades`:** Quando `busca` tiver 1 ou 2 caracteres, tanto `/oportunidades` quanto `/historico-licitacoes` exigem mínimo de 3 caracteres para executar busca textual.
