# Task 37 — implementação

## Escopo entregue

- A falha de `ai_usage_logs` agora devolve `500` genérico, sem totais sintéticos.
- A tela de uso informa falha de carregamento; o estado vazio bem-sucedido continua exibindo totais zero.
- Falhas de leitura em `ai_agents`, contagem de mensagens do bot e busca de resposta humana rejeitam com mensagens constantes. A rota existente as converte em `500` e o badge existente fica `unknown`.
- Nenhum novo reason, estado, retry, dependência, alteração de Item 65, traces ou budget.

## RED antes de produção

`pnpm test -- src/app/api/ai/usage/route.test.ts src/lib/ai/__tests__/conversation-ai-status.test.ts`

- `ai_usage_logs` com erro retornava `200` e totais sintéticos.
- As três leituras de status (`ai_agents`, count e human lookup) retornavam `Bot ativo` em vez de rejeitar.
- Resultado: 4 falhas e 29 testes aprovados.

## Evidência GREEN

- `pnpm test -- src/app/api/ai/usage/route.test.ts src/lib/ai/__tests__/conversation-ai-status.test.ts src/lib/ai/__tests__/bot-badge.test.ts` — 42 aprovados.
- `uv --no-cache run --no-sync --directory runtime pytest -p no:cacheprovider tests/unit/test_ai_usage_logs_bridge.py -m unit --tb=short` com `UV_OFFLINE=true` — 8 aprovados, sem DB.
- `pnpm typecheck` — aprovou.
- `git diff --check` — sem erros.
