# 2026-10-15-13 · Avaliação automática do agente

Plano de implementação IA, M4 passo 26. Migration
`supabase/migrations/20261016000012_eval_writes_by_worker.sql`.

## O que mudou

- `agent_core/evaluate.py` (novo): `run_evaluation(...)` roda o pack
  (`runtime/evals/pack`, 12 cenários em 4 rubricas) contra a versão do
  agente pelo sandbox do passo 24 (`simulate_turn`, agora com `purpose` e
  `eval_run_id`), decide cada cenário e grava tudo. Nunca levanta: erro
  vira run `failed` com o motivo.
  - `score_scenario` (pura): passou = resposta saiu e a última tentativa
    não falhou critério da rubrica DO cenário; grave = houve veredito
    `critical`, ou o cenário é de `seguranca` e não passou.
  - `aggregate` (pura): nota = % de cenários aprovados; conta os graves.
- `repository/evals.py` (novo): `start_run`, `finish_run`,
  `record_scenario_score` (`internal.judge_scores`, kind `post_hoc`),
  `set_version_eval`, `load_run` (escopado pela org da conexão).
- `agent_core/simulate.py`: `simulate_turn(..., purpose='playground',
  eval_run_id=None)`; o trace guarda `version_id`.
- `server.py`: `POST /internal/run-eval` (cria o run, responde 202 com o
  id e roda em segundo plano; recusa agente sem versão salva) e
  `POST /internal/eval-run` (andamento/resultado). Mesmo bearer do preview.
- Migration 12: `worker_role` ganha `UPDATE (eval_score, eval_grave)` em
  `ai_agent_versions` com policy por org.

## Como

As LLM calls da avaliação vão para `internal.llm_calls` com
`purpose='eval'` e `eval_run_id` — o custo de cada run é rastreável.

## Desvio do plano (declarado)

O plano previa um consumidor da fila `q_evals`. Ele nunca existiu e o pack
é pequeno, então a avaliação roda como tarefa `asyncio` do próprio listener
HTTP (referência forte em `_EVAL_TASKS`). Consequência: um restart do
processo no meio deixa o run em `running`; a tela mostra o estado e oferece
rodar de novo. Se o pack crescer, trocar por consumidor de `q_evals` sem
mudar a API (o app só conhece `run_id`).

## Por quê

Protótipo, checklist de ativação: "rodar avaliação" com nota e casos
graves; a nota aparece no painel Versões (alteração 12 do app, passo 25).

## Cobertura e lacunas

- Unit: `tests/unit/test_evaluate.py` (veredito por rubrica, grave por
  veto e por segurança, agregado, run completo, falha vira `failed`, pack
  padrão existe).
- App: item `eval` em `computeReadiness` (graves bloqueiam; nunca avaliado
  ou nota < 70 é aviso) com teste.
- db/pipeline (grant de UPDATE, run real) ficam para o executor descartável.
