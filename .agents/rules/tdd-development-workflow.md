# Governança da Squad Paperclip, Fluxo Enxuto (`av-fluxo-enxuto`) & Padrões de Projeto

> **Documento Mestre do Produto:** [`docs/PRD.md`](file:///docs/PRD.md) (histórico original nas seções §11 e §12)  
> **Projeto no Paperclip:** `Portal de Licitações` (`83891ed1-1820-4cc8-9b40-2d3fd6840e03`)  
> **Workspace Oficial:** `08185a70-af0a-4f1b-94a6-198a2917ed19` (`/home/hermes/apps/portal_licitacao`)  
> **Rotina PNCP no Paperclip:** `Coleta PNCP (terça e sexta)` (`ac972837-0b35-4c18-9bd7-bb23d6ad7904`)  
> **Aplicação desta Regra:** Obrigatória e ativa (`always on`) para todas as interações no repositório `portal_licitacao`.

---

## 1. Mapeamento da Squad no Paperclip (Matriz de Agentes & Comandos)

As demandas deste repositório são conduzidas pela squad no Paperclip conforme o roteamento canônico em `docs/agents/skill-routing.json`:

| Papel | Agente no Paperclip | ID do Agente | Comandos / Skills Principais | Responsabilidade no Fluxo |
| :--- | :--- | :--- | :--- | :--- |
| **Direção Humana / Apoio Executivo** | Alfredo e Vítor (`Mr. Goku` como apoio executivo) | `fb74c3c0-1788-4a50-b4eb-a52183921a8c` | Alçadas no Paperclip | Alçadas de escopo, merge, produção e compromissos externos (`Mr. Goku` não substitui aprovação humana). |
| **Entrada e Acompanhamento (PM)** | `Mr. Shikamaru` | `e4709d94-3d4d-43c4-8f62-98629e785c12` | `/triage`, `/to-tickets`, `/wayfinder`, `/to-questionnaire`, `/handoff` | Porta de entrada e dono de acompanhamento das demandas, triagem no Paperclip e organização de capacidade. |
| **Dono Técnico / Tech Lead** | `Mr. Kakashi` | `6ee7b192-bdd3-473b-b1e6-cf80fbd5ab9a` | `/setup-matt-pocock-skills`, `/ask-matt`, `/wayfinder`, `/domain-modeling`, `/codebase-design`, `/to-spec`, `/to-tickets`, `/implement-spec`, `/code-review`, `/pr`, `/diagnosing-bugs`, `/improve-codebase-architecture`, `/retro`, `/handoff` | Condução técnica proporcional, contratos Zod/Prisma, ADRs (`docs/adr/`), autorização `can()`, revisão de Standards e orquestração técnica. |
| **Negócios e Requisitos** | `Ms. Hinata` / `Mr. Neji` | `c5761c8a-8b63-43ad-9545-462019f8ba01` / `d4ff6330-89d3-4476-bb7b-6301a4dc9ae6` | `/grill-with-docs`, `/grill-me`, `/grilling`, `/domain-modeling`, `/to-spec`, `/to-questionnaire`, `/ui-ux-pro-max` (Hinata), `/handoff` | Esclarecimento de decisões abertas de requisitos, modelagem de domínio (`GLOSSARY.md`) e síntese de especificações (`SPEC` / `AC`). |
| **Desenvolvedor Backend** | `Mr. Vegeta` | `ae82a9b4-e510-4dce-b63d-5600b3e40fb7` | `/implement`, `/tdd`, `/codebase-design`, `/pr`, `/diagnosing-bugs`, `/handoff` | Implementação backend em fatias verticais com TDD (`RED` $\rightarrow$ `GREEN`), APIs Next.js App Router, Prisma ORM, serviços de domínio, validação Zod e `audit_log`. |
| **Desenvolvedor Frontend** | `Mr. Sasuke` | `21130286-4f7f-4bee-959b-1e606787a2a3` | `/implement`, `/tdd`, `/codebase-design`, `/ui-ux-pro-max`, `/frontend-design`, `/impeccable`, `/web-design-guidelines`, `/pr`, `/diagnosing-bugs`, `/handoff` | Implementação frontend em fatias verticais com TDD (`RED` $\rightarrow$ `GREEN`), IBM Carbon Design System, UI Shell, Grid, acessibilidade WCAG 2.1 AA e temas Claro/Escuro. |
| **QA Independente** | `Ms. Sakura` | `545f6e57-8c2d-49ce-8dd7-32eba8795c0b` | `/code-review`, `/diagnosing-bugs`, `/impeccable`, `/web-design-guidelines`, `/handoff` | Revisão independente de Spec/QA no SHA final, conferindo pedido, critérios de aceitação (`SPEC`/`AC`), regressão (`npm test`) e acessibilidade. |
| **Infraestrutura / DevOps** | `Mr. Piccolo` (apoio: `Mr. Krillin`) | `68ab23bf-fb6c-410a-8a76-7f0a54a17f54` (`b2948725-00d1-43f6-844d-2e152c7269c8`) | `/diagnosing-bugs`, `/handoff`, `docker-nextjs-production`, `ci-cd-github-actions-automation` | Containers Docker, PostgreSQL, Caddy, pipelines GitHub Actions CI/CD, builds de produção e diagnóstico operacional quando acionado. |

---

## 2. Fluxo de Desenvolvimento Proporcional (`av-fluxo-enxuto` & TDD)

O projeto adota o **`av-fluxo-enxuto`** integrado ao **Paperclip** (único rastreador de tarefas, especificações, documentos e dependências; o GitHub hospeda apenas código e PRs):

1. **Rastreabilidade no Paperclip (`docs/agents/issue-tracker.md`):**
   - Não crie nem exija GitHub Issues (`gh issue create`). Toda tarefa, subtarefa (`parentId`), bloqueio (`blockedByIssueIds`) e documento (`spec`, `plan`) vive no Paperclip sob o `projectId` `83891ed1-1820-4cc8-9b40-2d3fd6840e03`.
2. **Rota Proporcional ao Risco:**
   - `Mr. Shikamaru` é a porta de entrada e o dono de acompanhamento; `Mr. Kakashi` é o dono técnico e escolhe a menor rota suficiente. PM, arquitetura e DevOps não são etapas obrigatórias em toda tarefa.
   - Demanda grande ou nebulosa demais para uma única SPEC $\rightarrow$ `/wayfinder` antes de `/to-spec`.
   - Decisões de requisitos abertas $\rightarrow$ `Ms. Hinata` / `Mr. Neji` com `/grill-with-docs`.
   - Requisitos fechados $\rightarrow$ `/to-spec` (sintetizando problema, solução, contratos, fronteiras de teste e exclusões).
   - Múltiplas entregas verticais $\rightarrow$ `/to-tickets` (com `Mr. Shikamaru` e `Mr. Kakashi`) ou `/implement-spec` conduzido por `Mr. Kakashi`.
   - Correção pequena e clara $\rightarrow$ direto para implementação com TDD e revisão.
3. **Ciclo TDD pelo Desenvolvedor (`/implement` e `/tdd`):**
   - Antes de implementar, o desenvolvedor executa o preflight `python3 scripts/check_agent_setup.py --command implement`.
   - O próprio desenvolvedor (`Mr. Vegeta` no backend, `Mr. Sasuke` no frontend) conduz o ciclo **RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR** um comportamento por vez: escreve o teste automatizado (Vitest/Playwright) nas interfaces públicas/fronteiras acordadas, confirma a falha pelo motivo esperado (**RED**) e escreve o código mínimo de produção para passar (**GREEN**).
4. **Revisão Dupla no SHA Fixado (`/code-review`):**
   - **`Mr. Kakashi` (Standards):** revisa conformidade arquitetural, padrões obrigatórios da seção 3, tipagem estrita e fronteiras de módulo.
   - **`Ms. Sakura` (Spec / QA Independente):** em tarefa separada no mesmo SHA final, compara pedido, `SPEC`/`AC` e implementação, validando a suíte de testes e ausência de regressões. Autorrevisão do desenvolvedor não substitui o QA independente.
5. **Governança de Merge e Deploy (alçadas no Paperclip):**
   - As alçadas ficam no `GOVERNANCE.md` das instruções de cada agente no Paperclip, não neste repositório; na dúvida, a decisão é da direção humana (Alfredo e Vítor).
   - Concluir implementação ou QA não autoriza push, PR, merge ou deploy automaticamente; ações de publicação seguem as alçadas humanas vigentes.

---

## 3. Padrões de Projeto e Diretrizes de Arquitetura de Software

O código deve obedecer rigorosamente aos seguintes padrões arquiteturais consolidados:

### 3.1. Schema-First Design Pattern (Contratos Fortes em Runtime)
- Toda entrada de dados em APIs (`src/app/api/`) e formulários deve ser validada por schemas Zod (`src/server/schemas/`).
- Tipos TypeScript devem ser inferidos diretamente dos schemas Zod (`z.infer<typeof schema>`), garantindo sincronia total entre tipagem em tempo de compilação e validação em tempo de execução.
- Tipagem estrita: Proibido o uso de `any` em novos códigos (`strict: true`).

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
- Consumir sempre `APP_CONFIG.brandName`, `APP_CONFIG.shortName` e `APP_CONFIG.tagline`. Testes automatizados (`tests/unit/brand.test.ts`) varrem o repositório e falham caso encontrem nomes hardcoded.

### 3.5. Trilha de Auditoria Imutável (Audit Trail Pattern)
- Todas as mutações de dados críticas (cadastro, edição, inativação, deliberações GO/No-GO, alteração de status no Kanban) devem emitir registro de auditoria na tabela `audit_log` (`src/server/audit.ts`).
- Os registros de auditoria contêm obrigatoriamente: `usuarioId`, `usuarioNome`, `acao`, `entidadeTipo`, `entidadeId`, dados de `antes` e `depois`.

### 3.6. Governança RBAC Centralizada (Policy Pattern)
- Toda e qualquer checagem de permissão deve ser realizada por meio da função canônica `can(user, action, resource)` definida em `src/lib/rbac.ts`.
- Nunca implementar verificações manuais de `role === "OPERADOR"` espalhadas no código. A matriz central `ROLE_PERMISSIONS_CONTRACT` é a única fonte da verdade de autorização.
