# Especificação Técnica Operacional — Sprint 1 (Ingestão de Dados v2 & Central de Oportunidades GO/No-GO)

> **Épico no Paperclip:** `AV-33` (`b6948f54-caf5-4632-8409-fb15204d155f`)  
> **Documento Mestre:** `docs/PRD.md` (§4.4, §5.1, §6.1, §7, §8, §9 e §12)  
> **Workspace:** `/home/hermes/apps/portal_licitacao`

---

## 1. Visão Geral da Sprint 1
A Sprint 1 entrega o coração de entrada e triagem de negócios do Portal:
1. **Catálogo e Seed dos 22 Tipos de Sistema Padronizados** (`docs/PRD.md` §5.1).
2. **Endpoint de Ingestão e Sincronização v2 (`POST /api/ingestao`)** com validação Zod (`versaoContrato: 2`), cálculo de `hashCritico` (SHA-256), detecção cirúrgica de atualizações do PNCP (§6.1 e §8) e registro em `audit_log`.
3. **Central de Oportunidades (`/oportunidades`)** com tabela de alta densidade IBM Carbon `DataTable`, ordenação por Data de Abertura (mais próxima primeiro), filtros operacionais (incluindo query params vindos do Dashboard), deliberação rápida **Aceitar (GO) / Recusar (No-GO)** com modal de motivo e gravação em `audit_log`.
4. **Ações de Topo em `/oportunidades`:** Modal **`+ Adicionar Licitação Manualmente`** e Modal **`Importar Relatório (JSON)`** (`licitacoes_portal.json`).
5. **Rota de Destino `/oportunidades/[id]`:** Página inicial de detalhes do certame para garantir navegação funcional ao clicar em qualquer linha da tabela (as 4 abas profundas serão expandidas na Sprint 2).

---

## 2. Contratos Técnicos Obrigatórios da Sprint 1

### 2.1. Os 22 Tipos de Sistema Padronizados (`src/config/tipos-sistema.ts` & `prisma/schema.prisma`)
O arquivo `src/config/tipos-sistema.ts` deve exportar a constante imutável `TIPOS_SISTEMA_CATALOG` contendo exatamente os **22 tipos de sistema** definidos em `docs/PRD.md` (§5.1):

| Ordem | Código (`codigo`) | Nome (`nome`) |
| :-: | :--- | :--- |
| 1 | `SISTEMA_NOVO` | Sistema Novo (Desenvolvimento Sob Medida / Fábrica de Software) |
| 2 | `GESTAO_PUBLICA_ERP` | Gestão Pública (ERP Municipal / Administrativo Completo) |
| 3 | `EDUCACAO_PORTAL` | Portal de Educação (Gestão Escolar, Matrícula, Diário, Merenda) |
| 4 | `SAUDE_ATENCAO_BASICA` | Saúde (Atenção Básica, UBS, Prontuário Eletrônico, Regulação) |
| 5 | `HOSPITALAR` | Hospitalar (Gestão Hospitalar, UTI, Emergência, Leitos) |
| 6 | `CONTABIL_ORCAMENTARIO` | Contábil / Financeiro / Orçamentário / Tesouraria |
| 7 | `ASSISTENCIA_SOCIAL` | Assistência Social (CRAS, CREAS, Cadastro de Benefícios) |
| 8 | `GOVERNANCA_CORPORATIVA` | Governança Corporativa / Auditoria / Gestão Estratégica |
| 9 | `RH_FOLHA` | RH / Gestão de Pessoas / Folha de Pagamento |
| 10 | `BANCARIO_FINANCEIRO` | Bancário / Operações Financeiras / Conciliação Bancária |
| 11 | `TRIBUTARIO_ARRECADACAO` | Tributário / Arrecadação (IPTU, ISS, Nota Fiscal Eletrônica NFS-e) |
| 12 | `PROTOCOLO_PROCESSO_ELETRONICO` | Protocolo, Gestão Documental e Processo Administrativo Eletrônico |
| 13 | `PATRIMONIO_ALMOXARIFADO_FROTA` | Almoxarifado, Controle Patrimonial e Gestão de Frotas |
| 14 | `TRANSPARENCIA_OUVIDORIA` | Portal da Transparência / Ouvidoria / e-SIC |
| 15 | `PREVIDENCIA_RPPS` | Previdência e Gestão de Regime Próprio (RPPS) |
| 16 | `SANEAMENTO_AGUA_ESGOTO` | Saneamento Básico, Comercial e Faturamento de Água e Esgoto |
| 17 | `URBANISMO_LICENCIAMENTO` | Urbanismo, Obras, Alvará e Licenciamento Eletrônico |
| 18 | `BI_ANALYTICS_DADOS` | Business Intelligence (BI), Ciência de Dados e Dashboards |
| 19 | `INFRA_CLOUD_SUPORTE` | Infraestrutura de TI, Nuvem, Datacenter, NOC e Suporte Técnico |
| 20 | `LICENCA_SOFTWARE` | Compra e Renovação de Licenças de Software |
| 21 | `IMOBILIARIO` | Imobiliário (Gestão e Regularização de Bens e Terras Públicas) |
| 22 | `OUTROS` | Outros (Campo livre para novas especialidades de software) |

