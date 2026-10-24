# ADR 0002 — Catálogo dos 22 Tipos de Sistema, Ingestão v2 e Deliberação GO/No-GO (Sprint 1)

- **Status:** Aceito
- **Data:** 2026-10-24
- **Autor:** `Arquiteto de Software_ag`
- **Issue Relacionada:** `AV-34` (Épico `AV-33` — Sprint 1)

---

## 1. Contexto

A Sprint 1 entrega o coração de entrada e triagem de negócios do Portal: a ingestão do relatório `licitacoes_portal.json` (contrato v2) produzido pela esteira de IA do Paperclip e a Central de Oportunidades com deliberação GO / No-GO. Esta etapa arquitetural define os contratos e o modelo de dados que o `QA_ag` usará para escrever a suíte RED e que os desenvolvedores implementarão até o estado GREEN.

## 2. Decisões Arquiteturais

### 2.1. Catálogo dos 22 Tipos de Sistema — fonte da verdade em código

- `src/config/tipos-sistema.ts` exporta a constante imutável `TIPOS_SISTEMA_CATALOG` com exatamente os 22 tipos do PRD §5.1, na ordem canônica 1..22 (`SISTEMA_NOVO` → `OUTROS`), com asserções de contrato em tempo de compilação (comprimento 22, primeiro/último código).
- Helpers tipados: `isTipoSistemaCodigo`, `getTipoSistema`, `getTipoSistemaNome`, `listTiposSistema`, `normalizarTipoSistemaCodigo` e a tupla `TIPOS_SISTEMA_CODIGOS` (contrato direto para `z.enum`).
- A tabela `TipoSistema` (`id`, `codigo @unique`, `nome`, `ordem`, `ativo`, `createdAt`, `updatedAt`; índices em `ordem` e `ativo`) espelha o catálogo para consultas SQL/BI, provisionada por `seedTiposSistema()` (upsert idempotente por `codigo`, com fallback resiliente ao catálogo em memória quando o PostgreSQL não está acessível — mesmo padrão do `seedDirectors()`).

### 2.2. `Licitacao.tipoSistemaCodigo` sem FK rígida (acoplamento por código)

- Decidido **não** criar constraint de chave estrangeira de `Licitacao.tipoSistemaCodigo` para `TipoSistema.codigo`. O vínculo é lógico, garantido pela validação Zod na borda (ingestão e cadastro manual) e pelo vocabulário controlado do catálogo.
- **Justificativa:** a ingestão v2 é uma esteira externa de alto volume; uma FK rígida imporia ordenação de escritas e quebraria lotes inteiros em caso de dessincronia do seed, além de impedir o fallback em memória dos testes unitários. O campo é indexado (`@@index([tipoSistemaCodigo])`) para os filtros da Central de Oportunidades (PRD §10 — performance < 300 ms).
- Novos campos em `Licitacao`: `portalDisputa`, `esfera`, `poder` (TEXT), `atestadosExigidos` (JSONB) e `motivoRecusa` (TEXT) — migration `20261024225043_sprint_1_tipos_sistema_e_campos_licitacao`.

### 2.3. Normalização resiliente na borda (anti-fragilidade da esteira)

- `tipoSistemaSugerido`: valores vazios, não textuais ou desconhecidos vindos de sistemas externos são **normalizados para `OUTROS`** (`tipoSistemaCodigoNormalizadoSchema` = `z.unknown().transform(normalizar).pipe(tipoSistemaCodigoSchema)`), em vez de rejeitar o lote — o PRD §5.1 define `OUTROS` como "campo livre para novas especialidades", e a triagem humana refina depois na UI.
- `parecerGoNoGo` (ingestão), `parecerIA` (filtro) e `decisao` (deliberação) aceitam a grafia legada `"NO-GO"` e **sempre normalizam para `"NO_GO"`** (valor do enum `ParecerIA` no Prisma) na saída do parse. O banco jamais recebe `"NO-GO"`.

