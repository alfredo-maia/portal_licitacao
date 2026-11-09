# ⚡ Plano de Implementação: Sala Simulada de Pregão (Auto-Bidder Sandbox)

> **Documento de Planejamento & Arquitetura**  
> **Status:** Aguardando Aprovação do Usuário  
> **Stack:** Next.js 15 App Router | React 18 | IBM Carbon Design System | Zod | Vitest | TypeScript  
> **Conformidade Legal:** Lei Federal 14.133/2021 (Nova Lei de Licitações) & LC 123/2006 (ME/EPP)  
> **Diretrizes de Design:** Estrita observância ao Carbon Design System e **Purple Ban** (proibição absoluta de violeta, roxo, índigo e magenta).

---

## 1. Visão Geral & Objetivos

Implementar a **Sala Simulada de Pregão (Auto-Bidder Sandbox)** na plataforma, permitindo que os clientes dos planos **PRO** e **ENTERPRISE** (e usuários do plano **BÁSICO** em modo vitrine demonstrativo) testem, validem e ganhem confiança absoluta na atuação do Robô de Lances antes de sessões públicas reais nos portais de compras (`Compras.gov.br`, `BBMNet`, `Portal de Compras Públicas`, `Licitanet`, `BEC-SP`).

### 🎯 Respostas Alinhadas no Socratic Gate
1. **Origens de Certame (A1):** Suporte híbrido — 1 clique para carregar o **Cenário Demo Pré-Montado** (3 itens reais de TI/Equipamentos) OU importar qualquer **licitação real já configurada** do Pipeline com seus pisos calculados.
2. **Dinâmica do Relógio & Concorrentes (A2):** Cronômetro acelerado (ex: 45s de rodada + prorrogação automática de +15s ao receber lances nos 10s finais), com perfis virtuais ajustáveis (`Conservador`, `Moderado`, `Agressivo`) e botão para forçar lance rival manual em qualquer item.
3. **Regras da Lei 14.133/2021 & Táticas (A3):** Pacote completo — disputa simultânea multi-item (`IMEDIATO`, `SNIPER`, `MONITORAR`), trava de **Piso Seguro inviolável**, **Pausa de Emergência**, **Empate Ficto ME/EPP** (`<= 5%`), suporte aos modos **Aberto** e **Aberto e Fechado**, e **Log auditável exportável** da disputa.
4. **Controle de Acesso por Plano (A4):** Totalmente liberada para **PRO** e **ENTERPRISE**; no plano **BÁSICO**, acesso ao Cenário Demo com banner informativo de upgrade para certames reais do Pipeline.
5. **Garantia de Isolamento & Segurança:** Execução 100% em memória/Sandbox no cliente, com zero chamadas a APIs externas de governo e sem mutação de registros financeiros reais do banco de dados.

---

## 2. Tipo de Projeto & Critérios de Sucesso

- **Tipo de Projeto:** `WEB` (Next.js 15 App Router, React 18, Carbon Design System).
- **Critérios Mensuráveis de Sucesso:**
  1. **Trava Anti-Inexequibilidade 100% Inviolável:** O robô nunca dispara lance abaixo de `pisoUnitarioSeguro` sob qualquer circunstância, emitindo alerta visual de piso atingido.
  2. **Tática Sniper Eficaz:** No modo `SNIPER`, o robô aguarda e só dispara nos últimos `N` segundos (ex: <= 10s) da prorrogação se estiver perdendo a disputa.
  3. **Tática Imediata Precisa:** No modo `IMEDIATO`, cobre o menor lance rival assim que superado, respeitando o decremento configurado (`R$ 0,01`, `R$ 1,00` ou `%`).
  4. **Empate Ficto ME/EPP:** Se o menor lance for de empresa comum e nossa empresa for ME/EPP com piso viável a até 5% do líder, o sistema habilita e dispara o lance final de desempate.
  5. **Controle de Emergência:** O botão de pausa interrompe imediatamente todos os envios automáticos em todos os itens da sala.
  6. **Zero Erros de Tipagem & Regressão:** `npx tsc --noEmit` limpo e suíte unitária Vitest cobrindo 100% das regras lógicas do motor.

---

