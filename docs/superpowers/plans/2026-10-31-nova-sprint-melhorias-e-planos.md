# Nova Sprint — Melhorias de Autenticação, Multi-CNPJ, Planos, Oportunidades, Dossiê e Módulos Operacionais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar todas as melhorias e correções especificadas no documento `Nova Sprint.pdf` (Páginas 1 a 7), abrangendo proteção estrita de rotas pós-logout, fluxo `/esqueci-senha` com rate limit e prevenção de enumeração, trava de UF/Segmento no `/cadastro`, reforma completa de `/configuracoes` (Meu Perfil em 3 cards + ViaCEP, Multi-CNPJ + regras de plano, Equipe com limites e remoção de Operador Técnico/Auditoria), nova tela `/planos` com modo somente-leitura pós-carência, melhorias na tabela e filtro de sub-segmentos em `/oportunidades`, refatoração do dossiê `/oportunidades/[id]` (contador de IA, isolamento de equipe, busca real de edital no PNCP e upload sem ZIP), e ajustes em `/portais`, `/calendario`, `/documentacao` e `/declaracoes`.

**Architecture:** Evolução da arquitetura Next.js App Router + Prisma ORM + Zod (`Schema-First`) + IBM Carbon Design System (`@carbon/react`), mantendo isolamento estrito multi-tenant por `activeTenantId` (CNPJ ativo) e governança RBAC em `src/lib/rbac.ts`.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (`zero any`), Prisma ORM (PostgreSQL), NextAuth + JWT Cookie, IBM Carbon Design System (`@carbon/react`), Vitest + Testing Library.

---

## Governança Inicial (Etapa 1 do Ciclo TDD — `AGENTS.md`)

- [ ] **Step 0: Criar a Issue oficial no GitHub antes de qualquer alteração de código**
  - Executar `gh issue create` com o template obrigatório (`Contexto`, `Comportamento Atual`, `Comportamento Esperado`, `Critérios de Aceite`) cobrindo os 9 blocos da `Nova Sprint.pdf`.

---

