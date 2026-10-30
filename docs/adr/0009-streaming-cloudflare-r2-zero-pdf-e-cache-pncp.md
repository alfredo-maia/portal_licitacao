# ADR 0009: Streaming Cloudflare R2, Princípio Zero-PDF e Cache Diário PNCP (TTL 24h)

- **Status:** Aprovado
- **Data:** 30 de Outubro de 2026
- **Autores:** Arquiteto de Software_ag & Squad Antigravity
- **Contexto:** Transição para Plataforma SaaS Multi-Tenant (Sprint SaaS 3, Issue #11)
- **Documento Mestre:** [`docs/PLANO_TRANSICAO_SAAS_MULTI_TENANT.md`](../PLANO_TRANSICAO_SAAS_MULTI_TENANT.md) (§10 e §15)

---

## 1. Contexto & Problema

1. **Restrições de Infraestrutura da VPS Hostinger (100 GB NVMe):**
   - Na implementação original, o upload de editais e anexos salvava arquivos no sistema de arquivos local (`/data/uploads` e `public/uploads`).
   - O volume diário de dezenas de certames com editais em PDF de 10 a 50 MB cada esgotaria o disco da VPS em poucas semanas, causando indisponibilidade de banco de dados e containers.
2. **Latência e Instabilidade da API Federal do PNCP:**
   - Acesso repetido aos PDFs e anexos diretamente no PNCP sofre com oscilações, lentidão e bloqueios de taxa de requisições.
3. **Cofre de Documentos de Habilitação & Riscos de Abuso:**
   - Clientes corporativos necessitam de espaço para certidões e atestados, mas a plataforma não pode ser utilizada como repositório de arquivos arbitrários (vídeos, zips, executáveis ou arquivos pesados).

---

## 2. Decisões de Arquitetura

### 2.1. Princípio Zero-PDF no Servidor Local
- O disco da VPS Hostinger permanece estritamente restrito ao SO Ubuntu, containers Docker e dados textuais do PostgreSQL.
- Nenhum PDF ou anexo de edital é persistido no disco rígido local da aplicação.
- Todo tráfego de upload e download é processado via **streaming direto** (Memory/Stream -> Cloudflare R2 -> Cliente).

### 2.2. Provedor de Armazenamento Cloudflare R2
- Utilização do Cloudflare R2 como storage de objetos compatível com a API S3.
- Custo de tráfego de saída (egress) = **$0,00**, com custo de armazenamento previsível ($0,015/GB/mês).
- Emissão de URLs de download protegidas ou streaming direto com headers de segurança (`Content-Disposition: inline/attachment`, `Content-Type`, `X-Content-Type-Options: nosniff`).

### 2.3. Cache Diário de Editais do PNCP (TTL de 24 Horas)
- Ao abrir os documentos de um certame:
  1. O sistema verifica se existe cache válido no Cloudflare R2 (TTL de 24h).
  2. Se válido (`cachedAt` <= 24h atrás), entrega diretamente do R2 em alta velocidade.
  3. Se expirado ou inexistente, consulta a API do PNCP, realiza streaming para o bucket R2 e atualiza os metadados.
  4. Em caso de indisponibilidade momentânea do PNCP, caso haja cache anterior no R2, o sistema entrega o documento com status de resiliência.

### 2.4. Política de Segurança & Uso Justo Invisível (Fair Use)
- **Whitelist Estrita de Formatos:** Aceitos estritamente `application/pdf`, `image/jpeg` e `image/png`.
- **Bloqueio Total:** Rejeição de executáveis (`.exe`, `.bat`, `.sh`), compactados (`.zip`, `.rar`), planilhas com macros e vídeos.
- **Teto por Arquivo:** Máximo de **20 MB** por arquivo individual.
- **Cotas Silenciosas por Plano de Assinatura:**
  - Plano Básico: 500 MB (capacidade para ~250 certidões).
  - Plano Pro: 2 GB (capacidade para ~1.000 documentos).
  - Plano Enterprise: 5 GB (capacidade corporativa).
  - Ao atingir o limite, exibe mensagem acolhedora orientando contato com o suporte para liberação de cota adicional gratuita.

---

## 3. Consequências

- **Positivas:**
  - Preservação perpétua do disco da VPS Hostinger abaixo de 20 GB de ocupação.
  - Custo zero de tráfego no download de editais graças ao Cloudflare R2.
  - Velocidade imediata de abertura para editais já cacheados nas últimas 24 horas.
  - Blindagem de segurança do portal contra uploads maliciosos.
- **Negativas / Riscos:**
  - Dependência de conectividade de rede entre a aplicação e o Cloudflare R2 (mitigada por retries automáticos e fallback resiliente em memória para testes).