## 3. Arquitetura Técnica & Decisões Estruturais

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CAMADA DE APRESENTAÇÃO                          │
│                                                                        │
│   /robo-de-lances                         /oportunidades/[id] (Tab 7)  │
│   ├── Botão "🎮 Abrir Sala Simulada"      └── Botão "🎮 Simular Disputa"│
│   │                                                                    │
│   ▼                                                                    │
│   <SalaSimuladaModal / Componente> (IBM Carbon Design System)          │
│   ├── Seletor de Certame (Demo vs Oportunidade Real)                   │
│   ├── Painel Superior: Cronômetro, Status do Modo e Pausa de Pânico   │
│   ├── Grid Multi-Item: Cards dos Itens com Barra de Posição e Pisos   │
│   ├── Fita de Lances em Tempo Real (Tape Auditável)                   │
│   └── Painel de Controle de Concorrentes Virtuais                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     HOOK DE ESTADO & ORQUESTRAÇÃO                      │
│                useSalaSimuladaDisputa (React Hook)                     │
│  - Gerencia tick do relógio (intervalo de 1s)                          │
│  - Controla prorrogações automáticas (Lei 14.133/2021)                 │
│  - Injeta lances de concorrentes conforme perfil                       │
│  - Aciona o motor de decisão do robô                                   │
│  - Mantém histórico imutável de eventos para exportação                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MOTOR DETERMINÍSTICO PURO                          │
│                src/lib/robo-lances-engine.ts                           │
│  • avaliarProximoLance(item, contextoDisputa)                          │
│  • aplicarDecremento(valorAtual, decremento, pisoSeguro)               │
│  • verificarEmpateFictoMeEpp(lances, meuPiso, isMeEpp)                 │
│  • simularComportamentoConcorrente(item, perfil, tempoRestante)        │
│  • gerarCenarioDemoDisputa()                                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           SUÍTE DE TESTES                              │
│             tests/unit/robo-lances-simulador.test.ts                   │
│  • Teste de respeito estrito ao piso seguro                            │
│  • Teste de disparo em janela Sniper                                   │
│  • Teste de reação imediata com decremento mínimo                      │
│  • Teste de ativação e bloqueio de pausa de emergência                 │
│  • Teste de regra de desempate ME/EPP (Lei Complementar 123/2006)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Estrutura de Arquivos

| Ação | Arquivo | Finalidade |
|---|---|---|
| **CRIAR** | `src/lib/robo-lances-engine.ts` | Motor puro com lógica matemática de lances, decrementos, sniper, ME/EPP e cenários demo. |
| **CRIAR** | `src/components/robo-lances/sala-simulada-modal.tsx` | Interface da Sala Simulada com Carbon Design System, cronômetro, fita de lances e controles. |
| **ATUALIZAR** | `src/app/robo-de-lances/page.tsx` | Adicionar botão de destaque *"🎮 Abrir Sala de Disputa Simulada"*, banner para plano Básico e integração com o modal. |
| **ATUALIZAR** | `src/app/oportunidades/[id]/page.tsx` | Adicionar botão de atalho direto *"🎮 Simular Disputa Deste Certame"* na Aba 7 (Disputa). |
| **ATUALIZAR** | `src/server/schemas/arsenal.schema.ts` | Registrar recurso `ROBO_LANCES_SIMULADOR` na matriz de planos (`PRO`, `ENTERPRISE`). |
| **CRIAR** | `tests/unit/robo-lances-simulador.test.ts` | Bateria de testes unitários automatizados cobrindo todos os casos de borda do motor de lances. |
| **CRIAR** | `docs/PLAN-sala-simulada-robo-lances.md` | Registro dinâmico de plano no repositório conforme diretrizes do agente. |

---

## 5. Detalhamento dos Cenários e Regras de Negócio

### 5.1. Cenário Demo Padrão Pré-Carregado
Caso o usuário não selecione uma licitação do seu Pipeline, o simulador inicia imediatamente com 3 itens pré-configurados:
1. **Item 01: Notebook Corporativo Core i7 16GB 512GB SSD (10 UN)**
   - Valor Estimado: R$ 5.500,00 | Proposta Inicial: R$ 5.200,00 | **Piso Seguro: R$ 4.350,00**
   - Tática: `IMEDIATO` | Decremento: `R$ 0,01`
2. **Item 02: Monitor Profissional 27" IPS QHD (15 UN)**
   - Valor Estimado: R$ 1.800,00 | Proposta Inicial: R$ 1.650,00 | **Piso Seguro: R$ 1.320,00**
   - Tática: `SNIPER` (disparo nos últimos 10s) | Decremento: `R$ 5,00`
3. **Item 03: Estação de Trabalho Gráfica Xeon / RTX (2 UN)**
   - Valor Estimado: R$ 18.000,00 | Proposta Inicial: R$ 16.900,00 | **Piso Seguro: R$ 14.500,00**
   - Tática: `MONITORAR` (acompanha lances sem cobrir automaticamente)

### 5.2. Dinâmica dos Concorrentes Virtuais
- **Perfis Selecionáveis:**
  - `Agressivo`: dá lances frequentes (a cada 3-5s) com reduções fortes, testando a resiliência do robô próximo ao piso.
  - `Moderado (Padrão)`: lances a cada 6-10s cobrindo por R$ 0,01 ou R$ 1,00.
  - `Conservador`: poucos lances, desiste cedo ao atingir 15% de desconto.
- **Botão de Forçar Lance Rival:** Permite ao usuário clicar em qualquer item e injetar instantaneamente um lance concorrente (ex: R$ 10,00 abaixo do líder atual) para testar a resposta imediata do robô.

