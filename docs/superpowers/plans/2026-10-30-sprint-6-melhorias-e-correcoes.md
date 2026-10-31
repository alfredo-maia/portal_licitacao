# Sprint 6 — Melhorias e Correções (UX, Cadastro em 2 Etapas, Login Multi-Step, Dashboard, Oportunidades e Dossiê) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar integralmente as melhorias e correções especificadas no documento `Sprint 6.pdf` (Páginas 1 a 6), abrangendo: (1) Tela de Cadastro em 2 etapas com seleção de Segmentos/Sub-segmentos, UFs/Brasil inteiro e validação corporativa em português; (2) Correção definitiva do bug de login pós-cadastro (`opaonossopanificadora@gmail.com`) e novo fluxo de Login Multi-Step (E-mail Corporativo → Escolha do Método: Senha, Código por E-mail ou Código por WhatsApp); (3) Limpeza da NavBar (`X` duplicado e tag de versão) e garantia de entrega de notificações no sino global; (4) Reformulação limpa do Dashboard com nomenclatura comercial (sem `GO/No-GO` e sem card `Top 4 Categorias de TI`); (5) Reformulação da Central de Oportunidades (filtros dinâmicos por Segmento/Sub-segmento e UF do Tenant, remoção de Parecer IA, Importar JSON e Filtrar Tabela, ajuste de largura das colunas); e (6) Reformulação do Dossiê da Oportunidade (remoção de botões/cards legados, remoção da aba Repositórios Similares e adição do botão `"Buscar Edital"` com sincronização PNCP → Cloudflare R2 e download seletivo/total).

**Architecture:** Arquitetura em camadas Next.js 15 App Router (`src/app/` → `src/app/api/` → `src/server/services/` → `src/server/schemas/` + `src/lib/prisma.ts`), governada por Schema-First Design Pattern (Zod + TypeScript estrito `zero any`), RBAC centralizado (`can()`), auditoria em `audit_log` e componentes 100% IBM Carbon Design System (`@carbon/react`, tokens `var(--cds-*)`).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `@carbon/react` + `@carbon/icons-react`, Prisma ORM (PostgreSQL), NextAuth.js (JWT + Credentials/OTP), Vitest + Testing Library, Cloudflare R2 Storage.

**Spec:** `/Users/vitorhenrique/Downloads/Sprint 6.pdf` (Páginas 1 a 6) & `docs/PRD.md`.

**Global Constraints:**
- **Governança GitHub Issues (`AGENTS.md` / `.agents/rules/github-issues-workflow.md`):** Nenhuma linha de código de produção pode ser alterada antes de abrir a Issue correspondente da Sprint 6 via `gh issue create` com o template oficial.
- **Ciclo TDD Estrito em 7 Etapas (`.agents/rules/tdd-development-workflow.md`):** Issue → Schemas/ADR → Testes RED (`QA_ag`) → Implementação GREEN (`Devs`) → Code Review (`Arquiteto_ag`) → Regressão Completa (`QA_ag`) → Build/Deploy Staging e Fechamento da Issue (`DevOps_ag` & `Gerente_ag`).
- **IBM Carbon Design System:** Uso exclusivo de componentes `@carbon/react` e tokens semânticos `var(--cds-*)` compatíveis com temas Claro (`white`/`g10`) e Escuro (`g90`/`g100`).
- **Isolamento de Marca:** Uso exclusivo de `APP_CONFIG.brandName` vindo de `src/config/brand.ts`.
- **Nomenclatura Comercial:** Substituir `GO / NO-GO` na interface por termos comerciais claros (`Participar` / `Não Participar` ou `Aceitar` / `Recusar` / `Descartar`).

**Review Focus:**
- **Correctness:** Persistência real de usuários e tenants no PostgreSQL (e fallback in-memory sincronizado) para que qualquer conta recém-cadastrada (incluindo `opaonossopanificadora@gmail.com`) consiga autenticar imediatamente por senha, OTP E-mail ou OTP WhatsApp; vinculação estrita entre `Segmento / Ramo` e `Sub-segmento` sem vazamento de subcategorias de outros ramos.
- **Architecture:** Contratos Zod isomórficos em `src/server/schemas/` separados de dependências Node-only (`node:crypto`) para não quebrar o bundle client do Next.js.

---

## File Structure & Responsibilities

### Database & Contracts (`Arquiteto de Software_ag`)
- **Modify:** `prisma/schema.prisma` — Adicionar campos `telefone`, `segmentos` (`String[]`), `subsegmentos` (`String[]`), `ufs` (`String[]`) e `brasilInteiro` (`Boolean`) ao model `Tenant`.
- **Create:** `docs/adr/0012-sprint-6-ux-cadastro-login-oportunidades-dossie.md` — ADR documentando as decisões arquiteturais da Sprint 6 (Cadastro em 2 etapas com taxonomia vinculada ao Tenant, Login Multi-Step 3 métodos, Sincronização sob demanda de editais PNCP no Dossiê e remoção de acoplamentos legados de TI).
- **Modify:** `src/server/schemas/cadastro.schema.ts` — Atualizar `cadastroContaSchema` para validar `segmentos` (mínimo 1 Macro-Segmento), `subsegmentos` (lista de códigos de subcategorias selecionadas), `ufs` (lista de siglas UF) e `brasilInteiro` (`boolean`), além de mensagens em português claro.
- **Modify:** `src/server/schemas/oportunidades.schema.ts` — Adicionar filtros `segmento` (`MacroSegmento`) e `subsegmento` (`string`) ao `oportunidadesFilterSchema`.
- **Modify:** `src/server/schemas/dashboard.schema.ts` — Remover obrigatoriedade de `topTipos` na resposta do Dashboard (ou marcá-lo opcional/depreciado) mantendo o contrato limpo.