## Task 1: Autenticação Estrita Pós-Logout, Tela `/esqueci-senha` e Trava de UF/Segmento no `/cadastro`

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/components/shell/app-shell.tsx`
- Create: `src/server/schemas/esqueci-senha.schema.ts`
- Create: `src/server/services/esqueci-senha.service.ts`
- Create: `src/app/api/auth/esqueci-senha/route.ts`
- Create: `src/app/esqueci-senha/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/cadastro/page.tsx`
- Test: `src/middleware.test.ts`
- Test: `src/server/services/esqueci-senha.service.test.ts`
- Test: `src/app/cadastro/page.test.tsx`

### Especificação Técnica (Task 1)

1. **Proteção de Rotas e Logout Real (`src/middleware.ts` & `src/components/shell/app-shell.tsx`):**
   - Atualizar `src/middleware.ts` para interceptar todas as rotas de páginas da aplicação (`matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]`).
   - Rotas públicas permitidas sem sessão: `/login`, `/cadastro`, `/esqueci-senha`.
   - Qualquer outra rota sem cookie de sessão válido (`next-auth.session-token`, `__Secure-next-auth.session-token` ou `portal_licitacao_token`) deve redirecionar (`307`) imediatamente para `/login`.
   - Em `src/components/shell/app-shell.tsx`:
     - Incluir `/esqueci-senha` junto com `/login` e `/cadastro` nas rotas que renderizam sem o `Header`/`SideNav` corporativo (`isPublicAuthRoute`).
     - Remover o fallback visual `usuario@empresa.com.br`; no clique em `"Sair"`, limpar `localStorage`, expirar `portal_licitacao_token` via endpoint de logout e chamar `signOut({ callbackUrl: "/login" })`.

2. **Fluxo `/esqueci-senha` com Rate Limit (2 tentativas / 15 min) e Anti-Enumeração:**
   - Criar `src/server/schemas/esqueci-senha.schema.ts` validando `{ email: z.string().email() }`.
   - Criar `src/server/services/esqueci-senha.service.ts`:
     - Rate limiter determinístico por chave (`email.toLowerCase()` + `ip`): máximo de **2 solicitações a cada 15 minutos** (`15 * 60 * 1000` ms). Na 3ª tentativa dentro da janela, retornar `{ ok: false, code: "RATE_LIMIT_EXCEEDED", message: "Limite de 2 tentativas a cada 15 minutos atingido. Aguarde alguns minutos antes de tentar novamente." }` com status `429`.
     - **Anti-Enumeração:** Se o e-mail existir no banco (`prisma.user.findUnique`), gerar código/senha temporária e disparar o envio; se **não existir**, **não revelar** que o e-mail não existe e retornar exatamente o mesmo payload de sucesso: `{ ok: true, message: "Enviamos as instruções de recuperação para o seu e-mail. Verifique sua caixa de entrada e spam." }`.
   - Criar `src/app/api/auth/esqueci-senha/route.ts` (`POST`) e a página `src/app/esqueci-senha/page.tsx` com layout centralizado (idêntico ao `/login`), campo único de `E-mail`, alertas de sucesso/rate-limit e link para voltar ao `/login`.
   - Adicionar link `"Esqueci minha senha"` em `src/app/login/page.tsx` apontando para `/esqueci-senha`.

3. **Trava do Botão na Etapa 2 de `/cadastro` (`src/app/cadastro/page.tsx`):**
   - O botão `"Começar Teste de 14 Dias Grátis"` na Etapa 2 deve ter `disabled={carregando || segmentos.length === 0 || (ufs.length === 0 && !brasilInteiro)}` (garantindo que se o usuário desmarcar Brasil Inteiro e não escolher nenhuma UF, ou não escolher nenhum segmento, o botão fica bloqueado).
   - O cadastro só persiste no banco ao clicar nesse botão na Etapa 2 (`POST /api/cadastro`).

### Steps (Task 1)

- [x] **Step 1.1 (RED):** Escrever testes unitários em `src/middleware.test.ts` (bloqueio de rotas autenticadas sem sessão e liberação de `/login`, `/cadastro`, `/esqueci-senha`), `src/server/services/esqueci-senha.service.test.ts` (anti-enumeração para e-mail inexistente + bloqueio na 3ª tentativa em 15 minutos) e `src/app/cadastro/page.test.tsx` (botão desabilitado quando `ufs.length === 0 && !brasilInteiro`).
- [x] **Step 1.2 (Run RED):** Rodar `npx vitest run src/middleware.test.ts src/server/services/esqueci-senha.service.test.ts src/app/cadastro/page.test.tsx` e confirmar falha esperada.
- [x] **Step 1.3 (GREEN):** Implementar `src/middleware.ts`, `src/server/schemas/esqueci-senha.schema.ts`, `src/server/services/esqueci-senha.service.ts`, `src/app/api/auth/esqueci-senha/route.ts`, `src/app/esqueci-senha/page.tsx` e atualizar `src/app/login/page.tsx`, `src/app/cadastro/page.tsx` e `src/components/shell/app-shell.tsx`.
- [x] **Step 1.4 (Verify GREEN):** Rodar `npx vitest run src/middleware.test.ts src/server/services/esqueci-senha.service.test.ts src/app/cadastro/page.test.tsx` e confirmar 100% passando.

---

## Task 2: Reforma de `/configuracoes` (Tema Claro Padrão, Meu Perfil 3 Cards + ViaCEP, Multi-CNPJ + Regras de Plano, Equipe & RBAC)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/config/theme.ts`
- Modify: `src/components/shell/app-shell.tsx`
- Modify: `src/lib/rbac.ts`
- Modify: `src/server/schemas/configuracao.schema.ts`
- Modify: `src/server/services/configuracoes.service.ts`
- Create: `src/app/api/configuracoes/perfil/route.ts`
- Create: `src/app/api/configuracoes/tenants/route.ts`
- Create: `src/app/api/cep/[cep]/route.ts`
- Modify: `src/app/configuracoes/page.tsx`
- Test: `src/server/services/configuracoes.service.test.ts`
- Test: `src/app/configuracoes/page.test.tsx`

### Especificação Técnica (Task 2)

1. **Tema Claro por Padrão e Remoção da Preferência de Tema em `/configuracoes`:**
   - Em `src/config/theme.ts`, definir `DEFAULT_CARBON_THEME: CarbonThemeName = "white"`.
   - Em `src/app/configuracoes/page.tsx`:
     - Remover a frase `Front-only: Perfil, Dados da Empresa, Equipe (Anexo 4) e aba de Logs (conectada ao DB).`
     - Remover o bloco `"Preferência de Visualização (Tema)"` da aba Meu Perfil.
     - Remover a 4ª aba `"Trilha de Auditoria (Logs)"` para todos os clientes.

2. **Modelagem Prisma & Contratos Zod (`prisma/schema.prisma` & `src/server/schemas/configuracao.schema.ts`):**
   - Em `User`: adicionar campos opcionais `cpf String?`, `telefone String?`, `cep String?`, `logradouro String?`, `numero String?`, `complemento String?`, `bairro String?`, `cidade String?`, `uf String?`.
   - Em `ConfiguracaoEmpresa`: adicionar `inscricaoMunicipal String?`, `numero String?`, `complemento String?`, `bairro String?`.
   - Criar endpoint `GET /api/cep/[cep]` (consultando `https://viacep.com.br/ws/{cep}/json/` com fallback `https://brasilapi.com.br/api/cep/v1/{cep}`) retornando `{ ok: true, cep, logradouro, bairro, cidade, uf }`.

