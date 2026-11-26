# Design: Motor Semântico Determinístico V3 — Títulos Fiéis, Classificação 40x188 e Fallback `OUTROS`

- **Data:** 2026-11-26
- **Issue:** `#57`
- **Status:** Aguardando aprovação do parceiro

---

## 1. Intenção e Motivação (Why)

Impedir que licitações públicas coletadas no PNCP recebam títulos falsos enviesados para TI ou sejam classificadas em segmentos/subsegmentos incorretos. O caso emblemático ocorreu no certame `46578522000176-1-000033/2026` (**Município de Itariri/SP**), cujo objeto real é *"CONCESSÃO DO AUXILIO-FUNERAL PARA ATENDER AS DEMANDAS DAS FAMILIAS EM SITUAÇÃO DE VULNERABILIDADE SOCIAL/ECONOMICA"*, mas que recebeu o título *"Software de gestão da assistência social (SUAS)"* e foi listado no filtro de **Informática / Tecnologia**.

A precisão desse motor é crítica para toda a operação SaaS multi-tenant: cada cliente configura seus segmentos (40 macro-categorias) e subsegmentos (188 subatividades) e precisa confiar que sua Central de Oportunidades e seu Dashboard exibem apenas editais genuinamente aderentes ao seu ramo.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
1. **Fidelidade estrita do título (`miniResumo`):** Nenhum template de TI/Software pode ser aplicado sem âncora explícita de software/TI no objeto oficial do PNCP.
2. **Desacoplamento Título × Classificação:** O classificador deve ler exclusivamente o texto oficial do PNCP (`resumo`), nunca o `miniResumo` sintetizado.
3. **Separação Núcleo do Objeto × Destinatário/Finalidade:** Diferenciar *o que está sendo comprado/contratado* (peso alto) de *qual secretaria/público vai utilizar* (peso reduzido).
4. **Cobertura e Travas Anti-Colisão nos 40 Segmentos / 188 Subsegmentos:** Enriquecer vocabulário real do PNCP (ex.: `auxílio-funeral`, `funeral` em `FUNERARIA/3601`) e neutralizar expressões polissêmicas (ex.: `"sistema de registro de preços"`, `"licenciamento ambiental"`, `"rede municipal de ensino"`).
5. **Classificação `"OUTROS"`:** Editais sem aderência mínima confiável a nenhum dos 40 segmentos recebem `segmentoMacro = "OUTROS"` e `subcategorias = []`, ficando ocultos dos feeds filtrados por segmento/subsegmento dos clientes.
6. **Saneamento Retroativo da Base:** Reprocessar todas as licitações já salvas no banco (incluindo os ~900 certames em `staging.aponta.cloud`) corrigindo títulos e classificações.

### Não-Objetivos
- Não alterar a árvore comercial selecionável pelos clientes (`CATALOGO_MACRO_SEGMENTOS` permanece com exatamente 40 macro-categorias e 188 subatividades de 4 dígitos).
- Não introduzir dependência de chamadas LLM pagas no classificador de segmentos.

### Anti-Objetivos (Falhas Inaceitáveis)
- Jogar editais sem match em `ASSESSORIAS` (ou qualquer outro segmento comercial de clientes).
- Permitir que itens com `subcategorias: []` passem pelo filtro quando o cliente restringiu subsegmentos específicos.
- Corrigir apenas coletas futuras e deixar a base atual de `staging.aponta.cloud` com títulos/segmentos contaminados.

---

## 3. Restrições Arquiteturais

- **Schema-First & Compatibilidade:** `MacroSegmentoEnum` mantém as 40 opções selecionáveis em cadastro/configurações; novo `ClassificacaoMacroEnum` (`MacroSegmentoEnum` + `"OUTROS"`) tipa o retorno do classificador e o campo `segmentoMacro` da licitação (`zero any`).
- **Performance Determinística:** Tempo de classificação `< 1 ms` por certame, permitindo reclassificar lotes de milhares de registros de forma síncrona sem timeout.
- **Governança & Auditoria:** Toda execução administrativa de reprocessamento da base grava registro em `audit_log`.

---

## 4. Abordagens Avaliadas