### Backend Services & API Routes (`Desenvolvedor Backend_ag`)
- **Modify:** `src/server/services/cadastro.service.ts` —
  1. Garantir auto-healing seguro das colunas/tabelas SaaS no PostgreSQL (`tenant`, `tenant_user`, `User.isSuperAdmin`, `segmentos`, `subsegmentos`, `ufs`, `brasilInteiro`) antes da transação.
  2. Persistir `segmentos`, `subsegmentos`, `ufs` e `brasilInteiro` no `Tenant`.
  3. Chamar `upsertInMemoryAuthUser` imediatamente após criar o usuário para que o login funcione mesmo em ambientes com falha transitória de banco, e não silenciar erros fatais de criação de usuário.
  4. Criar função `ensureRegisteredUserCanLogin` / seed de recuperação para garantir que `opaonossopanificadora@gmail.com` (senha `123456`) esteja íntegro e autenticável.
- **Modify:** `src/server/auth/index.ts` —
  1. Tornar a consulta `prisma.user.findUnique` resiliente: caso o `include: { tenantMemberships: { include: { tenant: true } } }` falhe por divergência de schema no banco, fazer fallback para `prisma.user.findUnique({ where: { email: normalizedEmail } })` simples para nunca bloquear o login por senha/OTP.
  2. Retornar no `session.user` / perfil do tenant os `segmentos`, `subsegmentos`, `ufs` e `brasilInteiro` registrados no `Tenant`.
- **Modify:** `src/app/api/auth/otp/route.ts` — Suportar envio de código OTP de 6 dígitos tanto para `EMAIL_OTP` quanto para `WHATSAPP_OTP`, validando se o e-mail corporativo existe e retornando feedback em português.
- **Create:** `src/app/api/tenant/preferencias/route.ts` — Endpoint `GET /api/tenant/preferencias` que retorna os `segmentos`, `subsegmentos`, `ufs` e `brasilInteiro` do Tenant ativo (com fallback para catálogo completo para SuperAdmin/Diretoria ou sessão de degustação).
- **Modify:** `src/server/services/notificacoes.service.ts` & `src/app/api/notificacoes/resumo/route.ts` — Garantir geração automática/idempotente de notificações reais para o usuário logado quando houver licitações recebidas (`N1_COLETA_CONCLUIDA`), licitações com abertura próxima (`N3_ABERTURA_AMANHA`), portais vencendo (`N6_VENCIMENTO_PORTAL`) e documentos vencendo (`N7_VENCIMENTO_DOCUMENTO`), de modo que o `NotificationsBell` na NavBar sempre reflita alertas reais.
- **Modify:** `src/server/services/dashboard.service.ts` — Remover cálculo desnecessário de `topTipos` ("Top 4 Categorias de TI").
- **Modify:** `src/server/services/oportunidades.service.ts` —
  1. Filtrar por `segmento` (`segmentoMacro`) e `subsegmento` (`subcategorias` / classificação textual) além de `uf`.
  2. Garantir que a busca por palavra-chave (`busca`) pesquise no `resumo` (**Resumo Detalhado do Objeto**), `miniResumo`, `orgaoNome` e `numeroEdital`.
  3. Criar função `buscarESincronizarArquivosEditalPncp(licitacaoId, user, actorContext)` que consulta os arquivos oficiais da licitação na API do PNCP (`https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos`), faz o cache no Cloudflare R2 (usando `r2-storage.service.ts`) e registra os anexos na tabela `Arquivo` da licitação.
- **Create:** `src/app/api/oportunidades/[id]/arquivos/sync-pncp/route.ts` — Endpoint `POST /api/oportunidades/[id]/arquivos/sync-pncp` acionado pelo botão `"Buscar Edital"` na aba `Arquivos do Edital` do Dossiê.

### Frontend Components & Pages (`Desenvolvedor Frontend_ag`)
- **Modify:** `src/app/cadastro/page.tsx` —
  1. Subtítulo corporativo profissional: *"Cadastre sua empresa para monitorar e gerenciar licitações públicas do seu segmento em todo o país."*
  2. Adicionar `noValidate` ao `<Form>` e validação customizada em português com `ToastNotification` / `InlineNotification` e `invalid`/`invalidText` por campo (eliminando o tooltip nativo em inglês *"Please fill out this form"*).
  3. Alterar label de `"WhatsApp para Alertas Matinais"` para `"Telefone"`.
  4. Alterar botão da Etapa 1 para `"Escolher o ramo do seu negócio"`.
  5. Implementar **Etapa 2** na tela de cadastro: seleção em lista de Macro-Segmentos e Sub-segmentos (`CATALOGO_MACRO_SEGMENTOS`), onde ao marcar um Macro-Segmento todos os seus sub-segmentos vêm marcados por padrão (permitindo desmarcar individualmente); seleção de Estados (`UF`) ou opção `"Brasil inteiro"`; botão `"Começar Teste de 14 Dias Grátis"` desabilitado (`disabled`) até que pelo menos 1 segmento seja escolhido.
