# ADR 0004: Portais de Licitações, Acervo Documental de Habilitação & Notificações N6/N7

- **Status:** Aprovado
- **Data:** 25/10/2026
- **Contexto:** Sprint 4 — Portais de Compras (`/portais`), Repositório de Documentação (`/documentacao`), Ativação de N6/N7 no Job Diário e Integração de Alertas no Calendário.
- **Documento Mestre:** `docs/PRD.md` (§4.2, §4.5, §4.6, §6.2, §11, §12)

---

## 1. Contexto e Problema

A Lei Federal nº 14.133/2021 descentralizou as compras públicas em dezenas de plataformas eletrônicas privadas e governamentais (Compras.gov.br, Portal de Compras Públicas, Licitações-e, BLL Compras, BBMNet, etc.), cada uma com regras de credenciamento, anuidades pagas e exigências de certificado digital (A1/A3). Além disso, a participação em certames exige acervo de habilitação jurídica, fiscal, trabalhista, técnica e econômico-financeira estritamente em dia; um único documento vencido (ex.: CND Federal, Balanço ou FGTS) resulta na inabilitação imediata da empresa.

A Sprint 4 entrega os dois módulos pilares de compliance operacional:
1. **Módulo de Portais (`/portais` e `/portais/[id]`):** Catálogo centralizado de plataformas, controle de credenciais seguras (sem senhas), datas de renovação e regras de robô de lances.
2. **Módulo de Documentação (`/documentacao`):** Repositório de certidões, balanços e atestados com versionamento, destaque visual estrito em vermelho para documentos vencendo em ≤ 30 dias e conexão com o Calendário de Certames.
3. **Ativação dos Alertas N6 e N7:** Emissão automatizada no motor de notificações diário e projeção de alertas de vencimento na grade mensal do Calendário.

---

## 2. Decisões Arquiteturais

### 2.1. Segurança Estrita de Credenciais de Portais (PRD §4.5)
O portal **NÃO armazena senhas** de portais de compras no banco de dados.
- O modelo `Portal` armazena exclusivamente: `login`, `email`, `cnpj`, `usuario`, `url` oficial e dados de contato de suporte técnico.
- As senhas continuam sob custódia de cofres de senhas corporativos (1Password, Bitwarden) ou certificados físicos/tokens, evitando vazamentos e responsabilidade legal.

### 2.2. Categorização de Documentos (Lei 14.133/2021)
O modelo `Documento` padroniza as 5 categorias legais da nova lei de licitações:
- `JURIDICA`: Contrato Social, Requerimento de Empresário, Procurações.
- `FISCAL_TRABALHISTA`: CND Federal/Previdenciária, CND Estadual, CND Municipal, CNDT (Trabalhista), CRF FGTS.
- `QUALIFICACAO_TECNICA`: Atestados de Capacidade Técnica (ACT), Registro no CRA/CREA/outro conselho, Certificações ISO.
- `QUALIFICACAO_ECONOMICA`: Balanço Patrimonial registrado na Junta, Demonstração do Resultado (DRE), Certidão Falência/Recuperação Judicial, Índices de Liquidez (LG, SG, LC ≥ 1.0).
- `OUTROS`: Declarações avulsas e certidões complementares.

### 2.3. Controle de Validade e Documentos Permanentes
- `semValidade`: Booleano para documentos que não expiram (diplomas, contratos sociais registrados, atestados técnicos definitivos). Quando `true`, `dataVencimento` é nula.
- **Regra Visual Estrita (PRD §4.6):** Se o documento estiver vencido ou com vencimento em **≤ 30 dias**, o front-end é obrigado a exibi-lo com estilo de alerta visual (cor vermelha de erro do Carbon `--cds-support-error` e tipografia em negrito).

### 2.4. Versionamento de Documentos
Para manter a rastreabilidade de auditoria:
- Ao atualizar um documento (ex.: novo Balanço ou nova CND), o registro anterior não é excluído.
- O novo documento recebe `versao = versaoAnterior + 1` e `documentoPaiId` apontando para a raiz do documento.
- O documento anterior tem seu status alterado para `SUBSTITUIDO` ou `ARQUIVADO`, garantindo histórico fiel de quais certidões estavam vigentes em certames passados.

### 2.5. Ativação de Notificações N6 e N7 no Job Diário
As regras de antecedência da matriz (PRD §6.2) passam a ser executadas no `POST /api/notificacoes/jobs/diario`:
- **N6_VENCIMENTO_PORTAL:** Destinatários `DIRETORIA_E_COMERCIAL`. Antecedência: 30, 21, 14, 7 e 1 dia antes de `dataVencimento`.
- **N7_VENCIMENTO_DOCUMENTO:** Destinatários `TODOS`. Antecedência: 30, 14 e 1 dia antes de `dataVencimento`.
- Ambas usam a chave idempotente `montarChaveIdempotencia({ tipo, entidadeId, janela })` onde janela é a data da ocorrência (YYYY-MM-DD em BRT), garantindo zero duplicações.

### 2.6. Projeção de Alertas no Calendário de Certames (`GET /api/calendario`)
O serviço `calendario.service.ts` agora consome a tabela `Documento` para preencher `alertasDocumentais`:
- Filtra documentos com `status = ATIVO`, `semValidade = false` e `dataVencimento` dentro do mês consultado.
- Gera a estrutura do contrato:
  ```json
  {
    "documentoId": "doc-123",
    "titulo": "Certidão Negativa Federal",
    "dia": 18,
    "mensagem": "⚠️ Certidão Negativa Federal — Vencimento em 18/11/2026 (Atualizar)",
    "linkDestino": "/documentacao"
  }
  ```

---

## 3. Consequências

- O banco ganha as tabelas `portal` e `documento`.
- O in-memory store (`licitacoes-store.ts`) passa a armazenar portais e documentos para testes rápidos e isolados.
- A grade do `/calendario` exibe dinamicamente a faixa de alertas quando há certidões vencendo no mês.
- A tela `/portais` permite cadastrar e manter os portais com monitoramento de assinaturas.
- A tela `/documentacao` centraliza o repositório documental da empresa com uploads e versionamento.
