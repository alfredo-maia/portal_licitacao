# Diretrizes de Desenvolvimento, Governança e Squad Paperclip

Este arquivo e as regras em `.agents/rules/` são carregados **incondicionalmente (`always on`)** no início de qualquer sessão do Antigravity neste repositório.

> **Documento Mestre do Projeto:** [`docs/PRD.md`](file:///docs/PRD.md) (§11 e §12)  
> **Projeto no Paperclip:** `Portal de Licitações` (`83891ed1-1820-4cc8-9b40-2d3fd6840e03`)  
> **Rotina PNCP no Paperclip:** `Coleta PNCP (terça e sexta)` (`ac972837-0b35-4c18-9bd7-bb23d6ad7904`)

---

## 1. Mapeamento da Squad Autônoma no Paperclip

Ao operar neste repositório, o agente deve assumir e coordenar os papéis e skills da squad oficial:

* **`CEO_ag` / `Você`** (`fb74c3c0-1788-4a50-b4eb-a52183921a8c`): Aprovação estratégica de escopo e checkpoints.
* **`Gerente de Projeto_ag`** (`e4709d94-3d4d-43c4-8f62-98629e785c12`): Orquestração ágil, gestão de issues no GitHub e controle de DoD/DoR (`agile-sprint-orchestration`, `paperclip-board`, `definition-of-done-governance`).
* **`Arquiteto de Software_ag`** (`6ee7b192-bdd3-473b-b1e6-cf80fbd5ab9a`): Modelagem Prisma/Zod, ADRs, autorização `can()` e code reviews (`improve-codebase-architecture`, `schema-first-contracts`).
* **`Desenvolvedor Frontend_ag`** (`21130286-4f7f-4bee-959b-1e606787a2a3`): IBM Carbon Design System, UI Shell, Grid, acessibilidade WCAG e resolução de testes visuais (`carbon-design-system-react`, `frontend-tdd-green-workflow`).
* **`Desenvolvedor Backend_ag`** (`ae82a9b4-e510-4dce-b63d-5600b3e40fb7`): APIs Next.js App Router, Prisma ORM, camada de serviço e auditoria (`backend-tdd-green-workflow`, `postgres-prisma-patterns`).
* **`QA_ag`** (`545f6e57-8c2d-49ce-8dd7-32eba8795c0b`): Escrita antecipada de testes RED no Vitest/Playwright e validação final contra regressão (`qa-tdd-red-workflow`, `vitest-unit-and-contracts`).
* **`DevOps_ag`** (`68ab23bf-fb6c-410a-8a76-7f0a54a17f54`): Containers Docker, GitHub Actions CI/CD e builds de produção (`docker-nextjs-production`, `ci-cd-github-actions-automation`).

---

## 2. Regras Ativas do Repositório

1. **Governança de Issues no GitHub**: Veja [.agents/rules/github-issues-workflow.md](file:///.agents/rules/github-issues-workflow.md).
   - Nenhuma linha de código deve ser alterada ou criada sem uma Issue correspondente no GitHub criada via `gh issue create` com o template oficial (`Contexto`, `Comportamento Atual`, `Comportamento Esperado`, `Critérios de Aceite`).
   - Ao finalizar, marcar os checkboxes com `[x]`, adicionar comentário executivo de conclusão e fechar a issue via `gh issue close`.

2. **Ciclo TDD Estrito em 7 Etapas & Padrões de Projeto**: Veja [.agents/rules/tdd-development-workflow.md](file:///.agents/rules/tdd-development-workflow.md).
   - **Etapa 1:** Fatiamento e Issue no GitHub (`Gerente de Projeto_ag`).
   - **Etapa 2:** Schemas Prisma, contratos Zod e ADRs (`Arquiteto de Software_ag`).
   - **Etapa 3 (RED):** Especificação de testes automatizados no Vitest/Playwright (`QA_ag`).
   - **Etapa 4 (GREEN):** Implementação estrita do código de produção (`Devs Frontend & Backend`).
   - **Etapa 5:** Code Review técnico (`Arquiteto de Software_ag`).
   - **Etapa 6:** Validação final e suíte completa de regressão (`QA_ag`).
   - **Etapa 7:** Deploy de Preview, validação de build e fechamento de issue (`DevOps_ag` & `Gerente de Projeto_ag`).

3. **Padrões de Projeto de Software Obrigatórios**:
   - **Schema-First Design Pattern:** Validação em tempo de execução com schemas Zod unificados à tipagem estática TypeScript (`zero any`).
   - **Layered Architecture:** Separação estrita entre Rotas HTTP (`src/app/api/`), Camada de Serviço de Domínio (`src/server/services/`) e Persistência Prisma (`src/lib/prisma.ts`).
   - **Carbon Design System Tokens:** Uso exclusivo de componentes IBM Carbon e tokens CSS semânticos (`var(--cds-*)`), garantindo alternância perfeita entre temas Claro (`white`/`g10`) e Escuro (`g90`/`g100`).
   - **Isolamento de Marca:** Uso exclusivo de `APP_CONFIG.brandName` vindo de `src/config/brand.ts`. Proibido hardcode textual fora desse arquivo.
   - **Trilha de Auditoria:** Registro obrigatório na tabela `audit_log` para toda mutação crítica.
   - **Governança RBAC:** Autorização centralizada e exclusiva através da função `can(user, action, resource)` em `src/lib/rbac.ts`.
