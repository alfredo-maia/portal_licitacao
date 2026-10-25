# ADR 0005: Modelos Oficiais de Declaração (Anexo 5) e Gestão de Impugnações (Lei 14.133/2021)

- **Status:** Aceito
- **Data:** 2026-10-25
- **Autores:** Squad de Engenharia (Gerente de Projeto, Arquiteto, QA, Backend, Frontend, DevOps)
- **Decisores:** Diretoria Técnica & Comercial
- **Contexto:** PRD §4.7 (Declarações Oficiais), §4.9 (Impugnações e Esclarecimentos) e Anexo 5.

---

## 1. Contexto & Problema

Na participação em licitações públicas sob a **Lei Federal nº 14.133/2021**, dois componentes operacionais exigem precisão jurídica e rapidez para evitar inabilitação sumária da licitante:
1. **Emissão de Declarações Obrigatórias:** Todo certame exige a apresentação de um conjunto de 8 declarações padronizadas assinadas pelo representante legal (Art. 63 da Lei 14.133, Art. 7º CF/88, LC 123/2006). Preencher esses documentos manualmente em editores externos gera erros materiais, divergência de dados e atrasos na fase de habilitação.
2. **Defesa contra Editais Restritivos (Impugnações):** O Art. 164 da Lei 14.133/2021 estabelece que *qualquer pessoa é parte legítima para impugnar edital de licitação por irregularidade ou para solicitar esclarecimento sobre os seus termos, devendo protocolar o pedido até 3 (três) dias úteis antes da data de abertura do certame*. Perder este prazo fatal preclui o direito administrativo de sanar cláusulas restritivas ou ilegais.

---

## 2. Decisões Arquiteturais

### 2.1. Os 8 Modelos Oficiais de Declaração (PRD §4.7 e Anexo 5)

Definimos no domínio do sistema os 8 tipos oficiais com templates parametrizáveis:
1. `CARTA_CREDENCIAMENTO`: Credenciamento de representante/procurador para a sessão pública.
2. `ELABORACAO_INDEPENDENTE`: Declaração de elaboração independente de proposta (Art. 9º, III da Lei 14.133).
3. `INEXISTENCIA_FATOS_IMPEDITIVOS`: Declaração de inexistência de fatos impeditivos e idoneidade.
4. `NAO_TRABALHO_FORCADO`: Declaração de não trabalho forçado ou degradante (conformidade com direitos humanos).
5. `RENUNCIA_VISTORIA`: Declaração de renúncia de vistoria técnica presencial com conhecimento pleno do local.
6. `HABILITACAO_PLENA`: Declaração de pleno atendimento aos requisitos de habilitação jurídica, fiscal e técnica.
7. `ME_EPP`: Declaração de enquadramento como Microempresa ou Empresa de Pequeno Porte (LC 123/2006).
8. `NAO_EMPREGA_MENOR`: Declaração de observância do Art. 7º, XXXIII da Constituição Federal (não emprego de menores, salvo aprendiz a partir de 14 anos).

### 2.2. Split-Screen e Pré-visualização A4 em Tempo Real (`/declaracoes`)

Para conferir máxima produtividade e confiabilidade:
- A interface é dividida em **duas colunas**:
  - **Coluna Esquerda (Painel de Configuração):** Formulário interativo para seleção do modelo dentre os 8, seleção opcional de certame ativo (auto-preenchendo Órgão, Edital e Objeto), dados da empresa licitante e dados do declarante/representante legal.
  - **Coluna Direita (Folha A4 Dinâmica):** Renderização tipográfica formal em papel A4 virtual, com margens padronizadas (2.5cm), brasão/logotipo, texto jurídico com interpolação dinâmica dos dados e campo formal de assinatura.
- **Exportação:** Suporte a impressão direta (`window.print()`) e exportação limpa, estilizada para geração de PDF pronto para assinatura ICP-Brasil ou Gov.br.

### 2.3. Gestão e Funil de Impugnações (`/impugnacoes`)

A entidade `Impugnacao` modela a governança jurídica dos pedidos de retificação:
- **Status do Funil:** `RASCUNHO` $\rightarrow$ `PROTOCOLADA` $\rightarrow$ `ACATADA` $\rightarrow$ `INDEFERIDA`.
- **Cálculo Automático do Prazo Fatal (Art. 164 Lei 14.133):**
  - O prazo fatal é calculado subtraindo **3 dias úteis** da `dataAberturaSessao`.
  - O cálculo desconsidera sábados e domingos. Se o dia resultante recair em final de semana, retroage-se ao último dia útil anterior.
  - O sistema exibe um indicador visual do tempo restante e alerta de urgência quando o prazo fatal estiver próximo.
- **Minuta Jurídica Padronizada:** A ferramenta oferece templates com fundamentação jurídica sólida (jurisprudência do TCU sobre vedação a exigências excessivas de atestados, direcionamento de marcas e restrição à competitividade).

### 2.4. Trilha de Auditoria

Qualquer emissão de declaração ou alteração no ciclo de vida de uma impugnação registra evento formal em `audit_log` (`DECLARACAO_GERADA`, `IMPUGNACAO_CRIADA`, `IMPUGNACAO_STATUS_UPDATE`), garantindo rastreabilidade completa para governança.

---

## 3. Consequências

- **Positivas:**
  - Padronização 100% legal dos 8 documentos mais frequentes em certames.
  - Eliminação de erros de digitação de CNPJ, razão social e representação.
  - Prevenção ativa de preclusão de prazos de impugnação contra cláusulas ilegais de editais.
  - Impressão A4 de alta fidelidade sem dependências externas complexas.
- **Conformidade:** Totalmente aderente ao PRD §4.7, §4.9, Lei 14.133/2021 e Carbon Design System.
