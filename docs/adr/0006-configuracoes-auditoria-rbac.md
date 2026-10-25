# ADR 0006: Gestão de Configurações Corporativas, Trilha de Auditoria e Governança de Equipe (RBAC)

- **Status:** Aceito
- **Data:** 25 de Outubro de 2026
- **Contexto:** Sprint 6 — Configurações, Trilha de Auditoria & Hardening v1.0 (PRD §4.11, §7, Anexo 4).

---

## 1. Contexto e Motivação

O Portal de Licitações necessita de uma camada final de governança corporativa para centralizar os dados cadastrais da empresa licitante, gerenciar acessos e papéis dos colaboradores com RBAC e disponibilizar a inspeção da trilha imutável de auditoria (`audit_log`) para conformidade com a Lei Federal nº 14.133/2021.

## 2. Decisões de Arquitetura

### 2.1. Centralização dos Dados Corporativos da Licitante
- Centralização dos dados societários (Razão Social, CNPJ, Inscrição Estadual, CNAE, Endereço da Sede, Representante Legal e Dados Bancários).
- Estes dados alimentam automaticamente o gerador das 8 declarações oficiais (`/declaracoes`), minutas jurídicas (`/impugnacoes`) e relatórios de exportação.

### 2.2. Trilha de Auditoria Imutável (`audit_log`) & Exportação Segura
- A tabela `audit_log` já grava operações de mutação (`CREATE`, `UPDATE`, `DELETE`, `MOVE_KANBAN`, `DECIDE_GO_NOGO`, `LOGIN`, `DECLARACAO_GERADA`, etc.).
- Na Sprint 6, expõe-se um leitor de auditoria com:
  - Filtros por intervalo de datas, usuário, tipo de entidade e tipo de ação.
  - Visualização de diff entre o estado anterior (`antes`) e posterior (`depois`).
  - Exportação em CSV (RFC 4180) com sanitização de injeção de fórmulas (escape de `=, +, -, @`).

### 2.3. Gestão de Equipe e RBAC (Anexo 4 do PRD)
- Perfis formais de atuação:
  - `DIRETORIA`: Acesso irrestrito a aprovações de preço, deliberações GO/No-GO, gestão societária e exclusões.
  - `ANALISTA_COMERCIAL`: Triagem de oportunidades, lances, credenciamentos e petições.
  - `OPERADOR_TECNICO`: Análise de termos de referência, ACTs, atestados e elaboração de minutas.
- Apenas usuários com perfil `DIRETORIA` podem alterar papéis ou convidar novos membros.

## 3. Consequências e Mitigações

- **Conformidade Legal:** Trilha de auditoria integral e auditável para atendimento aos órgãos de controle (TCU, TCEs, CGU).
- **Resiliência:** Operação transparente tanto com PostgreSQL 16 quanto com fallback in-memory nos testes automatizados e em ambientes isolados de CI.