1. **Abordagem 1 (Escolhida pelo Parceiro) — Motor Semântico Determinístico V3 (Núcleo vs. Destinatário + Travas Anti-Colisão + `"OUTROS"`):**
   - Custo zero de API, latência sub-milissegundo, 100% reproduzível em testes unitários e resolve diretamente a causa estrutural das colisões semânticas e dos títulos alucinados.
2. **Abordagem 2 — Motor Híbrido (Determinístico V3 + Desempate por IA na Zona Cinzenta):**
   - Descartada nesta etapa pelo consumo de tokens/latência em coletas volumosas do PNCP, dado que o ajuste estrutural determinístico + `"OUTROS"` já elimina os falsos positivos.

---

## 5. Desenho Técnico Detalhado

### 5.1. Guarda de Contexto na Síntese de Títulos (`src/lib/resumo-licitacao.ts`)
- Criar `possuiContextoRealDeSoftwareTi(objetoRaw)`:
  - Exige presença de termo inequívoco de TI (`\b(software|softwares|saas|erp|sistema informatizado|sistema web|sistema de gestao|sistema eletronico|prontuario eletronico|plataforma digital|aplicativo|licenciamento de uso|licenca de software|fabrica de software|pontos de funcao|datacenter|data center|firewall|ciberseguranca|endpoints|cloud|nuvem)\b/i`).
  - Bloqueia imediatamente caso o núcleo seja incompatível com software (`auxílio-funeral`, `urna funerária`, `cesta básica`, `gêneros alimentícios`, `merenda`, `medicamentos`, `obra de`, `pavimentação`, `aquisição de veículos`, `licenciamento ambiental`).
- Os blocos fixos de títulos de TI em `sintetizarMiniResumo` só executam se `possuiContextoRealDeSoftwareTi(objetoRaw)` for `true`.
- Caso contrário, executa a extração limpa por fronteira de palavra sobre o objeto oficial (`limparTextoObjetoLicitacao`), preservando palavras compostas com hífen relevante (ex.: *"Concessão do Auxílio-Funeral para Atender as Demandas das Famílias"*).
- No fallback vazio (quando não há texto), retornar `"Aquisição e Contratação Pública"` em vez de `"Licitação de Tecnologia"`.

### 5.2. Motor Semântico Determinístico V3 (`src/server/services/classificador-segmentos.service.ts` & `src/server/schemas/segmentos.schema.ts`)
1. **Isolamento de Entrada:**
   - Em `ingestao.service.ts` (`mapItemToLicitacaoData`) e `oportunidades.service.ts` (`enrichRecordSegment`), chamar `classificarLicitacaoPorTexto(item.resumo)` **sem** concatenar `miniResumo` sintético.
2. **Pré-Limpeza de Expressões Polissêmicas (Anti-Colisão):**
   - Antes de pontuar palavras-chave, remover/mascarar jargões administrativos licitatórios que causam falsos positivos:
     - `"sistema de registro de precos"` / `"registro de precos"` (evita pontuar `"sistema"` em TI);
     - `"processo administrativo"` / `"processo licitatorio"` / `"processo eletronico"` quando parte do cabeçalho do edital (ex.: *"Pregão Eletrônico / Processo Administrativo nº..."*);
     - `"assinatura da ata"` / `"assinatura do contrato"` (evita pontuar `"assinatura"` em Publicidade/Software);
     - `"licenciamento ambiental"` (mapeado exclusivamente para `ESPECIALIZADOS/0402`, nunca `INFORMATICA`).
3. **Fatiamento Estrutural: Zona Núcleo vs. Zona Destinatário:**
   - Dividir o objeto normalizado no primeiro marcador de finalidade/órgão destinatário:
     `/\b(para atender|visando atender|em atendimento|destinad[oa]s?\s+a|a fim de atender|junto a|em prol d[ao]|no ambito d[ao]|da secretaria municipal|da secretaria de estado|do fundo municipal|das secretarias)\b/`
   - **Zona Núcleo (antes do marcador):** multiplicador `2.0x` (Termo Composto = `30 pts`, Termo Simples Específico = `12 pts`).
   - **Zona Destinatário (após o marcador):** multiplicador `0.25x` (Termo Composto = `4 pts`, Termo Simples = `1 pt`).
   - **Efeito prático:** Termos citados apenas na secretaria/público-alvo (*"...para atender a Secretaria de Saúde / Rede Municipal de Ensino / famílias em vulnerabilidade social"*) jamais atingem sozinhos o limiar mínimo nem superam o objeto real contratado no núcleo.
