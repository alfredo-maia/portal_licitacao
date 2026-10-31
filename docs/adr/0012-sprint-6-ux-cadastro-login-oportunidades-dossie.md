# ADR 0012: Melhorias de UX, Cadastro em 2 Etapas, Login Multi-Step, Filtros de Oportunidades por Segmento e Sincronização PNCP no Dossiê (Sprint 6)

## Status
Aprovado

## Data
2026-10-30

## Contexto
Com base no documento de homologação e feedback de produto (`Sprint 6.pdf`), o Portal de Licitações identificou pontos essenciais de atrito e necessidade de refinamento em suas principais interfaces e fluxos:
1. **Cadastro e Onboarding (/cadastro):** O cadastro solicitava apenas dados gerais, sem permitir que o usuário configurasse seus macro e sub-segmentos de atuação e abrangência geográfica (UFs ou Brasil todo), resultando em ruído de oportunidades irrelevantes. Além disso, apresentava mensagens informais e tooltips HTML5 nativos do navegador em inglês.
2. **Autenticação e Login (/login):** Usuários cadastrados (como `opaonossopanificadora@gmail.com`) enfrentaram falha de autenticação caso a transação Prisma encontrasse divergências pontuais de colunas na VPS de staging. Era necessário também adotar uma experiência moderna multi-step, oferecendo acesso por Senha, Código OTP por E-mail e Código OTP por WhatsApp.
3. **Limpeza Global de Navegação (AppShell & ModulePageShell):** Remoção de elementos visuais redundantes (botão 'X' adicional no menu e tag de versão estática em todas as telas).
4. **Dashboard Executivo (/dashboard):** Eliminação de nomenclaturas internas/técnicas (`GO/No-GO`) em prol de termos comerciais (`Participar`, `Recusadas`), cards mais limpos apenas com métricas e remoção da seção estática "Top 4 Categorias de TI".
5. **Central de Oportunidades (/oportunidades):** Substituição do catálogo fixo de TI por "Segmento / Ramo" e "Sub-segmento" integrados às preferências da conta do cliente, sem exibição cruzada de subcategorias alienígenas.
6. **Dossiê da Oportunidade (/oportunidades/[id]):** Eliminação de botões externos e benchmarking de código legado, introduzindo o botão "Buscar Edital" para sincronização direta dos arquivos oficiais do PNCP via streaming Cloudflare R2 com seleção individual ou download em lote.

## Decisões de Arquitetura

1. **Taxonomia Multi-Tenant em `Tenant`:**
   - Adicionados ao model `Tenant` no Prisma: `telefone String?`, `segmentos String[] @default([])`, `subsegmentos String[] @default([])`, `ufs String[] @default([])` e `brasilInteiro Boolean @default(true)`.
   - Na criação da conta, o serviço `realizarCadastroConta` valida e persiste os segmentos e UFs escolhidos, disponibilizando-os via endpoint `/api/tenant/preferencias`.

2. **Resiliência e Auto-Healing no Login e Cadastro:**
   - O serviço `cadastro.service.ts` garante auto-healing de tabelas e colunas via `ALTER TABLE IF NOT EXISTS` e sincroniza o usuário imediatamente no cache in-memory de autenticação (`upsertInMemoryAuthUser`), permitindo login imediato mesmo com lentidão transitória no banco.
   - Em `auth/index.ts`, caso a query relacional completa de `User` com `tenantMemberships` enfrente descompasso de migração, um fallback automático para `prisma.user.findUnique` simples garante que o hash bcrypt seja validado com sucesso.

3. **Autenticação Multi-Step com OTP de 6 Dígitos:**
   - O login passa a operar em etapas estritas: entrada de e-mail corporativo (`EMAIL`) -> escolha do método (`METHOD_SELECT`) -> e execução do método escolhido (`PASSWORD`, `EMAIL_OTP` ou `WHATSAPP_OTP`).
   - O link "Esqueceu a senha?" é renderizado única e exclusivamente na tela de senha.
   - Códigos OTP possuem validade de 10 minutos, com verificação de idempotência e expiração.

4. **Sincronização Sob Demanda de Arquivos PNCP no Dossiê:**
   - O endpoint `POST /api/oportunidades/[id]/arquivos/sync-pncp` consulta os arquivos oficiais registrados na API do PNCP (`/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos`), faz o streaming seguro para o bucket Cloudflare R2 e cadastra os arquivos no model `Arquivo` da licitação.

## Consequências
- Os novos usuários cadastram-se já segmentados com foco operacional restrito ao seu nicho de negócio.
- O login torna-se à prova de falhas e mais flexível, atendendo operadores que preferem autenticação instantânea por código no WhatsApp ou E-mail.
- O código do frontend fica alinhado às diretrizes do IBM Carbon Design System, sem tooltips nativos em inglês e com design corporativo limpo.

