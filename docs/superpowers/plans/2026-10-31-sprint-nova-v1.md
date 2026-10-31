# SPRINT Nova V1 — Header Multi-Empresa, Configurações, Oportunidades Segmentadas, Download Dossiê, Documentação e Declarações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o Header com seletor de Razão Social + CNPJ e isolamento multi-tenant estrito entre empresas; corrigir a persistência e validações parciais em Configurações com catálogo profissional de CNAE IBGE; refinar os filtros de Segmento em Oportunidades com MultiSelect restrito aos ramos da empresa ativa; corrigir o download de anexos do Dossiê via rota streaming da aplicação; eliminar o bug de fuso horário (-1 dia) e substituir documentos in-place em Documentação; preencher todos os dados societários em Declarações; e garantir os alertas de 30 dias em Notificações.

**Architecture:** Abordagem Schema-First e Layered Architecture. No Frontend, componentes IBM Carbon Design System (`@carbon/react`) integrados ao AppShell, persistindo o tenant ativo em cookies compartilhados (`portal_licitacao_active_tenant`) e sincronizando alterações via eventos de janela. No Backend, serviços de domínio em `src/server/services/` filtram estritamente por `tenantId` e pelos segmentos cadastrados para o CNPJ ativo; rotas de API em `src/app/api/` validam schemas Zod permissivos para edições parciais; e o streaming de arquivos é servido por endpoint dedicado com `Content-Disposition`, sem dependência de domínios internos.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5 (Strict), Prisma ORM + PostgreSQL 16, Zod, IBM Carbon Design System (`@carbon/react`), Cloudflare R2 / S3 Storage, Vitest.

**Spec:** `/Users/vitorhenrique/Downloads/Sprint Nova V1.pdf` (Páginas 1 a 3)

## Global Constraints

- **Multi-Tenant e Isolamento Estrito:** Cada empresa (CNPJ) cadastrada pelo cliente possui isolamento absoluto de dados. As oportunidades, Minhas Licitações, Kanban, Calendário, Documentos e Portais da Empresa X NUNCA podem aparecer para a Empresa Y.
- **Header do Portal:** O Header exibe a Razão Social e o CNPJ da empresa atualmente ativa. Ao alternar de empresa, exibe indicador visual de loading e atualiza toda a base de dados/informações exibidas na sessão.
- **Sincronização Bidirecional:** A alternância de empresa no Header reflete instantaneamente no select de `/configuracoes` (aba Dados da Empresa Licitante) e vice-versa.
- **Persistência de Dados da Empresa:** Dados cadastrais (Segmentos, Sub-segmentos, Endereço, UF, Representante) não podem ser perdidos ao salvar e recarregar a página. Schemas de entrada devem permitir salvamentos parciais sem exigir campos dispensáveis.
- **Catálogo Oficial de CNAE:** O sistema disponibiliza autocomplete/pesquisa de códigos CNAE oficiais do IBGE no cadastro e na edição da empresa.
- **Filtro de Segmentos em Oportunidades:** Quando o filtro de Segmento estiver em "Todos os Segmentos", o sistema busca **apenas** as oportunidades dos ramos configurados para a empresa ativa (e não de todos os ramos do catálogo global). O filtro deve suportar `MultiSelect` com checkboxes similar ao filtro de UF.
- **Download Confiável no Dossiê:** Arquivos anexados via upload manual devem ser servidos pela própria aplicação via streaming/proxy com cabeçalho de download (`Content-Disposition: attachment`), sem redirecionar para domínios internos inacessíveis (`docs.licitacao.internal`).
- **Data de Vencimento em Documentação:** O salvamento e a exibição da data de vencimento não podem sofrer regressão de -1 dia por discrepância de fuso horário (UTC vs UTC-3).
- **Substituição de Documentos:** A ação "Atualizar Documento" deve atualizar o documento existente no banco (datas e arquivo), sem duplicar o registro na listagem.
- **Declarações Completas:** A tela `/declaracoes` preenche automaticamente Razão Social, CNPJ, Endereço Completo, Representante (Nome, CPF, RG, Cargo), Cidade e UF a partir dos dados da empresa ativa selecionada.
- **Notificações:** Alertas ativos devem cobrir licitações recentes, documentos e portais a vencer em até 30 dias (janelas de 30, 15, 7, 3, 1 dias).

## Review Focus