- **Modify:** `src/app/login/page.tsx` —
  1. Fluxo Multi-Step fiel às páginas 2 e 3 do `Sprint 6.pdf` com componentes IBM Carbon:
     - **Passo 1 (`EMAIL`):** Campo único `"E-mail Corporativo"` + botão primário `"Avançar"`, divisor `"NOVO POR AQUI?"` + botão secundário `"Cadastrar Novo Usuário"` (`/cadastro`).
     - **Passo 2 (`METHOD_SELECT`):** Título `"Como deseja entrar?"`, exibe o e-mail digitado logo abaixo, e 3 botões de escolha: `"Entrar com senha"`, `"Receber código por E-mail"`, `"Receber código por WhatsApp"`.
     - **Passo 3A (`PASSWORD`):** Título `"Digite sua senha"`, exibe o e-mail digitado, link `"Esqueceu a senha?"` alinhado à direita do label `"Senha"` (exibido **exclusivamente** nesta tela de senha), input de senha, botão `"Entrar"` e botão `"Escolher outro método de entrada"`.
     - **Passo 3B (`EMAIL_OTP`):** Título `"Digite o código"`, subtítulo `"Código enviado para o seu e-mail"`, input de código de 6 dígitos (`0 0 0 0 0 0`), botão `"Entrar"` e botão `"Escolher outro método de entrada"`.
     - **Passo 3C (`WHATSAPP_OTP`):** Título `"Digite o código"`, subtítulo `"Código enviado para o seu WhatsApp"`, input de código de 6 dígitos (`0 0 0 0 0 0`), botão `"Entrar"` e botão `"Escolher outro método de entrada"`.
- **Modify:** `src/components/shell/app-shell.tsx` — Remover o botão `X` extra no topo direito da `SideNav` (`id="btn-close-navbar-right"`).
- **Modify:** `src/components/shell/module-page-shell.tsx` — Remover a tag `{APP_CONFIG.brandName} · v{APP_CONFIG.version}` (`"Portal PNCP · v1.0.0"`) de todas as rotas.
- **Modify:** `src/config/routes.ts` — Atualizar `description` da rota `/dashboard` para `"Visão executiva mensal."` (removendo `, 4 cards de topo, indicadores de resultado e Top 4 histórico.`).
- **Modify:** `src/app/dashboard/page.tsx` —
  1. Nos 4 KPI cards de topo, manter **apenas o título e a quantidade** (remover as frases de rodapé e tags extras).
  2. Card 1: alterar título de `"Recebidas da Coleta PNCP"` para `"Oportunidades Recebidas"`.
  3. Card 2: alterar título de `"Aguardando Decisão (GO/NO-GO)"` para `"Aguardando Decisão"`.
  4. Card 3 e Card 4 e demais textos: remover nomenclatura `GO/NO-GO` (`"Em Precificação"`, `"Recusadas"`, `"Participar"` / `"Não Participar"`).
  5. Manter integralmente o `"Painel de Desfecho & Resultados das Disputas"`.
  6. Remover completamente o card `"Top 4 Categorias de TI (Histórico Acumulado)"`.
- **Modify:** `src/app/oportunidades/page.tsx` —
  1. Substituir o select `"Tipo de Sistema"` por `"Segmento / Ramo"`, listando os segmentos cadastrados na conta/teste grátis do cliente.
  2. Adicionar ao lado direito de `"Segmento / Ramo"` o select `"Sub-segmento"`, vinculado dinamicamente ao `"Segmento / Ramo"` selecionado (exibindo apenas sub-segmentos do segmento ativo; nunca misturar sub-segmentos de outros ramos).
  3. No select `"UF"`, exibir apenas as UFs escolhidas no cadastro/teste grátis (ou todas as 27 UFs se escolheu `"Brasil inteiro"`).
  4. Remover o select `"Parecer da IA"`.
  5. Manter `"Faixa de Valor"`, `"Status"` e `"Busca por palavra-chave"` (que pesquisa no Resumo Detalhado do Objeto).
  6. Remover o filtro da barra da tabela (`TableToolbarSearch` `"Filtrar tabela..."`) e remover o botão `"Importar JSON"`.
  7. Na tabela: remover a coluna `"Parecer da IA"`, aumentar a largura horizontal das colunas `"Órgão e UF"` (ou `"Órgão"` / `"UF"`) e `"Mini-resumo"`, e remover os ícones/tags abaixo do texto dentro da célula `"Mini-resumo"`.
