# ADR 0007: Arquitetura SaaS Multi-Tenant no Prisma, Schemas por CNPJ, Isolamento de Dados e Sessão JWT (30 Dias)

## Status
Aprovado

## Contexto
O Portal de Licitações foi concebido como uma aplicação corporativa single-tenant voltada a uma única diretoria e equipe interna. Para expandir a solução comercialmente como plataforma B2B SaaS governada pela Lei Federal 14.133/2021 e integrada ao PNCP, é imperativo suportar múltiplos clientes corporativos concorrentes no mesmo banco de dados PostgreSQL sem qualquer risco de vazamento de informações comerciais, com controle de cotas por plano de assinatura (Básico, Pro, Enterprise) e experiência de acesso persistente por 30 dias.

## Decisões de Arquitetura

### 1. Modelo de Identidade vs. Tenant (N:N via TenantUser)
* **Usuário (`User`):** A conta é atrelada ao e-mail corporativo (`@unique`). O e-mail é sanitizado com `trim().toLowerCase()`, validado segundo a RFC 5322 e filtrado contra provedores de e-mails descartáveis/temporários.
* **Empresa (`Tenant`):** A unidade jurídica é o CNPJ (`Tenant.cnpj` `@unique`). Duas contas assinantes distintas **não podem registrar o mesmo CNPJ**.
* **Associação N:N (`TenantUser`):** Consultores e operadores de licitação podem ter acesso a múltiplos CNPJs com papéis específicos (`TITULAR`, `MEMBRO`, `CONSULTOR`), com chave composta única `@@unique([tenantId, userId])`.
* **Cota de CNPJs e Membros por Plano:**
  * **Plano Básico:** 1 CNPJ, 1 Usuário (Titular), 1 Macro-Segmento.
  * **Plano Pro:** Até 2 CNPJs (Matriz e Filial), até 2 Usuários, até 3 Macro-Segmentos.
  * **Plano Enterprise:** Até 5 CNPJs, até 5 Usuários, todos os 7 Macro-Segmentos.

### 2. Desacoplamento do Kanban em Catálogo Global vs. Dados Privados
* **`Licitacao` (Catálogo Público Global):** Registro imutável vindo do PNCP, compartilhado entre todos os tenants.
* **`TenantLicitacao` (Kanban Privado):** Armazena o status operacional do funil (`PENDENTE`, `ACEITA`, `RECUSADA`, etc.), notas estratégicas, lance mínimo, tags e motivo de descarte de cada empresa de forma 100% isolada (`@@unique([tenantId, licitacaoId])`).

### 3. Blindagem contra Vazamento de Dados (`getTenantPrisma`)
* Em vez de confiar em cláusulas manuais `where: { tenantId }`, a camada de serviços utilizará uma extensão do Prisma (`getTenantPrisma(tenantId)`).
* Todas as consultas em modelos privados (`TenantLicitacao`, `Documento`, `ConfiguracaoEmpresa`, `AuditLog`) têm o filtro `tenantId` automaticamente injetado em tempo de execução.

### 4. Validação Algorítmica de CNPJ e Prevenção de Fraudes
* Implementação do algoritmo oficial da Receita Federal em Módulo 11 para cálculo dos dois dígitos verificadores.
* Rejeição automática de sequências falsas repetidas de 14 dígitos.
* Enriquecimento cadastral automático via API pública com fallback.
* Fluxo de contestação e reivindicação de CNPJ via envio de OTP para o e-mail oficial constante na Receita Federal.

### 5. Autenticação Multicanal e Persistência de Sessão (30 Dias)
* Três canais de entrada suportados no login em 2 etapas: Senha tradicional, OTP via WhatsApp e OTP via E-mail.
* Sessão persistente por 30 dias (`maxAge: 30 * 24 * 60 * 60` segundos) em Cookie `HttpOnly; SameSite=Lax; Secure` com renovação contínua (*rolling session*).
* Invalidação forçada (*killswitch*) no servidor mediante revogação de permissão do usuário pelo titular da conta.

## Consequências
* **Positivas:** Isolamento lógico e criptográfico inviolável entre concorrentes; suporte nativo a escritórios de consultoria com múltiplos CNPJs; eliminação do atrito de re-autenticação diária no navegador.
* **Mitigações:** Testes unitários e de integração exaustivos cobrindo violação de unicidade (`P2002`), cross-tenant queries e limites de assentos por plano.
