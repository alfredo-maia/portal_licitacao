# Plano de Implementação — Ajustes Críticos de Performance, Isolamento Multi-Tenant e UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar lentidão global do sistema, garantir isolamento multi-tenant estrito (zero vazamento de colaboradores, documentos ou portais entre contas), implementar trava de CNPJ sem segmentos configurados, aprimorar UX de carregamento em Oportunidades, corrigir modal de sincronização PNCP, sanear fuso horário em Portais (-1 dia) e adicionar campo Nome Fantasia em Configurações.

**Architecture:** Arquitetura em camadas com validação Schema-First (Zod), resolução de Tenant autenticado baseada em `tenantUser`, eliminação de DDLs em tempo de execução através de flags de bootstrap, persistência de `nomeFantasia` e `tenantId` em `Portal` e `Documento`, e normalização de datas civis imunes a offset com `parseDataCivil` e `formatarDataSemOffset`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, PostgreSQL, Prisma ORM, IBM Carbon Design System, Vitest.

**Spec:** Documento do usuário `@[/Users/vitorhenrique/Downloads/Ajustes.pdf]`.

---

## Global Constraints

- **Zero `any`:** Manter tipagem estática rigorosa em TypeScript sem regressões no `npx tsc --noEmit`.
- **IBM Carbon Tokens:** Utilizar exclusivamente tokens de cor semânticos (`var(--cds-*)`) e componentes oficiais Carbon.
- **Isolamento Multi-Tenant Estrito:** Qualquer dado persistido ou lido (Colaboradores, Documentos, Portais, Oportunidades) deve pertencer estritamente ao `tenantId` autenticado.
- **Trilha de Auditoria:** Toda mutação relevante deve registrar entrada na tabela de `audit_log`.
- **Preservação de Fuso Horário:** Datas civis de vencimento devem ser sanitizadas com `parseDataCivil` (12:00 UTC) e formatadas com `formatarDataSemOffset`.

---

## Review Focus

1. **Tentativa de vazamento via cookie de sessão anterior:** Um usuário autenticado que possui no cookie um `portal_licitacao_active_tenant` de outra empresa não deve, sob hipótese alguma, carregar colaboradores, documentos ou portais daquela empresa.
2. **Novo CNPJ sem segmentos configurados:** Não deve disparar queries globais no banco e deve exibir banner amigável de conclusão de cadastro nas telas de Dashboard e Oportunidades.
3. **Resiliência da busca de edital no PNCP:** Se a API externa do PNCP demorar ou falhar, o modal não deve travar; deve exibir mensagem clara por 2 segundos e atualizar a página.
4. **Preservação da data em Portais:** Selecionar o dia 10 de novembro no formulário deve salvar e exibir exatamente 10 de novembro (e não 9 de novembro).
5. **Performance de queries:** Dashboard e listagem de Oportunidades devem responder em menos de 500ms, sem reprocessar regex/NLP em toda a base de dados.

---

## File Structure

- **Backend / Serviços:**
  - `src/server/services/configuracoes.service.ts`: Otimização de DDL (execução única em cache), isolamento estrito de `listarEquipe` por validação de membresia, persistência de `nomeFantasia`.
  - `src/server/services/oportunidades.service.ts`: Otimização de performance (uso direto de campos persistidos `segmentoMacro` e `subcategorias` sem re-executar NLP no loop), timeout de 8s na busca PNCP.
  - `src/server/services/dashboard.service.ts`: Suporte a trava de CNPJ sem segmentos configurados.
  - `src/server/services/portais.service.ts`: Isolamento por `tenantId` e sanitização de data de vencimento com `parseDataCivil`.
  - `src/server/services/documentos.service.ts`: Isolamento estrito por `tenantId` na listagem e criação.
- **Rotas de API HTTP:**
  - `src/app/api/usuarios/route.ts`: Resolução segura de `tenantId` validada contra `prisma.tenantUser`.
  - `src/app/api/documentos/route.ts`: Extração de `tenantId` da sessão e passagem para o serviço.
  - `src/app/api/portais/route.ts` & `[id]/route.ts`: Extração de `tenantId`, sanitização com `parseDataCivil`.
  - `src/app/api/oportunidades/route.ts`: Retorno de flag `configuracaoPendente: true` quando não houver segmentos.
  - `src/app/api/dashboard/route.ts`: Retorno de flag `configuracaoPendente: true` quando não houver segmentos.
  - `src/app/api/oportunidades/[id]/arquivos/sync-pncp/route.ts`: Resposta padronizada com mensagem legível e timeout.