- **Modify:** `src/app/oportunidades/[id]/page.tsx` —
  1. Remover as tags/ícones `"Parecer IA"` e `"Tipo de sistema"` do cabeçalho do dossiê.
  2. Remover os botões `"Abrir Edital Oficial no PNCP ↗"` e `"Portal de Disputa ↗"`.
  3. Remover o card/seção `"Classificação do Tipo de Sistema"` da aba Visão Geral.
  4. Na aba `"Arquivos do Edital"`, remover a contagem entre parênteses `({arquivos.length})`, exibindo apenas `"Arquivos do Edital"`.
  5. Adicionar dentro da aba `"Arquivos do Edital"` o botão `"Buscar Edital"` (com estado de loading `"Buscando arquivos no PNCP..."`), que sincroniza os arquivos do edital junto ao portal PNCP via Cloudflare R2 e permite ao cliente selecionar/baixar arquivos individuais ou clicar em `"Baixar Todos os Arquivos"`.
  6. Remover completamente a aba `"Repositórios Similares"`.

---

## Task 1: Governança GitHub Issue, ADR 0012, Schema Prisma & Correção Definitiva de Cadastro/Login + OTP Backend

**Files:**
- Create: `docs/adr/0012-sprint-6-ux-cadastro-login-oportunidades-dossie.md`
- Modify: `prisma/schema.prisma`
- Modify: `src/server/schemas/cadastro.schema.ts`
- Modify: `src/server/services/cadastro.service.ts`
- Modify: `src/server/auth/index.ts`
- Modify: `src/app/api/auth/otp/route.ts`
- Create: `src/app/api/tenant/preferencias/route.ts`
- Test: `tests/unit/sprint-6-auth-and-cadastro-backend.test.ts`

**Interfaces:**
```typescript
// src/server/schemas/cadastro.schema.ts
export const cadastroContaSchema = z.object({
  cnpj: z.string().transform(stripDigits).refine(isValidCnpj, "CNPJ inválido."),
  razaoSocial: z.string().trim().min(3, "Informe a Razão Social (mínimo 3 caracteres)."),
  cnaePrincipal: z.string().trim().optional(),
  uf: z.string().trim().length(2, "Selecione a UF sede da empresa.").optional(),
  nomeResponsavel: z.string().trim().min(3, "Informe o nome completo do responsável."),
  email: z.string().trim().email("Informe um e-mail corporativo válido."),
  whatsapp: z.string().transform(stripDigits).refine((v) => v.length >= 10 && v.length <= 13, "Informe um telefone válido com DDD."),
  senha: z.string().min(6, "A senha deve ter no mínimo 6 caracteres."),
  segmentos: z.array(MacroSegmentoEnum).min(1, "Selecione pelo menos um segmento de atuação."),
  subsegmentos: z.array(z.string()).default([]),
  ufs: z.array(z.string().length(2)).default([]),
  brasilInteiro: z.boolean().default(true),
});
```

- [ ] **Step 1: Criar a Issue da Sprint 6 no GitHub e redigir o ADR 0012**
  Executar `gh issue create` com o template oficial (`Contexto`, `Comportamento Atual`, `Comportamento Esperado`, `Critérios de Aceite`) para a Sprint 6 e criar `docs/adr/0012-sprint-6-ux-cadastro-login-oportunidades-dossie.md`.

- [ ] **Step 2: Escrever o teste unitário RED (`tests/unit/sprint-6-auth-and-cadastro-backend.test.ts`)**
  Testar:
  1. `cadastroContaSchema` exige ao menos 1 segmento em `segmentos`, aceita `subsegmentos`, `ufs` e `brasilInteiro`, e retorna mensagens de erro em português.
  2. `realizarCadastroConta` cadastra `opaonossopanificadora@gmail.com` com senha `123456`, segmentos `["ALIMENTOS_MERENDA_ESCOLAR"]`, subsegmentos `["PANIFICACAO_LANCHES"]`, `brasilInteiro: true` e sincroniza imediatamente o usuário para que `authorizeCredentials({ email: "opaonossopanificadora@gmail.com", password: "123456" })` retorne o usuário autenticado com sucesso (nunca `null`).
  3. `generateAndStoreOtp` e `authorizeCredentials` autenticam corretamente tanto por `EMAIL_OTP` quanto por `WHATSAPP_OTP`.

- [ ] **Step 3: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-auth-and-cadastro-backend.test.ts`
  Expected: FAIL (schema atual ainda não possui `segmentos`/`subsegmentos`/`ufs`/`brasilInteiro` obrigatórios nem sincronização resiliente no `realizarCadastroConta`).

- [ ] **Step 4: Implementar Schema Prisma, Contratos Zod, `cadastro.service.ts`, `auth/index.ts`, `/api/auth/otp` e `/api/tenant/preferencias`**
  1. Atualizar `prisma/schema.prisma` adicionando `telefone String?`, `segmentos String[] @default([])`, `subsegmentos String[] @default([])`, `ufs String[] @default([])` e `brasilInteiro Boolean @default(true)` ao model `Tenant`.
  2. Em `src/server/services/cadastro.service.ts`, adicionar auto-healing SQL (`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS ...`) e sincronizar `upsertInMemoryAuthUser` + persistência das preferências de segmento/UF por Tenant. Garantir também que a conta `opaonossopanificadora@gmail.com` (senha `123456`) esteja provisionada/sincronizada.
  3. Em `src/server/auth/index.ts`, proteger `prisma.user.findUnique` com fallback caso o `include` relacional falhe, garantindo que usuários do banco sempre autentiquem com `bcrypt.compare`.
  4. Criar `src/app/api/tenant/preferencias/route.ts` retornando `{ ok: true, segmentos, subsegmentos, ufs, brasilInteiro }` do Tenant logado.

- [ ] **Step 5: Rodar o teste para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-auth-and-cadastro-backend.test.ts`
  Expected: PASS.

