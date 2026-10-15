# 2026-10-15-08 · Modelo de dados multiagente (schema e fixtures)

Plano de implementação IA, M2 passo 13. Migration
`supabase/migrations/20261016000008_multi_agent_model.sql`.

## O que mudou

Nada no código do runtime (`src/`) — esta entrada existe porque o schema que
o runtime lê mudou e as fixtures dos testes db (`tests/db/factories.py`)
acompanharam. O comportamento em produção não muda até o passo 14.

Schema:

- `ai_agents.status` (`draft | active | paused`) é a fonte; `ai_agents.role`
  é a função que o lojista dá ao agente. `is_active` continua existindo como
  ESPELHO mantido por trigger nas duas direções (`status` escrito move
  `is_active`; `is_active` escrito move `status`). O default de `is_active`
  passa de `true` para `false`: agente novo nasce rascunho.
- O índice único `ai_agents_single_active_per_org` saiu. O runtime ainda
  escolhe "o agente ativo da org" em `repository/agent.py::load_active_version`
  e as rotas da API ainda recusam um segundo ativo (guard de código), por
  isso a org piloto não muda de comportamento com esta migration.
- `ai_agent_entries` (onde o agente atua): `whatsapp_account` com
  `ref_id = whatsapp_business_accounts.id`, ou `flow_touch`. Uma entrada
  ativa por `(org, kind, ref_id)`. RLS por org para `authenticated`; leitura
  para `worker_role` (quem vai usar no passo 14).
- `ai_missions.agent_id` (dono da missão), com backfill para o agente ativo
  da org (ou o único). Nullable por um release.
- `conversations.agent_id` (quem atende), que o runtime passa a gravar em
  `conclude_turn` no passo 14. `ai_runtime_activity` recriada com `agent_id`
  e `agent_name`.
- `seed_default_missions(p_org, p_agent)`: idempotente por
  `(org, agente, família)`; a versão de um argumento vira atalho para o
  agente ativo da org.

Fixtures (`tests/db/factories.py`):

- `create_agent(..., status=, role=)` — `status` vence `is_active`.
- `create_mission(..., agent_id=)`.
- `create_agent_entry(conn, org, agent_id, kind=, ref_id=, active=)`.

Teste novo: `tests/db/test_multi_agent_schema.py` (espelho status/is_active,
dois ativos por org, entrada única por número, RLS das entradas, missão com
dono, seed por agente, view com agente, `on delete set null` em conversas).

## Como

Espelho por trigger em vez de coluna gerada: uma coluna gerada quebraria
todo INSERT/UPDATE que ainda escreve `is_active` (rotas `agents/route.ts`,
`agents/[id]/route.ts`, `provider_keys.py` lê, factories escrevem). Com o
trigger os dois vocabulários convivem até o M7, quando `is_active` some.

Backfill de entradas só para org com EXATAMENTE um agente ativo: se houvesse
dois (impossível hoje pelo índice que esta migration remove, mas possível
num banco já migrado parcialmente), escolher qual atende o número é decisão
do lojista, não efeito de deploy.

## Por quê

O protótipo (correlação, seções 5 e 6) tem vários agentes por loja ligados a
entradas, e missões pertencem a um agente. Sem isso não existem a lista
Agentes, o "onde atua" nem o resolver por número do passo 14.

## Cobertura e lacunas

- Suíte db não roda neste ambiente (sem Postgres com `pgmq`/`vector`): o
  teste novo e a migration foram conferidos por leitura e `ruff`; precisam
  passar no executor descartável antes do apply em produção.
- `test_agent_loaders.py` e `test_responder_agent_identity.py` continuam
  válidos: `create_agent_version(status="active")` ainda escreve
  `is_active=true` e o trigger produz `status='active'`.
