# 📊 Relatório Executivo de Checkpoint — Sprint 0

> **Projeto:** Portal de Licitações (`83891ed1-1820-4cc8-9b40-2d3fd6840e03`)  
> **Épico:** `AV-25` — *[Sprint 0] Golden Template, IBM Carbon Shell & Fundação Técnica TDD*  
> **Data da Entrega:** 24/10/2026  
> **Gerente de Projeto:** `Gerente de Projeto_ag` (`e4709d94-3d4d-43c4-8f62-98629e785c12`)  
> **Status dos Testes & CI/CD:** 🟢 **100% GREEN** (Vitest + Playwright E2E + GitHub Actions CI/CD)

---

## 1. Links de Preview na VPS (Ativos e Validados — HTTP 200 OK)

- 🌐 **Preview Principal (Porta Direta VPS):** [http://paperclip.aponta.cloud:3010/dashboard](http://paperclip.aponta.cloud:3010/dashboard)
- 🔒 **Preview HTTPS (Caddy Reverse Proxy):** [https://chatwoot.aponta.cloud/dashboard](https://chatwoot.aponta.cloud/dashboard)
- 🔑 **Tela de Autenticação (Auth.js):** [http://paperclip.aponta.cloud:3010/login](http://paperclip.aponta.cloud:3010/login)
- 🖥️ **Acesso Interno VPS:** `http://localhost:3010/dashboard`

### Credenciais Provisionadas (Seed Idempotente da Diretoria)
1. **Vítor Henrique:** `vitorhenrique018@gmail.com` | Perfil: `DIRETORIA`
2. **Alfredo Maia:** `alfredosouza100@gmail.com` | Perfil: `DIRETORIA`

---

## 2. Resumo Executivo das Entregas da Sprint 0

Todos os 7 entregáveis obrigatórios da Sprint 0 foram construídos sob **TDD estrito** (Arquitetura → Testes RED → Implementação GREEN → Code Review → Validação QA → Deploy DevOps):

| # | Entregável Obrigatório | Evidência Técnica no Repositório | Status |
| :-: | :--- | :--- | :-: |
| **1** | **Next.js 15 App Router & TypeScript Estrito** | `tsconfig.json` (`strict: true`, alias `@/*`), `next.config.ts` (`output: "standalone"`), build de 16 rotas estáticas/dinâmicas em produção. | ✅ Concluído |
| **2** | **IBM Carbon Design System & Tema Claro/Escuro** | `@carbon/react`, `@carbon/icons-react`, `@carbon/charts-react`, fontes `IBM Plex Sans` e `IBM Plex Mono` (`src/app/globals.scss`) e `ThemeProvider` (`src/providers/theme-provider.tsx`) com Tema Claro (`white`/`g10`) padrão e alternador (`data-testid="theme-toggle"`) para Tema Escuro (`g90`/`g100`) persistido em `localStorage['pncp-theme']`. | ✅ Concluído |
| **3** | **UI Shell Raiz (`Header` + `SideNav` com 11 Rotas)** | `src/components/shell/app-shell.tsx` com título via `APP_CONFIG.brandName`, sino de notificações com badge (`data-testid="notifications-bell"`), alternador de tema, avatar de perfil (`data-testid="user-profile-action"`) e `SideNav` colapsável mapeando as 11 rotas oficiais. | ✅ Concluído |
| **4** | **Isolamento Estrito de Marca (`Brand Token`)** | `src/config/brand.ts` centralizando `APP_CONFIG`. Varredura estática automatizada (`tests/unit/brand.test.ts`) garante zero ocorrências da string literal fora de `src/config/brand.ts`. | ✅ Concluído |
| **5** | **Autenticação Auth.js (NextAuth) & RBAC** | Provedor `Credentials` com `bcryptjs` (`src/server/auth/`), página `/login` Carbon, autorização unificada `can(user, action, resource)` (`src/lib/rbac.ts`) e seed idempotente dos 2 diretores (`prisma/seed.ts`). | ✅ Concluído |
| **6** | **PostgreSQL 16 + Prisma ORM + Trilha `audit_log`** | Container `portal-licitacao-db` (`postgres:16-alpine` na porta `15434`), `prisma/schema.prisma` (`User`, `Account`, `Session`, `Licitacao`, `AuditLog`) e interceptador/registro imutável em `audit_log` (`src/server/audit.ts` / `src/lib/prisma.ts`). | ✅ Concluído |
| **7** | **Infraestrutura TDD (Vitest + Playwright) & CI/CD** | 18 testes unitários/integração no Vitest (`4 passed`) + 3 fluxos E2E no Playwright Chromium (`3 passed`), `Dockerfile` multi-stage e workflows GitHub Actions `CI` e `CD (Produção)` 100% verdes. | ✅ Concluído |

---

## 3. Mapeamento Validado das 11 Rotas Oficiais (`SideNav`)

1. `/dashboard` — **Dashboard**
2. `/oportunidades` — **Oportunidades**
3. `/minhas-licitacoes` — **Minhas Licitações**
4. `/calendario` — **Calendário**
5. `/portais` — **Portais de Licitações**
6. `/documentacao` — **Documentação**
7. `/declaracoes` — **Declarações**
8. `/impugnacoes` — **Impugnações**
9. `/robo-de-lances` — **Robô de Lances** *(com badge visual `"Em breve"`)*
10. `/notificacoes` — **Notificações**
11. `/configuracoes` — **Configurações**

---

## 4. Rastreabilidade da Esteira TDD no Paperclip

- **[AV-26](/AV/issues/AV-26)** — *Etapa 1 (Arquitetura)* — `Arquiteto de Software_ag` — Commit `2d1473e` (`done`)
- **[AV-27](/AV/issues/AV-27)** — *Etapa 2 (TDD RED - QA)* — `QA_ag` — Commit `7623901` (`done`)
- **[AV-28](/AV/issues/AV-28)** — *Etapa 3A (TDD GREEN Backend)* — `Desenvolvedor Backend_ag` — Commit `478698e` (`done`)
- **[AV-29](/AV/issues/AV-29)** — *Etapa 3B (TDD GREEN Frontend)* — `Desenvolvedor Frontend_ag` — Commit `0929007` (`done`)
- **[AV-30](/AV/issues/AV-30)** — *Etapa 4 (Code Review Técnico)* — `Arquiteto de Software_ag` — Commit `f57c373` (`done`)
- **[AV-31](/AV/issues/AV-31)** — *Etapa 5 (QA Validação 100% GREEN)* — `QA_ag` — 18 testes Vitest + 3 suítes E2E Playwright (`done`)
- **[AV-32](/AV/issues/AV-32)** — *Etapa 6 (DevOps CI/CD & Deploy Preview VPS)* — `DevOps_ag` — Commits `cf0f163`, `b8b2f98` (`done`)

---

## 5. Solicitação de Aprovação de Checkpoint (Diretoria)

Solicitamos a validação e aprovação formal da Diretoria (**Vítor / Alfredo / `CEO_ag`**) sobre a entrega da **Sprint 0** para destravamento imediato do backlog da **Sprint 1 (Ingestão de Dados v2 `POST /api/ingestao` & Central de Oportunidades GO/No-GO)**.
