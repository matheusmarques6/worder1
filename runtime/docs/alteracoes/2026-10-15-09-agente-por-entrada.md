# 2026-10-15-09 · O runtime resolve o agente por conversa, entrada e missão

Plano de implementação IA, M2 passo 14. Migration
`supabase/migrations/20261016000009_alert_no_agent_for_entry.sql`.

## O que mudou

- `repository/agent.py`
  - `resolve_agent_for_turn(conn, organization_id, conversation_agent_id,
    channel_account_id) -> AgentResolution(version, reason)`: a ordem é
    conversa já atendida por um agente ativo → entrada do número
    (`ai_agent_entries` kind `whatsapp_account`, ref = conta WhatsApp do
    job) → único agente ativo da org (modelo antigo). Vários ativos sem
    entrada = `ambiguous`; nenhum ativo = `none`.
  - `resolve_agent_for_mission(conn, organization_id, mission_agent_id)`:
    o dono da missão (`ai_missions.agent_id`); sem dono, o único ativo.
  - `choose_agent(...)`: a regra pura, sem banco (testada em unit).
  - `load_active_versions`, `load_version_for_agent`, `load_entry_agent_id`,
    `list_active_agents`, `assign_conversation_agent(..., reset_owner_mission)`.
  - `load_active_version` continua existindo (preview e copiloto, que não
    têm conversa nem número) e agora devolve o agente ativo mais recente.
  - `ConversationState.agent_id` e `ActiveVersion.role`.
- `repository/missions.py`: `load_active_mission(..., agent_id=)` só devolve
  a missão DESTE agente ou uma sem dono; `MissionVersion.agent_id`.
- `agent_core/responder.py`: usa `resolve_agent_for_turn`; passa o agente
  para as duas buscas de missão (dona e descoberta); em `ambiguous` abre o
  alerta `no_agent_for_entry` (dedup por número) e devolve turno vazio
  (silêncio, como missão ausente). Com mais de um agente ativo oferece a
  ferramenta `transfer_to_agent`.
- `agent_core/toucher.py`: a missão do toque é filtrada pelo agente da
  conversa (quando há) e a voz é do dono da missão (`resolve_agent_for_mission`).
- `queueing/worker.py`: ao concluir um turno ou toque ACEITO, grava
  `conversations.agent_id = trace.agent_id` na mesma transação do CAS.
- `tools/builtin.py`: `TransferToAgent` (troca `conversations.agent_id`,
  limpa a missão dona, registra atividade no contato) e
  `transfer_to_agent_spec(agents, exclude)` com os destinos reais no enum.
  Não está no catálogo do lojista (`TOOL_CATALOG` do TS tem teste de
  paridade com o registro legado congelado): entra sozinha quando a org tem
  dois ou mais agentes ativos.
- `repository/alerts.py`: `NO_AGENT_FOR_ENTRY`.

## Como

A resolução roda na transação curta de leitura, antes de qualquer rede, e o
resultado carrega o motivo para o diagnóstico. O fallback "único ativo"
mantém a org piloto exatamente como antes: uma org com um agente ativo e
sem entradas responde igual. O passo 15 (API) é quem cria entradas; o
backfill do passo 13 já ligou o agente ativo às contas WhatsApp existentes.

`assign_conversation_agent` é idempotente (`agent_id is distinct from`) e
roda com a credencial do worker (policy `conversations_worker_scoped`, for
all). Transferência entre agentes limpa `owner_mission_version_id` para o
novo agente arbitrar as missões DELE no próximo turno — o turno atual já
saiu com a identidade de quem transferiu.

## Por quê

Protótipo: vários agentes por loja, cada um "atuando em" números e toques
de fluxo; uma conversa transferida para outro agente continua com ele. Sem
isto, o segundo agente ativo seria escolhido ao acaso (o índice
single-active caiu no passo 13).

## Cobertura e lacunas

- Unit: `tests/unit/test_agent_resolution.py` (regra pura e a tool);
  fixtures de `test_accepted_trace_producers.py` passam a simular
  `resolve_agent_for_turn`/`resolve_agent_for_mission`/`list_active_agents`.
- db: `tests/db/test_agent_resolution_db.py` (entrada, conversa, pausa,
  RLS entre orgs, missão por agente, assign/reset). Não roda neste
  ambiente (sem Postgres com `pgmq`/`vector`); conferido por leitura e `ruff`.
- Pipeline "dois números, dois agentes" (aceite do passo) fica para o
  executor descartável; o caminho de código é o mesmo coberto pelos testes
  db acima mais o `run_turn` já existente.