- **Prisma Schema (`prisma/schema.prisma`):**
  - Adicionar modelo `TipoSistema` (`id`, `codigo` `@unique`, `nome`, `ordem` `Int`, `ativo` `Boolean @default(true)`, `createdAt`, `updatedAt`) e manter/vincular em `Licitacao` os campos `tipoSistemaCodigo` (indexado), `portalDisputa` (`String?`), `esfera` (`String?`), `poder` (`String?`), `atestadosExigidos` (`Json?`) e `motivoRecusa` (`String? @db.Text`).
- **Seed (`prisma/seed.ts`):**
  - Exportar função `seedTiposSistema()` que faz upsert idempotente dos 22 tipos no PostgreSQL (com fallback resiliente em memória caso o banco não esteja acessível no ambiente de teste unitário) e invocá-la junto com `seedDirectors()` ao rodar `pnpm run db:seed`.

---

### 2.2. Contrato de Ingestão de Dados v2 (`src/server/schemas/ingestao.schema.ts` e `POST /api/ingestao`)
O contrato Zod em `src/server/schemas/ingestao.schema.ts` deve validar estritamente o formato `licitacoes_portal.json` (`docs/PRD.md` §8):
- `versaoContrato`: `z.literal(2)`
- `executadoEm`: `z.string().min(1)` (ISO datetime)
- `totalRegistros`: `z.number().int().nonnegative()`
- `licitacoes`: `z.array(ingestaoLicitacaoItemSchema)` onde cada item contém:
  - `pncpId`: `z.string().min(1)`
  - `numeroEdital`: `z.string().min(1)`
  - `orgao`: objeto com `cnpj` (`string`), `nome` (`string`), `esfera` (`string` opcional), `poder` (`string` opcional), `uf` (`string` de 2 caracteres), `municipio` (`string` opcional)
  - `modalidade`: `z.string().min(1)`
  - `portalDisputa`: `z.string().optional()`
  - `valorEstimado`: `z.number().nonnegative()`
  - `dataPublicacaoPncp`: `z.coerce.date().optional()`
  - `dataAbertura`: `z.coerce.date()`
  - `dataUltimaAtualizacao`: `z.coerce.date().optional()`
  - `isPresencial`: `z.boolean().default(false)`
  - `distanciaGoianiaKm`: `z.number().nullable().optional()`
  - `miniResumo`: `z.string().min(1)`
  - `resumo`: `z.string().min(1)`
  - `tipoSistemaSugerido`: enum dos 22 códigos (`tipoSistemaCodigoSchema`). Se vier um valor desconhecido ou vazio em sistemas externos, normalizar ou validar conforme o enum dos 22 tipos.
  - `quantidadeLotes`: `z.number().int().positive().default(1)`
  - `loteUnico`: `z.boolean().default(true)`
  - `precoPorLote`: `z.boolean().default(false)`
  - `parecerGoNoGo`: aceita `"GO" | "AVALIAR" | "NO-GO" | "NO_GO"` e normaliza `"NO-GO"` para `"NO_GO"` (valor do enum `ParecerIA` no Prisma).
  - `justificativaTecnica`: `z.string().optional()`
  - `atestadosExigidos`: `z.array(z.string()).default([])`
  - `linkPncp`: `z.string().url().optional().or(z.literal(""))`
  - `linkSistemaOrigem`: `z.string().url().optional().or(z.literal(""))`

