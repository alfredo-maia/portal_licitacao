# SPRINT New — Correções Críticas de Banco, Planos Trial=PRO, Oportunidades, Dossiê e Declarações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir as colunas ausentes no PostgreSQL de produção/staging que bloqueavam cadastros, perfil, equipe, documentos e arquivos do dossiê; padronizar o Trial gratuito com todas as funções e cotas do Plano PRO (2 CNPJs e 2 Colaboradores); ajustar o rate limit global de Esqueci a Senha; refinar os filtros de escopo, ordenação, classificador semântico e cadastro manual em Oportunidades; e corrigir a pré-visualização e impressão em página única em Declarações.

**Architecture:** Abordagem Schema-First com sincronização idempotente de DDL no `scripts/docker-entrypoint.cjs` e auto-healing na camada de serviço Prisma, garantindo 100% de paridade entre `prisma/schema.prisma` e o PostgreSQL em execução. Camadas de serviço em `src/server/services/` isolam as regras de negócio de planos, classificação de licitações e rate limiting, enquanto os componentes React Carbon em `src/app/` consomem contratos tipados.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5 (Strict, Zero Any), Prisma ORM + PostgreSQL 16, Zod, IBM Carbon Design System (`@carbon/react`), Vitest.

**Spec:** `/Users/vitorhenrique/Downloads/SPRINT New.pdf` (Páginas 1 a 3)

## Global Constraints

- Todos os clientes em período de Teste Grátis (`billingStatus === "TRIAL"`) possuem como plano base e capacidades funcionais o **Plano PRO** (`plano: "PRO"`, até **2 CNPJs** e até **2 Colaboradores**, até 2 Segmentos e até 3 UFs).
- A conta `opaonossopanificadora@gmail.com` deve estar configurada com o plano **ENTERPRISE** (`billingStatus: "ATIVO"`, até 5 CNPJs e até 10 Colaboradores) para testes de mudança de CNPJs.
- No fluxo `/esqueci-senha`, o limite de **2 solicitações a cada 15 minutos** é aplicado globalmente por cliente/IP, independentemente de o usuário digitar o mesmo e-mail 3 vezes ou 3 e-mails distintos.
- Na tela `/planos`, clientes em Teste Grátis (`TRIAL`) não devem ter nenhum dos 3 cards de planos marcados como `"Plano Atual"`, e o card superior deve exibir: `Plano Atual da Empresa: Teste Grátis` + `Degustação: 14 dia(s) restante(s)` e `Capacidade: até 2 CNPJ(s) e até 2 Colaborador(es)`.
- Na tela `/oportunidades`, os selects de `Segmento / Ramo`, `Sub-segmento` e `UF` devem exibir **apenas** os itens selecionados pelo cliente na Seção 5 de Configurações; quando houver 2 ou mais estados (e não for Brasil inteiro), o seletor de UF deve permitir múltipla escolha com checkboxes (`MultiSelect`).
- Na tela `/declaracoes`, nenhuma mensagem de erro (`Dados inválidos para geração de declaração`) ou loading infinito (`Carregando modelo A4 oficial...`) deve aparecer ao abrir a página; deve exibir imediatamente um molde de pré-visualização A4, atualizar ao clicar no botão e forçar a impressão em **apenas 1 página A4**.

## Review Focus

1. **Paridade DDL PostgreSQL vs Prisma Schema:** Se `User.cpf` (e demais colunas de endereço) ou `Licitacao.esfera`/`poder`/`portalDisputa`/`atestadosExigidos`/`motivoRecusa` faltarem no banco, o Prisma falha em qualquer `create`/`findUnique`/`include` e cai em memória; o entrypoint e o auto-healing devem criar todas essas colunas de forma idempotente.
2. **Rate Limit de Esqueci a Senha com E-mails Diferentes:** Três chamadas consecutivas com `vitorhenrique018@gmail.com`, `vitorhenrique019@gmail.com` e `vitorhenrique020@gmail.com` do mesmo cliente/IP devem bloquear na 3ª tentativa com HTTP 429.
3. **Persistência de Meu Perfil e Validação de CPF:** O usuário logado (`vitorhenrique018@gmail.com`) deve ver seu próprio e-mail na aba Meu Perfil, ter seu CPF validado pelos dígitos verificadores oficiais (`isValidCpf`) e manter todos os campos preenchidos após salvar e recarregar.
4. **Classificação de Licitações Não-TI:** Licitações de óleo lubrificante, combustível, britagem, material escolar ou insumos hospitalares nunca devem receber `TECNOLOGIA_TELECOM` nem mini-resumo de software por fallback indevido.
5. **Impressão de Declaração em 1 Folha A4:** O HTML/CSS de impressão de `/declaracoes` deve conter `max-height` e `page-break-inside: avoid` para impedir que a assinatura vaze para uma segunda página.

---

### Task 1: Sincronização DDL PostgreSQL, Cadastro Trial=PRO e Esqueci-Senha Global Rate Limit

**Files:**
- Modify: `scripts/docker-entrypoint.cjs`
- Modify: `src/server/services/cadastro.service.ts`
- Modify: `src/server/services/esqueci-senha.service.ts`
- Modify: `src/server/services/esqueci-senha.service.test.ts`
- Test: `tests/unit/sprint-new-task1-db-auth-esqueci-senha.test.ts`

**Interfaces:**
- Consumes: `esqueciSenhaSchema` from `src/server/schemas/esqueci-senha.schema.ts`
- Produces:
  - `solicitarRecuperacaoSenha(rawEmail: string, ip?: string): Promise<EsqueciSenhaResponse>` (rate limit de 2 tentativas / 15 min por IP para qualquer e-mail digitado)
  - DDL completo em `scripts/docker-entrypoint.cjs` (colunas de `User`, `Licitacao`, `configuracao_empresa` e upgrade de `opaonossopanificadora@gmail.com` para `ENTERPRISE`)