1. **Isolamento de Ramos na Busca Default de Oportunidades:** Um cliente com CNPJ de Alimentos com filtro em "Todos os Segmentos" não pode receber nem visualizar licitações de Medicamentos ou Obras; apenas as oportunidades associadas aos seus segmentos cadastrados.
2. **Salvamento Parcial em Configurações:** O usuário que edita apenas o campo de Segmentos ou o Endereço sem informar RG do representante ou banco não pode tomar erro de validação HTTP 400.
3. **Resolução de Download de Anexos na VPS:** Qualquer anexo adicionado a uma oportunidade deve ser baixável com sucesso clicando no botão "Download", sem falha de DNS (`ERR_NAME_NOT_RESOLVED`).
4. **Timezone Offset em Documentação:** Informar `2026-10-27` no formulário deve renderizar estritamente `27/10/2026` em qualquer navegador ou ambiente brasileiro.
5. **Atualização In-Place de Documento:** Salvar uma nova versão de documento com ID `doc_123` deve manter apenas 1 registro correspondente na listagem, com a nova validade e o novo arquivo.

---

### Task 1: Header do Portal — Seletor de Razão Social + CNPJ Ativo, Sincronização Bidirecional e Loading

**Files:**
- Create: `src/components/shell/tenant-header-selector.tsx`
- Modify: `src/components/shell/app-shell.tsx:145-155`
- Create: `tests/unit/tenant-header-selector.test.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/configuracoes/tenants` -> `{ ok: true, tenants: Array<{ id, cnpj, razaoSocial, plano }>, activeTenantId: string }`
  - `POST /api/configuracoes/tenants` `{ tenantId: string }` -> `{ ok: true, activeTenantId: string }`
- Produces:
  - Componente `<TenantHeaderSelector />` no Header da aplicação, com:
    - Dropdown Carbon com `Razão Social — CNPJ` formatado.
    - Disparo de loading overlay (`Loading` ou barra de progresso) durante a transição.
    - Disparo de evento global (`window.dispatchEvent(new CustomEvent('tenant-changed', { detail: { tenantId } }))`) e `router.refresh()` para recarregar dados da página atual.

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/tenant-header-selector.test.tsx`**

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { TenantHeaderSelector } from "@/components/shell/tenant-header-selector";

describe("TenantHeaderSelector (Header Multi-Empresa)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve carregar e exibir a Razão Social e o CNPJ da empresa ativa no Header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        tenants: [
          { id: "tenant_1", razaoSocial: "ALIMENTOS LTDA", cnpj: "12345678000190" },
          { id: "tenant_2", razaoSocial: "REMEDIOS PHARMA", cnpj: "98765432000109" },
        ],
        activeTenantId: "tenant_1",
      }),
    });

    render(<TenantHeaderSelector />);

    await waitFor(() => {
      expect(screen.getByText(/ALIMENTOS LTDA/i)).toBeInTheDocument();
      expect(screen.getByText(/12\.345\.678\/0001-90/)).toBeInTheDocument();
    });
  });

  it("deve alternar a empresa ativa via POST e disparar indicador de loading e evento de sincronização", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          tenants: [
            { id: "tenant_1", razaoSocial: "ALIMENTOS LTDA", cnpj: "12345678000190" },
            { id: "tenant_2", razaoSocial: "REMEDIOS PHARMA", cnpj: "98765432000109" },
          ],
          activeTenantId: "tenant_1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, activeTenantId: "tenant_2" }),
      });

    global.fetch = fetchMock;
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TenantHeaderSelector />);

    await waitFor(() => {
      expect(screen.getByText(/ALIMENTOS LTDA/i)).toBeInTheDocument();
    });

    const select = screen.getByTestId("tenant-header-select");
    fireEvent.change(select, { target: { value: "tenant_2" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/configuracoes/tenants",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ tenantId: "tenant_2" }),
        }),
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "tenant-changed" }),
      );
    });
  });
});
```

- [x] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/tenant-header-selector.test.tsx`
Expected: FAIL (módulo `@/components/shell/tenant-header-selector` não existe).

- [x] **Step 3: Criar componente `TenantHeaderSelector` e integrá-lo em `src/components/shell/app-shell.tsx`**

1. Em `src/components/shell/tenant-header-selector.tsx`:
   - Consultar `GET /api/configuracoes/tenants` ao montar e quando receber evento `tenant-changed`.
   - Renderizar seletor compacto no Header Carbon com formato: `<Razão Social> — <CNPJ Formatado>`.
   - Se houver mais de uma empresa, permitir seleção no dropdown; ao selecionar, exibir modal/overlay de loading discreto (`"Alternando empresa..."`), fazer `POST /api/configuracoes/tenants` com `{ tenantId }`, emitir `CustomEvent("tenant-changed", { detail: { tenantId } })` e chamar `router.refresh()`.
2. Em `src/components/shell/app-shell.tsx`:
   - Inserir `<TenantHeaderSelector />` dentro de `<Header>` logo após `<HeaderName>` e antes de `<HeaderGlobalBar>`.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/tenant-header-selector.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/shell/tenant-header-selector.tsx src/components/shell/app-shell.tsx tests/unit/tenant-header-selector.test.tsx
git commit -m "feat(header): seletor de empresa razao social e cnpj com loading e sincronizacao"
```

