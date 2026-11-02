# Triage Labels

As skills utilizam cinco papéis canônicos de triagem, duas categorias complementares e cinco etiquetas de `/wayfinder`. Este arquivo mapeia esses papéis para as etiquetas reais já cadastradas no Paperclip (`companyId`: `672fabb1-8461-437d-ad7b-6a7bd33df05c`, projeto **Portal de Licitações** `83891ed1-1820-4cc8-9b40-2d3fd6840e03`).

## Etiquetas Canônicas de Triagem

| Label in mattpocock/skills | Label in our tracker | Paperclip Label ID | Cor | Meaning |
|---|---|---|---|---|
| `needs-triage` | `needs-triage` | `d5c22fa2-1484-4ab4-9029-6b706e85f5f3` | `#64748b` | Maintainer (`Mr. Shikamaru`) precisa avaliar e classificar a demanda |
| `needs-info` | `needs-info` | `89c9e979-b4dc-4de5-8af2-49acf40e6b57` | `#eab308` | Aguardando esclarecimento ou informações adicionais do solicitante |
| `ready-for-agent` | `ready-for-agent` | `e963f9c3-3728-4280-92f8-923af655514b` | `#22c55e` | Totalmente especificada e pronta para execução por agente autônomo |
| `ready-for-human` | `ready-for-human` | `13dbd1b5-a197-4ca6-ab93-8179a1751cf5` | `#3b82f6` | Requer decisão, ação ou implementação humana direta |
| `wontfix` | `wontfix` | `cc5b2598-06f4-4556-8094-e5d45f51bf0d` | `#ef4444` | Demanda descartada ou fora de escopo; não será executada |

## Categorias Disponíveis

| Categoria | Label in our tracker | Paperclip Label ID | Cor | Uso |
|---|---|---|---|---|
| `bug` | `bug` | `be989025-2a29-4e05-a68b-aad8f40ad16e` | `#ef4444` | Defeito, regressão ou falha de comportamento reproduzível |
| `enhancement` | `enhancement` | `cd2cf0a9-260a-4bcf-bf37-aed6cca0d550` | `#a855f7` | Evolução, melhoria ou nova funcionalidade solicitada |

## Etiquetas de Wayfinder (`/wayfinder`)

| Papel | Label in our tracker | Paperclip Label ID | Cor | Uso |
|---|---|---|---|---|
| `wayfinder:map` | `wayfinder:map` | `070a2a24-7234-4c24-858b-ec5fdcd72aa9` | `#0ea5e9` | Issue raiz com o mapa de exploração (Notes / Decisions-so-far / Fog) |
| `wayfinder:grilling` | `wayfinder:grilling` | `f0133e43-052e-41e3-a7aa-25ff0b1cb2a6` | `#8b5cf6` | Ticket de decisão ou alinhamento de requisitos |
| `wayfinder:research` | `wayfinder:research` | `c55b749c-a194-4587-8d5c-a41345d4d066` | `#14b8a6` | Ticket de investigação técnica no código/ambiente |
| `wayfinder:prototype` | `wayfinder:prototype` | `e6f79168-ce95-4920-bc11-9c362132642b` | `#f97316` | Ticket de protótipo ou spike descartável |
| `wayfinder:task` | `wayfinder:task` | `79f88230-ae2f-49a5-9c70-9b5de5d58142` | `#64748b` | Ticket de tarefa preparatória delimitada |

Quando uma skill mencionar um papel de triagem (ex.: aplicar a etiqueta de pronta para agente em `/triage`), utilize exatamente o nome e o `id` correspondentes da tabela acima no Paperclip (`labelIds`).
