# Governança da Squad Paperclip, Ciclo TDD Estrito & Padrões de Projeto

> **Documento Mestre do Projeto:** [`docs/PRD.md`](file:///docs/PRD.md) (§11 e §12)  
> **Projeto no Paperclip:** `Portal de Licitações` (`83891ed1-1820-4cc8-9b40-2d3fd6840e03`)  
> **Rotina PNCP no Paperclip:** `Coleta PNCP (terça e sexta)` (`ac972837-0b35-4c18-9bd7-bb23d6ad7904`)  
> **Aplicação desta Regra:** Obrigatória e ativa (`always on`) para todas as interações no repositório `portal_licitacao`.

---

## 1. Mapeamento da Squad Autônoma no Paperclip (Matriz de Agentes & Skills)

Toda tarefa ou ciclo de implementação executado neste projeto deve assumir estritamente o papel, as responsabilidades e as skills dos agentes oficiais da Squad:

| Papel | Agente no Paperclip | ID do Agente | Skills Vinculadas (`skills.sh`) | Responsabilidade Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **Diretoria / Estratégia** | `CEO_ag` / `Você` | `fb74c3c0-1788-4a50-b4eb-a52183921a8c` | N/A | Validação de escopo, aprovação de checkpoints e destravamento de marcos. |
| **Gerente de Projeto** *(Orquestrador Ágil)* | `Gerente de Projeto_ag` | `e4709d94-3d4d-43c4-8f62-98629e785c12` | `agile-sprint-orchestration`<br>`paperclip-converting-plans-to-tasks`<br>`definition-of-done-governance`<br>`paperclip-board`<br>`git-workflow-conventional-commits`<br>`paperclip` | Criação e rastreabilidade de Issues no GitHub, fatiamento com links em `docs/`, controle de DoR/DoD e relatórios executivos. |
| **Arquiteto de Software** *(Tech Lead)* | `Arquiteto de Software_ag` | `6ee7b192-bdd3-473b-b1e6-cf80fbd5ab9a` | `improve-codebase-architecture`<br>`schema-first-contracts`<br>`definition-of-done-governance`<br>`paperclip-converting-plans-to-tasks`<br>`paperclip` | Modelagem profunda de domínios, design de schemas Zod/Prisma, ADRs (`docs/adr/`), autorização `can()`, integridade de auditoria e code review. |
| **Desenvolvedor Frontend** | `Desenvolvedor Frontend_ag` | `21130286-4f7f-4bee-959b-1e606787a2a3` | `carbon-design-system-react`<br>`nextjs-app-router-best-practices`<br>`frontend-tdd-green-workflow`<br>`paperclip` | Componentes Carbon UI Shell, Grid, acessibilidade WCAG 2.1 AA, temas Claro/Escuro e resolução dos testes do QA (**Fase GREEN**). |
| **Desenvolvedor Backend** | `Desenvolvedor Backend_ag` | `ae82a9b4-e510-4dce-b63d-5600b3e40fb7` | `backend-tdd-green-workflow`<br>`nodejs-api-best-practices`<br>`postgres-prisma-patterns`<br>`paperclip` | APIs Next.js App Router, queries Prisma seguras, serviços de domínio, validação Zod e audit log (**Fase GREEN**). |
| **QA / Tester** | `QA_ag` | `545f6e57-8c2d-49ce-8dd7-32eba8795c0b` | `qa-tdd-red-workflow`<br>`playwright-e2e-best-practices`<br>`vitest-unit-and-contracts`<br>`paperclip` | **TDD Estrito:** criação antecipada de testes automatizados no Vitest/Playwright que falham (**Fase RED**), validação final e blindagem contra regressão. |
| **DevOps** | `DevOps_ag` | `68ab23bf-fb6c-410a-8a76-7f0a54a17f54` | `docker-nextjs-production`<br>`ci-cd-github-actions-automation`<br>`git-workflow-conventional-commits`<br>`paperclip` | Docker Compose, Postgres VPS (porta 15434), Caddy, pipeline GitHub Actions CI/CD e builds de produção. |

---

## 2. O Ciclo de Engenharia em 7 Etapas Rigorosas (PRD §11.3)

Qualquer entrega deve obrigatoriamente percorrer as 7 etapas abaixo:

1. **Etapa 1 — Fatiamento & Issue no GitHub (`Gerente de Projeto_ag`):**
   - Criação da Issue no GitHub via `gh issue create` com o template oficial (`Contexto`, `Comportamento Atual`, `Comportamento Esperado`, `Critérios de Aceite`).
   - Toda referência documental deve usar links relativos para arquivos em `docs/`.
2. **Etapa 2 — Arquitetura, Schemas & Contratos (`Arquiteto de Software_ag`):**
   - Modelagem de dados no Prisma (`prisma/schema.prisma`) e contratos em runtime com Zod (`src/server/schemas/*.schema.ts`).
   - Definição de ADR caso haja decisão de arquitetura estrutural em `docs/adr/`.
3. **Etapa 3 — Especificação de Testes RED (`QA_ag`):**
   - O código de produção **NÃO** pode ser iniciado sem que os testes automatizados correspondentes estejam criados em `tests/unit/` (Vitest) ou `tests/e2e/` (Playwright).
   - Execução do teste comprovando a falha intencional (**Estado RED**).
4. **Etapa 4 — Implementação GREEN (`Dev Frontend & Backend`):**
   - Escrita estrita do código necessário e suficiente para transformar os testes de RED para **GREEN**.
   - Aderência total aos padrões de projeto da seção 3.
5. **Etapa 5 — Code Review Técnico (`Arquiteto de Software_ag`):**
   - Revisão de código validando: ausência de hardcode da marca (uso exclusivo de `src/config/brand.ts`), tipagem estrita (`strict: true`, zero `any`), autorização centralizada via `can()` e uso de tokens Carbon.
6. **Etapa 6 — Validação Completa de Regressão (`QA_ag`):**
   - Execução da suíte completa de testes (`npm test`), garantindo 100% de aprovação (zero regressões).
7. **Etapa 7 — Validação de Build & DoD (`DevOps_ag` & `Gerente de Projeto_ag`):**
   - Execução do build de produção (`npm run build`) com validação de tipos e rotas.
   - Commit convencional referenciando a issue (ex: `feat(#X): ...` ou `fix(#X): ...`).
   - Atualização dos critérios `[x]` na Issue do GitHub e fechamento com comentário técnico de entrega.

---

## 3. Padrões de Projeto e Diretrizes de Arquitetura de Software

O código deve obedecer aos seguintes padrões arquiteturais consolidados:

### 3.1. Schema-First Design Pattern (Contratos Fortes em Runtime)
- Toda entrada de dados em APIs (`src/app/api/`) e formulários deve ser validada por schemas Zod (`src/server/schemas/`).
- Tipos TypeScript devem ser inferidos diretamente dos schemas Zod (`z.infer<typeof schema>`), garantindo sincronia total entre tipagem em tempo de compilação e validação em tempo de execução.
- Tipagem estrita: Proibido o uso de `any` em novos códigos.

### 3.2. Layered Architecture (Separação Limpa de Camadas)
- **Rotas e Controladores (`src/app/api/*`):** Atuam exclusivamente como portas de entrada HTTP leves: autenticam via sessão, validam payload com schema Zod, verificam autorização com `can(user, action, resource)` e delegam para a camada de serviço.
- **Camada de Serviço (`src/server/services/*`):** Contém 100% da lógica de negócio e regras operacionais. Nunca manipula diretamente objetos `NextRequest` ou `NextResponse`.
- **Camada de Persistência (`src/lib/prisma.ts` / Prisma Client):** Acesso padronizado ao PostgreSQL 16 com suporte a fallback resiliente em memória para testes unitários em CI.

### 3.3. Padrão de Design System Carbon (IBM Carbon UI Shell)
- A interface consome exclusivamente componentes do IBM Carbon Design System (`@carbon/react`, `@carbon/icons-react`, `@carbon/charts-react`).
- **Tokens Semânticos de Cor:** É proibido o uso de cores hexadecimais estáticas fixas no CSS quando houver token Carbon correspondente (ex: utilizar `var(--cds-layer-01)`, `var(--cds-text-primary)`, `var(--cds-support-error)`). Isso garante compatibilidade nativa com os temas Claro (`white`/`g10`) e Escuro (`g90`/`g100`).
- Tipografia oficial: Família **IBM Plex** (`IBM Plex Sans` para textos gerais e `IBM Plex Mono` para valores monetários e identificadores).

### 3.4. Isolamento Estrito de Marca (Single Source of Truth Pattern)
- Nenhuma string referente ao nome da marca/produto pode ser escrita diretamente no código fora de `src/config/brand.ts`.
- Consumir sempre `APP_CONFIG.brandName`, `APP_CONFIG.shortName` e `APP_CONFIG.tagline`. Testes do QA varrem o repositório e quebram caso encontrem nomes hardcoded.

### 3.5. Trilha de Auditoria Imutável (Audit Trail Pattern)
- Todas as mutações de dados críticas (cadastro, edição, inativação, deliberações GO/No-GO, alteração de status no Kanban) devem emitir registro de auditoria na tabela `audit_log` (`src/server/audit.ts`).
- Os registros de auditoria contêm obrigatoriamente: `usuarioId`, `usuarioNome`, `acao`, `entidadeTipo`, `entidadeId`, dados de `antes` e `depois`.

### 3.6. Governança RBAC Centralizada (Policy Pattern)
- Toda e qualquer checagem de permissão deve ser realizada por meio da função canônica `can(user, action, resource)` definida em `src/lib/rbac.ts`.
- Nunca implementar verificações manuais de `role === "OPERADOR"` espalhadas no código. A matriz central `ROLE_PERMISSIONS_CONTRACT` é a única fonte da verdade de autorização.