---

### Task 2: Configurações — Persistência de Dados da Empresa, Multi-CNPJ e Autocomplete CNAE

**Files:**
- Create: `src/config/cnae-catalogo.ts`
- Create: `src/app/api/cnae/route.ts`
- Modify: `src/server/schemas/configuracao.schema.ts:6-42`
- Modify: `src/server/services/tenant.service.ts:170-230`
- Modify: `src/server/services/configuracoes.service.ts:370-520`
- Modify: `src/app/api/configuracoes/empresa/route.ts:15-68`
- Modify: `src/app/configuracoes/page.tsx:497-558`
- Create: `tests/unit/sprint-nova-task2-configuracoes-cnae.test.ts`

**Interfaces:**
- Consumes:
  - `GET /api/cnae?q=...` -> `{ ok: true, cnaes: Array<{ codigo: string, descricao: string }> }`
  - `PUT /api/configuracoes/empresa?tenantId=...` com dados cadastrais e escopo da empresa
- Produces:
  - Catálogo de CNAEs do IBGE (`CATALOGO_CNAE`) indexado por código e descrição.
  - Inicialização automática de registro `configuracao_empresa` ao cadastrar novo CNPJ em `createTenantForUser`.
  - Schema Zod flexível para permitir edições parciais sem erros de obrigatoriedade indevida.
  - Persistência efetiva por `tenantId` garantindo que alterações fiquem gravadas e sejam recarregadas ao voltar na tela.

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/sprint-nova-task2-configuracoes-cnae.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { configuracaoEmpresaAtualizarInputSchema } from "@/server/schemas/configuracao.schema";
import { CATALOGO_CNAE, buscarCnaes } from "@/config/cnae-catalogo";
import { atualizarConfiguracaoEmpresa, obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";

describe("Sprint Nova Task 2 — Persistência de Configurações e Catálogo CNAE", () => {
  it("deve permitir validação e salvamento parcial de campos da empresa sem exigir todos os dados secundários", () => {
    const inputParcial = {
      razaoSocial: "NOVA EMPRESA ALIMENTOS LTDA",
      cnpj: "12.345.678/0001-90",
      segmentos: ["ALIMENTACAO_BEBIDAS"],
      ufs: ["GO", "DF"],
      endereco: "Av Brasil 100",
      cidade: "Goiânia",
      uf: "GO",
    };

    const parsed = configuracaoEmpresaAtualizarInputSchema.safeParse(inputParcial);
    expect(parsed.success).toBe(true);
  });

  it("deve fornecer catálogo de CNAEs oficiais do IBGE com busca por código e texto", () => {
    expect(CATALOGO_CNAE.length).toBeGreaterThan(50);
    const resultadosAlimento = buscarCnaes("alimentação");
    expect(resultadosAlimento.length).toBeGreaterThan(0);
    expect(resultadosAlimento[0]).toHaveProperty("codigo");
    expect(resultadosAlimento[0]).toHaveProperty("descricao");
  });

  it("deve persistir e recuperar configurações associadas ao tenantId específico", async () => {
    const tenantIdTeste = "tenant_teste_persist_1";
    await atualizarConfiguracaoEmpresa(
      {
        razaoSocial: "EMPRESA TESTE MULTI-CNPJ",
        cnpj: "11.222.333/0001-44",
        cnae: "4711-3/02",
        endereco: "Rua T-63, 500",
        cidade: "Goiânia",
        uf: "GO",
        segmentos: ["ALIMENTACAO_BEBIDAS"],
        ufs: ["GO"],
      },
      "user_123",
      tenantIdTeste,
    );

    const config = await obterConfiguracaoEmpresa(tenantIdTeste);
    expect(config.razaoSocial).toBe("EMPRESA TESTE MULTI-CNPJ");
    expect(config.segmentos).toContain("ALIMENTACAO_BEBIDAS");
    expect(config.cnae).toBe("4711-3/02");
  });
});
```

- [x] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/sprint-nova-task2-configuracoes-cnae.test.ts`
Expected: FAIL (`CATALOGO_CNAE` ausente e validação parcial falhando por campos obrigatórios como `cep` ou `representanteCpf`).

- [x] **Step 3: Implementar Catálogo CNAE, Schemas Permissivos e Persistência por Tenant**

1. Em `src/config/cnae-catalogo.ts`:
   - Definir `CATALOGO_CNAE` com as classes e subclasses oficiais do IBGE mais utilizadas em compras públicas (Alimentos, Saúde/Medicamentos, TI/Software, Engenharia/Obras, Serviços Gerais, Limpeza, Transporte, etc.).
   - Exportar helper `buscarCnaes(query: string, limite = 20)`.
2. Em `src/app/api/cnae/route.ts`:
   - Endpoint `GET /api/cnae?q=termo` retornando os CNAEs correspondentes para o autocomplete.
3. Em `src/server/schemas/configuracao.schema.ts`:
   - Tornar opcionais com fallback ou nullable os campos `cep`, `representanteNome`, `representanteCpf`, `representanteCargo`, `bancoNome`, `agencia`, `contaCorrente`, `chavePix` no `configuracaoEmpresaAtualizarInputSchema`, permitindo que o usuário salve apenas os dados de identificação, segmentos e UFs se desejar.
4. Em `src/server/services/tenant.service.ts`:
   - Em `createTenantForUser`, criar imediatamente o registro em `configuracao_empresa` vinculado ao `newTenantId` com Razão Social, CNPJ, CNAE, Endereço, Cidade e UF informados no formulário.
5. Em `src/server/services/configuracoes.service.ts`:
   - Assegurar que `obterConfiguracaoEmpresa` e `atualizarConfiguracaoEmpresa` priorizem o `tenantId` fornecido em vez de cair no registro global `default`.
6. Em `src/app/configuracoes/page.tsx`:
   - Na aba Dados da Empresa:
     - Adicionar autocomplete/combobox para seleção do CNAE Principal consultando `/api/cnae?q=...`.
     - Passar `tenantId` ativo na URL `/api/configuracoes/empresa?tenantId=${activeTenantId}` tanto no `GET` quanto no `PUT`.
     - No modal de Novo CNPJ, incluir campo de busca/seleção de CNAE e salvar todos os campos preenchidos.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/sprint-nova-task2-configuracoes-cnae.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/config/cnae-catalogo.ts src/app/api/cnae/route.ts src/server/schemas/configuracao.schema.ts src/server/services/tenant.service.ts src/server/services/configuracoes.service.ts src/app/api/configuracoes/empresa/route.ts src/app/configuracoes/page.tsx tests/unit/sprint-nova-task2-configuracoes-cnae.test.ts
git commit -m "feat(configuracoes): persistencia multi-tenant real, cadastro novo cnpj completo e catalogo cnae"
```

---

### Task 3: Isolamento Multi-Tenant Estrito e Filtro de Segmentos Checkbox na Central de Oportunidades

**Files:**
- Modify: `src/server/services/oportunidades.service.ts:370-430`
- Modify: `src/app/api/oportunidades/route.ts:16-45`
- Modify: `src/app/oportunidades/page.tsx:470-520`
- Create: `tests/unit/sprint-nova-task3-oportunidades-segmentos-isolamento.test.ts`

**Interfaces:**
- Consumes:
  - `GET /api/oportunidades?segmento=...&subsegmento=...&uf=...` com `activeTenantId` lido do cookie ou query.
  - `GET /api/tenant/preferencias` -> retorna `segmentos`, `subsegmentos`, `ufs` da empresa ativa.
- Produces:
  - Comportamento de busca: quando `filtroSegmento` estiver vazio ("Todos os Segmentos"), filtra **apenas** pelos segmentos configurados na empresa ativa do usuário (nunca retorna segmentos não contratados/não configurados pela empresa).
  - Componente UI: seletor de Segmento / Ramo transformado em `MultiSelect` com checkboxes similar ao filtro de UF.
  - Isolamento estrito: oportunidade recusada ou favoritada em uma empresa não reflete na outra.

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/sprint-nova-task3-oportunidades-segmentos-isolamento.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { insertInMemoryLicitacao, resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";

describe("Sprint Nova Task 3 — Oportunidades: Filtro de Segmentos e Isolamento por Empresa", () => {
  it("deve restringir a busca padrão ('Todos os Segmentos') apenas aos segmentos configurados na empresa ativa", async () => {
    resetInMemoryLicitacoes();

    // Licitação de Alimentos
    insertInMemoryLicitacao({
      id: "lic_alim_1",
      idPncp: "alim_001",
      numeroEdital: "PE 10/2026",
      orgaoNome: "Prefeitura de Goiânia",
      uf: "GO",
      objeto: "Aquisição de gêneros alimentícios e merenda escolar",
      dataAbertura: new Date("2026-11-15T09:00:00Z"),
      valorEstimado: 100000,
      tipoSistemaCodigo: "OUTROS",
      segmentoMacro: "ALIMENTACAO_BEBIDAS",
    });

    // Licitação de Medicamentos
    insertInMemoryLicitacao({
      id: "lic_med_1",
      idPncp: "med_001",
      numeroEdital: "PE 20/2026",
      orgaoNome: "Hospital Municipal",
      uf: "GO",
      objeto: "Aquisição de medicamentos e insumos hospitalares",
      dataAbertura: new Date("2026-11-15T09:00:00Z"),
      valorEstimado: 200000,
      tipoSistemaCodigo: "OUTROS",
      segmentoMacro: "SAUDE_MEDICAMENTOS",
    });

    // Cenário: Empresa ativa trabalha APENAS com ALIMENTACAO_BEBIDAS
    const resultadoEmpresaAlimentos = await listOportunidades({
      segmentosTenantAtivo: ["ALIMENTACAO_BEBIDAS"],
      // segmento não informado (busca default 'Todos os Segmentos')
    });

    expect(resultadoEmpresaAlimentos.some((l) => l.segmentoMacro === "ALIMENTACAO_BEBIDAS")).toBe(true);
    expect(resultadoEmpresaAlimentos.some((l) => l.segmentoMacro === "SAUDE_MEDICAMENTOS")).toBe(false);
  });
});
```

- [x] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/sprint-nova-task3-oportunidades-segmentos-isolamento.test.ts`
Expected: FAIL (`listOportunidades` ainda não restringe por `segmentosTenantAtivo` no default).

- [x] **Step 3: Implementar restrição de segmentos no backend e MultiSelect no frontend de Oportunidades**

1. Em `src/server/schemas/oportunidade.schema.ts` e `src/server/services/oportunidades.service.ts`:
   - Adicionar suporte a `segmentosTenantAtivo?: string[]` no schema e na lógica de filtro.
   - Quando `filters.segmento` estiver vazio ou for "Todos os Segmentos", mas `filters.segmentosTenantAtivo` tiver itens, aplicar filtro `IN (segmentosTenantAtivo)`.
2. Em `src/app/api/oportunidades/route.ts`:
   - Obter o tenant ativo da sessão ou do cookie `portal_licitacao_active_tenant`.
   - Carregar os segmentos configurados do tenant ativo e injetar em `segmentosTenantAtivo` dos filtros da busca.
3. Em `src/app/oportunidades/page.tsx`:
   - Substituir o `<Dropdown id="filter-segmento">` por `<MultiSelect id="filter-segmento">` com checkboxes quando a empresa tiver múltiplos segmentos configurados, permitindo marcar um, vários ou todos os seus ramos.
   - Garantir que a lista de opções contenha apenas os segmentos cadastrados para a empresa ativa.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/sprint-nova-task3-oportunidades-segmentos-isolamento.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/server/schemas/oportunidade.schema.ts src/server/services/oportunidades.service.ts src/app/api/oportunidades/route.ts src/app/oportunidades/page.tsx tests/unit/sprint-nova-task3-oportunidades-segmentos-isolamento.test.ts
git commit -m "feat(oportunidades): filtro de segmentos restrito a empresa ativa e multiselect com checkboxes"
```

---

### Task 4: Dossiê — Rota de Download Streaming de Anexos sem Erro de Domínio Interno

**Files:**
- Create: `src/app/api/oportunidades/[id]/arquivos/[arquivoId]/download/route.ts`
- Modify: `src/app/api/oportunidades/[id]/arquivos/[arquivoId]/route.ts`
- Modify: `src/app/oportunidades/[id]/page.tsx:438-456,1133-1143`
- Create: `tests/unit/sprint-nova-task4-download-anexos.test.ts`

**Interfaces:**
- Consumes:
  - `GET /api/oportunidades/[id]/arquivos/[arquivoId]/download`
- Produces:
  - Stream de resposta HTTP com headers:
    - `Content-Disposition: attachment; filename="<nomeOriginal>"`
    - `Content-Type: <mimeType>`
  - Links de download na interface do Dossiê que apontam para a rota local em vez do domínio interno `docs.licitacao.internal`.

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/sprint-nova-task4-download-anexos.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { GET as downloadRoute } from "@/app/api/oportunidades/[id]/arquivos/[arquivoId]/download/route";

describe("Sprint Nova Task 4 — Rota de Download Streaming de Anexos do Dossiê", () => {
  it("deve responder com status 200, headers de anexo e stream de bytes para download", async () => {
    const mockRequest = new Request("http://localhost:3000/api/oportunidades/lic_123/arquivos/arq_456/download");
    const mockContext = {
      params: Promise.resolve({ id: "lic_123", arquivoId: "arq_456" }),
    };

    const response = await downloadRoute(mockRequest, mockContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-type")).toBeTruthy();
  });
});
```

- [x] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/sprint-nova-task4-download-anexos.test.ts`
Expected: FAIL (módulo `/download/route` não existe).

- [x] **Step 3: Implementar rota de download streaming e atualizar botões do Dossiê**

1. Em `src/app/api/oportunidades/[id]/arquivos/[arquivoId]/download/route.ts`:
   - Buscar metadados do arquivo na oportunidade (banco ou store).
   - Se o arquivo possuir `r2Key` ou buffer:
     - Obter o buffer através do cliente R2 (`obterBufferStreamingR2` ou fallback mock).
     - Retornar `new NextResponse(buffer, { headers: { "Content-Disposition": `attachment; filename="${encodeURIComponent(arquivo.nome)}"`, "Content-Type": arquivo.mimeType } })`.
   - Se for arquivo do PNCP externo (`https://pncp.gov.br/...`), redirecionar (`NextResponse.redirect(url)`).
2. Em `src/app/oportunidades/[id]/page.tsx`:
   - Atualizar a função de download individual e "Baixar Todos / Baixar Selecionados":
     - Se `arq.caminho` começar com `http://docs.licitacao.internal` ou `https://docs.licitacao.internal` (ou não for URL externa pública), utilizar a rota de download `/api/oportunidades/${oportunidade.id}/arquivos/${arq.id}/download`.
     - Evita qualquer navegação para `docs.licitacao.internal`.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/sprint-nova-task4-download-anexos.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/api/oportunidades/[id]/arquivos/[arquivoId]/download/route.ts src/app/oportunidades/[id]/page.tsx tests/unit/sprint-nova-task4-download-anexos.test.ts
git commit -m "fix(dossie): rota de streaming de download de arquivos anexados eliminando erro de dominio interno"
```

---

### Task 5: Documentação — Correção de Fuso Horário (-1 dia) e Substituição In-Place de Documentos

**Files:**
- Modify: `src/app/documentacao/page.tsx:220-255,420-435,530-545`
- Modify: `src/server/services/documentos.service.ts:180-260`
- Create: `tests/unit/sprint-nova-task5-documentacao-timezone-substituicao.test.ts`

**Interfaces:**
- Consumes:
  - Formatação de data em pt-BR sem conversão UTC truncada: `formatarDataSemOffset(isoOuData: string): string`
  - `PUT /api/documentos/[id]` para atualizar documento existente sem duplicar
- Produces:
  - Renderização exata da data informada pelo cliente (ex: informado 27/10 -> exibido 27/10).
  - Ação de "Atualizar Documento" que substitui datas e arquivo mantendo o mesmo registro ativo na listagem.

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/sprint-nova-task5-documentacao-timezone-substituicao.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { formatarDataSemOffset } from "@/lib/date-utils";
import { atualizarDocumento, criarDocumento, listDocumentos } from "@/server/services/documentos.service";

describe("Sprint Nova Task 5 — Documentação: Timezone e Substituição sem Duplicação", () => {
  it("deve formatar a data sem subtrair 1 dia independente do fuso horário local", () => {
    // String ISO meia-noite UTC ou YYYY-MM-DD
    const dataString1 = "2026-10-27";
    const dataString2 = "2026-10-27T00:00:00.000Z";

    expect(formatarDataSemOffset(dataString1)).toBe("27/10/2026");
    expect(formatarDataSemOffset(dataString2)).toBe("27/10/2026");
  });

  it("ao atualizar documento, deve substituir o existente sem criar novo registro duplicado na listagem", async () => {
    const docCriado = await criarDocumento({
      nome: "Certidão Negativa de Débitos",
      categoria: "FISCAL_TRABALHISTA",
      dataVencimento: new Date("2026-10-27"),
      semValidade: false,
    });

    const listaInicial = await listDocumentos();
    const countInicial = listaInicial.length;

    // Atualização com nova data e novo arquivo
    await atualizarDocumento(docCriado.id, {
      dataVencimento: new Date("2027-10-27"),
      arquivoNome: "cnd_nova.pdf",
    });

    const listaFinal = await listDocumentos();
    expect(listaFinal.length).toBe(countInicial); // Não duplicou
    const docAtualizado = listaFinal.find((d) => d.id === docCriado.id);
    expect(docAtualizado?.arquivoNome).toBe("cnd_nova.pdf");
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/sprint-nova-task5-documentacao-timezone-substituicao.test.ts`
Expected: FAIL (`formatarDataSemOffset` não exportado de `@/lib/date-utils`).

- [x] **Step 3: Implementar helper de data imune a fuso e fluxo de substituição in-place**

1. Em `src/lib/date-utils.ts`:
   - Adicionar função `formatarDataSemOffset(valor: string | Date | null | undefined): string`:
     - Se string `YYYY-MM-DD`, separa diretamente `[ano, mes, dia]` e retorna `${dia}/${mes}/${ano}`.
     - Se ISO `YYYY-MM-DDTHH:mm:ss`, extrai os 10 primeiros caracteres e formata de modo determinístico.
2. Em `src/app/documentacao/page.tsx`:
   - Utilizar `formatarDataSemOffset(doc.dataVencimento)` e `formatarDataSemOffset(doc.dataEmissao)` na exibição dos cards.
   - Na função `salvarNovaVersao`:
     - Em vez de chamar `POST /api/documentos/${docAlvoVersao.id}/nova-versao` (que inseria nova linha e deixava duas versões visíveis), chamar `PUT /api/documentos/${docAlvoVersao.id}` com o novo arquivo e novas datas, substituindo o documento diretamente.
     - Atualizar o texto do modal para: `"Atualizar Documento (Substituir Arquivo e Datas)"`.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/sprint-nova-task5-documentacao-timezone-substituicao.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/date-utils.ts src/app/documentacao/page.tsx src/server/services/documentos.service.ts tests/unit/sprint-nova-task5-documentacao-timezone-substituicao.test.ts
git commit -m "fix(documentacao): correcao de fuso horario na data de vencimento e substituicao in-place de documentos"
```

---

### Task 6: Declarações — Preenchimento Completo dos Dados Societários da Empresa Ativa

**Files:**
- Modify: `src/app/declaracoes/page.tsx:99-125`
- Create: `tests/unit/sprint-nova-task6-declaracoes-dados-empresa.test.ts`

**Interfaces:**
- Consumes:
  - `GET /api/configuracoes/empresa` com tenant ativo
- Produces:
  - Carregamento de todos os campos societários no estado da página `/declaracoes`:
    - `empresaRazaoSocial`, `empresaCnpj`, `empresaEndereco` (logradouro, número, complemento, bairro, cidade, UF, CEP), `representanteNome`, `representanteCpf`, `representanteRg`, `representanteCargo`, `cidade` e `uf`.
  - Recarregamento automático ao detectar alteração de empresa no Header (`tenant-changed`).

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/sprint-nova-task6-declaracoes-dados-empresa.test.tsx`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import DeclaracoesPage from "@/app/declaracoes/page";

describe("Sprint Nova Task 6 — Declarações: Preenchimento Completo de Dados da Empresa", () => {
  it("deve carregar Razão Social, CNPJ, Endereço Completo, RG e Cargo do Representante", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            empresa: {
              razaoSocial: "EMPRESA LICITANTE NACIONAL LTDA",
              cnpj: "12.345.678/0001-90",
              endereco: "Av. Paulista, 1000",
              numero: "1000",
              bairro: "Bela Vista",
              cidade: "São Paulo",
              uf: "SP",
              cep: "01310-100",
              representanteNome: "Carlos Alberto Silva",
              representanteCpf: "123.456.789-00",
              representanteRg: "MG-12.345.678",
              representanteCargo: "Diretor Presidente",
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, templates: [], oportunidades: [] }),
      });
    });

    render(<DeclaracoesPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("EMPRESA LICITANTE NACIONAL LTDA")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Carlos Alberto Silva")).toBeInTheDocument();
      expect(screen.getByDisplayValue("MG-12.345.678")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Diretor Presidente")).toBeInTheDocument();
    });
  });
});
```

- [x] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/sprint-nova-task6-declaracoes-dados-empresa.test.tsx`
Expected: FAIL (campos de RG e Cargo não estão sendo vinculados ao input ou preenchidos pelo fetch).

