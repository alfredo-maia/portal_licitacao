# ADR 0011: Arsenal Premium de Expansão Pro & Enterprise (Sprint SaaS 5)

* **Status:** Aceito
* **Data:** 2026-10-30
* **Autores:** `Arquiteto de Software_ag`, `Desenvolvedor Backend_ag`, `Desenvolvedor Frontend_ag`
* **Issue Relacionada:** [#14](https://github.com/alfredo-maia/portal_licitacao/issues/14)
* **Referência no Plano Mestre:** [`docs/PLANO_TRANSICAO_SAAS_MULTI_TENANT.md`](file:///docs/PLANO_TRANSICAO_SAAS_MULTI_TENANT.md) (§12 e §14)

---

## 1. Contexto

Na transição do Portal para uma plataforma SaaS B2B Multi-Tenant em escada de valor (`BASICO` R$ 59,90, `PRO` R$ 97,00 e `ENTERPRISE` R$ 197,00), a retenção e o *upsell* dependem de ferramentas de produtividade que atuem diretamente no momento crítico da disputa eletrônica e da defesa jurídica do licitante:

1. **Calculadora de Lance Mínimo & Simulador de BDI (Todos os planos):** Impede que o operador dê lances no calor da disputa abaixo do custo + impostos + frete ou na faixa de inexequibilidade (Art. 59 da Lei 14.133/2021).
2. **Gerador Automático de Propostas Comerciais Timbradas (`PRO` e `ENTERPRISE`):** Automatiza a emissão da proposta readequada pós-disputa com dados cadastrais, bancários e quadro de itens calculados.
3. **Monitor de Chat do Pregoeiro com Alertas WhatsApp (`ENTERPRISE`):** Identifica menções ao CNPJ/Razão Social da empresa ou convocações de prazo fatal na sala de disputa, acionando a fila anti-ban do `whatsapp.service.ts`.
4. **Gerador de Minutas de Impugnação com IA — Art. 164 Lei 14.133/2021 (`ENTERPRISE`):** Redige petições fundamentadas na Nova Lei de Licitações e jurisprudência do TCU a partir da cláusula restritiva apontada.
5. **Inteligência de Preços de Concorrentes & Relatório Executivo Mensal (`ENTERPRISE`):** Entrega visão histórica de descontos praticados e consolidado executivo de conversão para a diretoria.

---

## 2. Decisão Arquitetural

### 2.1. Matriz de Elegibilidade por Plano (`ARSENAL_PLAN_MATRIX`)
Centralizamos em `src/server/schemas/arsenal.schema.ts` a política de acesso por plano:
- `CALCULADORA_BDI`: `["BASICO", "PRO", "ENTERPRISE"]`
- `PROPOSTA_PDF`: `["PRO", "ENTERPRISE"]`
- `MONITOR_CHAT_PREGOEIRO`: `["ENTERPRISE"]`
- `MINUTA_IMPUGNACAO_IA`: `["ENTERPRISE"]`
- `INTELIGENCIA_PRECOS`: `["ENTERPRISE"]`
- `RELATORIO_EXECUTIVO_MENSAL`: `["ENTERPRISE"]`

Toda chamada de serviço valida `canUseArsenalFeature(plano, feature)` antes de executar a operação, retornando erro semântico de upgrade quando o plano atual não contempla o recurso.

### 2.2. Motor Matemático de Lance Mínimo, BDI e Alerta de Inexequibilidade
O cálculo em `calcularLanceMinimoEBdi()` segue a estrutura de engenharia de custos públicos:
- **Custo Total Unitário:** `custoUnitarioDireto + freteUnitario`
- **Fator de Impostos e BDI:** Aplicação composta sobre o custo base para encontrar o **Lance Mínimo Seguro** (respeitando a `margemMinimaPercentual`) e o **Preço Sugerido com BDI**.
- **Análise do Lance Proposto:** Calcula a margem líquida real no lance informado e emite alerta:
  - `MARGEM_NEGATIVA`: quando o lance proposto é inferior ao custo + tributos obrigatórios (prejuízo líquido).
  - `ABAIXO_MARGEM_MINIMA`: quando o lance gera lucro positivo porém inferior ao piso de margem definido pela diretoria.
  - `RISCO_INEXEQUIBILIDADE`: quando o desconto ultrapassa 50% em bens/serviços ou 25% em obras/engenharia sobre o valor estimado (Art. 59, § 4º da Lei 14.133/2021).
  - `SEGURO`: quando o lance respeita a margem mínima e os limites de exequibilidade.

### 2.3. Monitor de Chat do Pregoeiro Integrado ao WhatsApp
O analisador de mensagens da sala de disputa (`analisarMensagensChatPregoeiro`) inspeciona cada mensagem do pregoeiro/sistema buscando:
1. Menção direta ao CNPJ (formatado ou apenas dígitos) ou à Razão Social/Nome Fantasia do `Tenant`.
2. Gatilhos críticos de convocação (`convoco`, `convocada`, `proposta readequada`, `enviar anexo`, `habilitação`, `prazo de 2 horas`, `manifestação de intenção de recurso`).
Quando detectado um evento crítico direcionado ao licitante, o serviço aciona `enfileirarMensagemWhatsApp()` com tipo `CHAT_PREGOEIRO` e registra auditoria.

---

## 3. Consequências

* **Positivas:**
  * Entrega imediata dos 5 diferenciais competitivos dos planos `PRO` e `ENTERPRISE` diretamente na rota `/robo-de-lances` sem quebrar o contrato de 11 rotas oficiais do `ModulePageShell`.
  * Proteção financeira real contra erros humanos de precificação durante pregões eletrônicos.
  * Reuso integral da infraestrutura de fila WhatsApp com jitter humano construída na Sprint SaaS 4.
* **Negativas / Trade-offs:**
  * O módulo de Inteligência de Preços opera sobre a base consolidada de certames e homologações indexadas no portal, expandindo sua precisão conforme o histórico noturno do PNCP cresce.