---

## Task 2: Tela de Cadastro em 2 Etapas (`/cadastro`)

**Files:**
- Modify: `src/app/cadastro/page.tsx`
- Test: `tests/unit/sprint-6-cadastro-ui.test.tsx`

- [ ] **Step 1: Escrever o teste RED para a nova Tela de Cadastro (`tests/unit/sprint-6-cadastro-ui.test.tsx`)**
  Testar todos os requisitos do item `1 - Tela de Cadastro` do `Sprint 6.pdf`:
  1. Exibe subtítulo corporativo profissional (não exibe mais *"Inicie sua degustação corporativa gratuita..."*).
  2. O `<form>` possui `noValidate` e, ao submeter com campos vazios, exibe notificação em português (`"Preencha todos os campos obrigatórios..."`) sem depender de tooltip nativo em inglês.
  3. O campo de telefone possui label `"Telefone"` (não `"WhatsApp para Alertas Matinais"`).
  4. O botão da Etapa 1 chama-se `"Escolher o ramo do seu negócio"`.
  5. Ao preencher a Etapa 1 e clicar em `"Escolher o ramo do seu negócio"`, avança para a Etapa 2 exibindo a lista de Macro-Segmentos e Sub-segmentos (`CATALOGO_MACRO_SEGMENTOS`), seletor de UFs / `"Brasil inteiro"` e o botão `"Começar Teste de 14 Dias Grátis"`.
  6. Na Etapa 2, o botão `"Começar Teste de 14 Dias Grátis"` inicia **desabilitado (`disabled`)** até que pelo menos 1 segmento seja selecionado; ao marcar um Macro-Segmento, todos os seus sub-segmentos vêm marcados por padrão (podendo ser desmarcados individualmente), habilitando o botão de conclusão.

- [ ] **Step 2: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-cadastro-ui.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar as 2 etapas em `src/app/cadastro/page.tsx`**
  Implementar com componentes IBM Carbon (`Form`, `TextInput`, `PasswordInput`, `Checkbox`, `Tag`, `Button`, `InlineNotification`, `Tile`) seguindo todas as regras visuais e de estado da Etapa 1 e Etapa 2.

- [ ] **Step 4: Rodar os testes de Cadastro para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-cadastro-ui.test.tsx`
  Expected: PASS.

---

## Task 3: Tela de Login Multi-Step (`/login`)

**Files:**
- Modify: `src/app/login/page.tsx`
- Test: `tests/unit/sprint-6-login-ui.test.tsx`

- [ ] **Step 1: Escrever o teste RED para o novo fluxo Multi-Step de Login (`tests/unit/sprint-6-login-ui.test.tsx`)**
  Testar todos os requisitos do item `2 - Tela de Login` (Páginas 2 e 3 do `Sprint 6.pdf`):
  1. **Passo 1:** Exibe apenas o input `"E-mail Corporativo"` (sem CPF), botão `"Avançar"`, divisor `"NOVO POR AQUI?"` e botão `"Cadastrar Novo Usuário"` apontando para `/cadastro`.
  2. **Passo 2 (`Como deseja entrar?`):** Ao informar um e-mail válido e clicar em `"Avançar"`, exibe `"Como deseja entrar?"`, mostra o e-mail digitado abaixo do título e apresenta as 3 opções:
     - `"Entrar com senha"`
     - `"Receber código por E-mail"`
     - `"Receber código por WhatsApp"`
  3. **Passo 3A (`Digite sua senha`):** Ao clicar em `"Entrar com senha"`, exibe `"Digite sua senha"`, o e-mail digitado, o link `"Esqueceu a senha?"` (visível **somente** nesta opção), o campo de senha, o botão `"Entrar"` e o botão `"Escolher outro método de entrada"`.
  4. **Passo 3B (`Digite o código` - E-mail):** Ao clicar em `"Receber código por E-mail"`, dispara requisição OTP (`EMAIL_OTP`), exibe `"Digite o código"`, `"Código enviado para o seu e-mail"`, campo de 6 dígitos (`0 0 0 0 0 0`), botão `"Entrar"` e botão `"Escolher outro método de entrada"` (sem exibir `"Esqueceu a senha?"`).
  5. **Passo 3C (`Digite o código` - WhatsApp):** Ao clicar em `"Receber código por WhatsApp"`, dispara requisição OTP (`WHATSAPP_OTP`), exibe `"Digite o código"`, `"Código enviado para o seu WhatsApp"`, campo de 6 dígitos (`0 0 0 0 0 0`), botão `"Entrar"` e botão `"Escolher outro método de entrada"` (sem exibir `"Esqueceu a senha?"`).

- [ ] **Step 2: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-login-ui.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar o fluxo Multi-Step em `src/app/login/page.tsx`**
  Construir as etapas `EMAIL` → `METHOD_SELECT` → `PASSWORD` / `EMAIL_OTP` / `WHATSAPP_OTP` utilizando componentes IBM Carbon (`Tile`, `Form`, `TextInput`, `PasswordInput`, `Button`, `InlineNotification`), preservando o seletor de tema no topo e validação em português.

- [ ] **Step 4: Rodar os testes de Login para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-login-ui.test.tsx`
  Expected: PASS.

