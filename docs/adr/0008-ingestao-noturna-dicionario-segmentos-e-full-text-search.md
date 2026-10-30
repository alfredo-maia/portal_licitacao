# ADR 0008: Motor de Ingestão Noturna, Dicionário Semântico de Segmentos e Full-Text Search Nativo

- **Status:** Aprovado
- **Data:** 30 de Outubro de 2026
- **Autores:** Arquiteto de Software_ag & Squad Antigravity
- **Contexto:** Transição para Plataforma SaaS Multi-Tenant (Sprint SaaS 2, Issue #10)
- **Documento Mestre:** [`docs/PLANO_TRANSICAO_SAAS_MULTI_TENANT.md`](../PLANO_TRANSICAO_SAAS_MULTI_TENANT.md) (§1.2, §8, §9, §11 e §15)

---

## 1. Contexto & Problema

Na arquitetura legada, a ingestão de editais era direcionada exclusivamente ao nicho interno de Tecnologia da Informação, utilizando uma lista fixa de 22 tipos de software corporativo (`TipoSistema`).

Com a expansão para SaaS comercial multi-nicho, empresas de diferentes setores (Farmácias, Construtoras, Fornecedores de Alimentos, Frotistas, etc.) contratam a plataforma para monitorar oportunidades específicas. Para atender a essa demanda em escala:
1. É imperativo classificar e etiquetar os certames em tempo de ingestão conforme a taxonomia oficial de 7 macro-segmentos e subcategorias essenciais.
2. É necessário catalogar oficialmente as modalidades da Lei 14.133/2021 pelos seus códigos PNCP (Pregão Eletrônico 6, Dispensa Eletrônica 8, Concorrência 5, Inexigibilidade 9, Leilão 1).
3. A busca global precisa de motor de busca textual otimizado (*Full-Text Search*) com suporte a sinônimos, múltiplos filtros (segmentos, modalidades, UFs, datas) e ordenação por relevância.
4. Prorrogações de prazo (`dataEncerramentoProposta`) precisam de sincronização automatizada sem perder a rastreabilidade no Kanban e Calendário.

---

## 2. Decisões de Arquitetura

### 2.1. Taxonomia de 2 Níveis e Classificação Semântica
Adotamos uma taxonomia estrita e hierárquica dividida em 7 Macro-Segmentos:
1. `SAUDE_MEDICAMENTOS_HOSPITALAR` (Medicamentos, Materiais Hospitalares, Equipamentos Médicos/Odontológicos, Gases Medicinais)
2. `AUTOMOTIVO_PECAS_FROTAS` (Pneus/Câmaras, Peças Automotivas, Óleos/Lubrificantes, Manutenção de Frotas)
3. `OBRAS_CONSTRUCAO_MANUTENCAO` (Materiais Básicos, Obras de Engenharia/Pavimentação, Elétrica/Iluminação, Hidráulica/Saneamento)
4. `ALIMENTOS_MERENDA_ESCOLAR` (Não-Perecíveis, Hortifrúti Fresco, Carnes/Laticínios, Panificação/Lanches)
5. `TECNOLOGIA_TELECOM` (Equipamentos/Hardware, Softwares/SaaS/Licenças, Redes/Telecom, Suporte Técnico)
6. `SERVICOS_TERCEIRIZADOS_OPERACIONAIS` (Limpeza/Conservação, Vigilância/Segurança, Portaria/Apoio, Locação de Máquinas/Veículos)
7. `MATERIAIS_ESCRITORIO_SUPRIMENTOS` (Papelaria/Escritório, Mobiliário, Materiais de Limpeza, Uniformes/EPIs)

O classificador semântico varre o `objeto`, `resumo` e termos-chave da contratação, mapeando os macro-segmentos e subcategorias com precisão.

### 2.2. Modalidades da Lei 14.133/2021 e Ingestão Noturna
Mapeamos e normalizamos os códigos oficiais da API do PNCP:
- `6`: Pregão Eletrônico
- `8`: Dispensa de Licitação (Compra Direta)
- `5`: Concorrência Eletrônica
- `9`: Inexigibilidade de Licitação
- `1`: Leilão Eletrônico

A rotina noturna realiza UPSERT idempotente baseado no `idPncp`/`numeroControlePNCP`.

### 2.3. Sincronização de Prazos e Prorrogações
Quando a rotina de sincronização identifica alteração em `dataEncerramentoProposta`, o sistema:
- Atualiza a data no banco e gera histórico de retificação.
- Emite notificação de prorrogação (`N2_LICITACAO_ATUALIZADA`).
- Garante que a data no Calendário reflita imediatamente o novo prazo fatal.

### 2.4. Full-Text Search Resiliente
Implementamos uma camada de busca que:
- Permite busca textual com normalização, remoção de acentos e tokenização em português.
- Filtra eficientemente por múltiplos macro-segmentos, modalidades, estados (UFs) e faixas de valores.
- Opera de forma resiliente tanto no PostgreSQL nativo quanto em ambiente de testes/CI.

---

## 3. Consequências

- **Positivas:**
  - Suporte completo a múltiplos segmentos de mercado para clientes de diferentes ramos.
  - Zero duplicações na ingestão através do UPSERT idempotente.
  - Prazos de licitação mantidos sempre sincronizados com a fonte federal oficial.
  - Busca rápida e flexível para o frontend e filtros de oportunidades.
- **Negativas / Riscos:**
  - Ambiguidade em objetos de licitação que abrangem mais de uma categoria (mitigado permitindo múltiplos segmentos por certame).
