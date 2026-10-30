# Superpowers Framework & Methodology Integration

Este repositório possui o framework oficial de habilidades **Superpowers** (`obra/superpowers`) instalado em `.agents/skills/`.

## 1. Habilidades Disponíveis em `.agents/skills/`

1. **`using-superpowers`**: Guia mestre sobre como e quando acionar cada habilidade do framework.
2. **`brainstorming`**: Diálogo socrático e refinamento interativo de arquitetura e requisitos antes da execução.
3. **`writing-plans`**: Fatiamento de planos em tarefas modulares e atômicas.
4. **`executing-plans`**: Execução disciplinada passo a passo com validação contínua.
5. **`test-driven-development`**: Ciclo estrito Red-Green-Refactor.
6. **`systematic-debugging`**: Análise sistemática de causa-raiz.
7. **`verification-before-completion`**: Verificação exaustiva com testes e conferência antes de finalizar qualquer entrega.
8. **`requesting-code-review` & `receiving-code-review`**: Checklist rigoroso pré e pós-revisão de código.
9. **`subagent-driven-development`**: Orquestração e revisão dupla de qualidade.
10. **`using-git-worktrees`** & **`finishing-a-development-branch`**: Isolamento de branches e finalização limpa de código.

## 2. Diretriz de Uso para Modelos (Claude Sonnet / Gemini / Antigravity)

- Ao iniciar qualquer fase de arquitetura ou revisão de plano, consulte e siga as diretrizes de [brainstorming](file:///.agents/skills/brainstorming/SKILL.md) e [using-superpowers](file:///.agents/skills/using-superpowers/SKILL.md).
- Em etapas de implementação, aplique [test-driven-development](file:///.agents/skills/test-driven-development/SKILL.md) e as regras em [.agents/rules/tdd-development-workflow.md](file:///.agents/rules/tdd-development-workflow.md).
- Antes de considerar qualquer issue pronta, execute os passos de [verification-before-completion](file:///.agents/skills/verification-before-completion/SKILL.md).