---

## Task 4: NavBar, Cabeçalho Global & Notificações Ativas (`AppShell`, `ModulePageShell`, `NotificationsBell`)

**Files:**
- Modify: `src/components/shell/app-shell.tsx`
- Modify: `src/components/shell/module-page-shell.tsx`
- Modify: `src/server/services/notificacoes.service.ts`
- Modify: `src/app/api/notificacoes/resumo/route.ts`
- Test: `tests/unit/sprint-6-navbar-and-notifications.test.tsx`

- [ ] **Step 1: Escrever o teste RED (`tests/unit/sprint-6-navbar-and-notifications.test.tsx`)**
  Testar todos os requisitos do item `3 - NavBar` (Página 4 do `Sprint 6.pdf`):
  1. O botão `X` extra dentro do topo direito da `SideNav` (`#btn-close-navbar-right`) **não existe** mais no `AppShell`.
  2. O componente `ModulePageShell` **não exibe** mais a tag `"Portal PNCP · v1.0.0"` em nenhuma rota.
  3. O serviço de resumo de notificações (`getResumoNotificacoes`) sincroniza e entrega notificações reais (licitações recebidas da coleta, certames com abertura próxima, documentos e portais próximos do vencimento) para o usuário autenticado, alimentando o `NotificationsBell`.

- [ ] **Step 2: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-navbar-and-notifications.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar as alterações em `app-shell.tsx`, `module-page-shell.tsx` e `notificacoes.service.ts`**
  1. Remover o bloco `<div style={{ display: "flex", justifyContent: "flex-end"... }}><button id="btn-close-navbar-right"...>` de `src/components/shell/app-shell.tsx`.
  2. Remover `<Tag type="outline" size="sm" className="pncp-mono">{APP_CONFIG.brandName} · v{APP_CONFIG.version}</Tag>` de `src/components/shell/module-page-shell.tsx`.
  3. Em `src/server/services/notificacoes.service.ts`, garantir que ao consultar o resumo/lista de notificações, caso existam licitações recebidas, documentos vencendo ou portais vencendo ainda não vinculados ao usuário logado, os alertas correspondentes sejam vinculados/retornados para que o sino sempre exiba as notificações ativas.

- [ ] **Step 4: Rodar o teste para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-navbar-and-notifications.test.tsx`
  Expected: PASS.

---

## Task 5: Tela Dashboard & Nomenclatura Comercial (`/dashboard`)

**Files:**
- Modify: `src/config/routes.ts`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/server/services/dashboard.service.ts`
- Modify: `src/server/schemas/dashboard.schema.ts`
- Test: `tests/unit/sprint-6-dashboard.test.tsx`

- [ ] **Step 1: Escrever o teste RED para o Dashboard (`tests/unit/sprint-6-dashboard.test.tsx`)**
  Testar todos os requisitos do item `4 - Tela Dashboard` (Páginas 4 e 5 do `Sprint 6.pdf`):
  1. A descrição da rota `/dashboard` em `src/config/routes.ts` é `"Visão executiva mensal."` (sem `, 4 cards de topo, indicadores de resultado e Top 4 histórico.`).
  2. Nos 4 cards principais de topo, são exibidos **apenas o título e a quantidade** (sem frases de rodapé como `"Editais enviados pela esteira no mês"`, `"recebidas no mês"`, `"Certames aceitos em elaboração ativa"`, `"Certames descartados no período"`).
  3. O Card 1 tem o título `"Oportunidades Recebidas"` (não `"Recebidas da Coleta PNCP"`).
  4. O Card 2 tem o título `"Aguardando Decisão"` (sem `"(GO/NO-GO)"`).
  5. Nenhuma ocorrência de `"GO/NO-GO"`, `"GO"` ou `"NO-GO"` aparece na tela do Dashboard (substituídos por `"Em Precificação"`, `"Recusadas"`, `"Participar"` / `"Não Participar"`).
  6. O `"Painel de Desfecho & Resultados das Disputas"` permanece completo.
  7. O card `"Top 4 Categorias de TI (Histórico Acumulado)"` (`data-testid="top-tipos-panel"`) **não existe** mais.

