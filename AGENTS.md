# Diretrizes de Desenvolvimento e Governança do Agente

Este arquivo e as regras em `.agents/rules/` são sempre carregados automaticamente no início de qualquer sessão do Antigravity neste projeto.

---

## Regras Ativas do Projeto

1. **Governança de Issues no GitHub**: Veja [.agents/rules/github-issues-workflow.md](file:///.agents/rules/github-issues-workflow.md).
   - **Obrigatório**: Nenhuma alteração de código ou correção de bug pode ser iniciada sem que uma Issue correspondente esteja aberta no GitHub seguindo o template corporativo (Contexto, Comportamento Atual, Comportamento Esperado, Critérios de Aceite).
   - Ao finalizar, os critérios de aceite devem ser marcados com `[x]`, a issue deve receber comentário de conclusão com resumo técnico e ser fechada via `gh issue close`.

2. **Metodologia TDD Estrito & Paperclip Squad**: Veja [.agents/rules/tdd-development-workflow.md](file:///.agents/rules/tdd-development-workflow.md).
   - **Fase 1 (RED)**: Escrever primeiro os testes automatizados no Vitest (`tests/unit/`) antes do código de produção.
   - **Fase 2 (GREEN)**: Implementar estritamente o necessário com IBM Carbon Design System, Clean URLs e RBAC (`can()`).
   - **Fase 3 (REFACTOR & DoD)**: Validar 100% dos testes (`npm test`) e compilação de produção (`npm run build`).

3. **Qualidade e Padrões de Design**:
   - Padrão visual alinhado ao IBM Carbon Design System (Carbon UI Shell, Grid, Buttons).
   - Textos e mensagens 100% em Português do Brasil (PT-BR).