- [x] **Step 3: Implementar carregamento completo e escuta de troca de tenant em `src/app/declaracoes/page.tsx`**

1. Em `src/app/declaracoes/page.tsx`:
   - Atualizar a função `carregarDadosEmpresa`:
     - Consultar `GET /api/configuracoes/empresa`.
     - Popular: `setEmpresaRazaoSocial`, `setEmpresaCnpj`, `setEmpresaEndereco` (concatenando logradouro, número, complemento, bairro, cidade, UF, CEP), `setRepresentanteNome`, `setRepresentanteCpf`, `setRepresentanteRg`, `setRepresentanteCargo`, `setCidade` e `setUf`.
   - Adicionar listener para o evento `window.addEventListener("tenant-changed", carregarDadosEmpresa)`.
   - Garantir que todos os campos possuam inputs correspondentes editáveis pelo usuário no formulário de geração.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/sprint-nova-task6-declaracoes-dados-empresa.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/declaracoes/page.tsx tests/unit/sprint-nova-task6-declaracoes-dados-empresa.test.ts
git commit -m "feat(declaracoes): preenchimento automatico completo de endereco representante rg e cargo"
```

---

### Task 7: Notificações — Validação e Disparo de Alertas de Licitações, Documentos e Portais em 30 Dias

**Files:**
- Modify: `src/server/services/notificacoes.service.ts:420-510`
- Modify: `src/server/services/ingestao.service.ts:240-295`
- Create: `src/app/api/notificacoes/verificar/route.ts`
- Create: `tests/unit/sprint-nova-task7-notificacoes-alertas-30-dias.test.ts`

**Interfaces:**
- Consumes:
  - `POST /api/notificacoes/verificar` -> executa varredura de vencimentos e ingestão
- Produces:
  - Geração de notificações para:
    - Oportunidades recentes ingeridas via sync PNCP para todos os usuários ativos do sistema.
    - Documentos vencendo em 30, 15, 7, 3, 1 dias.
    - Portais de compras vencendo em 30, 15, 7, 3, 1 dias.

- [x] **Step 1: Escrever teste de unidade RED em `tests/unit/sprint-nova-task7-notificacoes-alertas-30-dias.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { executarJobNotificacoesDiarias, listNotificacoes } from "@/server/services/notificacoes.service";
import { insertInMemoryDocumento, insertInMemoryPortal, resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";

describe("Sprint Nova Task 7 — Notificações: Alertas de Vencimento em 30 Dias", () => {
  it("deve gerar alertas automáticos para documentos e portais que vencem em 30 dias", async () => {
    const hoje = new Date("2026-11-01T10:00:00Z");
    const dataVencimento30d = new Date("2026-12-01T10:00:00Z");

    insertInMemoryDocumento({
      id: "doc_venc_30d",
      nome: "Certidão Estadual de Débitos",
      categoria: "FISCAL_TRABALHISTA",
      dataVencimento: dataVencimento30d,
      semValidade: false,
      status: "ATIVO",
    });

    insertInMemoryPortal({
      id: "portal_venc_30d",
      nome: "Comprasnet / Compras.gov",
      url: "https://comprasnet.gov.br",
      dataVencimento: dataVencimento30d,
    });

    const resultadoJob = await executarJobNotificacoesDiarias(hoje);
    expect(resultadoJob.ok).toBe(true);
    expect(resultadoJob.contagens.N7_VENCIMENTO_DOCUMENTO).toBeGreaterThanOrEqual(1);
    expect(resultadoJob.contagens.N6_VENCIMENTO_PORTAL).toBeGreaterThanOrEqual(1);
  });
});
```

- [x] **Step 2: Executar teste para verificar falha (RED)**

Run: `npx vitest run tests/unit/sprint-nova-task7-notificacoes-alertas-30-dias.test.ts`
Expected: FAIL (contagens 0 ou cálculo de dias não coincidindo com a janela 30).

- [x] **Step 3: Ajustar cálculo de janelas de 30 dias e entrega de notificações**

1. Em `src/server/services/notificacoes.service.ts`:
   - Corrigir a comparação de dias para considerar a diferença arredondada em dias civis (`Math.round(diffMs / (1000 * 60 * 60 * 24)) === 30`).
   - Garantir que destinatários de documentos e portais incluam todos os usuários cadastrados e ativos.
2. Em `src/server/services/ingestao.service.ts`:
   - Na conclusão da coleta PNCP, enviar a notificação `N1_COLETA_CONCLUIDA` e `N2_LICITACAO_ATUALIZADA` para os usuários ativos do tenant (e não apenas IDs seed).
3. Criar `src/app/api/notificacoes/verificar/route.ts`:
   - Rota autenticada que permite verificar alertas e disparar o job diário de forma idempotente.

- [x] **Step 4: Executar teste para verificar aprovação (GREEN)**

Run: `npx vitest run tests/unit/sprint-nova-task7-notificacoes-alertas-30-dias.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/server/services/notificacoes.service.ts src/server/services/ingestao.service.ts src/app/api/notificacoes/verificar/route.ts tests/unit/sprint-nova-task7-notificacoes-alertas-30-dias.test.ts
git commit -m "feat(notificacoes): alertas confiaveis de oportunidades documentos e portais em 30 dias"
```

---

### Task 8: Verificação Global de Regressão, Build de Produção e Deploy

**Files:**
- Modify: `docs/superpowers/plans/2026-10-31-sprint-nova-v1.md` (marcar tarefas concluídas)

- [x] **Step 1: Executar suíte completa de testes do Vitest**

Run: `npx vitest run`
Expected: 100% dos testes aprovados (0 falhas).

- [x] **Step 2: Executar checagem estrita de tipos TypeScript**

Run: `npx tsc --noEmit`
Expected: Zero erros de compilação TypeScript.

- [x] **Step 3: Executar build de produção do Next.js**

Run: `npm run build`
Expected: Build concluído com sucesso, gerando todas as rotas estáticas e dinâmicas do App Router.

- [x] **Step 4: Commit e Push para a Branch de Trabalho**

```bash
git push origin feat/saas-multi-tenant
```