4. **Revisão de Vocabulário e Exclusões nos 40 Segmentos / 188 Subsegmentos:**
   - `FUNERARIA (3601)`: adicionar `"auxilio funeral"`, `"beneficio funeral"`, `"funeral"`, `"traslado funerario"`, `"urna mortuaria"`, `"tanatopraxia"`, `"jazigo"`, `"sepultamento"`.
   - `INFORMATICA (3101..3106)`: remover/restringir palavras soltas ambíguas (como `"sistema"` isolado sem qualificador tecnológico nos radicais) e exigir qualificadores reais de TI/telecom/equipamentos.
   - Revisão das 40 categorias para evitar termos de 1 palavra excessivamente genéricos (como `"social"`, `"rede"`, `"servico"`, `"gestao"`, `"material"`, `"equipamento"`, `"licenca"`, `"plano"`, `"sistema"` isolados) e fortalecer termos nucleares específicos por subcategoria.
5. **Limiar Mínimo de Confiança e Retorno `"OUTROS"`:**
   - Definir `SCORE_MINIMO_CLASSIFICACAO = 10`.
   - Se nenhum segmento atingir `>= 10` pontos (e nenhum radical inequívoco bater na **Zona Núcleo**), retornar `{ macro: "OUTROS", subcategorias: [], score: 0, termosCorrespondentes: [] }`.

### 5.3. Blindagem de Filtragem (`src/server/services/oportunidades.service.ts` & `busca-licitacoes.service.ts`)
- **`passaSubsegmentosTenant`:** Quando o tenant selecionou subsegmentos dentro de uma macro-categoria (`restringiu === true`), exigir `subs.length > 0 && subs.some((c) => subsegmentosTenant.includes(c))` (corrigindo o bug onde `subs.length === 0` retornava `true`).
- **`enrichRecordSegment`:** Reconhecer `"OUTROS"` como classificação já processada (não sobrescrever com fallback legado).
- **Filtros de UI / ADM:** Permitir filtrar explicitamente `segmento=OUTROS` quando desejado no ADM/busca avançada, mantendo clientes filtrados apenas pelos seus segmentos contratados (`segmentosTenantAtivo`).

### 5.4. Saneamento Retroativo da Base Existente
- Criar serviço `reclassificarCatalogoLicitacoesService()` (exposto em `POST /api/admin/licitacoes` com `acao: "reclassificar_catalogo"` e em script CLI `scripts/reclassificar-catalogo-licitacoes.ts`):
  - Lê todas as licitações do banco;
  - Detecta títulos contaminados pelos antigos rótulos forçados de TI (quando ` !possuiContextoRealDeSoftwareTi(resumo) `) ou títulos truncados, regenerando `miniResumo` fiel a partir de `resumo`;
  - Recalcula `segmentoMacro` e `subcategorias` usando exclusivamente `classificarLicitacaoPorTexto(resumo)` (Motor V3);
  - Atualiza em lote no PostgreSQL, registra `AuditLog` (`ADMIN_RECLASSIFICAR_CATALOGO`) e retorna resumo detalhado (`analisados`, `titulosCorrigidos`, `segmentosAlterados`, `movidosParaOutros`, `amostras`).

---

## 6. Decisões Assumidas pelo Construtor (Para Conferência)
- `CATALOGO_MACRO_SEGMENTOS` continua com as **40 categorias comerciais** para não exibir `"Outros"` como ramo de atuação no cadastro de empresas, enquanto o banco e o Portal ADM aceitam `"OUTROS"` para certames sem aderência.
- Limiar mínimo calibrado em `10 pontos` (1 termo específico ou composto no núcleo = `12` a `30` pontos, passa; menções apenas na finalidade/secretaria = `1` a `4` pontos, barra e envia para `"OUTROS"`).
