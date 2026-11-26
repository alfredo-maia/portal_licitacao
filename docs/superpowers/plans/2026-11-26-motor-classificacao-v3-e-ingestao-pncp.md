# Motor Semântico Determinístico V3 & Ingestão PNCP (14/11 a 25/11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar títulos alucinados de TI e falsos positivos de classificação nos 40 segmentos / 188 subsegmentos (introduzindo separação Núcleo vs. Destinatário, travas anti-colisão e fallback `"OUTROS"`), reclassificar a base existente em `staging.aponta.cloud` e ingerir os editais do PNCP publicados entre `14/11/2026` e `25/11/2026`.

**Architecture:** `resumo-licitacao.ts` passa a exigir âncora explícita de TI antes de aplicar templates de software e detecta títulos contaminados legados. `classificador-segmentos.service.ts` classifica exclusivamente a partir do objeto oficial do PNCP, pontuando o núcleo do objeto (`2.0x`) separado da finalidade/órgão destinatário (`0.25x`), neutralizando jargões licitatórios polissêmicos e retornando `macro: "OUTROS"` abaixo do score mínimo (`10`). `reclassificarCatalogoLicitacoesService` corrige retroativamente todos os registros do banco antes da nova ingestão `20261114`–`20261125`.

**Tech Stack:** TypeScript, Next.js 15 App Router, Zod, Prisma ORM (PostgreSQL), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-motor-classificacao-segmentos-v3-design.md`

## Global Constraints
- `CATALOGO_MACRO_SEGMENTOS` e `MacroSegmentoEnum` mantêm exatamente as 40 macro-categorias e 188 subatividades selecionáveis pelos clientes.
- `ClassificacaoMacroEnum` (`MacroSegmento | "OUTROS"`) tipa o retorno do classificador e buscas (`zero any`).
- `classificarLicitacaoPorTexto` avalia apenas o objeto oficial, nunca o `miniResumo` sintético.
- Itens abaixo de `SCORE_MINIMO_CLASSIFICACAO = 10` recebem `macro: "OUTROS"` e `subcategorias: []`.
- Toda ação administrativa de reclassificação registra `AuditLog`.

## Review Focus
1. Objetos com `"Sistema de Registro de Preços"` ou `"Processo Eletrônico"` no preâmbulo não podem pontuar em `INFORMATICA`.
2. Objetos curtos legítimos de 1 palavra-chave forte no núcleo (ex.: `"Aquisição de medicamentos"`, `"Serviços funerários"`) devem atingir `>= 10` pontos e classificar no segmento correto, não cair em `"OUTROS"`.
3. `ingestLicitacoesV2` recebendo payload com `miniResumo` legado contaminado deve regenerar o `miniResumo` fiel quando o `resumo` não for de TI e atualizar `segmentoMacro`/`subcategorias` mesmo se o `hashCritico` não mudou.
4. `buscaLicitacoesResultSchema` (`itemLicitacaoBuscaSchema`) não pode quebrar com `ZodError` ao listar licitações cujo `segmentoMacro` seja `"OUTROS"`.
5. `passaSubsegmentosTenant` deve bloquear registros com `subcategorias: []` quando o cliente restringiu subsegmentos daquela macro-categoria, mas continuar liberando quando o cliente selecionou a macro inteira sem restringir subsegmentos.

---

### Task 1: Schemas, Síntese Fiel de Títulos e Motor Semântico V3

**Files:**
- Modify: `src/lib/resumo-licitacao.ts`
- Modify: `src/lib/licitacao-texto.ts`
- Modify: `src/server/schemas/segmentos.schema.ts`
- Modify: `src/server/schemas/busca-licitacoes.schema.ts`
- Modify: `src/server/services/classificador-segmentos.service.ts`
- Test: `tests/unit/motor-classificacao-v3-issue-57.test.ts`

- [ ] **Step 1: Escrever suíte de testes RED cobrindo Itariri/SP, colisões multi-segmento e fallback `OUTROS`**
- [ ] **Step 2: Executar Vitest e confirmar falha (RED)**
- [ ] **Step 3: Implementar guarda `possuiContextoRealDeSoftwareTi` e `pareceTituloContaminadoPorTemplateTi` em `resumo-licitacao.ts`**
- [ ] **Step 4: Implementar `ClassificacaoMacroEnum`, reforço de vocabulário 40x188 (incluindo `FUNERARIA/3601`) e Motor V3 (Núcleo `2.0x` vs. Destinatário `0.25x` + neutralização de jargões + `OUTROS`)**
- [ ] **Step 5: Executar Vitest e confirmar aprovação**

### Task 2: Desacoplamento na Ingestão, Blindagem de Filtros e Reclassificação Retroativa

**Files:**
- Modify: `src/server/schemas/ingestao.schema.ts`
- Modify: `src/server/services/ingestao.service.ts`
- Modify: `src/server/services/oportunidades.service.ts`
- Modify: `src/server/services/resumo-objeto-licitacao.service.ts`
- Modify: `src/server/schemas/superadmin.schema.ts`
- Modify: `src/app/api/admin/licitacoes/route.ts`
- Modify: `src/app/api/ingestao/route.ts`
- Modify: `scripts/ingest-pncp-periodo.ts`

- [ ] **Step 1: Desacoplar `miniResumo` da chamada `classificarLicitacaoPorTexto(item.resumo)` e atualizar detecção de mudança de segmento em `ingestLicitacoesV2`**
- [ ] **Step 2: Blindar `passaSubsegmentosTenant` e `enrichRecordSegment` em `oportunidades.service.ts`**
- [ ] **Step 3: Implementar `reclassificarCatalogoLicitacoesService` e expor em `/api/admin/licitacoes` (`reclassificar_catalogo`) e `PATCH /api/ingestao`**
- [ ] **Step 4: Executar testes unitários + suíte de taxonomia existente + `npm run build`**

### Task 3: Deploy em Staging, Saneamento da Base Atual e Ingestão PNCP (14/11/2026 a 25/11/2026)

- [ ] **Step 1: Commit, push e conclusão do workflow `deploy-staging.yml` em `staging.aponta.cloud`**
- [ ] **Step 2: Executar reclassificação retroativa em `https://staging.aponta.cloud` e validar correção do certame `46578522000176-1-000033/2026` (Itariri/SP)**
- [ ] **Step 3: Executar `scripts/ingest-pncp-periodo.ts --dataInicial=20261114 --dataFinal=20261125` para `https://staging.aponta.cloud` e validar resultados**
