# Especificação Técnica Operacional — Sprint 4 (Portais de Licitações & Documentação de Habilitação)

> **Documento Mestre:** `docs/PRD.md` (§4.2, §4.5, §4.6, §6.2, §11, §12)  
> **Decisões e premissas:** `docs/adr/0004-portais-e-documentacao-de-habilitacao.md`  
> **Contratos Zod:** `src/server/schemas/{portal,documento}.schema.ts`  

---

## 1. Entregáveis da Sprint

1. **Catálogo de Portais (`/portais` e `/portais/[id]`):**
   - Tabela/Cards Carbon com listagem de plataformas (nome, link oficial, status de cadastro, valor e data de vencimento da assinatura, tags de robô e certificado digital).
   - Modal/Form `+ Novo Portal` e edição de portal existente.
   - Detalhe individual com informações de suporte técnico e credenciais seguras (**zero senhas salvas**).
2. **Repositório Central de Habilitação (`/documentacao`):**
   - Categorização pelas 5 classes da Lei 14.133 (Jurídica, Fiscal/Trabalhista, Qualificação Técnica, Qualificação Econômico-Financeira, Outros).
   - Modal de upload com suporte a documentos permanentes (`semValidade`) ou com data de expiração.
   - **Regra Visual Estrita:** Documentos vencidos ou vencendo em ≤ 30 dias renderizados com destaque visual em **vermelho e negrito** (`support-error`).
   - Suporte a versionamento (subir nova versão arquiva a anterior mantendo rastreabilidade).
3. **Ativação dos Alertas N6 e N7:**
   - Emissão de **N6** (vencimento de portal: 30, 21, 14, 7, 1 dia antes) para Diretoria e Comercial.
   - Emissão de **N7** (vencimento de documento: 30, 14, 1 dia antes) para Todos os usuários ativos.
   - Ambos integrados ao job diário idempotente `POST /api/notificacoes/jobs/diario`.
4. **Integração Real com o Calendário (`/calendario`):**
   - Endpoint `GET /api/calendario` agora lê `Documento` ativo e projeta `alertasDocumentais` reais com mensagem e link direto.
5. **Captura do Valor Arrematado no Kanban (Pendência Sprint 3 / ADR §2.5):**
   - Modal ao mover para a coluna `Contemplada` permite registrar o `valorArrematado` final da disputa.

---

## 2. Endpoints e Contratos

| Método e Rota | Contrato Zod | Regras e Permissões |
| :--- | :--- | :--- |
| `GET /api/portais` | `portalListQuerySchema` → `portalListResponseSchema` | Filtro por status, busca por nome, ordenação por vencimento. Exige sessão. |
| `POST /api/portais` | `portalCriarInputSchema` → `portalDetalheResponseSchema` | Cria portal. RBAC: `DIRETORIA` ou `ANALISTA_COMERCIAL`. Grava `audit_log`. |
| `GET /api/portais/[id]` | `portalDetalheResponseSchema` | Detalhe completo. Exige sessão. 404 se não encontrado. |
| `PATCH /api/portais/[id]` | `portalAtualizarInputSchema` → `portalDetalheResponseSchema` | Atualização parcial. RBAC: `DIRETORIA` ou `ANALISTA_COMERCIAL`. Grava `audit_log`. |
| `DELETE /api/portais/[id]` | `{ ok: true }` | Exclusão lógica/física. RBAC: `DIRETORIA`. Grava `audit_log`. |
| `GET /api/documentos` | `documentoListQuerySchema` → `documentoListResponseSchema` | Listagem por categoria, status, vencimento próximo (≤ 30 dias). Exige sessão. |
| `POST /api/documentos` | `documentoCriarInputSchema` → `documentoDetalheResponseSchema` | Cadastro e upload. Grava `audit_log`. |
| `GET /api/documentos/[id]` | `documentoDetalheResponseSchema` | Detalhes e histórico de versões anteriores. Exige sessão. |
| `POST /api/documentos/[id]/nova-versao` | `documentoNovaVersaoInputSchema` → `documentoDetalheResponseSchema` | Cria nova versão, arquiva a versão anterior. Grava `audit_log`. |
| `DELETE /api/documentos/[id]` | `{ ok: true }` | Arquiva ou remove documento. RBAC: `DIRETORIA`. Grava `audit_log`. |

---

## 3. Critérios de Aceite por Etapa

### Etapa 1 — Arquitetura (Gemini 3.8 Flash High)
- [x] ADR 0004 e especificação da Sprint 4.
- [ ] Modelos Prisma `Portal` e `Documento` em `schema.prisma`.
- [ ] Migration idempotente `20261025150000_sprint_4_portais_documentacao`.
- [ ] DDL correspondente espelhado no `scripts/docker-entrypoint.cjs` (`ddlSprint4`).
- [ ] Zod Schemas exportados em `src/server/schemas/index.ts`.

### Etapa 2 — TDD RED (QA)
- [ ] Testes unitários para contratos e regras de cálculo de vencimento (≤ 30 dias).
- [ ] Testes de API para CRUD de Portais e Documentos.
- [ ] Testes de emissão de N6 e N7 no job diário.
- [ ] Testes de projeção de alertas documentais no Calendário.

### Etapa 3A — Backend GREEN
- [ ] Implementação de `portal.service.ts` e `documento.service.ts`.
- [ ] Atualização de `notificacoes.service.ts` (N6 e N7 ativos).
- [ ] Atualização de `calendario.service.ts` (leitura de documentos reais).
- [ ] Implementação de todos os route handlers da §2.

### Etapa 3B — Frontend GREEN
- [ ] Tela `/portais` com visualização de cartões/tabela, status e modais de criação/edição.
- [ ] Tela `/documentacao` com filtro por categoria, badges de validade em vermelho e negrito, e nova versão.
- [ ] Atualização da faixa de alerta do `/calendario`.
- [ ] Campo de `valorArrematado` no Kanban ao contemplar certame.

### Etapa 4 — Code Review
- [ ] Verificação de isolamento de senhas (zero senhas em portais).
- [ ] Conformidade total ao IBM Carbon Design System e `APP_CONFIG`.

### Etapa 5 — Validação QA
- [ ] 100% dos testes Vitest verdes; Playwright E2E validado; build Next.js 15 compilado sem erros.

### Etapa 6 — DevOps & Deploy
- [ ] Push para `main` e validação do deploy automatizado na VPS via GitHub Actions.
