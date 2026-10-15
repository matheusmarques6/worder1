# 2026-10-15-12 · Simulação de turno (painel Testar)

Plano de implementação IA, M4 passo 24. Sem migration: a trilha usa o
`purpose='playground'` já aceito desde a alteração 03, e os cenários vão
para `ai_test_scenarios` (alteração 02).

## O que mudou

- `agent_core/simulate.py` (novo): `simulate_turn(conn, organization_id,
  agent_id, message, history, agent_draft, mission_version_id, event_type,
  profile, platform_llm, base_secret)` devolve um `SimulationTrace` (resposta,
  bloqueio, tentativas do Juiz 1 com critérios reprovados, ferramentas,
  fontes, regras, blocos do prompt, modelo, custo).
  - Partes puras com teste: `apply_draft` (rascunho não salvo vence a versão),
    `ContactProfile.parse` / `profile_state` (perfil novo, recorrente ou com
    carrinho vira o bloco ESTADO), `as_chat`, `simulated_tool_result`.
- `repository/agent.py`: `load_version_for_preview` — versão de um agente
  ativo OU rascunho (produção primeiro, senão a mais recente, senão a linha
  do agente; prompt vazio vira um mínimo explícito).
- `repository/missions.py`: `load_mission_by_id` (rascunho incluído).
- `server.py`: `POST /internal/simulate-turn` (mesmo bearer do preview);
  400 para corpo inválido, 422 para `SimulationUnavailable`, 503 sem cliente
  de plataforma.

## Como (o sandbox)

- Nada de conversa, lease, outbox, `messages`, `incentive_grants` ou
  `internal.tool_calls`: o turno usa um id de conversa descartável.
- Ferramentas de escrita (`save_customer`, `save_interests`,
  `transfer_to_human`, `transfer_to_agent`, `create_coupon`) não executam:
  devolvem "simulado: faria X com estes argumentos". As de leitura
  (`product_lookup`, `order_status`) executam de verdade; `timeline`, que
  precisa de um contato real, fica de fora.
- Toda chamada de LLM (embedding, geração e juiz) vai para
  `internal.llm_calls` com `purpose='playground'` e `conversation_id` nulo —
  custo de teste visível e separado do de produção. Um `TurnBudget` próprio
  limita as chamadas.
- Mesmo prompt compilado do turno (missão, regras da loja, conhecimento do
  agente) e mesmo Juiz 1 (rubricas da plataforma + juízes do lojista).

## Por quê

Protótipo, editor → Testar: o lojista conversa com o agente antes de ativar
ou salvar, vê de onde veio cada resposta e guarda o diálogo como cenário.

## Cobertura e lacunas

- Unit: `tests/unit/test_simulate.py` (rascunho, perfis, chat, escrita
  simulada, caminho completo com provedores de mentira, agente inexistente).
- App: `src/app/api/ai/agents/[id]/simulate/route.test.ts` (org da sessão,
  404, 503 sem runtime, 422 repassado).
- Pipeline "simulate não grava outbox nem incentive_grants" fica para o
  executor descartável; o código não tem caminho até essas tabelas.
