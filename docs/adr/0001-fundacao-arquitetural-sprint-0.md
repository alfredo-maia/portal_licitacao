# ADR 0001 — Fundação Arquitetural, Contratos Schema-First e Isolamento de Marca (Sprint 0)

- **Status:** Aceito
- **Data:** 2026-10-24
- **Autor:** `Arquiteto de Software_ag`
- **Issue Relacionada:** `AV-26` (Épico `AV-25` — Sprint 0)

---

## 1. Contexto
O projeto do Portal de Licitações demanda uma arquitetura web corporativa resiliente, tipada de ponta a ponta (`strict: true`, zero `any`), construída sob o ciclo de TDD estrito (Arquitetura $\rightarrow$ QA RED $\rightarrow$ Devs GREEN $\rightarrow$ Code Review $\rightarrow$ QA Regressão $\rightarrow$ Deploy Preview).

## 2. Decisões Arquiteturais

### 2.1. Stack Principal & UI
- **Framework:** Next.js 15 (App Router) sobre Node.js 24 e `pnpm`.
- **Design System:** IBM Carbon Design System (`@carbon/react`, `@carbon/icons-react`, `@carbon/charts-react`, `@ibm/plex`), com suporte nativo aos temas Claro (`white`/`g10` — padrão) e Escuro (`g90`/`g100`) persistidos na chave `pncp-theme` (`src/types/theme.ts`).

### 2.2. Desacoplamento Estrito de Marca (`src/config/brand.ts`)
- Toda referência textual ao nome da aplicação deve consumir exclusivamente `APP_CONFIG.brandName` exportado por `src/config/brand.ts`.
- Nenhuma ocorrência literal do nome provisório é permitida em componentes, páginas, serviços ou schemas fora de `src/config/brand.ts`.

### 2.3. Contrato Canônico das 11 Rotas (`src/config/routes.ts`)
- As 11 rotas oficiais são declaradas em ordem imutável (`order: 1..11`) em `src/config/routes.ts`, exportadas como `APP_ROUTES`, `ROUTES` e `OFFICIAL_ROUTES`.
- A rota 9 (`/robo-de-lances`) carrega os metadados `badge: "Em breve"` e `isPlaceholder: true`.

### 2.4. Persistência, RBAC e Trilha de Auditoria Imutável
- **ORM & Banco:** Prisma ORM 5.22 sobre PostgreSQL 16 (`localhost:15434`).
- **Modelos Base (`prisma/schema.prisma`):** `User`, `Account`, `Session`, `Licitacao` e `AuditLog` (`@@map("audit_log")`).
- **RBAC (`src/lib/rbac.ts`):** Autorização centralizada via `can(user, action, resource)` cobrindo os perfis `DIRETORIA`, `ANALISTA_COMERCIAL` e `OPERADOR`.
- **Contratos Zod (`src/server/schemas/`):** Validação em tempo de execução para `brand`, `routes`, `rbac`, `audit`, `auth` e `licitacao`.

## 3. Consequências
- O `QA_ag` (`AV-27`) dispõe de todos os tipos, schemas e contratos exportados sem erros de compilação para elaborar a suíte de testes RED (Vitest e Playwright).
- Os desenvolvedores Backend (`AV-28`) e Frontend (`AV-29`) implementam o código de produção guiados pelos contratos estritos até atingir o estado GREEN.