#### Cálculo do `hashCritico` e Detecção Cirúrgica de Mudanças (`src/server/services/ingestao.service.ts`)
- Exportar função pura `computeHashCritico(input)` que gera um hash SHA-256 hex determinístico a partir dos campos críticos da licitação:
  - `dataAbertura` (em ISO UTC)
  - `valorEstimado` (número normalizado)
  - `resumo` (trimmed)
  - `modalidade` (trimmed)
  - `numeroEdital` (trimmed)
  - `orgaoCnpj` (trimmed)
- Exportar função `ingestLicitacoesV2(payload, actorContext?)`:
  1. Valida `payload` com `ingestaoPayloadV2Schema`.
  2. Para cada item em `payload.licitacoes`:
     - Calcula `novoHash = computeHashCritico(...)`.
     - Busca registro existente por `idPncp` (`pncpId`).
     - **Se não existir:** cria a licitação com `status: "PENDENTE"`, `hashCritico: novoHash`, incrementa `criados` e grava `recordAuditLog({ acao: "INGESTAO_CRIACAO", entidadeTipo: "LICITACAO", entidadeId: id, antes: null, depois: ... })`.
     - **Se já existir e `existente.hashCritico === novoHash`:** mantém inalterado e incrementa `inalterados`.
     - **Se já existir e `existente.hashCritico !== novoHash`:** atualiza os dados da licitação (incluindo `dataAbertura`, `valorEstimado`, `resumo`, `dataUltimaAtualizacao`, `hashCritico: novoHash`, preservando o `status` caso já tenha sido deliberada pela equipe), incrementa `atualizados` e grava `recordAuditLog({ acao: "INGESTAO_ATUALIZACAO_CRITICA", entidadeTipo: "LICITACAO", entidadeId: id, antes: ..., depois: ... })`.
  3. Ao final do lote, grava um log de auditoria consolidado `acao: "INGESTAO_LOTE_V2"` e retorna:
     ```ts
     {
       ok: true,
       versaoContrato: 2,
       totalRecebidos: number,
       criados: number,
       atualizados: number,
       inalterados: number,
       registros: LicitacaoRecord[]
     }
     ```
- **Rota `POST /api/ingestao` (`src/app/api/ingestao/route.ts`):**
  - Recebe o JSON, chama `ingestLicitacoesV2(body)` e retorna `200 OK` com o resultado acima, ou `400 Bad Request` (`{ ok: false, error: "VALIDATION_ERROR", issues }`) em caso de erro de schema Zod.

---

### 2.3. Serviço e Endpoints da Central de Oportunidades (`src/server/services/oportunidades.service.ts` & `/api/oportunidades`)

#### Listagem e Filtros (`listOportunidades(filters)` e `GET /api/oportunidades`)
- **Ordenação Obrigatória (§4.4):** Sempre ordenada por `dataAbertura ASC` (da data de abertura mais próxima para a mais distante).
- **Filtros suportados (`OportunidadesFilterInput` em `src/server/schemas/oportunidades.schema.ts`):**
  - `tipoSistema?: TipoSistemaCodigo` (um dos 22 tipos)
  - `uf?: string` (ex.: `"GO"`, `"SP"`, `"DF"`)
  - `faixaValor?: "ATE_500K" | "500K_A_2M" | "ACIMA_2M"` (ou `valorMin?: number`, `valorMax?: number`):
    - `ATE_500K`: `valorEstimado <= 500_000`
    - `500K_A_2M`: `valorEstimado > 500_000 && valorEstimado <= 2_000_000`
    - `ACIMA_2M`: `valorEstimado > 2_000_000`
  - `status?: LicitacaoStatus` (ex.: `"PENDENTE"`, `"ACEITA"`, `"RECUSADA"`)
  - `parecerIA?: "GO" | "AVALIAR" | "NO_GO" | "NO-GO"`
  - `periodo?: "mes" | "todos"` (se `"mes"`, filtra licitações com `dataAbertura` ou `createdAt` dentro do mês corrente, ou compatível com o atalho do Dashboard)
  - `busca?: string` (filtro case-insensitive em `orgaoNome`, `miniResumo`, `resumo` ou `numeroEdital`)
- **Dados Iniciais (Seed / Fallback Resiliente):**
  - O serviço deve contar com um conjunto inicial realista de licitações seed (mínimo de 4 licitações cobrindo pareceres `GO`, `AVALIAR`, `NO_GO`, diferentes UFs, faixas de valor e tipos de sistema como `EDUCACAO_PORTAL`, `SAUDE_ATENCAO_BASICA`, `GESTAO_PUBLICA_ERP`, `INFRA_CLOUD_SUPORTE`) para que a tela `/oportunidades` já renderize dados ricos tanto com PostgreSQL ativo quanto no fallback em memória dos testes automatizados.

