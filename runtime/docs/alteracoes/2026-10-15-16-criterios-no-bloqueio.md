# 2026-10-15-16 · Critérios da revisão no evento de bloqueio

Integração da UI do protótipo, fase F5 (Atividade). Sem migration: o
evento já tinha `metadata` (jsonb) desde
`20261016000013_ai_outcomes_and_events.sql`.

## Por que

O bloco "Qualidade e segurança" da Atividade do protótipo lista as
respostas bloqueadas pela revisão **por tipo de infração**. Por exemplo:
"Prometeu data exata de entrega" ou "Preço diferente do catálogo".

Até aqui o evento `blocked` (alteração 2026-10-15-14) só guardava
`blocked_by`, e esse campo diz apenas *como* a resposta parou:
`critical` ou `judge_unusable`. Não diz *qual regra* a resposta quebrou.
Sem isso, a tela só poderia mostrar o total de bloqueios.

## O que mudou

### `repository/outcomes.py` · `blocked_metadata(blocked_by, failed)`

Função pura nova. Monta o `metadata` do evento:

- `blocked_by`, como antes;
- `failed`, com os critérios da revisão que reprovaram.

Os critérios saem do `Judgement.failed_criteria` do Juiz 1. São os ids
das rubricas, como `sem-promessas-inventadas`, ou o id de um critério
criado pela loja. Não se repetem, e no máximo 5 são guardados. Sem
critério, a chave `failed` fica de fora.

### `agent_core/responder.py` · `_record_blocked(..., failed=())`

O ponto que grava o bloqueio passa
`outcome.judgement.failed_criteria`, ou nada se não houver julgamento. O
evento passa a ser escrito com `blocked_metadata(...)`.

## O que NÃO mudou

- Quando o evento é gravado: só quando a revisão segura a resposta. O
  teto de custo do turno (`budget_exceeded`) continua fora, como antes.
- A transação: o evento continua em savepoint próprio e nunca derruba o
  turno.
- O desfecho da conversa (`blocked_count`).

## No app (mesmo commit)

`GET /api/ai/activity/summary` conta os eventos `blocked` do período por
critério e devolve o resultado em `quality.infractions`. A tela troca o
id da rubrica por um rótulo curto, e o critério da loja pelo nome dele.
Eventos antigos, sem `failed`, entram só no total.

## Cobertura

- Unit: `tests/unit/test_outcomes.py::TestBlockedMetadata`. Cobre
  critérios sem repetição, motivo sem critério e o limite de 5.

## Como reverter

Reverta o commit. Os eventos já gravados com `failed` não atrapalham: a
tela ignora a chave se ela não for lida.