- **Frontend UI (Carbon Design System):**
  - `src/app/dashboard/page.tsx`: Banner de alerta quando `configuracaoPendente` for detectada.
  - `src/app/oportunidades/page.tsx`: Banner de alerta para CNPJ sem segmentos, bloqueio interativo durante o carregamento de preferências/oportunidades.
  - `src/app/oportunidades/[id]/page.tsx`: Modal de busca PNCP com feedback textual, timer de 2s e refresh; isolamento de equipe por tenant.
  - `src/app/portais/page.tsx`: Uso de `formatarDataSemOffset` na renderização das datas.
  - `src/app/configuracoes/page.tsx`: Campo "Nome Fantasia" abaixo de "Razão Social" na Aba Dados da Empresa.
- **Banco de Dados & Scripts:**
  - `prisma/schema.prisma`: Adição de `nomeFantasia` em `configuracao_empresa` e `tenant`, e `tenantId` em `Portal`.
  - `scripts/docker-entrypoint.cjs`: Migrações DDL correspondentes.

---

## Plano de Tarefas

### Tarefa 1: Otimização Drástica de Performance e Eliminação de DDLs Bloqueantes
**Responsáveis:** Arquiteto de Software & Dev Backend

**Arquivos:**
- Modificar: `src/server/services/configuracoes.service.ts`
- Modificar: `src/server/services/oportunidades.service.ts`
- Modificar: `scripts/docker-entrypoint.cjs`
- Testes: `tests/unit/performance-e-ddl-cache.test.ts`

- [ ] **Passo 1.1:** Criar teste unitário em `tests/unit/performance-e-ddl-cache.test.ts` verificando que chamadas consecutivas a `obterConfiguracaoEmpresa` não disparam queries de DDL redundantes.
- [ ] **Passo 1.2:** Em `src/server/services/configuracoes.service.ts`, adicionar guard em memória (`let ddlExecuted = false`) para que `ensureConfiguracaoEmpresaColumns` execute no máximo uma única vez por ciclo de vida do processo Node.
- [ ] **Passo 1.3:** Em `src/server/services/oportunidades.service.ts`, refatorar `listOportunidades` para NÃO re-executar `classificarLicitacaoPorTexto` em cada linha do banco se o registro já possuir `segmentoMacro` preenchido.
- [ ] **Passo 1.4:** Adicionar índices compostos e colunas pendentes no `scripts/docker-entrypoint.cjs`.
- [ ] **Passo 1.5:** Executar `npx vitest run tests/unit/performance-e-ddl-cache.test.ts` e confirmar GREEN.

---

### Tarefa 2: Resolução Segura de Tenant e Isolamento Multi-Tenant Estrito (Colaboradores, Documentos e Portais)
**Responsáveis:** Arquiteto de Software & QA

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Modificar: `scripts/docker-entrypoint.cjs`
- Modificar: `src/app/api/usuarios/route.ts`
- Modificar: `src/server/services/configuracoes.service.ts` (função `listarEquipe`)
- Modificar: `src/app/api/documentos/route.ts` & `src/server/services/documentos.service.ts`
- Modificar: `src/app/api/portais/route.ts`, `[id]/route.ts` & `src/server/services/portais.service.ts`
- Testes: `tests/unit/isolamento-multi-tenant-estrito.test.ts`

