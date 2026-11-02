# Diretrizes de Desenvolvimento, Governança e Squad Paperclip

Este arquivo e as regras em `.agents/rules/` são carregados **incondicionalmente (`always on`)** no início de qualquer sessão do Antigravity neste repositório.

> **Documento Mestre do Produto:** [`docs/PRD.md`](file:///docs/PRD.md) (histórico inicial em §11 e §12)  
> **Projeto no Paperclip:** `Portal de Licitações` (`83891ed1-1820-4cc8-9b40-2d3fd6840e03`)  
> **Workspace no Paperclip:** `08185a70-af0a-4f1b-94a6-198a2917ed19` (`/home/hermes/apps/portal_licitacao`)  
> **Repositório Git (código e PRs):** `https://github.com/alfredo-maia/portal_licitacao.git`  
> **Rotina PNCP no Paperclip:** `Coleta PNCP (terça e sexta)` (`ac972837-0b35-4c18-9bd7-bb23d6ad7904`)

---

## 1. Mapeamento da Squad no Paperclip

Ao operar neste repositório, cada agente atua conforme seu papel, atribuições e comandos roteados em `docs/agents/skill-routing.json`:

* **Direção Humana / Alçadas (`Alfredo` e `Vítor`, com `Mr. Goku` `fb74c3c0-1788-4a50-b4eb-a52183921a8c` no apoio executivo):** Aprovação estratégica de escopo, merge, deploy em produção e compromissos externos conforme `GOVERNANCE.md`.
* **`Mr. Shikamaru` — Entrada e Acompanhamento / Gerente de Projeto** (`e4709d94-3d4d-43c4-8f62-98629e785c12`): Porta de entrada e dono de acompanhamento das demandas de desenvolvimento, triagem no Paperclip (`/triage`), divisão em entregas verticais (`/to-tickets`, `/wayfinder`) e coordenação de capacidade.
* **`Mr. Kakashi` — Dono Técnico / Head de Engenharia / Tech Lead** (`6ee7b192-bdd3-473b-b1e6-cf80fbd5ab9a`): Liderança técnica, definição da menor rota suficiente (`av-fluxo-enxuto`), modelagem Prisma/Zod, ADRs (`docs/adr/`), autorização `can()`, condução de especificações e arquitetura (`/to-spec`, `/implement-spec`, `/codebase-design`, `/improve-codebase-architecture`) e revisão de Standards (`/code-review`).
* **`Ms. Hinata` & `Mr. Neji` — Negócios e Requisitos** (`c5761c8a-8b63-43ad-9545-462019f8ba01` / `d4ff6330-89d3-4476-bb7b-6301a4dc9ae6`): Alinhamento de decisões abertas (`/grill-with-docs`, `/grilling`), modelagem de vocabulário de domínio (`GLOSSARY.md` via `/domain-modeling`) e especificação verificável (`/to-spec`).
* **`Mr. Vegeta` — Desenvolvedor Backend** (`ae82a9b4-e510-4dce-b63d-5600b3e40fb7`): Implementação backend com TDD (`/implement`, `/tdd`), APIs Next.js App Router, Prisma ORM, camada de serviço, validação Zod e trilha de auditoria (`audit_log`).
* **`Mr. Sasuke` — Desenvolvedor Frontend** (`21130286-4f7f-4bee-959b-1e606787a2a3`): Implementação frontend com TDD (`/implement`, `/tdd`), IBM Carbon Design System, UI Shell, Grid, acessibilidade WCAG 2.1 AA e design/refinamento visual (`/ui-ux-pro-max`, `/frontend-design`, `/impeccable`, `/web-design-guidelines`).
* **`Ms. Sakura` — QA Independente** (`545f6e57-8c2d-49ce-8dd7-32eba8795c0b`): Revisão independente de Spec/QA no SHA final (`/code-review`), validação de critérios de aceitação (`SPEC`/`AC`), regressão no Vitest/Playwright e auditoria de interface.
* **`Mr. Piccolo` — Infraestrutura / DevOps** (`68ab23bf-fb6c-410a-8a76-7f0a54a17f54`, com `Mr. Krillin` `b2948725-00d1-43f6-844d-2e152c7269c8` em diagnóstico operacional): Containers Docker, PostgreSQL, Caddy, pipelines GitHub Actions CI/CD, builds de produção e diagnóstico de infraestrutura (`/diagnosing-bugs`).

---

## 2. Regras Ativas do Repositório

1. **Rastreador Único no Paperclip**: Veja [`docs/agents/issue-tracker.md`](file:///docs/agents/issue-tracker.md).
   - O **Paperclip** (`projectId`: `83891ed1-1820-4cc8-9b40-2d3fd6840e03`) é o único rastreador de tarefas, especificações, documentos (`spec`, `plan`), subtarefas (`parentId`) e bloqueios (`blockedByIssueIds`).
   - O GitHub (`alfredo-maia/portal_licitacao`) hospeda exclusivamente o código e Pull Requests. Não crie nem exija GitHub Issues (`gh issue create`).

2. **Fluxo Enxuto (`av-fluxo-enxuto`) & TDD Real**: Veja [`.agents/rules/tdd-development-workflow.md`](file:///.agents/rules/tdd-development-workflow.md).
   - **Rota proporcional:** `Mr. Kakashi` define a menor rota suficiente conforme o risco da demanda; PM, arquitetura e DevOps participam apenas quando necessário.
   - **Requisitos e SPEC:** Decisões abertas passam por `Ms. Hinata`/`Mr. Neji` (`/grill-with-docs`); requisitos fechados viram especificação verificável (`/to-spec`) e, quando cabível, tickets verticais (`/to-tickets`).
   - **TDD pelo Desenvolvedor (`RED` $\rightarrow$ `GREEN`):** `Mr. Vegeta` (backend) e `Mr. Sasuke` (frontend) executam `/implement` e `/tdd`, escrevendo primeiro o teste automatizado que falha pelo motivo esperado (`RED`) nas fronteiras públicas e implementando o código mínimo para passar (`GREEN`).
   - **Revisão de Standards e QA Independente:** `Mr. Kakashi` revisa Standards; `Ms. Sakura` executa o Spec/QA independente em tarefa separada no mesmo SHA final.
   - **Preflight obrigatório:** Antes de `/implement`, `/tdd` ou `/implement-spec`, valide o ambiente e a atribuição com `python3 scripts/check_agent_setup.py --command <comando>`.

3. **Padrões de Projeto de Software Obrigatórios**:
   - **Schema-First Design Pattern:** Validação em tempo de execução com schemas Zod (`src/server/schemas/`) unificados à tipagem estática TypeScript (`zero any`).
   - **Layered Architecture:** Separação estrita entre Rotas HTTP (`src/app/api/`), Camada de Serviço de Domínio (`src/server/services/`) e Persistência Prisma (`src/lib/prisma.ts`).
   - **Carbon Design System Tokens:** Uso exclusivo de componentes IBM Carbon e tokens CSS semânticos (`var(--cds-*)`), garantindo alternância perfeita entre temas Claro (`white`/`g10`) e Escuro (`g90`/`g100`).
   - **Isolamento de Marca:** Uso exclusivo de `APP_CONFIG.brandName` vindo de `src/config/brand.ts`. Proibido hardcode textual fora desse arquivo.
   - **Trilha de Auditoria:** Registro obrigatório na tabela `audit_log` (`src/server/audit.ts`) para toda mutação crítica.
   - **Governança RBAC:** Autorização centralizada e exclusiva através da função `can(user, action, resource)` em `src/lib/rbac.ts`.

---

## Agent skills

### Issue tracker

Issues, especificações, documentos e dependências deste projeto são rastreados exclusivamente no Paperclip (`projectId`: `83891ed1-1820-4cc8-9b40-2d3fd6840e03`, `workspaceId`: `08185a70-af0a-4f1b-94a6-198a2917ed19`, `/home/hermes/apps/portal_licitacao`). See `docs/agents/issue-tracker.md`.

### Triage labels

Cinco etiquetas canônicas de triagem (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), duas categorias (`bug`, `enhancement`) e cinco etiquetas `/wayfinder` cadastradas com seus IDs reais no Paperclip. See `docs/agents/triage-labels.md`.

### Domain docs

Layout `single-context` com `GLOSSARY.md` (sob demanda) na raiz do repositório, ADRs em `docs/adr/` e histórico em `docs/PRD.md` e `docs/sprints/`. See `docs/agents/domain.md`.