3. **Aba 1 — "Meu Perfil" (3 Cards + Card Sessão Ativa):**
   - **Card 1 — Dados Pessoais:** `Nome Completo`, `E-mail (Não pode ser alterado)` (`disabled`), `CPF` (máscara `000.000.000-00`), `Telefone / WhatsApp` (máscara `(00) 00000-0000`).
   - **Card 2 — Endereço:** `CEP` (auto-preenchimento via `/api/cep/[cep]` ao atingir 8 dígitos), `Rua / Logradouro`, `Número`, `Complemento`, `Bairro`, `Cidade`, `Estado (UF)`.
   - **Card 3 — Segurança:** `Nova Senha` (placeholder `"Digite para alterar a senha"`), `Confirmar Nova Senha` (placeholder `"Confirme a nova senha"`).
   - **Botão no canto inferior direito:** `"Salvar Meu Perfil"` (`PUT /api/configuracoes/perfil`), atualizando dados pessoais, endereço e hash Bcrypt da nova senha (se preenchida e coincidente).
   - Manter o card `"Sessão Ativa"` ao lado.

4. **Aba 2 — "Dados da Empresa Licitante" (Multi-CNPJ, Regras de Plano e ViaCEP):**
   - **Seletor Multi-CNPJ no topo:**
     - `Select` exibindo todas as empresas vinculadas ao usuário no formato `${razaoSocial} - ${cnpj}`. Ao alternar, invoca `POST /api/configuracoes/tenants` (ou atualiza `activeTenantId` na sessão/cookie) e recarrega todos os dados da empresa selecionada (impactando declarações, oportunidades, portais e documentação).
     - Ao lado direito do `Select`, botão `"Adicionar CNPJ"`:
       - Se o plano permitir apenas 1 CNPJ (`billingStatus === "TRIAL"` ou `plano === "BASICO"` com `maxCnpjs <= 1`), botão fica `disabled` com tooltip/título: `"Faça upgrade do seu plano para cadastrar múltiplos CNPJs."`
       - Se estiver no plano `ENTERPRISE` (`maxCnpjs === 5`) e já possuir 5 CNPJs cadastrados, botão fica `disabled` com mensagem: `"Você atingiu o limite máximo de 5 CNPJs do plano Enterprise."`
       - Quando habilitado, abre modal para cadastrar novo CNPJ vinculado ao titular.
   - Remover a frase `Fonte única da verdade utilizada no auto-preenchimento das 8 Declarações Oficiais e Impugnações.`
   - **Seção Dados do CNPJ:** `Razão Social`, `CNPJ`, `Inscrição Estadual`, `Inscrição Municipal`, `CNAE Principal`.
   - **Seção Triagem & Escopo de Licitações (`Segmento`, `Sub-segmento` e `UF`):**
     - **Teste Grátis (`billingStatus === "TRIAL"`):** 1 CNPJ, mas permite selecionar múltiplos segmentos e todas as UFs.
     - **Plano Básico (`billingStatus === "ATIVO"` e `plano === "BASICO"`):** permite apenas **1 Segmento** e **1 UF** (não pode selecionar todas as UFs). Se o cliente veio do Teste Grátis com >1 segmento ou >1 UF, exibir `InlineNotification` (`kind="warning"`) pedindo para atualizar suas informações e definir por padrão a UF de origem da empresa e o primeiro segmento escolhido.
     - **Planos `PRO` e `ENTERPRISE`:** múltiplos segmentos e todas as UFs liberados.
   - **Seção Endereço da Sede:** `CEP` (com busca automática via `/api/cep/[cep]`), `Logradouro`, `Número`, `Complemento`, `Bairro`, `Cidade`, `Estado`.
   - Manter seções `Representante Legal` e `Dados Bancários`.