- [ ] **Passo 2.1:** Adicionar campo `tenantId String?` e relação `tenant Tenant?` no modelo `Portal` em `prisma/schema.prisma`, gerando cliente com `npx prisma generate`.
- [ ] **Passo 2.2:** Adicionar DDL no `scripts/docker-entrypoint.cjs` para a coluna `tenantId` em `portal`.
- [ ] **Passo 2.3:** Escrever teste RED em `tests/unit/isolamento-multi-tenant-estrito.test.ts` simulando criação de novo usuário e garantindo que ele NUNCA veja colaboradores, documentos ou portais de outro tenant, mesmo com cookie forjado.
- [ ] **Passo 2.4:** Em `src/app/api/usuarios/route.ts` e `listarEquipe`, validar estritamente se o usuário autenticado pertence ao `tenantId` via `prisma.tenantUser`. Caso contrário, fallback exclusivo para os tenants do usuário.
- [ ] **Passo 2.5:** Em `src/app/api/documentos/route.ts` e `src/server/services/documentos.service.ts`, filtrar e persistir obrigatoriamente pelo `tenantId` ativo.
- [ ] **Passo 2.6:** Em `src/app/api/portais/route.ts` e `src/server/services/portais.service.ts`, filtrar e persistir obrigatoriamente pelo `tenantId` ativo.
- [ ] **Passo 2.7:** Rodar testes e confirmar GREEN.

---

### Tarefa 3: Trava e Alerta para Novo CNPJ sem Segmentos / UFs Configurados
**Responsáveis:** Dev Backend & Dev Frontend

**Arquivos:**
- Modificar: `src/app/api/dashboard/route.ts` & `src/server/services/dashboard.service.ts`
- Modificar: `src/app/api/oportunidades/route.ts` & `src/server/services/oportunidades.service.ts`
- Modificar: `src/app/dashboard/page.tsx`
- Modificar: `src/app/oportunidades/page.tsx`
- Testes: `tests/unit/trava-novo-cnpj-sem-segmentos.test.ts`

- [ ] **Passo 3.1:** Escrever teste unitário RED em `tests/unit/trava-novo-cnpj-sem-segmentos.test.ts` garantindo que empresa sem segmentos cadastrados retorne 0 oportunidades e a flag `configuracaoPendente: true`.
- [ ] **Passo 3.2:** No backend de Dashboard e Oportunidades, verificar se `cfg.segmentos` está vazio; em caso positivo, não buscar licitações e responder `configuracaoPendente: true`.
- [ ] **Passo 3.3:** Em `src/app/dashboard/page.tsx`, exibir `ActionableNotification` ou `InlineNotification` de aviso com botão de redirecionamento para `/configuracoes` quando `configuracaoPendente === true`.
- [ ] **Passo 3.4:** Em `src/app/oportunidades/page.tsx`, exibir o mesmo alerta de cadastro pendente e suprimir a tabela vazia.
- [ ] **Passo 3.5:** Rodar testes e validar GREEN.

---

### Tarefa 4: UX de Carregamento em Oportunidades (Bloqueio Interativo)
**Responsáveis:** Dev Frontend

**Arquivos:**
- Modificar: `src/app/oportunidades/page.tsx`
- Testes: `tests/unit/oportunidades-loading-ux.test.tsx`

- [ ] **Passo 4.1:** Escrever teste visual/unitário testando que, enquanto as preferências do tenant e oportunidades estiverem carregando, os selects e filtros ficam desabilitados (`disabled={loading}`).
- [ ] **Passo 4.2:** Em `src/app/oportunidades/page.tsx`, adicionar estado consolidado de carregamento e desabilitar `Select`, `TextInput` e botões de filtro até a conclusão da resposta.
- [ ] **Passo 4.3:** Assegurar que o select de Segmento só renderize as opções do cliente após o retorno das preferências, sem exibir a lista completa temporariamente.
- [ ] **Passo 4.4:** Rodar testes e confirmar GREEN.

---

### Tarefa 5: Tela Oportunidades/[id]: Sincronização PNCP Resiliente e Equipe Estrita
**Responsáveis:** Dev Backend & Dev Frontend

**Arquivos:**
- Modificar: `src/server/services/oportunidades.service.ts` (`buscarESincronizarArquivosEditalPncp`)
- Modificar: `src/app/oportunidades/[id]/page.tsx`
- Testes: `tests/unit/dossie-pncp-sync-modal.test.tsx`