### 5.3. Relógio e Prorrogação da Lei 14.133/2021
- No modo **Aberto**, a rodada tem duração acelerada (45 segundos).
- Se houver qualquer lance nos últimos 10 segundos da contagem, o relógio ganha **prorrogação automática de +15 segundos** (simulando a regra real dos 2 minutos finais do Compras.gov.br).
- Se a contagem chegar a 0s sem novos lances, a etapa é encerrada e os vencedores são declarados.

---

## 6. Tarefas de Execução (Task Breakdown)

### Tarefa 1: Motor Determinístico de Lances (`src/lib/robo-lances-engine.ts`)
- **Agente:** `backend-specialist`
- **Skills:** `clean-code`, `api-patterns`
- **Prioridade:** P0 (Bloqueador)
- **Input:** Tipos `DisputaItemRegra`, `DisputaConfig` e estruturas de eventos de lance.
- **Output:** Funções puras exportadas: `avaliarProximoLance`, `aplicarDecremento`, `calcularEmpateFicto`, `gerarCenarioDemoDisputa` e simulador de lances rivais.
- **Verify:** `npx vitest run tests/unit/robo-lances-simulador.test.ts` passando com 100% de sucesso.

### Tarefa 2: Suíte de Testes Automatizados (`tests/unit/robo-lances-simulador.test.ts`)
- **Agente:** `backend-specialist`
- **Skills:** `testing-patterns`, `clean-code`
- **Prioridade:** P0
- **Input:** Especificação dos 5 casos de borda críticos (Piso seguro, Sniper window, Imediato, Pausa e ME/EPP).
- **Output:** Arquivo de testes Vitest cobrindo todos os cenários sem dependência de banco de dados.
- **Verify:** Vitest executa e valida as asserções em menos de 2 segundos.

### Tarefa 3: Componente da Sala Simulada com Carbon (`src/components/robo-lances/sala-simulada-modal.tsx`)
- **Agente:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Prioridade:** P1
- **Input:** `@carbon/react`, `@carbon/icons-react`, motor de lances e hooks.
- **Output:** Modal / Tela imersiva de disputa com painel de controle, cronômetro acelerado, cards dos itens, tape de lances e exportação do log.
- **Verify:** Verificação de acessibilidade, responsividade e estrita observância ao **Purple Ban**.

### Tarefa 4: Integração em `/robo-de-lances` e `/oportunidades/[id]`
- **Agente:** `frontend-specialist`
- **Skills:** `clean-code`, `nextjs-react-expert`
- **Prioridade:** P1
- **Input:** Telas existentes de Robô de Lances e Dossiê da Licitação.
- **Output:** Botão de abertura *"🎮 Abrir Sala de Disputa Simulada"* no painel central e atalho na Aba 7 de Oportunidades, com controle de plano (BÁSICO em modo vitrine / PRO e ENTERPRISE completos).
- **Verify:** Navegação fluida entre o Pipeline, a Aba Disputa e o Simulador Sandbox.

### Tarefa 5: Verificação de Build, Tipos e Deploy
- **Agente:** `orchestrator`
- **Skills:** `lint-and-validate`, `deployment-procedures`
- **Prioridade:** P2
- **Input:** Repositório completo.
- **Output:** `npx tsc --noEmit` sem erros, todos os testes do Vitest verdes, `pnpm build` bem-sucedido.
- **Verify:** Commit limpo na branch `feat/saas-multi-tenant` e deploy na VPS Hostinger Staging.

---

## 7. Fase X: Checklist de Verificação Final

- [x] Trava de Piso Seguro: Nenhum lance gerado é inferior a `pisoUnitarioSeguro`
- [x] Tática Sniper: O robô só dispara quando o tempo restante for `<= segundosFinaisSniper`
- [x] Tática Imediata: O robô dispara em até 1 ciclo ao ser ultrapassado pelo concorrente
- [x] Pausa de Emergência: Interrupção imediata de todos os disparos ao acionar a pausa
- [x] Empate Ficto ME/EPP: Concede direito de cobrir lance líder em margem `<= 5%`
- [x] Purple Ban: Zero ocorrência de violeta, roxo, índigo ou magenta no CSS/JSX
- [x] Carbon Tokens: Uso estrito de `--cds-interactive`, `--cds-support-*`, `--cds-layer-*`
- [x] Isolamento: Zero mutações no banco de dados e zero requisições a portais reais
- [x] Testes Unitários: Todos os 21 testes unitários e de UI passando com `vitest`
- [x] Build & Lint: `tsc --noEmit` (0 erros) e `pnpm build` concluídos com sucesso (44/44 rotas estáticas e dinâmicas)

## ✅ PHASE X COMPLETE
- Engine: ✅ `src/lib/robo-lances-engine.ts`
- UI Sandbox: ✅ `src/components/robo-lances/sala-simulada-modal.tsx`
- Lint & Types: ✅ `tsc --noEmit` Pass
- Tests: ✅ 21/21 passing in `tests/unit/robo-lances-simulador.test.tsx`
- Build: ✅ Next.js 15.5.28 (44/44 routes)
- Deploy: ✅ Pushed commit `aa11a1e` to `origin/feat/saas-multi-tenant`