- [ ] **Step 2: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-dashboard.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar as melhorias em `routes.ts`, `dashboard/page.tsx`, `dashboard.service.ts` e `dashboard.schema.ts`**
  1. Atualizar `src/config/routes.ts`.
  2. Simplificar os 4 KPI cards em `src/app/dashboard/page.tsx` para conterem apenas título e número, atualizar os títulos (`"Oportunidades Recebidas"`, `"Aguardando Decisão"`, `"Em Precificação"`, `"Recusadas"`), substituir `GO` / `NO-GO` por `"Participar"` / `"Não Participar"` no indicador de viabilidade, e remover o bloco `"Top 4 Categorias de TI (Histórico Acumulado)"`.
  3. Limpar o cálculo de `topTipos` em `src/server/services/dashboard.service.ts`.

- [ ] **Step 4: Rodar o teste para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-dashboard.test.tsx`
  Expected: PASS.

---

## Task 6: Central de Oportunidades (`/oportunidades`)

**Files:**
- Modify: `src/server/schemas/oportunidades.schema.ts`
- Modify: `src/server/services/oportunidades.service.ts`
- Modify: `src/app/oportunidades/page.tsx`
- Test: `tests/unit/sprint-6-oportunidades.test.tsx`

- [ ] **Step 1: Escrever o teste RED para a Central de Oportunidades (`tests/unit/sprint-6-oportunidades.test.tsx`)**
  Testar todos os requisitos do item `5 - Tela Oportunidades` (Página 5 do `Sprint 6.pdf`):
  1. O select `"Tipo de Sistema"` foi substituído por `"Segmento / Ramo"` (`data-testid="filter-segmento"`), populado com os segmentos cadastrados na conta/teste grátis do cliente.
  2. À direita de `"Segmento / Ramo"`, existe o select `"Sub-segmento"` (`data-testid="filter-subsegmento"`), vinculado dinamicamente ao `"Segmento / Ramo"` selecionado: ao escolher `"Saúde, Medicamentos & Hospitalar"`, exibe apenas sub-segmentos de Saúde (ex: `"Medicamentos & Fármacos"`) e **jamais** exibe sub-segmentos de Alimentos (ex: `"Panificação & Lanches"`).
  3. O select `"UF"` exibe apenas as UFs escolhidas no cadastro/teste grátis (ou todas as UFs quando `"Brasil inteiro"` estiver ativo).
  4. O select `"Parecer da IA"` (`data-testid="filter-parecer-ia"`) **não existe** mais.
  5. O filtro `"Busca por palavra-chave"` pesquisa no **Resumo Detalhado do Objeto** (`resumo`).
  6. O filtro de barra da tabela (`"Filtrar tabela..."`) e o botão `"Importar JSON"` (`data-testid="btn-open-import-modal"`) **não existem** mais.
  7. Na tabela de oportunidades:
     - A coluna `"Parecer da IA"` **não existe** mais.
     - As colunas `"Órgão e UF"` (ou `"Órgão"` / `"UF"`) e `"Mini-resumo"` possuem largura horizontal ampliada.
     - Dentro da célula de `"Mini-resumo"`, **não existem** tags ou ícones abaixo do texto do mini-resumo.

- [ ] **Step 2: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-oportunidades.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar os novos filtros e tabela limpa em `oportunidades.schema.ts`, `oportunidades.service.ts` e `src/app/oportunidades/page.tsx`**
  1. Adicionar `segmento` e `subsegmento` em `oportunidadesFilterSchema` e filtrar correspondente em `listOportunidades` (`buildPrismaWhere` e `matchesFilters`).
  2. Carregar as preferências do Tenant (`GET /api/tenant/preferencias`) em `src/app/oportunidades/page.tsx` para popular `"Segmento / Ramo"`, `"Sub-segmento"` (filtrado estritamente pelo segmento selecionado + sub-segmentos habilitados pelo Tenant) e `"UF"`.
  3. Remover o Dropdown `"Parecer da IA"`, remover `TableToolbarSearch` (`"Filtrar tabela..."`), remover o botão `"Importar JSON"`, remover a coluna `"Parecer da IA"` de `headers`, ampliar as larguras de `"orgaoUF"` (`26%`) e `"miniResumo"` (`48%`), e renderizar apenas o texto limpo em `"miniResumo"`.

- [ ] **Step 4: Rodar o teste para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-oportunidades.test.tsx`
  Expected: PASS.

---

## Task 7: Dossiê da Oportunidade & Sincronização de Editais PNCP (`/oportunidades/[id]`)

**Files:**
- Modify: `src/server/services/oportunidades.service.ts`
- Create: `src/app/api/oportunidades/[id]/arquivos/sync-pncp/route.ts`
- Modify: `src/app/oportunidades/[id]/page.tsx`
- Test: `tests/unit/sprint-6-dossie.test.tsx`

