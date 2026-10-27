# Metodologia TDD Estrito & Governança da Squad Paperclip

Esta regra define o padrão técnico obrigatório de desenvolvimento de software no repositório `portal_licitacao`, espelhando a esteira autônoma e as regras de ouro da Squad de Engenharia no Paperclip (PRD §11).

---

## 1. Princípio do TDD Estrito (Test-Driven Development)
Todo novo recurso, correção de bug (*hotfix*) ou refatoração deve obedecer rigorosamente ao ciclo em 3 fases:

### 🔴 Fase 1 — RED (Especificação de Testes Automatizados)
- **Regra de Ouro:** Nenhuma linha de código de produção deve ser criada antes do teste automatizado correspondente.
- Criar ou atualizar a suíte de testes em `tests/unit/` utilizando Vitest e `@testing-library/react`.
- O teste deve expressar o comportamento esperado, os critérios de aceite da Issue e falhar antes da implementação (estado RED).

### 🟢 Fase 2 — GREEN (Implementação Estrita)
- Escrever o código de produção necessário e suficiente para fazer a suíte de testes passar.
- Respeitar os padrões de arquitetura e design estabelecidos:
  1. **IBM Carbon Design System:** Utilizar componentes oficiais (`@carbon/react`) e ícones Carbon (`@carbon/icons-react`).
  2. **Clean URLs:** Nunca expor query parameters desnecessários ou artificiais na URL (ex: `?origem=...`). Utilizar histórico do navegador (`router.back()`) ou persistência em `sessionStorage`.
  3. **RBAC & Segurança:** Todas as proteções de perfil (Diretoria, Analista Comercial, Operador) devem ser validadas centralizadamente via função `can()` em `src/lib/rbac.ts`.
  4. **Internacionalização:** Todos os textos, mensagens de erro, cabeçalhos e rótulos devem ser 100% em Português do Brasil (PT-BR).

### 🔵 Fase 3 — REFACTOR & Qualidade Contínua (DoD - Definition of Done)
- Executar a suíte completa de testes (`npm test`) e assegurar 100% de aprovação (zero regressões).
- Executar o build de produção (`npm run build`) para validar a compilação do Next.js sem avisos ou erros de tipagem.
- Vincular commits com mensagens semânticas referenciando a issue do GitHub (ex: `feat(#6): ...` ou `test(#6): ...`).

---

## 2. Checklists Obrigatórios de DoD (Definition of Done)
Para considerar qualquer entrega concluída:
- [ ] Issue criada no GitHub com o template oficial antes da codificação.
- [ ] Testes unitários/integração escritos e validados (`npm test`).
- [ ] Build de produção compilado com sucesso (`npm run build`).
- [ ] Critérios de aceite da Issue marcados com `[x]`.
- [ ] Comentário de fechamento na issue com resumo técnico dos commits e testes.