5. **Aba 3 — "Gestão da Equipe" (Proteção do Titular, Limite por Plano e Remoção de Operador Técnico):**
   - Renomear aba de `"Gestão da Equipe & RBAC"` para `"Gestão da Equipe"`.
   - Remover `(Anexo 4)` e a frase `Diretoria, Analistas Comerciais e Operadores Técnicos com segregação de funções.` e remover `(RBAC)` do modal.
   - **Regras de Governança de Membros (Frontend + Backend em `configuracoes.service.ts`):**
     - O criador da conta (`TenantUser.role === "TITULAR"`) é sempre membro da equipe com papel `DIRETORIA` e **não pode ser excluído nem modificado por nenhum outro usuário** (apenas ele mesmo pode editar seus dados pessoais em Meu Perfil).
     - **Nenhum usuário pode se auto-excluir ou se auto-inativar.**
     - **Apenas o Usuário Principal (`TITULAR`) pode inativar colaboradores.**
     - **Limite de Colaboradores por Plano (`maxUsers`):** Contando com o titular, se `totalUsuariosDoTenant >= tenant.maxUsers`, o botão `"Novo Colaborador"` fica `disabled` na UI e o backend retorna erro `403 PLAN_USER_LIMIT_REACHED` caso chamado diretamente.
   - **Modal `"Cadastrar Novo Colaborador"`:**
     - Campos: `Nome Completo`, `E-mail Corporativo`, `Papel no Sistema`, `Senha Provisória`.
     - No select `Papel no Sistema`: exibir `Diretoria (Titular)` como `disabled` (escuro/bloqueado) e `Analista Comercial` (`ANALISTA_COMERCIAL`) selecionado para todos os colaboradores.
     - Remover `Operador Técnico` (`OPERADOR`) das opções da UI e schemas de criação de colaborador.

### Steps (Task 2)

- [ ] **Step 2.1 (RED):** Escrever testes em `src/server/services/configuracoes.service.test.ts` cobrindo: atualização de Meu Perfil (CPF, endereço, senha), bloqueio de alteração do `TITULAR` por terceiros, proibição de auto-inativação, permissão de inativação restrita ao `TITULAR`, limite de usuários por plano (`maxUsers`), e normalização de 1 Segmento + 1 UF no Plano Básico.
- [ ] **Step 2.2 (Run RED):** Executar `npx vitest run src/server/services/configuracoes.service.test.ts` e confirmar falha.
- [ ] **Step 2.3 (GREEN):** Atualizar `prisma/schema.prisma`, `src/config/theme.ts`, `src/server/schemas/configuracao.schema.ts`, `src/server/services/configuracoes.service.ts`, criar as rotas `/api/cep/[cep]`, `/api/configuracoes/perfil`, `/api/configuracoes/tenants` e refatorar `src/app/configuracoes/page.tsx`.
- [ ] **Step 2.4 (Verify GREEN):** Executar `npx vitest run src/server/services/configuracoes.service.test.ts src/app/configuracoes/page.test.tsx` e confirmar todos os testes passando.

---

## Task 3: Nova Tela de `/planos`, Item na NavBar e Modo Somente-Leitura (Paywall Pós-Carência + Banner Global)

**Files:**
- Modify: `src/config/routes.ts`
- Modify: `src/components/shell/app-shell.tsx`
- Create: `src/lib/subscription-guard.ts`
- Create: `src/app/api/planos/status/route.ts`
- Create: `src/app/planos/page.tsx`
- Modify: `src/app/oportunidades/page.tsx`
- Modify: `src/app/documentacao/page.tsx`
- Modify: `src/app/portais/page.tsx`
- Modify: `src/app/declaracoes/page.tsx`
- Test: `src/lib/subscription-guard.test.ts`
- Test: `src/app/planos/page.test.tsx`

### Especificação Técnica (Task 3)

1. **Rota `/planos` na NavBar (`src/config/routes.ts` & `src/components/shell/app-shell.tsx`):**
   - Inserir a rota `{ id: "planos", label: "Planos", path: "/planos", iconName: "Money", group: "sistema", order: 10 }` entre `Notificações` (`order: 9`) e `Configurações` (`order: 11`) em `src/config/routes.ts`.
   - Adicionar o ícone `Money` (ou `Purchase`) no mapa `ICON_MAP` em `src/components/shell/app-shell.tsx`.

2. **Página `/planos` (`src/app/planos/page.tsx`):**
   - Exibir os 3 planos oficiais (`Básico`, `Pro`, `Enterprise`) em cards comparativos do Carbon Design System (`Tile`), detalhando:
     - **Básico:** 1 CNPJ, 1 UF, 1 Segmento, até 2 usuários, 20 análises IA/mês, 5 GB Cofre R2.
     - **Pro:** até 2 CNPJs, Brasil Inteiro (todas as UFs), múltiplos segmentos, até 5 usuários, 50 análises IA/mês, 20 GB Cofre R2.
     - **Enterprise:** até 5 CNPJs, Brasil Inteiro (todas as UFs), múltiplos segmentos, até 15 usuários, 200 análises IA/mês, 50 GB Cofre R2.
   - Destacar com Tag `"Plano Atual"` (ou `"Teste Grátis de 14 Dias Ativo — X dias restantes"`) o plano vigente do tenant logado.

