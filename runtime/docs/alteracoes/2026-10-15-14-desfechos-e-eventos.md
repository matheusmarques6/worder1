# 2026-10-15-14 · O runtime escreve desfechos e eventos

Plano de implementação IA, M5 passo 28. Migrations
`20261016000013_ai_outcomes_and_events.sql` (passo 27: tabelas, RLS,
atribuição de pedido) e `20261016000014_close_idle_ai_conversations.sql`.

## O que mudou

- `repository/outcomes.py` (novo): `record_turn` (upsert por conversa:
  +1 mensagem, tokens, custo recalculado de `internal.llm_calls`, 1ª
  resposta na primeira vez), `mark` (transferência com motivo, bloqueio,
  lacuna, incentivo), `record_event` (vocabulário fechado), `handoff_code`
  e `coupon_offers` (puras).
- `queueing/worker.py`: depois do CAS aceito (turno e toque),
  `_record_outcome` grava o turno e, para cada `create_coupon` concedido no
  trace, marca o incentivo e emite o evento `incentive`. Roda em savepoint
  dentro da transação do CAS: erro de telemetria desfaz só o savepoint.
- `agent_core/handoff.py`: toda transferência (palavra-chave, assunto
  proibido, mídia, ferramenta) marca `transferred` com o motivo e emite o
  evento `handoff`.
- `agent_core/responder.py`: reprovação do Juiz 1 (exceto teto do turno)
  marca `blocked` e emite `blocked`; a lacuna (alteração 11) também marca
  `gap` e emite `gap`.
- Fechamento: `public.close_idle_ai_conversations(p_idle_hours, p_limit)`
  fecha conversas ociosas, decide `resolved_without_human` e emite `solved`;
  o cron `/api/cron/ai-close-conversations` (de hora em hora) chama a RPC e
  classifica o assunto das fechadas (lista fixa, `gpt-4o-mini` com a chave
  OpenAI da org, custo `topic`, sob o orçamento).

## Desvio do plano (declarado)

O plano previa o fechamento por job `conversation.closed` em
`q_domain_events` e a classificação no runtime. Ficou no app (cron + RPC)
porque o fechamento é uma varredura por tempo, sem evento de origem, e a
classificação não precisa do contexto do agente. O runtime só escreve o que
acontece DENTRO do turno.

## Cobertura e lacunas

- Unit: `tests/unit/test_outcomes.py` (regras puras, gancho do worker,
  falha não propaga); app: `topics.test.ts`.
- db: `tests/db/test_ai_outcomes.py` (atribuição idempotente, janela,
  fechamento resolvido × transferido, sem fechar duas vezes). Não roda
  neste ambiente.