- [ ] **Step 1: Escrever o teste RED para o Dossiê da Oportunidade (`tests/unit/sprint-6-dossie.test.tsx`)**
  Testar todos os requisitos do item `6 - Tela Dossie da Oportunidade` (Páginas 5 e 6 do `Sprint 6.pdf`):
  1. No cabeçalho do dossiê, **não existem** mais as tags `"Parecer IA:"` nem a tag de `"Tipo de sistema"` (`oportunidade.tipoSistemaCodigo`).
  2. **Não existem** mais os botões `"Abrir Edital Oficial no PNCP ↗"` (`data-testid="btn-link-pncp"`) e `"Portal de Disputa ↗"`.
  3. Na aba Visão Geral, **não existe** mais o card/seção `"Classificação do Tipo de Sistema"` (`select-tipo-sistema-dossie`).
  4. O título da aba de arquivos é exatamente `"Arquivos do Edital"`, **sem** mostrar a quantidade entre parênteses `()`.
  5. A aba `"Repositórios Similares"` (`data-testid="tab-repositorios"`) **não existe** mais.
  6. Dentro da aba `"Arquivos do Edital"`, existe o botão `"Buscar Edital"` (`data-testid="btn-buscar-edital-pncp"`). Ao clicar nele:
     - Exibe indicador de carregamento (`"Buscando arquivos do edital no PNCP..."`) enquanto consulta `POST /api/oportunidades/[id]/arquivos/sync-pncp`.
     - Após sincronizar os arquivos do PNCP via Cloudflare R2, lista os arquivos com checkboxes de seleção e botões para baixar os arquivos escolhidos ou `"Baixar Todos os Arquivos"`.

- [ ] **Step 2: Rodar o teste para confirmar falha (RED)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-dossie.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implementar endpoint `sync-pncp` e refatorar `src/app/oportunidades/[id]/page.tsx`**
  1. Em `src/server/services/oportunidades.service.ts`, implementar `buscarESincronizarArquivosEditalPncp(id, user, actorContext)`:
     - Extrai `cnpj`, `ano` e `sequencial` do `idPncp` (formato `CNPJ-1-SEQ/ANO` ou `numeroControlePNCP`).
     - Consulta `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos` (com fallback resiliente caso o PNCP demore ou caso o edital seja de homologação).
     - Registra/sincroniza os documentos oficiais na tabela `Arquivo` integrados ao Cloudflare R2 (`r2-storage.service.ts`) e registra `AuditLog` (`EDITAL_PNCP_SYNC`).
  2. Criar a rota `POST /api/oportunidades/[id]/arquivos/sync-pncp/route.ts`.
  3. Em `src/app/oportunidades/[id]/page.tsx`:
     - Remover tags `Parecer IA` e `tipoSistemaCodigo` do header.
     - Remover botões `"Abrir Edital Oficial no PNCP ↗"` e `"Portal de Disputa ↗"`.
     - Remover seção `"Classificação do Tipo de Sistema"`.
     - Renomear a Tab para `"Arquivos do Edital"` (sem parênteses).
     - Remover a Tab e o TabPanel de `"Repositórios Similares"`.
     - Adicionar na aba `"Arquivos do Edital"` o botão `"Buscar Edital"`, estado de loading (`InlineLoading`), seleção de arquivos (`Checkbox`) e botões `"Baixar Selecionados"` e `"Baixar Todos os Arquivos"`.

- [ ] **Step 4: Rodar o teste para confirmar sucesso (GREEN)**
  Run: `./node_modules/.bin/vitest run tests/unit/sprint-6-dossie.test.tsx`
  Expected: PASS.

---

## Task 8: Atualização de Testes Legados Impactados, Regressão Completa, Build & Deploy Staging

**Files:**
- Modify: `tests/unit/routes.test.ts`
- Modify: `tests/unit/sprint-1-oportunidades.test.ts`
- Modify: `tests/unit/sprint-2-frontend.test.tsx`
- Modify: `tests/unit/sprint-3-frontend.test.tsx`
- Modify: `tests/unit/sprint-7-masks-rbac-rules.test.ts`
- Modify: `tests/unit/sprint-saas-cadastro-and-login-shell.test.tsx`

- [ ] **Step 1: Atualizar asserções em testes unitários de sprints anteriores que verificavam elementos removidos/renomeados pela Sprint 6**
  Atualizar os testes legados para refletirem as novas regras de negócio da Sprint 6 (ex.: descrição da rota `/dashboard`, ausência de `"Top 4 Categorias de TI"`, ausência da aba `"Repositórios Similares"`, novo fluxo de Login Multi-Step e Cadastro em 2 etapas).

- [ ] **Step 2: Executar suíte completa de testes unitários e contratos (`QA_ag`)**
  Run: `npm test`
  Expected: 100% dos arquivos de teste e asserções passando (`0 failed`).

- [ ] **Step 3: Executar build de produção Next.js (`DevOps_ag`)**
  Run: `npm run build`
  Expected: `exit code 0` sem erros de compilação ou tipagem.

- [ ] **Step 4: Commit, Push, Deploy em Staging (`https://staging.aponta.cloud`) e Fechamento da Issue no GitHub (`Gerente de Projeto_ag`)**
  1. `git add -A && git commit -m "feat(sprint-6): implementa melhorias de cadastro, login multi-step, dashboard, oportunidades e dossie (Closes #<ISSUE_NUMBER>)"`
  2. `git push origin feat/saas-multi-tenant`
  3. Sincronizar schema no PostgreSQL de Staging (`prisma db push`) e aguardar conclusão `success` dos workflows CI/CD no GitHub Actions.
  4. Verificar que o usuário `opaonossopanificadora@gmail.com` autentica com sucesso em `https://staging.aponta.cloud/login` e fechar a Issue no GitHub com o relatório executivo do DoD.