3. **Guarda de Expiração e Modo Somente-Leitura (`src/lib/subscription-guard.ts`):**
   - Criar função pura `evaluateTenantAccess(tenant)` que verifica se:
     - `billingStatus === "BLOQUEADO"` ou `billingStatus === "CANCELADO"`, OU
     - `billingStatus === "TRIAL"` e `agora > trialFim + 3 dias de carência`, OU
     - `vencimentoAssinatura` expirou há mais de 3 dias de carência.
   - Quando `isReadOnly === true`:
     - **Banner Global no `AppShell`:** exibir barra de alerta crítica no topo de todas as páginas informando que o período de teste/assinatura expirou e orientando a acessar `/planos` ou entrar em contato para regularizar.
     - **Bloqueios de Ação (UI + API):**
       - Em `/oportunidades`: bloquear abertura do dossiê (`/oportunidades/[id]`).
       - Em `/documentacao` e `/portais`: desabilitar botões de criar, editar, nova versão e excluir (`POST`, `PATCH`, `DELETE` retornam `403 SUBSCRIPTION_READ_ONLY`).
       - Em `/declaracoes`: permitir visualização na tela, mas desabilitar os botões `Imprimir / PDF A4`, `Copiar Texto` e `Exportar .TXT`.

### Steps (Task 3)

- [ ] **Step 3.1 (RED):** Escrever testes unitários em `src/lib/subscription-guard.test.ts` (cálculo de trial ativo, período de carência de 3 dias e bloqueio somente-leitura após o 3º dia) e `src/app/planos/page.test.tsx` (renderização dos 3 planos e destaque do Plano Atual).
- [ ] **Step 3.2 (Run RED):** Executar `npx vitest run src/lib/subscription-guard.test.ts src/app/planos/page.test.tsx` e confirmar falha.
- [ ] **Step 3.3 (GREEN):** Implementar `src/lib/subscription-guard.ts`, `src/app/api/planos/status/route.ts`, `src/app/planos/page.tsx`, atualizar `src/config/routes.ts`, `src/components/shell/app-shell.tsx` e aplicar `isReadOnly` nas páginas e rotas de API de Documentação, Portais, Declarações e Oportunidades.
- [ ] **Step 3.4 (Verify GREEN):** Executar `npx vitest run src/lib/subscription-guard.test.ts src/app/planos/page.test.tsx` e `src/config/routes.test.ts`.

---

## Task 4: Refatoração da Tela `/oportunidades` e Filtro Inteligente de Sub-segmentos

**Files:**
- Modify: `src/server/schemas/segmentos.schema.ts`
- Modify: `src/server/services/oportunidades.service.ts`
- Modify: `src/server/services/busca-licitacoes.service.ts`
- Modify: `src/app/oportunidades/page.tsx`
- Test: `src/server/services/oportunidades.service.test.ts`
- Test: `src/app/oportunidades/page.test.tsx`

### Especificação Técnica (Task 4)

1. **Correção do Filtro `Select Sub-segmento` (`src/server/services/oportunidades.service.ts` & `src/server/schemas/segmentos.schema.ts`):**
   - Mapear palavras-chave semânticas por sub-segmento em `src/server/schemas/segmentos.schema.ts` (ex.: `"Medicamentos & Fármacos"` -> `["medicamento", "medicamentos", "farmaco", "fármaco", "remedio", "remédio", "comprimido", "ampola", "insulina", "dipirona", "antibiotico"]`, etc.).
   - Em `listarOportunidades` (`src/server/services/oportunidades.service.ts`), quando `query.subsegmento` for informado, filtrar licitações que possuam o código/label em `subcategorias` **OU** cujo `miniResumo` / `resumo` contenha qualquer uma das palavras-chave daquele sub-segmento (case-insensitive / sem acento). Assim, licitações como `76017458000115-1-000078/2024` (que tratam de medicamentos no resumo/edital) aparecem imediatamente ao filtrar por `"Medicamentos & Fármacos"`.

2. **Ajustes Visuais e Estruturais na Tabela de `/oportunidades` (`src/app/oportunidades/page.tsx`):**
   - Remover o botão de engrenagem (configurações da tabela) no `TableToolbar`.
   - Reduzir o tamanho do botão `"Adicionar Manualmente"` para `size="sm"`.
   - Remover os filtros/tags e textos `Participar - Recomendado`, `AVALIAR DIRETORIA`, `Não Participar` e remover a frase `e Deliberação (Participar / Não Participar)` do subtítulo da página.
   - Habilitar ordenação (`isSortable`) em todas as colunas da tabela (Data Limite, Órgão, UF, Objeto, Valor Estimado, etc.), suportando ordenação ascendente/descendente.
   - Remover a coluna de `Checkbox` (`TableSelectAll` / `TableSelectRow`) do lado esquerdo da coluna `Data Limite (Proposta)`.
   - Renomear o cabeçalho da coluna `Mini-resumo` para **`Objeto`** e exibir o objeto/título da licitação.
   - Ao passar o mouse sobre a linha/célula da licitação (`title` / tooltip customizado Carbon), exibir um mini-texto provisório com o **Resumo Detalhado do Objeto** limitado a **300 caracteres** (`resumo.slice(0, 300)`).

