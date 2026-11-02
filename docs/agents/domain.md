# Domain Docs

Como as skills de engenharia devem consumir e atualizar a documentação de domínio do projeto **Portal de Licitações** (`83891ed1-1820-4cc8-9b40-2d3fd6840e03`, workspace `/home/hermes/apps/portal_licitacao`).

## Antes de explorar, leia estes arquivos

- **`GLOSSARY.md`** na raiz do repositório (quando existente): define a linguagem ubíqua do domínio de licitações públicas (Lei 14.133/2021, PNCP, triagem GO/No-GO, dossiê, habilitação, declarações e impugnações). Se `GLOSSARY.md` ainda não existir, **prossiga silenciosamente** sem criar placeholders; a skill `/domain-modeling` (acionada via `/grill-with-docs` ou `/improve-codebase-architecture`) o criará quando novos termos ou fronteiras de domínio forem resolvidos.
- **`docs/PRD.md`**: documento mestre de produto e requisitos originais do Portal de Licitações.Nota: as seções §11 e §12 do PRD registram o histórico do ciclo inicial de sprints; para governança operacional, rastreamento e TDD vigentes, prevalecem `AGENTS.md`, `docs/agents/*` e `.agents/rules/tdd-development-workflow.md` (`av-fluxo-enxuto`).
- **`docs/adr/`**: registra as decisões arquiteturais (ADRs `0001` a `0006` e subsequentes) tomadas no projeto. Leia os ADRs pertinentes à área em que for atuar.
- **`docs/sprints/`**: especificações e relatórios históricos das Sprints 0 a 6 (preservados como referência documental).

## Estrutura de arquivos (`single-context`)

O repositório adota o layout de contexto único (`single-context`):

```text
/
├── AGENTS.md
├── GLOSSARY.md                        ← criado sob demanda por /domain-modeling
├── docs/
│   ├── PRD.md                         ← especificação mestre e histórico do produto
│   ├── adr/                           ← decisões arquiteturais (0001..0006+)
│   ├── sprints/                       ← histórico de especificações de sprints
│   └── agents/
│       ├── domain.md
│       ├── issue-tracker.md
│       ├── skill-routing.json
│       └── triage-labels.md
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   ├── components/
│   ├── config/
│   ├── lib/
│   ├── providers/
│   ├── server/
│   └── types/
└── tests/
    ├── unit/
    └── e2e/
```

## Use o vocabulário do domínio

Quando sua saída nomear um conceito do projeto (em título de tarefa, especificação, hipótese de diagnóstico, contrato Zod/Prisma ou teste), utilize a terminologia canônica consolidada em `GLOSSARY.md` (quando presente), `docs/PRD.md` e nos schemas de `src/server/schemas/`.

## Sinalize conflitos com ADRs

Se uma proposta ou mudança contradisser um ADR existente em `docs/adr/`, sinalize explicitamente o conflito antes de alterar o comportamento ou a estrutura:

> _Contradicts ADR-000X (...), mas merece reavaliação porque…_
