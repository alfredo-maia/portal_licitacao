---
name: implement-spec
disable-model-invocation: true
description: "Implementar uma especificação por grafo de tarefas e branch de integração, usando agentes existentes."
---

# /implement-spec

Projeto: Portal de Licitações (83891ed1-1820-4cc8-9b40-2d3fd6840e03). Responsáveis: Mr. Kakashi.

Se o argumento contiver --check, execute apenas uma verificação de descoberta: retorne COMMAND_OK implement-spec; não abra outros arquivos, não use ferramentas e não execute a operação desta skill. Quando múltiplos comandos forem verificados, retorne uma linha para cada um.

No uso normal, execute primeiro `python3 scripts/check_agent_setup.py --command implement-spec` na raiz do projeto. Em caso de falha, informe o erro e pare; o setup exige acionamento manual, não o execute automaticamente. Este preflight confere configuração e atribuição declarada, não substitui permissões do runtime. Depois, leia e execute [matt-implement-spec](/home/hermes/apps/paperclip-test/data/instances/default/skills/672fabb1-8461-437d-ad7b-6a7bd33df05c/matt-implement-spec/SKILL.md), usando as referências relativas ao diretório dessa fonte. O Paperclip é o rastreador. Respeite as atribuições do agente da tarefa, as instruções do projeto e as autorizações existentes. Autorrevisão não substitui QA independente. Leia somente referências pertinentes; não carregue o catálogo inteiro.