### Steps (Task 4)

- [ ] **Step 4.1 (RED):** Adicionar testes em `src/server/services/oportunidades.service.test.ts` (filtragem por sub-segmento `"saude_medicamentos"` / `"Medicamentos & Fármacos"` encontrando licitações por palavras-chave no resumo/objeto) e `src/app/oportunidades/page.test.tsx` (coluna `"Objeto"`, ausência de checkboxes, tooltip de até 300 caracteres, ausência de frases de deliberação).
- [ ] **Step 4.2 (Run RED):** Executar `npx vitest run src/server/services/oportunidades.service.test.ts src/app/oportunidades/page.test.tsx` e confirmar falha.
- [ ] **Step 4.3 (GREEN):** Atualizar `src/server/schemas/segmentos.schema.ts`, `src/server/services/oportunidades.service.ts` e `src/app/oportunidades/page.tsx`.
- [ ] **Step 4.4 (Verify GREEN):** Executar `npx vitest run src/server/services/oportunidades.service.test.ts src/app/oportunidades/page.test.tsx` e confirmar todos passando.

---

## Task 5: Refatoração do Dossiê `/oportunidades/[id]` (Contador IA, Equipe Isolada por Tenant, Busca Real de Edital no PNCP e Upload Restrito)

**Files:**
- Modify: `src/app/api/usuarios/route.ts`
- Modify: `src/server/services/dossie.service.ts`
- Modify: `src/app/api/licitacoes/[id]/arquivos/sync/route.ts`
- Modify: `src/app/api/licitacoes/[id]/arquivos/route.ts`
- Modify: `src/app/oportunidades/[id]/page.tsx`
- Test: `src/server/services/dossie.service.test.ts`
- Test: `src/app/oportunidades/[id]/page.test.tsx`

### Especificação Técnica (Task 5)

1. **Contador de Análises de IA no Botão `"Verificar Status de Participação"`:**
   - Calcular o total de análises de IA realizadas pelo tenant no mês corrente (`analisesUsadasMes`) e o limite do plano (`limiteAnalisesPlano`: Trial = 5, Básico = 20, Pro = 50, Enterprise = 200).
   - Exibir no botão: `Verificar Status de Participação (${analisesUsadasMes}/${limiteAnalisesPlano})` — ex.: `Verificar Status de Participação (2/20)`.

2. **Isolamento Multi-Tenant na `Equipe Operacional` (`src/app/api/usuarios/route.ts`):**
   - Atualizar `GET /api/usuarios` para ler `activeTenantId` da sessão autenticada e retornar **exclusivamente** os usuários vinculados ao `tenantId` do cliente logado (`where: { tenantMemberships: { some: { tenantId: activeTenantId, ativo: true } } }`). Nunca retornar usuários de outras empresas.

3. **Aba `Visão Geral & Dados Técnicos`:**
   - Remover o bloco/campo `"Modalidade & Formato de Disputa"`.

4. **Aba `Arquivos do Edital` — Busca Real no PNCP, Modal de Carregamento e Notificações:**
   - Em `buscarESincronizarArquivosEditalPncp` (`src/server/services/dossie.service.ts`):
     - Suportar extração de `{ cnpj, ano, sequencial }` tanto do formato `CNPJ-1-SEQUENCIAL/ANO` (`numeroControlePNCP` ou `idPncp`) quanto de `linkPncp` / `linkSistemaOrigem`.
     - Consultar `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencialInt}/arquivos`.
     - Diferenciar claramente os 3 cenários no retorno da API `POST /api/licitacoes/[id]/arquivos/sync`:
       1. `statusSync: "NENHUM_DOCUMENTO"` (total no PNCP = 0 e banco = 0): exibir notificação `"No momento não foram disponibilizados documentos para este edital."`
       2. `statusSync: "NOVOS_DOCUMENTOS"` (`sincronizados > 0`): salvar na tabela `Arquivo` (e cache R2 quando configurado, compartilhado para todos os clientes) e exibir `"Novos documentos foram disponibilizados no sistema."`
       3. `statusSync: "JA_ATUALIZADO"` (`totalExistentes > 0 && sincronizados === 0`): exibir `"Os documentos disponíveis já estão atualizados (são esses mesmos)."`
   - Em `src/app/oportunidades/[id]/page.tsx`:
     - Ao clicar em `"Buscar Edital"`, abrir um **Modal de Carregamento** (`Modal` passivo com `InlineLoading`: *"Consultando e sincronizando documentos do edital..."*).
     - Atualizar a frase de estado vazio para: `"Nenhum arquivo anexado a esta licitação até o momento. Clique em “Buscar Edital” para sincronizar os documentos oficiais."` (removendo `"do PNCP"`).