- [ ] **Step 1: Write the failing test in `tests/unit/sprint-new-task1-db-auth-esqueci-senha.test.ts`**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  _resetRateLimit,
  solicitarRecuperacaoSenha,
} from "@/server/services/esqueci-senha.service";

describe("Sprint New — Task 1: DDL Entrypoint, Trial=PRO & Esqueci-Senha Global Rate Limit", () => {
  beforeEach(() => {
    _resetRateLimit();
  });

  it("deve bloquear na 3ª tentativa mesmo quando o cliente digita 3 e-mails diferentes", async () => {
    const ip = "192.168.1.55";
    const r1 = await solicitarRecuperacaoSenha("vitorhenrique018@gmail.com", ip);
    const r2 = await solicitarRecuperacaoSenha("vitorhenrique019@gmail.com", ip);
    const r3 = await solicitarRecuperacaoSenha("vitorhenrique020@gmail.com", ip);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("deve conter todas as colunas de User (cpf, telefone, cep, endereco) e Licitacao (esfera, poder) no docker-entrypoint.cjs", () => {
    const entrypointPath = path.resolve(process.cwd(), "scripts/docker-entrypoint.cjs");
    const content = fs.readFileSync(entrypointPath, "utf-8");

    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "cpf"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "cep"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "logradouro"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "esfera"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "portalDisputa"`);
    expect(content).toContain(`opaonossopanificadora@gmail.com`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sprint-new-task1-db-auth-esqueci-senha.test.ts`
Expected: FAIL (`r3.ok` is `true` because rate limit key included email, and `User.cpf` is missing in `docker-entrypoint.cjs`).

- [ ] **Step 3: Implement rate limit global por IP em `src/server/services/esqueci-senha.service.ts` e DDL completo em `scripts/docker-entrypoint.cjs` e `src/server/services/cadastro.service.ts`**

1. Em `src/server/services/esqueci-senha.service.ts`:
   - Alterar `const rateLimitKey = `${normalizedEmail}:${ip}`;` para `const rateLimitKey = `ip:${ip || "127.0.0.1"}`;`.
   - Atualizar `src/server/services/esqueci-senha.service.test.ts` para refletir o limite por IP (usando IPs distintos quando testar clientes distintos e o mesmo IP quando testar bloqueio com e-mails iguais ou diferentes).
2. Em `scripts/docker-entrypoint.cjs`:
   - Adicionar DDL idempotente para `"User"`: `cpf`, `telefone`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `isSuperAdmin`.
   - Adicionar DDL idempotente para `"Licitacao"`: `esfera`, `poder`, `portalDisputa`, `atestadosExigidos`, `motivoRecusa`, `modalidadeCodigo`, `numeroControlePNCP`, `segmentoMacro`, `subcategorias`, `dataEncerramentoProposta`, `valorArrematado`, `responsavelId` e tabela `"TipoSistema"`.
   - Adicionar DDL idempotente para `"configuracao_empresa"`: `inscricaoMunicipal`, `numero`, `complemento`, `bairro`, `tenantId`.
   - Adicionar rotina de promoção automática da conta `opaonossopanificadora@gmail.com`: busca o usuário e seus tenants vinculados (ou cria/atualiza o tenant associado) configurando `plano = 'ENTERPRISE'`, `billingStatus = 'ATIVO'`, `maxCnpjs = 5`, `maxUsers = 10`.
3. Em `src/server/services/cadastro.service.ts`:
   - Incluir no bloco de auto-healing antes da transação os `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS` para `cpf`, `telefone`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sprint-new-task1-db-auth-esqueci-senha.test.ts src/server/services/esqueci-senha.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/docker-entrypoint.cjs src/server/services/cadastro.service.ts src/server/services/esqueci-senha.service.ts src/server/services/esqueci-senha.service.test.ts tests/unit/sprint-new-task1-db-auth-esqueci-senha.test.ts
git commit -m "fix: ddl completo user e licitacao no entrypoint e rate limit global no esqueci-senha"
```

---

### Task 2: Configurações (Remoção Tag RBAC, Meu Perfil Persistente + Validação CPF, Enterprise para O Pão Nosso e Gestão da Equipe)

**Files:**
- Modify: `src/server/services/configuracoes.service.ts`
- Modify: `src/app/api/configuracoes/perfil/route.ts`
- Modify: `src/app/api/configuracoes/equipe/route.ts`
- Modify: `src/app/api/configuracoes/tenants/route.ts`
- Modify: `src/app/configuracoes/page.tsx`
- Modify: `src/server/auth/index.ts`
- Test: `tests/unit/sprint-new-task2-configuracoes-perfil-equipe.test.ts`

**Interfaces:**
- Consumes: `isValidCpf` from `src/lib/masks.ts`
- Produces:
  - `obterMeuPerfil(userId: string, fallbackUser?: { email?: string; name?: string }): Promise<MeuPerfil>`
  - `atualizarMeuPerfil(userId: string, data: MeuPerfilAtualizarInput, fallbackUser?: { email?: string; name?: string }): Promise<MeuPerfil>` (valida CPF com `isValidCpf` quando informado)
  - `listarEquipe(tenantId?: string | null, currentUser?: { id: string; name: string; email: string; role?: string }): Promise<UsuarioEquipeListResponse>` (garante que o próprio usuário logado seja sempre exibido e que novos colaboradores persistam e façam login)

- [ ] **Step 1: Write the failing test in `tests/unit/sprint-new-task2-configuracoes-perfil-equipe.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import {
  atualizarMeuPerfil,
  criarMembroEquipe,
  listarEquipe,
  obterMeuPerfil,
} from "@/server/services/configuracoes.service";

describe("Sprint New — Task 2: Meu Perfil, Validação de CPF e Gestão da Equipe", () => {
  it("deve retornar o e-mail real do usuário logado em obterMeuPerfil mesmo quando buscado por fallback de sessão", async () => {
    const perfil = await obterMeuPerfil("id_antigo_sessao", {
      email: "vitorhenrique018@gmail.com",
      name: "Vítor Henrique",
    });
    expect(perfil.email).toBe("vitorhenrique018@gmail.com");
    expect(perfil.email).not.toBe("usuario@empresa.com.br");
  });

  it("deve rejeitar CPF inválido ao atualizar Meu Perfil e persistir os dados quando CPF for válido", async () => {
    await expect(
      atualizarMeuPerfil(
        "usr_vitor_1",
        {
          name: "Vítor Henrique",
          cpf: "111.111.111-11",
        },
        { email: "vitorhenrique018@gmail.com", name: "Vítor Henrique" },
      ),
    ).rejects.toThrow(/CPF inválido/i);

    const atualizado = await atualizarMeuPerfil(
      "usr_vitor_1",
      {
        name: "Vítor Henrique Atualizado",
        cpf: "529.982.247-25",
        cep: "74115-030",
        logradouro: "Av. República do Líbano",
        cidade: "Goiânia",
        uf: "GO",
      },
      { email: "vitorhenrique018@gmail.com", name: "Vítor Henrique" },
    );

    expect(atualizado.name).toBe("Vítor Henrique Atualizado");
    expect(atualizado.cpf).toBe("529.982.247-25");
    expect(atualizado.logradouro).toBe("Av. República do Líbano");

    const recarregado = await obterMeuPerfil("usr_vitor_1", {
      email: "vitorhenrique018@gmail.com",
      name: "Vítor Henrique",
    });
    expect(recarregado.cpf).toBe("529.982.247-25");
    expect(recarregado.logradouro).toBe("Av. República do Líbano");
  });

  it("deve sempre exibir o próprio usuário logado na Gestão da Equipe e listar novo colaborador criado", async () => {
    const tenantId = "tnt_equipe_test";
    const currentUser = {
      id: "usr_titular_equipe",
      name: "Titular Empresa",
      email: "titular@empresa.com.br",
      role: "DIRETORIA",
    };

    const inicial = await listarEquipe(tenantId, currentUser);
    expect(inicial.usuarios.some((u) => u.email === "titular@empresa.com.br")).toBe(true);

    await criarMembroEquipe(
      {
        name: "Novo Colaborador",
        email: "colaborador.novo@empresa.com.br",
        role: "ANALISTA_COMERCIAL",
        password: "Senha@123",
        ativo: true,
      },
      currentUser.id,
      { id: currentUser.id, role: "DIRETORIA" },
      tenantId,
    );

    const aposCriacao = await listarEquipe(tenantId, currentUser);
    expect(aposCriacao.usuarios.some((u) => u.email === "colaborador.novo@empresa.com.br")).toBe(true);
    expect(aposCriacao.usuarios.some((u) => u.email === "titular@empresa.com.br")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sprint-new-task2-configuracoes-perfil-equipe.test.ts`
Expected: FAIL (`obterMeuPerfil` returns `usuario@empresa.com.br`, `atualizarMeuPerfil` does not validate CPF digits, `listarEquipe` does not include `currentUser`).

- [ ] **Step 3: Implement fixes in `configuracoes.service.ts`, API routes, `auth/index.ts`, and `src/app/configuracoes/page.tsx`**

1. Em `src/server/services/configuracoes.service.ts`:
   - Executar auto-healing das colunas de `"User"` (`cpf`, `telefone`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`).
   - Em `obterMeuPerfil(userId, fallbackUser)`: buscar no Prisma por `id: userId` ou (se não achar e houver `fallbackUser?.email`) por `email: fallbackUser.email.toLowerCase()`. Sincronizar e mesclar com o cache em memória para que os campos salvos nunca voltem vazios e o `email` seja sempre o e-mail real da sessão.
   - Em `atualizarMeuPerfil(userId, data, fallbackUser)`: se `data.cpf` for preenchido, validar com `isValidCpf(data.cpf)` de `@/lib/masks`; se inválido, lançar `new Error("CPF inválido. Verifique os dígitos informados.")`. Atualizar no Prisma por `id` ou `email` (usando `upsert` se necessário) e atualizar também no store em memória.
   - Em `listarEquipe(tenantId, currentUser)`: garantir que se `currentUser` for fornecido, seu registro exista na listagem da equipe do `tenantId` (e vincular automaticamente em `tenantUser` no banco se ainda não estiver vinculado). Mesclar membros do banco e memória do mesmo `tenantId` sem duplicar por `email`.
   - Em `criarMembroEquipe`: para planos `TRIAL`, considerar limite `maxUsers = Math.max(tenant.maxUsers, 2)`; persistir o novo colaborador na tabela `"User"` e `"tenant_user"`, registrar no store em memória com `tenantId` e chamar `upsertInMemoryAuthUser` para permitir login imediato.
2. Em `src/app/api/configuracoes/perfil/route.ts` e `src/app/api/configuracoes/equipe/route.ts`:
   - Passar `{ email: session.user.email, name: session.user.name }` para `obterMeuPerfil`/`atualizarMeuPerfil` e `currentUser` para `listarEquipe`.
   - Garantir que se `session.user.email?.toLowerCase() === "opaonossopanificadora@gmail.com"`, seu tenant seja automaticamente promovido para `plano: "ENTERPRISE"`, `billingStatus: "ATIVO"`, `maxCnpjs: 5`, `maxUsers: 10` também em `/api/configuracoes/tenants`.
3. Em `src/app/configuracoes/page.tsx`:
   - Remover a `Tag` `"RBAC & Gestão Multi-CNPJ"` do cabeçalho.
   - Adicionar validação visual de CPF (`isValidCpf`) no campo CPF da aba **Meu Perfil** antes de salvar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sprint-new-task2-configuracoes-perfil-equipe.test.ts src/app/configuracoes/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/configuracoes.service.ts src/app/api/configuracoes/perfil/route.ts src/app/api/configuracoes/equipe/route.ts src/app/api/configuracoes/tenants/route.ts src/app/configuracoes/page.tsx src/server/auth/index.ts tests/unit/sprint-new-task2-configuracoes-perfil-equipe.test.ts
git commit -m "fix: persistencia meu perfil com validacao cpf, equipe com proprio usuario e enterprise para conta teste"
```

---

### Task 3: Tela Planos — Regras Visuais e Capacidades do Teste Grátis (Trial = PRO)

**Files:**
- Modify: `src/app/api/planos/status/route.ts`
- Modify: `src/app/planos/page.tsx`
- Modify: `src/app/planos/page.test.tsx`

**Interfaces:**
- Produces:
  - `GET /api/planos/status`: para `billingStatus === "TRIAL"`, retorna `plano: "PRO"`, `maxCnpjs: 2`, `maxUsers: 2`, `diasRestantesTrial: 14` (ou dias restantes reais > 0).
  - `PlanosPage`: quando `billingStatus === "TRIAL"`, exibe no card superior `Plano Atual da Empresa: Teste Grátis` e `Degustação: 14 dia(s) restante(s)` com `Capacidade: até 2 CNPJ(s) e até 2 Colaborador(es).`, e **não** marca nenhum dos 3 cards de planos abaixo com `"Plano Atual"`.

- [ ] **Step 1: Write the failing test in `src/app/planos/page.test.tsx`**

```typescript
  it("não deve marcar nenhum dos 3 cards como Plano Atual quando o cliente estiver no Teste Grátis (TRIAL) e deve exibir Teste Grátis Degustação e capacidade de 2 CNPJs e 2 Colaboradores", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        plano: "PRO",
        billingStatus: "TRIAL",
        diasRestantesTrial: 14,
        diasRestantesCarencia: 0,
        isReadOnly: false,
        isBlocked: false,
        inGracePeriod: false,
        mensagemStatus: "Período de avaliação gratuita ativo (14 dias restantes).",
        maxCnpjs: 2,
        maxUsers: 2,
      }),
    } as any);

    render(<PlanosPage />);

    await waitFor(() => {
      expect(screen.getByText(/Teste Grátis/i)).toBeInTheDocument();
      expect(screen.getByText(/Degustação: 14 dia\(s\) restante\(s\)/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Capacidade: até 2 CNPJ\(s\) e até 2 Colaborador\(es\)\./i),
      ).toBeInTheDocument();
    });

    // Nenhum dos 3 cards deve exibir a badge "Plano Atual" nem o botão "Plano Atual Ativo"
    expect(screen.queryByText("Plano Atual")).not.toBeInTheDocument();
    expect(screen.queryByText("Plano Atual Ativo")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/planos/page.test.tsx`
Expected: FAIL (Currently `PlanosPage` marks `PRO` card with `"Plano Atual"` even during `TRIAL`).

- [ ] **Step 3: Update `src/app/api/planos/status/route.ts` and `src/app/planos/page.tsx`**

1. Em `src/app/api/planos/status/route.ts`:
   - Se o usuário for `opaonossopanificadora@gmail.com`, garantir `plano: "ENTERPRISE"`, `billingStatus: "ATIVO"`, `maxCnpjs: 5`, `maxUsers: 10`.
   - Se `billingStatus === "TRIAL"`, forçar `plano: "PRO"`, `maxCnpjs: Math.max(tenantData?.maxCnpjs || 2, 2)`, `maxUsers: Math.max(tenantData?.maxUsers || 2, 2)`, e se `trialFim` for nulo no banco, calcular 14 dias restantes por padrão.
2. Em `src/app/planos/page.tsx`:
   - Definir `const isTrial = status?.billingStatus === "TRIAL";`.
   - No card `"Plano Atual da Empresa:"`: quando `isTrial` for `true`, exibir `<Tag type="blue">Teste Grátis</Tag>` e `<Tag type="cyan">Degustação: {status?.diasRestantesTrial || 14} dia(s) restante(s)</Tag>`, além de `Capacidade: até {isTrial ? 2 : (status?.maxCnpjs ?? 2)} CNPJ(s) e até {isTrial ? 2 : (status?.maxUsers ?? 2)} Colaborador(es).`.
   - Nos 3 cards do catálogo: definir `const isPlanoAtual = !isTrial && plano.id === planoAtivoId;`, de modo que no teste grátis nenhum card fique marcado como plano atual e todos os 3 botões permitam `"Contratar Agora"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/planos/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/planos/status/route.ts src/app/planos/page.tsx src/app/planos/page.test.tsx
git commit -m "feat: exibir Teste Gratis sem marcar card de plano atual e garantir capacidade Pro no trial"
```

---

### Task 4: Tela Oportunidades — Escopo Dinâmico da Triagem (Segmentos, Sub-segmentos, Multi-UF), Classificador Semântico, Ordenação Alfabética e Cadastro Manual

**Files:**
- Modify: `src/app/api/tenant/preferencias/route.ts`
- Modify: `src/server/schemas/segmentos.schema.ts`
- Modify: `src/server/services/classificador-segmentos.service.ts`
- Modify: `src/lib/resumo-licitacao.ts`
- Modify: `src/server/schemas/oportunidades.schema.ts`
- Modify: `src/server/services/oportunidades.service.ts`
- Modify: `src/app/oportunidades/page.tsx`
- Test: `tests/unit/sprint-new-task4-oportunidades-classificador-filtros.test.ts`

**Interfaces:**
- Produces:
  - `classificarLicitacaoPorTexto(objeto: string, resumo?: string): ClassificacaoSegmento` (classifica corretamente óleos/lubrificantes como `AUTOMOTIVO_PECAS_FROTAS`, materiais ambulatoriais como `SAUDE_MEDICAMENTOS_HOSPITALAR`, britagem/obras como `OBRAS_CONSTRUCAO_MANUTENCAO`, expediente/escolar como `MATERIAIS_ESCRITORIO_SUPRIMENTOS` etc.)
  - `GET /api/tenant/preferencias`: retorna exatamente `{ segmentos, subsegmentos, ufs, brasilInteiro }` configurados na Seção 5 da empresa ativa.
  - `OportunidadesPage`:
    - Selects de Segmento, Sub-segmento e UF restritos às opções escolhidas na Seção 5 de Configurações; quando houver 2 ou mais estados (e não todos), exibe `MultiSelect` com checkboxes para selecionar 2 ou mais estados.
    - Ordenação alfabética (`localeCompare`) para `Órgão e UF` e `Objeto`, numérica para `Valor Estimado` e cronológica para `Data Limite`.
    - Modal de Cadastro Manual com validação de CNPJ e Valor, selects de escolha única para `UF`, `Segmento` e `Sub-segmento`, e **sem** o select de `Tipo de Sistema`.

- [ ] **Step 1: Write the failing test in `tests/unit/sprint-new-task4-oportunidades-classificador-filtros.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { classificarLicitacaoPorTexto } from "@/server/services/classificador-segmentos.service";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { clearInMemoryLicitacoes, insertInMemoryLicitacao } from "@/server/services/licitacoes-store";

describe("Sprint New — Task 4: Classificador de Segmentos, Multi-UF e Filtros de Oportunidades", () => {
  it("deve classificar licitação de óleos e lubrificantes como AUTOMOTIVO_PECAS_FROTAS e não TECNOLOGIA_TELECOM", () => {
    const res = classificarLicitacaoPorTexto(
      "Aquisição de óleos e lubrificantes para manutenção de viaturas militares",
    );
    expect(res.macro).toBe("AUTOMOTIVO_PECAS_FROTAS");
    expect(res.subcategorias).toContain("OLEOS_LUBRIFICANTES_FLUIDOS");
  });

  it("deve classificar materiais ambulatoriais como SAUDE_MEDICAMENTOS_HOSPITALAR e britagem/estradas como OBRAS_CONSTRUCAO_MANUTENCAO", () => {
    const saude = classificarLicitacaoPorTexto(
      "Eventual fornecimento de Materiais/insumos e equipamentos de uso ambulatorial.",
    );
    expect(saude.macro).toBe("SAUDE_MEDICAMENTOS_HOSPITALAR");

    const obras = classificarLicitacaoPorTexto(
      "LOCAÇÃO DE CONJUNTO DE BRITAGEM MÓVEL PRIMÁRIO PARA MANUTENÇÃO DAS ESTRADAS E OBRAS DE INFRAESTRUTURA",
    );
    expect(obras.macro).toBe("OBRAS_CONSTRUCAO_MANUTENCAO");
  });

  it("deve filtrar oportunidades por múltiplas UFs separadas por vírgula (ex: GO,MT) e por segmento reclassificado", async () => {
    clearInMemoryLicitacoes();
    insertInMemoryLicitacao({
      idPncp: "TEST-GO-1",
      numeroEdital: "01/2026",
      orgaoNome: "Prefeitura de Goiânia",
      orgaoCnpj: "01234567000199",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      portalDisputa: null,
      miniResumo: "Óleos e lubrificantes automotivos",
      resumo: "Aquisição de óleos e lubrificantes para frota",
      valorEstimado: 80000,
      dataAbertura: new Date("2026-11-10T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-11-10T10:00:00Z"),
      dataPublicacaoPncp: null,
      dataUltimaAtualizacao: null,
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "OUTROS",
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "h1",
      valorArrematado: null,
      responsavelId: null,
    });
    insertInMemoryLicitacao({
      idPncp: "TEST-SP-1",
      numeroEdital: "02/2026",
      orgaoNome: "Prefeitura de São Paulo",
      orgaoCnpj: "01234567000188",
      uf: "SP",
      municipio: "São Paulo",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      portalDisputa: null,
      miniResumo: "Óleos e lubrificantes",
      resumo: "Aquisição de óleos e lubrificantes",
      valorEstimado: 90000,
      dataAbertura: new Date("2026-11-11T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-11-11T10:00:00Z"),
      dataPublicacaoPncp: null,
      dataUltimaAtualizacao: null,
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "OUTROS",
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "h2",
      valorArrematado: null,
      responsavelId: null,
    });

    const filtradas = await listOportunidades({
      uf: "GO,MT",
      segmento: "AUTOMOTIVO_PECAS_FROTAS",
      subsegmento: "OLEOS_LUBRIFICANTES_FLUIDOS",
    });

    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].idPncp).toBe("TEST-GO-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sprint-new-task4-oportunidades-classificador-filtros.test.ts`
Expected: FAIL (`res.macro` is `"TECNOLOGIA_TELECOM"` and `uf: "GO,MT"` is rejected by `z.string().length(2)` in `oportunidadesFilterSchema`).

- [ ] **Step 3: Implement improvements in classifier, schemas, service, preferences route, and `src/app/oportunidades/page.tsx`**

1. Em `src/server/schemas/segmentos.schema.ts` e `src/server/services/classificador-segmentos.service.ts`:
   - Expandir as palavras-chave de todas as 28 subcategorias (incluindo termos simples e compostos: `"óleo"`, `"oleos"`, `"lubrificante"`, `"lubrificantes"`, `"combustível"`, `"diesel"`, `"gasolina"`, `"viatura"`, `"viaturas"`, `"ambulatorial"`, `"medicamento"`, `"hospitalar"`, `"saúde"`, `"endovascular"`, `"britagem"`, `"estradas"`, `"infraestrutura"`, `"expediente"`, `"material escolar"`, `"incêndio"`, `"extintor"`, etc.).
   - Em `src/lib/resumo-licitacao.ts`: exigir contexto de software (`sistema`, `software`, `saas`, `informatizado`) antes de mapear `"frota"`/`"abastecimento"` para software de frota, e no fallback final retornar o texto higienizado do objeto ao invés de `"Solução de Tecnologia da Informação e Software"`.
2. Em `src/server/schemas/oportunidades.schema.ts` e `src/server/services/oportunidades.service.ts`:
   - Permitir `uf` com 1 ou múltiplas siglas separadas por vírgula (ex: `"GO"` ou `"GO,MT"`) em `oportunidadesFilterSchema`.
   - Em `criarLicitacaoManualSchema`: tornar `tipoSistemaCodigo` opcional com `.default("OUTROS")` e aceitar `segmentoMacro` e `subsegmento` opcionais.
   - Em `matchesFilters` e `buildPrismaWhere`: suportar múltiplas UFs (`uf.split(",")`), avaliar `classificarLicitacaoPorTexto(record.resumo, record.miniResumo)` quando `segmentoMacro` for nulo ou legado, e usar normalização sem acentos no filtro de `subsegmento`.
3. Em `src/app/api/tenant/preferencias/route.ts`:
   - Resolver `tenantId` via cookie `portal_licitacao_active_tenant`, `session.user.activeTenantId` ou `prisma.tenantUser.findFirst({ where: { userId } })`, e consultar também `obterConfiguracaoEmpresa(tenantId)` para retornar exatamente os `segmentos`, `subsegmentos`, `ufs` e `brasilInteiro` configurados pelo cliente.
4. Em `src/app/oportunidades/page.tsx`:
   - Filtrar as opções de `Segmento / Ramo` por `preferencias.segmentos`, `Sub-segmento` por `preferencias.subsegmentos` (quando definidos para aquele segmento), e `UF` por `preferencias.ufs` (quando `!preferencias.brasilInteiro`).
   - Quando houver 2 ou mais estados em `preferencias.ufs` (e `!preferencias.brasilInteiro`), renderizar `MultiSelect` (select com checkbox) para permitir selecionar 2 ou mais estados simultaneamente.
   - Configurar `sortRow` customizado no `DataTable` para ordenar `orgaoUF` e `miniResumo` (Objeto) em ordem alfabética (`localeCompare`), `valorEstimado` numericamente e `dataAbertura` por data.
   - No modal `+ Adicionar Licitação Manualmente`:
     - Aplicar máscara e validação em `CNPJ do Órgão` (`maskCnpj` / `isValidCnpj`) e `Valor Estimado`.
     - Substituir o input de texto de `UF` por `Dropdown` de escolha única (`ESTADOS_BRASIL`).
     - Adicionar `Dropdown` de escolha única para `Segmento` e `Sub-segmento`.
     - Remover o `Dropdown` de `Tipo de Sistema`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sprint-new-task4-oportunidades-classificador-filtros.test.ts tests/unit/oportunidades.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tenant/preferencias/route.ts src/server/schemas/segmentos.schema.ts src/server/services/classificador-segmentos.service.ts src/lib/resumo-licitacao.ts src/server/schemas/oportunidades.schema.ts src/server/services/oportunidades.service.ts src/app/oportunidades/page.tsx tests/unit/sprint-new-task4-oportunidades-classificador-filtros.test.ts
git commit -m "feat: escopo dinamico de filtros em oportunidades, classificador semantico, ordenacao alfabetica e modal manual"
```

---

### Task 5: Dossiê (`Oportunidades/[id]`) e Documentação — Persistência de Equipe, Arquivos/PNCP e Novos Documentos

**Files:**
- Modify: `src/server/services/oportunidades.service.ts`
- Modify: `src/server/services/licitacoes-store.ts`
- Modify: `src/app/api/documentos/route.ts`
- Modify: `src/server/services/documentos.service.ts`
- Test: `tests/unit/sprint-new-task5-dossie-equipe-arquivos-documentos.test.ts`

**Interfaces:**
- Produces:
  - `atualizarEquipe(id, rawInput, user, actorContext)`: persiste `responsavelId` e `atribuidos` tanto no PostgreSQL quanto no store em memória e retorna a oportunidade atualizada com `responsavel` e `atribuidos` populados.
  - `adicionarArquivoEdital` e `buscarESincronizarArquivosEditalPncp`: persistem os arquivos tanto no PostgreSQL quanto no store em memória (vinculados ao `oportunidade.id` real) e retornam em `getOportunidadeById`.
  - `criarDocumento(data, usuarioId)`: persiste em PostgreSQL (com fallback seguro se `usuarioId` não existir na tabela `"User"`, gravando `criadoPorId: null` no banco) e mescla em `listarDocumentos` para que o novo documento apareça imediatamente na tela `/documentacao`.

- [ ] **Step 1: Write the failing test in `tests/unit/sprint-new-task5-dossie-equipe-arquivos-documentos.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import {
  adicionarArquivoEdital,
  atualizarEquipe,
  buscarESincronizarArquivosEditalPncp,
  getOportunidadeById,
} from "@/server/services/oportunidades.service";
import { clearInMemoryLicitacoes, insertInMemoryLicitacao } from "@/server/services/licitacoes-store";
import { criarDocumento, listarDocumentos } from "@/server/services/documentos.service";

describe("Sprint New — Task 5: Persistência de Equipe, Arquivos/PNCP no Dossiê e Documentação", () => {
  it("deve salvar e retornar os membros atribuídos da Equipe Operacional da Licitação", async () => {
    clearInMemoryLicitacoes();
    const lic = insertInMemoryLicitacao({
      idPncp: "PNCP-EQ-001",
      numeroEdital: "10/2026",
      orgaoNome: "Órgão Teste",
      orgaoCnpj: "12345678000199",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      portalDisputa: null,
      miniResumo: "Aquisição de medicamentos",
      resumo: "Aquisição de medicamentos hospitalares",
      valorEstimado: 100000,
      dataAbertura: new Date(),
      dataEncerramentoProposta: new Date(),
      dataPublicacaoPncp: null,
      dataUltimaAtualizacao: null,
      status: "ACEITA",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "OUTROS",
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "heq",
      valorArrematado: null,
      responsavelId: null,
    });

    await atualizarEquipe(lic.id, {
      responsavelId: "usr_resp_1",
      atribuidoIds: ["usr_membro_1", "usr_membro_2"],
    });

    const detalhe = await getOportunidadeById(lic.id);
    expect(detalhe.responsavelId).toBe("usr_resp_1");
    expect(detalhe.atribuidos.map((a: any) => a.usuarioId)).toEqual([
      "usr_membro_1",
      "usr_membro_2",
    ]);
  });

  it("deve salvar e retornar uploads de arquivos e editais buscados no PNCP", async () => {
    clearInMemoryLicitacoes();
    const lic = insertInMemoryLicitacao({
      idPncp: "00394452000103-1-022491/2026",
      numeroEdital: "35/2026",
      orgaoNome: "Comando do Exército",
      orgaoCnpj: "00394452000103",
      uf: "PE",
      municipio: "Recife",
      esfera: "F",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      portalDisputa: null,
      miniResumo: "Óleos e lubrificantes",
      resumo: "Aquisição de óleos e lubrificantes",
      valorEstimado: 200000,
      dataAbertura: new Date(),
      dataEncerramentoProposta: new Date(),
      dataPublicacaoPncp: null,
      dataUltimaAtualizacao: null,
      status: "PENDENTE",
      parecerIA: "AVALIAR",
      justificativaIA: null,
      tipoSistemaCodigo: "OUTROS",
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: "https://pncp.gov.br/app/editais/00394452000103-1-022491/2026",
      linkSistemaOrigem: null,
      hashCritico: "harq",
      valorArrematado: null,
      responsavelId: null,
    });

    await adicionarArquivoEdital(lic.id, {
      nome: "Anexo_Manual.pdf",
      tamanho: 102400,
      mimeType: "application/pdf",
      caminho: "/uploads/editais/Anexo_Manual.pdf",
    });

    const sync = await buscarESincronizarArquivosEditalPncp(lic.id);
    expect(sync.sincronizados).toBeGreaterThan(0);

    const detalhe = await getOportunidadeById(lic.id);
    expect(detalhe.arquivos.length).toBeGreaterThanOrEqual(2);
    expect(detalhe.arquivos.some((a: any) => a.nome === "Anexo_Manual.pdf")).toBe(true);
  });

  it("deve criar novo documento e retorná-lo na listagem de documentos", async () => {
    const criado = await criarDocumento(
      {
        nome: "Certidão Negativa Federal Teste Sprint New",
        categoria: "FISCAL_TRABALHISTA",
        semValidade: false,
        dataVencimento: new Date(Date.now() + 30 * 86400000),
      },
      "usr_qualquer_id",
    );

    expect(criado.id).toBeDefined();
    const lista = await listarDocumentos({ busca: "Certidão Negativa Federal Teste Sprint New" });
    expect(lista.documentos.some((d) => d.id === criado.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sprint-new-task5-dossie-equipe-arquivos-documentos.test.ts`
Expected: FAIL (`detalhe.atribuidos` and `detalhe.arquivos` are `[]` when using in-memory / fallback in `getOportunidadeById`).

- [ ] **Step 3: Implement persistence and relation resolution in `oportunidades.service.ts`, `licitacoes-store.ts`, `documentos.service.ts` and `api/documentos/route.ts`**

1. Em `src/server/services/licitacoes-store.ts` e `src/server/services/oportunidades.service.ts`:
   - Armazenar `atribuidos`, `arquivos`, `repositoriosSimilares` e `analisesIA` também no store em memória por `licitacaoId`.
   - Em `getOportunidadeById(id)`: se a consulta com `include` completo falhar no PostgreSQL, buscar `basic` no PostgreSQL (ou em memória) e consultar individualmente `prisma.arquivo.findMany({ where: { licitacaoId: realId } })`, `prisma.licitacaoAtribuido.findMany({ where: { licitacaoId: realId } })`, `prisma.repositorioSimilar.findMany({ where: { licitacaoId: realId } })` e `prisma.analiseStatusParticipacao.findMany({ where: { licitacaoId: realId } })`, mesclando com os registros em memória para que nenhum arquivo anexado, edital sincronizado do PNCP ou membro atribuído da equipe jamais seja perdido!
   - Em `atualizarEquipe`, `adicionarArquivoEdital`, `removerArquivoEdital` e `buscarESincronizarArquivosEditalPncp`: usar sempre `oportunidade.id` real e gravar tanto no PostgreSQL quanto no store em memória, evitando duplicação de arquivos com o mesmo `nome` ao sincronizar do PNCP.
2. Em `src/app/api/documentos/route.ts` e `src/server/services/documentos.service.ts`:
   - Em `src/app/api/documentos/route.ts`: envolver `mkdir(publicDir)` e `writeFile(join(publicDir, safeName))` em `try/catch` para não falhar com erro de permissão de escrita no container Docker.
   - Em `criarDocumento`: tentar `prisma.documento.create` com `criadoPorId: usuarioId || null`; se falhar por FK (`documento_criadoPorId_fkey`), repetir `prisma.documento.create` com `criadoPorId: null` antes de recorrer ao store em memória, e em `listarDocumentos` mesclar os registros do banco com eventuais registros em memória.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sprint-new-task5-dossie-equipe-arquivos-documentos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/oportunidades.service.ts src/server/services/licitacoes-store.ts src/app/api/documentos/route.ts src/server/services/documentos.service.ts tests/unit/sprint-new-task5-dossie-equipe-arquivos-documentos.test.ts
git commit -m "fix: persistencia de equipe e arquivos no dossie e criacao resiliente de documentos"
```

---

### Task 6: Tela Declarações — Molde de Pré-Visualização Imediato, Sem Erro Inicial e Impressão em 1 Única Página A4

**Files:**
- Modify: `src/app/declaracoes/page.tsx`
- Modify: `src/server/services/declaracoes.service.ts`
- Test: `tests/unit/sprint-new-task6-declaracoes-preview-print.test.tsx`

**Interfaces:**
- Produces:
  - `DeclaracoesPage`:
    - Não dispara erro `"Dados inválidos para geração de declaração"` ao entrar na página.
    - Não exibe `"Carregando modelo A4 oficial..."`; renderiza imediatamente um molde de pré-visualização A4 comum com os dados disponíveis (ou placeholders `[...]`).
    - Atualiza a Pré-visualização da Folha A4 Oficial quando o cliente clica em `"Atualizar Folha A4"`.
    - Força a impressão em **1 única página A4** (`@page { size: A4 portrait; margin: 10mm 14mm; }`, `max-height: 272mm`, `overflow: hidden`, `page-break-inside: avoid`).

- [ ] **Step 1: Write the failing test in `tests/unit/sprint-new-task6-declaracoes-preview-print.test.tsx`**

```typescript
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DeclaracoesPage from "@/app/declaracoes/page";

describe("Sprint New — Task 6: Tela Declarações (Sem erro inicial, Molde A4 imediato e Impressão 1 página)", () => {
  it("não deve exibir 'Dados inválidos para geração de declaração' nem 'Carregando modelo A4 oficial...' ao abrir a página, exibindo o molde A4 imediatamente", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/declaracoes/templates")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, templates: [] }) });
      }
      if (url.includes("/api/oportunidades")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, oportunidades: [] }) });
      }
      if (url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, empresa: {} }) });
      }
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: "Dados inválidos para geração de declaração" }),
      });
    }) as any;

    render(<DeclaracoesPage />);

    expect(
      screen.queryByText(/Dados inválidos para geração de declaração/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Carregando modelo A4 oficial/i),
    ).not.toBeInTheDocument();
    expect(document.getElementById("a4-folha-oficial")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sprint-new-task6-declaracoes-preview-print.test.tsx`
Expected: FAIL (Currently `DeclaracoesPage` calls `handleGerar()` on mount, showing `"Dados inválidos para geração de declaração"` and `"Carregando modelo A4 oficial..."`).

- [ ] **Step 3: Implement immediate A4 template preview and single-page print enforcement in `src/app/declaracoes/page.tsx` and `src/server/services/declaracoes.service.ts`**

1. Em `src/app/declaracoes/page.tsx`:
   - Remover o `useEffect` que chamava `handleGerar()` automaticamente antes da ação do usuário.
   - Criar função `construirMoldePreviewLocal()` que gera instantaneamente o HTML e texto do molde da declaração selecionada usando os campos preenchidos no formulário ou placeholders claros (`[NOME DA EMPRESA LICITANTE]`, `[CNPJ]`, `[ÓRGÃO PÚBLICO]`, `[EDITAL Nº]`, etc.), exibindo-o imediatamente dentro de `#a4-folha-oficial` caso `documentoGerado` ainda seja `null`.
   - Ao clicar no botão `"Atualizar Folha A4"`, se todos os campos obrigatórios estiverem preenchidos, chama `/api/declaracoes/gerar` e atualiza `documentoGerado`; se algum campo ainda estiver em branco, atualiza o molde local com os dados digitados e exibe aviso amigável sem quebrar a folha A4.
   - Em `handleImprimir()` e no bloco `<style>` de impressão: aplicar `@page { size: A4 portrait; margin: 10mm 14mm; }`, `html, body { width: 100%; max-height: 272mm; overflow: hidden !important; page-break-after: avoid !important; page-break-before: avoid !important; break-inside: avoid !important; font-size: 10.5pt; line-height: 1.38; }` para forçar que toda a impressão caiba estritamente em **1 única página A4**.
2. Em `src/server/services/declaracoes.service.ts`:
   - Ajustar espaçamentos inline (`margin`, `padding`, `line-height`) do HTML gerado para que mesmo com objetos de licitação longos o conteúdo nunca ultrapasse 1 folha A4.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sprint-new-task6-declaracoes-preview-print.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/declaracoes/page.tsx src/server/services/declaracoes.service.ts tests/unit/sprint-new-task6-declaracoes-preview-print.test.tsx
git commit -m "fix: molde a4 imediato sem erro inicial e impressao forcada em 1 pagina em declaracoes"
```

---

### Task 7: Reclassificação das Licitações Existentes, Suíte Completa Vitest, Build de Produção e Deploy no Staging

**Files:**
- Modify: `scripts/docker-entrypoint.cjs` (migrar/reclassificar licitações existentes no banco ao subir o container)
- Test: Suíte completa (`npx vitest run` e `npm run build`)

**Interfaces:**
- Consumes: Tasks 1 a 6

- [ ] **Step 1: Run complete TypeScript typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run complete Vitest test suite**

Run: `npx vitest run`
Expected: All test suites PASS (0 failures)

- [ ] **Step 3: Run Next.js production build**

Run: `npm run build`
Expected: `Compiled successfully` and static/dynamic pages generated without errors.

- [ ] **Step 4: Commit, Push to `feat/saas-multi-tenant`, Close GitHub Issue and Re-ingest 30 Classified Opportunities on Staging**

```bash
git push origin feat/saas-multi-tenant
```

