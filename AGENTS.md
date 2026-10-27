# Diretrizes de Desenvolvimento e Governança do Agente

## Regras Ativas do Projeto
1. **Governança de Issues no GitHub**: Veja [.agents/rules/github-issues-workflow.md](file:///.agents/rules/github-issues-workflow.md).
   - **Obrigatório**: Nenhuma alteração de código ou correção de bug pode ser iniciada sem que uma Issue correspondente esteja aberta no GitHub seguindo o template corporativo (Contexto, Comportamento Atual, Comportamento Esperado, Critérios de Aceite).
   - Ao finalizar, os critérios de aceite devem ser marcados com `[x]`, a issue deve receber comentário de conclusão com resumo técnico e ser fechada via `gh issue close`.

2. **Qualidade e Testes**:
   - Manter 100% dos testes unitários passando (`npm test`).
   - Validar compilação (`npm run build`) antes de qualquer commit.
   - Padrão visual alinhado ao IBM Carbon Design System (Carbon UI Shell).