5. **Upload de Arquivos pelo Cliente (Bloqueio de `.ZIP` e Atualização Imediata da Lista):**
   - Permitir apenas `PDF`, `PNG`, `JPEG`/`JPG`, `DOC` e `DOCX` (`accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"`). Rejeitar arquivos `.zip` na validação de frontend e no backend (`POST /api/licitacoes/[id]/arquivos`).
   - Em `POST /api/licitacoes/[id]/arquivos`, suportar `multipart/form-data` (extraindo o `File` enviado pelo `FileDropZone`, salvando o arquivo e gravando no banco) **e** JSON, atualizando imediatamente `dossie.arquivos` na UI após o upload.

### Steps (Task 5)

- [ ] **Step 5.1 (RED):** Escrever testes em `src/server/services/dossie.service.test.ts` (3 cenários de retorno do sync PNCP, parse de `numeroControlePNCP`, bloqueio de `.zip` no upload) e `src/app/oportunidades/[id]/page.test.tsx`.
- [ ] **Step 5.2 (Run RED):** Executar `npx vitest run src/server/services/dossie.service.test.ts src/app/oportunidades/[id]/page.test.tsx` e confirmar falha.
- [ ] **Step 5.3 (GREEN):** Implementar as melhorias em `src/app/api/usuarios/route.ts`, `src/server/services/dossie.service.ts`, `src/app/api/licitacoes/[id]/arquivos/sync/route.ts`, `src/app/api/licitacoes/[id]/arquivos/route.ts` e `src/app/oportunidades/[id]/page.tsx`.
- [ ] **Step 5.4 (Verify GREEN):** Executar `npx vitest run src/server/services/dossie.service.test.ts src/app/oportunidades/[id]/page.test.tsx` e confirmar todos passando.

---

## Task 6: Ajustes em `/portais`, `/calendario`, `/documentacao` e `/declaracoes`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/server/auth-session.ts`
- Modify: `src/app/api/portais/route.ts`
- Modify: `src/app/api/portais/[id]/route.ts`
- Modify: `src/server/services/portais.service.ts`
- Modify: `src/app/portais/page.tsx`
- Modify: `src/server/schemas/calendario.schema.ts`
- Modify: `src/server/services/calendario.service.ts`
- Modify: `src/app/calendario/page.tsx`
- Modify: `src/app/api/documentos/route.ts`
- Modify: `src/app/api/documentos/[id]/route.ts`
- Modify: `src/server/services/documentos.service.ts`
- Modify: `src/app/declaracoes/page.tsx`
- Test: `src/server/services/calendario.service.test.ts`
- Test: `src/server/services/documentos.service.test.ts`
- Test: `src/app/declaracoes/page.test.tsx`

### Especificação Técnica (Task 6)

1. **Autenticação Unificada e Tela `/portais` (`src/app/portais/page.tsx` & `src/app/api/portais/route.ts`):**
   - Criar helper `getAuthenticatedUserAndTenant(request)` em `src/server/auth-session.ts` que resolve a sessão via NextAuth (`getServerSession(authOptions)`) ou fallback do JWT `portal_licitacao_token`, garantindo que nenhum cliente logado receba `UNAUTHORIZED` ao cadastrar portais, documentos ou declarações, e que qualquer membro autenticado do tenant possa criar/editar/excluir registros do seu CNPJ ativo.
   - Adicionar `tenantId String?` ao model `Portal` para isolamento por CNPJ ativo.
   - Em `src/app/portais/page.tsx`, remover os 2 checkboxes (`Aceita Robô de Lances` e `Exige Certificado Digital e-CNPJ`) da seção `Configurações Técnicas e Integrações` do modal.

2. **Alertas de Vencimento de Portais no `/calendario` (`src/server/services/calendario.service.ts` & `src/app/calendario/page.tsx`):**
   - Criar função `buscarPortaisVencendoNoMes(ano, mes, tenantId)` em `src/server/services/portais.service.ts`.
   - Em `getCalendarioData` (`src/server/services/calendario.service.ts`), buscar os portais com `dataVencimento` no mês consultado e incluí-los nos alertas do calendário (`alertasPortais` / mesclado aos indicadores de vencimento do dia na grade do `/calendario`), exibindo tag/alerta visual na célula do dia e no modal de detalhes do dia, exatamente como já ocorre para Documentação.

