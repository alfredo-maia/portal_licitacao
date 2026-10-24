# Especificação Técnica Operacional — Sprint 0 (Golden Template, Carbon Shell & TDD)

> **Épico no Paperclip:** `AV-25` (`f959e0f8-5844-4c1f-a2be-2401272e3177`)  
> **Documento Mestre:** `docs/PRD.md` (§2, §3, §7, §9, §11, §12)  
> **Workspace:** `/home/hermes/apps/portal_licitacao`

---

## 1. Convenções de Infraestrutura & Portas na VPS
Para evitar colisão com outros containers existentes na VPS:
- **PostgreSQL 16 (Docker Compose):**
  - Container: `portal-licitacao-db` (`postgres:16-alpine`)
  - Porta no Host: `15434:5432`
  - `DATABASE_URL` local/dev: `postgresql://pncp:pncp_secret_2026@localhost:15434/portal_licitacao?schema=public`
- **Aplicação Next.js 15 (Preview / Docker / Dev):**
  - Porta padrão de preview/produção na VPS: `3010` (`http://localhost:3010`)
- **Gerenciador de Pacotes:** `pnpm` (conforme `.github/workflows/ci.yml`).

---

## 2. Contratos Técnicos Obrigatórios da Sprint 0

### 2.1. Isolamento de Marca (`src/config/brand.ts`)
```typescript
export const APP_CONFIG = {
  brandName: process.env.NEXT_PUBLIC_APP_NAME || "Portal PNCP",
  shortName: "PNCP",
  tagline: "Inteligência e Gestão em Licitações Públicas",
  version: "1.0.0",
} as const;
```
- **Regra Estrita:** É proibido usar a string literal `"Portal PNCP"` fora de `src/config/brand.ts`. O teste automatizado do QA varre `src/` e falha se encontrar qualquer ocorrência hardcoded.

### 2.2. Contrato das 11 Rotas Oficiais (`src/config/routes.ts`)
A barra lateral (`SideNav` do Carbon) e o roteador App Router devem conter exatamente as 11 rotas na ordem abaixo:
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

Cada rota deve possuir sua página `page.tsx` correspondente no App Router renderizando dentro do UI Shell com título e estrutura Carbon sem erros.

### 2.3. Design System IBM Carbon & Tema Claro/Escuro
- Pacotes: `@carbon/react`, `@carbon/charts-react`, `@carbon/icons-react`, `@ibm/plex`.
- Fontes: **IBM Plex Sans** e **IBM Plex Mono**.
- **Tema Padrão:** Claro (`white` / `g10`).
- **Alternância de Tema:** Botão/seletor no `Header` global (`data-testid="theme-toggle"`) alternando entre Tema Claro (`white`/`g10`) e Tema Escuro (`g90`/`g100`), com persistência em `localStorage` (chave `pncp-theme`).
- **Header Global (`Header`):**
  - Nome da aplicação vindo de `APP_CONFIG.brandName`.
  - Sino de notificações (`data-testid="notifications-bell"`) com badge numérico.
  - Seletor de tema (`data-testid="theme-toggle"`).
  - Avatar/menu de perfil do usuário (`data-testid="user-profile-action"`).

### 2.4. Banco de Dados, Prisma Schema & Audit Log (`prisma/schema.prisma`)
Modelos obrigatórios na Sprint 0:
- `User` (`id`, `name`, `email` unique, `passwordHash`, `role` enum `DIRETORIA | ANALISTA_COMERCIAL | OPERADOR`, `ativo`, `createdAt`, `updatedAt`)
- `Account` e `Session` (compatíveis com Auth.js / NextAuth)
- `Licitacao` (modelo base com `id`, `idPncp` unique, `numeroEdital`, `orgaoNome`, `orgaoCnpj`, `uf`, `modalidade`, `miniResumo`, `resumo`, `valorEstimado`, `dataAbertura`, `status`, `parecerIA`, `createdAt`, `updatedAt`)
- `AuditLog` (`id`, `ocorridoEm`, `usuarioId`, `usuarioNome`, `ip`, `acao`, `entidadeTipo`, `entidadeId`, `antes` Json?, `depois` Json?, mapeado para `@@map("audit_log")`)

**Extensão/Middleware de Auditoria (`src/lib/prisma.ts` / `src/server/audit.ts`):**
- Função/extensão que intercepta ou registra automaticamente mutações (`create`, `update`, `delete`) na tabela `audit_log`.

### 2.5. Autenticação (Auth.js) & RBAC (`src/server/auth/`)
- Provedor `Credentials` validando e-mail e senha com `bcryptjs`.
- Seed (`prisma/seed.ts`) provisionando obrigatoriamente os 2 diretores:
  1. `vitorhenrique018@gmail.com` (Perfil: `DIRETORIA`, Nome: `Vítor Henrique`)
  2. `alfredosouza100@gmail.com` (Perfil: `DIRETORIA`, Nome: `Alfredo Maia`)
  *(Usar variável `SEED_DIRECTOR_PASSWORD` com fallback seguro para ambiente de teste/dev).*
- Função de autorização RBAC: `can(user, action, resource)` em `src/lib/rbac.ts`.

### 2.6. Scripts Obrigatórios no `package.json`
Para compatibilidade com `.github/workflows/ci.yml` e validação do QA:
- `pnpm run lint`
- `pnpm run typecheck` (`tsc --noEmit`)
- `pnpm run test` (`vitest run`)
- `pnpm run test:e2e` (`playwright test`)
- `pnpm run build` (`next build`)
- `pnpm run db:seed`