#### Deliberação GO / No-GO (`deliberarOportunidade(input)` e `POST /api/oportunidades/[id]/decisao`)
- **Autorização RBAC:** Valida permissão via `can(user, "licitacao:decide", "licitacao")`. Perfis `DIRETORIA` e `ANALISTA_COMERCIAL` têm permissão; `OPERADOR` recebe erro `403 Forbidden`.
- **Payload (`decisaoOportunidadeSchema`):**
  - `decisao: z.enum(["GO", "NO_GO", "NO-GO"])`
  - `motivoRecusa: z.string().max(1000).optional()`
- **Comportamento:**
  - Quando `decisao === "GO"`:
    - Atualiza `status` da licitação para `"ACEITA"`.
    - Grava em `audit_log`: `acao: "DECISAO_GO"`, `entidadeTipo: "LICITACAO"`, `entidadeId: id`, `antes: { status: statusAnterior }`, `depois: { status: "ACEITA" }`.
  - Quando `decisao === "NO_GO"` ou `"NO-GO"`:
    - Atualiza `status` da licitação para `"RECUSADA"` e armazena `motivoRecusa` (se informado).
    - Grava em `audit_log`: `acao: "DECISAO_NO_GO"`, `entidadeTipo: "LICITACAO"`, `entidadeId: id`, `antes: { status: statusAnterior }`, `depois: { status: "RECUSADA", motivoRecusa: motivoRecusa ?? null }`.

#### Cadastro Manual de Licitação (`criarOportunidadeManual(input)` e `POST /api/oportunidades`)
- **Payload (`criarLicitacaoManualSchema`):**
  - `numeroEdital`: `string` obrigatório
  - `orgaoNome`: `string` obrigatório
  - `orgaoCnpj`: `string` obrigatório (11 a 18 caracteres)
  - `uf`: `string` (2 letras)
  - `municipio`: `string` opcional
  - `modalidade`: `string` (padrão `"Pregão Eletrônico"`)
  - `valorEstimado`: `number >= 0`
  - `dataAbertura`: `z.coerce.date()`
  - `miniResumo`: `string` (2 a 5 palavras)
  - `resumo`: `string`
  - `tipoSistemaCodigo`: um dos 22 códigos (`tipoSistemaCodigoSchema`)
  - `parecerIA`: `"GO" | "AVALIAR" | "NO_GO"` (padrão `"AVALIAR"`)
  - `isPresencial`: `boolean` opcional (padrão `false`)
  - `pncpId`: opcional (se omitido, gerar automaticamente `MANUAL-${timestamp}-${random}`)
- **Comportamento:**
  - Calcula `hashCritico`, cria a licitação com `status: "PENDENTE"`, grava em `audit_log` (`acao: "CADASTRO_MANUAL_LICITACAO"`, `entidadeTipo: "LICITACAO"`, `entidadeId: id`) e retorna `201 Created`.

---

### 2.4. Interface Frontend — Central de Oportunidades (`src/app/oportunidades/page.tsx` e `/oportunidades/[id]/page.tsx`)

#### Seletores `data-testid` e Requisitos Visuais Obrigatórios
1. **Ações de Topo em `/oportunidades`:**
   - Botão **`+ Adicionar Licitação Manualmente`**: `data-testid="btn-open-manual-modal"`
   - Botão **`Importar Relatório (JSON)`**: `data-testid="btn-open-import-modal"`
2. **Barra de Filtros Operacionais (`data-testid="oportunidades-filters"`):**
   - Filtro Tipo de Sistema (22 opções + "Todos"): `data-testid="filter-tipo-sistema"`
   - Filtro UF (ex.: Todas, GO, DF, SP, MG, PR, RJ, etc.): `data-testid="filter-uf"`
   - Filtro Faixa de Valor (`Todos`, `Até R$ 500 mil`, `R$ 500 mil a R$ 2 mi`, `Acima de R$ 2 mi`): `data-testid="filter-faixa-valor"`
   - Filtro Status (`Todos`, `PENDENTE`, `ACEITA`, `RECUSADA`): `data-testid="filter-status"`
   - Filtro Parecer da IA (`Todos`, `GO`, `AVALIAR`, `NO_GO`): `data-testid="filter-parecer-ia"`
   - Campo de busca textual: `data-testid="filter-busca"`
   - **Integração com Query Params:** Ao carregar `/oportunidades?status=PENDENTE`, `/oportunidades?status=RECUSADA`, `/oportunidades?periodo=mes` ou `/oportunidades?tipoSistema=EDUCACAO_PORTAL`, os filtros devem inicializar sincronizados com os parâmetros da URL.