3. **Atualização de Versão (`V1`, `V2`, `V3`) em `/documentacao` (`src/server/services/documentos.service.ts` & `src/app/api/documentos/[id]/route.ts`):**
   - Em `listarDocumentos`: filtrar por padrão `status: "ATIVO"` (quando nenhum filtro de status específico for passado) e pelo `tenantId` ativo, para que os cards da listagem principal mostrem **apenas a versão ativa mais recente** (`V2`, `V3`) com os **novos dados de emissão, validade e arquivo**, enquanto as versões substituídas (`V1`) permanecem apenas no histórico de versões do documento.
   - Em `PATCH /api/documentos/[id]/route.ts`: suportar tanto `multipart/form-data` (upload de novo arquivo na atualização de versão) quanto `application/json`, repassando os novos metadados (`dataEmissao`, `dataVencimento`, `arquivoNome`, `arquivoUrl`, `arquivoTamanho`, `mimeType`) para `criarNovaVersao`.

4. **Tela `/declaracoes` (`src/app/declaracoes/page.tsx`):**
   - **Auto-carregamento inicial por Tenant Ativo:** Ao abrir a página `/declaracoes`, buscar imediatamente `/api/configuracoes/empresa` do CNPJ ativo na sessão e preencher todos os campos da empresa e a pré-visualização da Folha A4 (eliminando os valores estáticos hardcoded de `"Aponta Tecnologia e Serviços LTDA"` como estado inicial).
   - **Filtro do Select `Auto-preenchimento por Licitação do Pipeline`:** Buscar apenas as licitações do tenant que estejam nos 9 status permitidos:
     - `ACEITA` (*Participar*)
     - `ANALISE_TECNICA` (*Análise Técnica*)
     - `ANALISE_FINANCEIRA` (*Análise Financeira*)
     - `REVISAO_PROPOSTA` (*Revisão da Proposta*)
     - `ENVIADA` (*Enviada*)
     - `EM_DISPUTA` (*Em Disputa*)
     - `AGUARDANDO_RESULTADO` (*Aguardando Resultado*)
     - `CONTEMPLADA` (*Contemplada*)
     - `IMPUGNADA` (*Impugnada*)
   - **Posição dos Botões de Ação:** Mover os botões `Imprimir / PDF A4`, `Copiar Texto` e `Exportar .TXT` do topo para a parte inferior do formulário, alinhados ao lado direito do botão `Atualizar Folha A4`.
   - **Impressão em 1 Única Folha A4:** Ajustar o CSS `@media print` e espaçamentos internos da `.folha-a4-declaracao` (`@page { size: A4 portrait; margin: 12mm; }`, `max-height: 273mm`, `page-break-inside: avoid`, `break-inside: avoid`, tipografia e margens compactadas) para garantir que qualquer uma das 8 declarações seja impressa em **apenas 1 folha A4**.

### Steps (Task 6)

- [ ] **Step 6.1 (RED):** Escrever testes em `src/server/services/calendario.service.test.ts` (inclusão de vencimento de portais no calendário), `src/server/services/documentos.service.test.ts` (listagem retornando apenas a versão ativa `V2` com metadados novos e mantendo `V1` no histórico) e `src/app/declaracoes/page.test.tsx` (carregamento inicial com dados do tenant, filtro dos 9 status do pipeline e botões ao lado de `Atualizar Folha A4`).
- [ ] **Step 6.2 (Run RED):** Executar `npx vitest run src/server/services/calendario.service.test.ts src/server/services/documentos.service.test.ts src/app/declaracoes/page.test.tsx` e confirmar falha.
- [ ] **Step 6.3 (GREEN):** Implementar `src/server/auth-session.ts`, atualizar `src/app/api/portais/*`, `src/server/services/portais.service.ts`, `src/app/portais/page.tsx`, `src/server/services/calendario.service.ts`, `src/app/calendario/page.tsx`, `src/server/services/documentos.service.ts`, `src/app/api/documentos/*` e `src/app/declaracoes/page.tsx`.
- [ ] **Step 6.4 (Verify GREEN):** Executar `npx vitest run src/server/services/calendario.service.test.ts src/server/services/documentos.service.test.ts src/app/declaracoes/page.test.tsx` e confirmar todos passando.

---

## Task 7: Regressão Completa, Build de Produção, Deploy em Staging e Fechamento da Issue (Etapas 5, 6 e 7 — `AGENTS.md`)

- [ ] **Step 7.1:** Executar `npx prisma generate` e validar tipagem com `npx tsc --noEmit`.
- [ ] **Step 7.2:** Executar toda a suíte de testes automatizados (`npx vitest run`) garantindo 0 regressões.
- [ ] **Step 7.3:** Executar `npm run build` para validar o build de produção do Next.js.
- [ ] **Step 7.4:** Realizar commit semântico, push para `origin/feat/saas-multi-tenant`, atualizar o container em Staging (`staging.aponta.cloud`) aplicando as novas colunas no PostgreSQL e fechar a Issue no GitHub via `gh issue close`.