### 2.4. Contratos Zod da Sprint 1 (`src/server/schemas/`)

- `tipos-sistema.schema.ts`: `tipoSistemaCodigoSchema` (enum estrito dos 22 códigos) e `tipoSistemaCodigoNormalizadoSchema`.
- `ingestao.schema.ts`: `ingestaoPayloadV2Schema` (`versaoContrato: z.literal(2)`, `executadoEm`, `totalRegistros`, `licitacoes[]`) e `ingestaoLicitacaoItemSchema` com todos os campos do PRD §8, incluindo defaults (`isPresencial: false`, `quantidadeLotes: 1`, `loteUnico: true`, `precoPorLote: false`, `atestadosExigidos: []`) e links com `z.string().url().optional().or(z.literal(""))`.
- `oportunidades.schema.ts`: `oportunidadesFilterSchema` (tipoSistema, uf uppercase, faixaValor, valorMin/valorMax, status, parecerIA, periodo `mes|todos`, busca), `decisaoOportunidadeSchema` (`decisao` GO/NO_GO/NO-GO normalizada + `motivoRecusa` ≤ 1000) e `criarLicitacaoManualSchema` (com refinement de `miniResumo` entre 2 e 5 palavras, `modalidade` default `"Pregão Eletrônico"`, `parecerIA` default `"AVALIAR"`).
- Todos reexportados por `src/server/schemas/index.ts`.

### 2.5. RBAC — ações escopadas por recurso `licitacao:decide` e `licitacao:create`

- Adotado o padrão de ações namespaced `"<recurso>:<acao>"` para as novas permissões da Sprint 1, sem quebrar as ações legadas da Sprint 0 (`decide_go_nogo`, etc.).
- `can(user, "licitacao:decide", "licitacao")` e `can(user, "licitacao:create", "licitacao")` autorizam `DIRETORIA` e `ANALISTA_COMERCIAL` e negam `OPERADOR` (HTTP 403 nas rotas), conforme sprint-1-spec §2.3. A ação legada `decide_go_nogo` permanece exclusiva da `DIRETORIA` até sua descontinuação em sprint futura.

### 2.6. Auditoria obrigatória das mutações (PRD §7)

- Toda mutação da Sprint 1 grava em `audit_log` via `recordAuditLog` com as ações canônicas: `INGESTAO_CRIACAO`, `INGESTAO_ATUALIZACAO_CRITICA`, `INGESTAO_LOTE_V2`, `DECISAO_GO`, `DECISAO_NO_GO` e `CADASTRO_MANUAL_LICITACAO`, sempre com `entidadeTipo: "LICITACAO"`, `entidadeId` e snapshots `antes`/`depois`.
- O cálculo de `hashCritico` (SHA-256 determinístico sobre `dataAbertura` ISO UTC, `valorEstimado`, `resumo`, `modalidade`, `numeroEdital`, `orgaoCnpj`) é o mecanismo de detecção cirúrgica de atualizações do PNCP (PRD §6.1): hash igual → registro inalterado; hash diferente → update preservando o `status` deliberado pela equipe.

## 3. Consequências

- O `QA_ag` (Etapa 2) escreve a suíte RED contra estes contratos estáveis: catálogo de 22 tipos, schemas de ingestão v2/oportunidades e a matriz RBAC `licitacao:decide`/`licitacao:create`.
- O `Desenvolvedor Backend_ag` implementa `ingestao.service.ts` (`computeHashCritico`, `ingestLicitacoesV2`), `oportunidades.service.ts` (`listOportunidades`, `deliberarOportunidade`, `criarOportunidadeManual`) e as rotas `POST /api/ingestao`, `GET|POST /api/oportunidades` e `POST /api/oportunidades/[id]/decisao` guiado por estes contratos.
- A ausência de FK rígida em `tipoSistemaCodigo` transfere a garantia de integridade para a validação Zod na borda e para o seed idempotente — trade-off aceito e monitorado no code review.