3. **Tabela de Alta Densidade Carbon `DataTable` (`data-testid="oportunidades-datatable"`):**
   - Ordenada por **Data de Abertura** ascendente (mais próxima primeiro).
   - Colunas obrigatórias:
     1. **Data de Abertura** (com fonte monoespaçada `IBM Plex Mono`)
     2. **Órgão e UF** (nome do órgão + UF)
     3. **Mini-resumo** (mais tag do Tipo de Sistema)
     4. **Resumo do Objeto** (texto truncado com atributo `title` ou Tooltip Carbon exibindo o resumo completo ao passar o mouse)
     5. **Valor Estimado** (formatado em Real `R$`, estilizado com `fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)"` e `data-testid="valor-estimado-cell"`)
     6. **Parecer da IA** (`Tag` Carbon: verde `GO`, amarela/warm-gray `AVALIAR`, vermelha `NO-GO`)
     7. **Ações Rápidas**:
        - Botão **`Aceitar (GO)`**: `data-testid="btn-aceitar-{id}"` (dispara decisão `GO` e atualiza status para `ACEITA`).
        - Botão **`Recusar (No-GO)`**: `data-testid="btn-recusar-{id}"` (abre o modal de confirmação/motivo de recusa).
   - **Linha Clicável:**
     - Cada `TableRow` deve ter `data-testid="oportunidade-row-{id}"` e `style={{ cursor: "pointer" }}`.
     - Clicar na linha redireciona para `/oportunidades/[id]` (cliques nos botões de Ações Rápidas devem usar `e.stopPropagation()` para não navegar acidentalmente).
4. **Modal de Motivo de Recusa (`data-testid="modal-recusar-licitacao"`):**
   - Campo de texto opcional para o motivo (`data-testid="input-motivo-recusa"`).
   - Botão de confirmação (`data-testid="btn-confirmar-recusa"`) que envia `POST /api/oportunidades/[id]/decisao` com `decisao: "NO_GO"` e `motivoRecusa`.
5. **Modal `+ Adicionar Licitação Manualmente` (`data-testid="modal-adicionar-manual"`):**
   - Inputs com `data-testid`:
     - `input-manual-edital` (`numeroEdital`)
     - `input-manual-orgao` (`orgaoNome`)
     - `input-manual-cnpj` (`orgaoCnpj`)
     - `input-manual-uf` (`uf`)
     - `input-manual-valor` (`valorEstimado`)
     - `input-manual-abertura` (`dataAbertura`)
     - `input-manual-mini-resumo` (`miniResumo`)
     - `input-manual-resumo` (`resumo`)
     - `input-manual-tipo-sistema` (`tipoSistemaCodigo` — select com os 22 tipos)
   - Botão salvar (`data-testid="btn-salvar-manual"`) que chama `POST /api/oportunidades` e adiciona a licitação na tabela.
6. **Modal `Importar Relatório (JSON)` (`data-testid="modal-importar-json"`):**
   - Permite upload de arquivo `.json` (`data-testid="input-file-json"`) e/ou colagem de conteúdo JSON (`data-testid="textarea-import-json"`).
   - Botão processar (`data-testid="btn-confirmar-importacao"`) que envia o payload para `POST /api/ingestao`, exibe resumo de criados/atualizados/inalterados e recarrega a listagem.
7. **Página de Detalhes Inicial (`/oportunidades/[id]` — `src/app/oportunidades/[id]/page.tsx`):**
   - Container com `data-testid="oportunidade-detalhe-page"`, exibindo Número do Edital, Órgão, UF, Valor Estimado, Parecer da IA, Status atual, Tipo de Sistema, Resumo completo e botão de voltar para `/oportunidades`.

---

## 3. Isolamento de Marca & Qualidade (DoD)
- **Proibido hardcode de `"Portal PNCP"`** fora de `src/config/brand.ts`.
- Todas as mutações (`POST /api/ingestao`, `POST /api/oportunidades`, `POST /api/oportunidades/[id]/decisao`) devem registrar entrada em `audit_log` via `recordAuditLog`.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run test:e2e` e `pnpm run build` devem passar com 0 erros.
