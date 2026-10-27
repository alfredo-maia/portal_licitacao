# Regra de Governança: Criação e Ciclo de Vida de Issues no GitHub

Esta regra é de cumprimento obrigatório para qualquer agente de IA ou desenvolvedor atuando neste repositório.

---

## 1. Princípio Fundamental
**Nenhuma linha de código deve ser alterada ou criada sem uma Issue correspondente no GitHub.**
Antes de iniciar qualquer implementação, correção de bug (*hotfix*), refatoração ou criação de nova funcionalidade, o agente **DEVE OBRIGATORIAMENTE** criar ou associar uma Issue no GitHub seguindo o padrão oficial documentado abaixo.

---

## 2. Padrão Oficial de Criação de Issue

Ao criar a issue via CLI (`gh issue create`), utilize a seguinte estrutura padronizada em Markdown:

```markdown
## Contexto
[Descrição executiva e contextualizada do módulo, tela ou fluxo afetado no sistema]

## Comportamento Atual (Problema)
[Detalhamento de como o sistema se comporta atualmente, incluindo mensagens de erro, telas padrão não tratadas ou bugs observados]

## Comportamento Esperado (Solução Proposta)
[Detalhamento da solução a ser construída, requisitos visuais (Carbon Design System), padrões arquiteturais e fluxos de navegação]

## Critérios de Aceite
- [ ] [Critério 1: Requisito funcional ou de interface]
- [ ] [Critério 2: Tratamento de exceção/navegação]
- [ ] [Critério 3: Conformidade com design system / responsividade]
- [ ] [Critério 4: Testes automatizados passando no Vitest]
- [ ] [Critério 5: Build de produção aprovado sem erros (npm run build)]
```

---

## 3. Fluxo de Execução Obrigatório do Agente

1. **Consulta Prévia**:
   - Executar `gh issue list` para verificar se a issue já foi criada pelo usuário ou por outro agente.

2. **Criação da Issue**:
   - Caso não exista, redigir o corpo completo da issue e executar:
     ```bash
     gh issue create --title "[Tipo] Nome descritivo da tarefa" --body "$CORPO_MARKDOWN"
     ```
   - Obter o número da issue criada (ex: `#5`).

3. **Notificação ao Usuário**:
   - Comunicar ao usuário o número e o link da issue criada, solicitando confirmação ou iniciando a implementação conforme alinhamento.

4. **Implementação e Testes**:
   - Desenvolver o código respeitando a arquitetura existente.
   - Garantir que todos os testes passem (`npm test`).
   - Validar a compilação de produção (`npm run build`).

5. **Commit e Fechamento da Issue**:
   - Realizar commits convencionais referenciando a issue (ex: `feat(#5): ...` ou `fix(#5): ...`).
   - Atualizar os critérios de aceite da issue marcando os checkboxes com `[x]`.
   - Adicionar comentário de fechamento detalhando os commits, cobertura de testes e build.
   - Fechar a issue via `gh issue close <id>`.
