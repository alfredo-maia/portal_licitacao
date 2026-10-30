# ADR 0010: Portal SuperAdmin, Fila WhatsApp com Jitter, Billing Asaas e Paywall Suave

- **Status:** Aprovado
- **Data:** 2026-10-30
- **Autores:** Squad Antigravity (Arquiteto de Software_ag, DevOps_ag, Backend_ag)
- **Contexto:** Sprint SaaS 4 — Plataforma Comercial Multi-Tenant B2B ([docs/PLANO_TRANSICAO_SAAS_MULTI_TENANT.md](file:///docs/PLANO_TRANSICAO_SAAS_MULTI_TENANT.md) §6, §7, §13 e §15)

---

## 1. Contexto e Motivação

1. **Gestão Operacional da Plataforma (SuperAdmin):**
   - Na transição para o modelo SaaS com múltiplos clientes pagantes, a diretoria do portal necessita de visibilidade consolidada de MRR (Receita Recorrente Mensal), status das empresas (Trial, Ativo, Em Atraso), licitações arrematadas com sucesso pelos clientes e controle de espaço de armazenamento no Cloudflare R2 com botão de expansão com 1 clique (+1 GB, +2 GB).
2. **Gateway de Pagamento Asaas & Idempotência Financeira:**
   - O Asaas atua como provedor de pagamentos (PIX recorrente, cartão de crédito e boleto bancário). Webhooks enviados pelo Asaas podem sofrer retransmissões automáticas em caso de instabilidade de rede. O sistema requer garantia de idempotência atômica para evitar cobranças duplicadas ou concessão errônea de planos.
3. **Comunicação por WhatsApp & Blindagem Anti-Ban:**
   - Disparos matinais de editais e alertas urgentes não podem ser emitidos em lote simultâneo (*burst*), pois algoritmos de segurança da Meta bloqueiam chips por comportamento de spam. É mandatória uma fila assíncrona com **jitter humano aleatório de 4 a 9 segundos** entre cada mensagem, associada a opt-out legal obrigatório.
4. **Governança de Paywall Suave (Soft Paywall) & Grace Period:**
   - Bloquear clientes instantaneamente no minuto seguinte ao vencimento gera atrito severo com o cliente comercial em razão do tempo de compensação bancária de boletos ou autorização de compras corporativas. A plataforma adota um **Período de Graça de 3 dias**, exibindo banner amarelo amigável e permitindo regularização antes do bloqueio efetivo no 4º dia.

---

## 2. Decisões de Arquitetura

### 2.1. Portal SuperAdmin sob `/admin` com Barreira Invisível
- O portal administrativo é implementado na rota `/admin` dentro do mesmo aplicativo Next.js App Router, eliminando a dependência de subdomínios externos, registros adicionais de DNS ou novos certificados SSL na VPS.
- **Proteção por RBAC & Middleware:** Usuários com perfil `SUPERADMIN` têm acesso irrestrito ao painel. Usuários comuns (`DIRETORIA`, `ANALISTA_COMERCIAL`, `OPERADOR`) ou visitantes anônimos são interceptados no Middleware e Server Components recebendo `404 Not Found` (comportamento de rota inexistente para fins de segurança defensiva).

### 2.2. Modelo Atômico de Idempotência do Asaas (`AsaasWebhookEvent`)
- Cada webhook recebido em `/api/webhooks/asaas` registra imediatamente o identificador único fornecido pelo Asaas (`event.id`) no modelo `AsaasWebhookEvent`.
- A verificação de unicidade impede reprocessamentos acidentais.
- A transição de status financeiro das empresas é controlada pelo enum `TenantBillingStatus`:
  - `TRIAL`: Período gratuito de 14 dias.
  - `ATIVO`: Assinatura confirmada e em dia.
  - `GRACE_PERIOD`: Vencida há até 3 dias (banner amarelo de aviso, acesso liberado).
  - `BLOQUEADO`: Inadimplente há mais de 3 dias (redirecionamento suave para regularização).

### 2.3. Motor de Disparo WhatsApp com Jitter Humano (4 a 9 Segundos)
- O serviço `whatsapp.service.ts` gerencia o ciclo de envio:
  - Adição de mensagens à fila estruturada `WhatsAppMensagem`.
  - Processamento sequencial aplicando um delay aleatório calculado por `Math.floor(Math.random() * (9000 - 4000 + 1) + 4000)` ms.
  - Inserção compulsória da assinatura de opt-out no rodapé: *"Para pausar estes alertas, responda PAUSAR a qualquer momento"*.
  - Tratamento de palavras de opt-out (`PAUSAR`, `SAIR`, `STOP`) com suspensão automática de envios para o número.

### 2.4. Soft Paywall & Whitelist no Middleware
- O Middleware Next.js avalia a condição do Tenant:
  - Se `billingStatus === BLOQUEADO`, restringe a navegação em rotas operacionais e redireciona suavemente para `/faturamento` ou exibe o modal de regularização.
  - Rotas públicas e essenciais permanecem sempre liberadas: `/`, `/login`, `/faturamento`, `/checkout`, `/api/auth/*`, `/api/webhooks/*`, `/api/suporte`, `/_next/*`.

---

## 3. Consequências

- **Positivas:**
  - Visibilidade executiva e controle do SaaS sem dependência de ferramentas terceiras pagas.
  - Zero risco de banimento de chip no WhatsApp por envios em massa.
  - Idempotência total nos eventos de faturamento Asaas com integridade de banco de dados.
  - Redução drástica de cancelamentos acidentais (churn involuntário) graças ao Grace Period de 3 dias.
- **Negativas / Riscos Mitigados:**
  - O processamento de fila com delay de 4-9s aumenta o tempo total de envio para bases muito grandes: mitigado por particionamento em janela matinal estendida (06:30 às 08:30).