- [ ] **Passo 5.1:** Adicionar timeout de 8 segundos no `fetch` para a API do PNCP em `buscarESincronizarArquivosEditalPncp`.
- [ ] **Passo 5.2:** Em `src/app/oportunidades/[id]/page.tsx`, aprimorar o modal de carregamento para exibir mensagem de resultado:
  - Se sincronizou arquivos: *"X arquivo(s) oficial(is) sincronizado(s) com sucesso!"*
  - Se nenhum arquivo: *"Nenhum arquivo disponibilizado pelo órgão no PNCP para esta contratação."*
  - Se erro: *"Não foi possível conectar ao portal do PNCP no momento."*
- [ ] **Passo 5.3:** Manter a mensagem visível por exatamente 2 segundos no modal e, em seguida, fechar o modal e atualizar os dados da página.
- [ ] **Passo 5.4:** Na listagem de equipe do dossiê (Responsável e Membros Atribuídos), assegurar que a chamada a `/api/usuarios` retorne apenas os membros da empresa ativa da conta.
- [ ] **Passo 5.5:** Rodar testes e validar GREEN.

---

### Tarefa 6: Correção de Fuso Horário (-1 Dia) em Portais
**Responsáveis:** Dev Backend & Dev Frontend

**Arquivos:**
- Modificar: `src/app/api/portais/route.ts` & `src/app/api/portais/[id]/route.ts`
- Modificar: `src/server/services/portais.service.ts`
- Modificar: `src/app/portais/page.tsx`
- Testes: `tests/unit/portais-timezone-fix.test.ts`

- [ ] **Passo 6.1:** Escrever teste unitário em `tests/unit/portais-timezone-fix.test.ts` validando que salvar um portal com data `"2026-11-10"` preserva o dia civil 10 sem recuar para o dia 9.
- [ ] **Passo 6.2:** Em `src/app/api/portais/route.ts` e `[id]/route.ts`, sanitizar `dataVencimento` com `parseDataCivil`.
- [ ] **Passo 6.3:** Em `src/app/portais/page.tsx`, substituir `toLocaleDateString("pt-BR")` por `formatarDataSemOffset(p.dataVencimento)`.
- [ ] **Passo 6.4:** Rodar testes e validar GREEN.

---

### Tarefa 7: Campo "Nome Fantasia" na Aba Dados da Empresa
**Responsáveis:** Arquiteto de Software & Dev Frontend

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Modificar: `scripts/docker-entrypoint.cjs`
- Modificar: `src/server/schemas/configuracao.schema.ts`
- Modificar: `src/server/services/configuracoes.service.ts`
- Modificar: `src/app/configuracoes/page.tsx`
- Testes: `tests/unit/empresa-nome-fantasia.test.tsx`

- [ ] **Passo 7.1:** Escrever teste unitário RED em `tests/unit/empresa-nome-fantasia.test.tsx` validando que o formulário renderiza o campo "Nome Fantasia" abaixo de "Razão Social" e persiste o valor.
- [ ] **Passo 7.2:** Adicionar `nomeFantasia String?` em `configuracao_empresa` no Prisma e DDL no entrypoint.
- [ ] **Passo 7.3:** Atualizar `configuracaoEmpresaSchema` e `atualizarConfiguracaoEmpresa` para persistir e devolver `nomeFantasia`.
- [ ] **Passo 7.4:** Em `src/app/configuracoes/page.tsx`, adicionar o componente `TextInput` com `id="empresa-fantasia"` e `labelText="Nome Fantasia"` logo abaixo de "Razão Social da Empresa *".
- [ ] **Passo 7.5:** Rodar testes e validar GREEN.

---

### Tarefa 8: Verificação de Regressão Completa, Deploy e Validação em Staging
**Responsáveis:** DevOps & Squad

- [ ] **Passo 8.1:** Executar `npx tsc --noEmit` garantindo 0 erros de compilação.
- [ ] **Passo 8.2:** Executar suíte completa do Vitest (`npx vitest run`).
- [ ] **Passo 8.3:** Realizar commit e push para `feat/saas-multi-tenant`.
- [ ] **Passo 8.4:** Acompanhar workflow do GitHub Actions até conclusão bem-sucedida do CD de Staging.
- [ ] **Passo 8.5:** Validar em staging os fluxos apontados no documento `Ajustes.pdf`.

