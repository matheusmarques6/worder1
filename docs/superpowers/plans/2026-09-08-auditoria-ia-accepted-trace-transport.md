# Accepted AI Trace Transport Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task.

**Goal:** entregar W2-T5 multi-WABA e persistir, anotar e consumir exatamente um trace de produto por turno aceito, na mesma transação do CAS, sem misturar traces legados nem enfraquecer testes.

**Architecture:** manter a conversa canônica por organização/contato e congelar `channel_account_id` desde o inbound até mensagem, outbox, envio e trace. O produtor devolve conteúdo e metadados tipados; depois de `conclude_turn` aceitar e criar `outbox_id`, o worker chama uma porta SQL estreita na mesma transação. `outbox_id` é a chave idempotente. Traces TypeScript continuam `legacy_generated`; novos traces do runtime são `runtime_accepted`. Anotações são escritas apenas por rota autenticada para `owner/admin`.

**Tech Stack:** PostgreSQL/Supabase migrations, Python 3.13/psycopg/pytest, TypeScript/Next.js 14/Vitest, PowerShell disposable DB executor e Docker.

**Spec:** `docs/superpowers/specs/2026-09-15-auditoria-ia-accepted-trace-design.md`

**Starting point:** branch `fix/ai-engine-schema-baseline`, spec commit `8bd27c3a`. Antes de Task 1, buscar o remoto e provar que a referência remota é ancestral e que a branch está zero commits atrás. Não mesclar, rebasear, fazer push ou modificar o checkout principal.

## Global Constraints

- Trabalhar somente no worktree `C:\Users\Usuario\worder\worder1\.worktrees\sync-remote-ai-2026-09-08`.
- Um único implementador escreve por vez. Cada Task recebe implementador novo, revisão independente de spec + qualidade e fix loop antes da próxima.
- Seguir TDD estrito: criar o menor teste, executar e observar a falha esperada, implementar o mínimo, executar GREEN e só então refatorar.
- Nenhum teste existente pode ser removido, convertido para skip/todo, ter assert retirado ou expectativa relaxada.
- Não editar migrations já aplicadas nem a fixture selada `runtime/tests/db/fixtures/app_baseline_legacy.sql`.
- Migrations novas: `20260915010000_account_scoped_conversation_bridge.sql` e `20260915020000_accepted_agent_traces.sql`.
- Não criar a reserva antiga `20260910020100`: ela ordenaria antes de `20260910020400_mission_touch_identity.sql` e teria contratos sobrescritos. Atualizar documentos para o nome forward-only real.
- `runtime_accepted` significa CAS aceito e outbox persistida, não entrega confirmada pela Meta.
- `committed=true` sozinho não autoriza trace: veto sem conteúdo também conclui o CAS. Writer exige `outbox_id != null`.
- Respostas determinísticas aceitas também recebem trace; campos LLM ficam nulos quando não houve chamada `agent_reply`. Nunca inventar tentativa ou custo.
- Veto, blocked topic, superseded ou caminho sem outbox não produz `runtime_accepted`.
- Metering/tools/scores operacionais mantêm todas as tentativas; trace de produto contém somente a tentativa selecionada.
- Preservar linhas e writers legados; sem backfill que transforme histórico em aceito.
- `worker_role` não recebe INSERT amplo; usa função `internal` `SECURITY DEFINER` com EXECUTE mínimo.
- Sem fila, dependência, contador materializado ou módulo de produto novo.
- Sem push, merge, deploy, migration remota ou leitura de produção.
- O controlador cria e registra um run directory novo para cada rodada `Action Test` (RED, GREEN e re-review). `Test` sempre chama `stop()` no finally; um run testado nunca é reutilizado.
- O executor já faz cleanup em falha/Test. O guardião verifica `state=stopped`; só chama `Action Stop` diretamente quando Prepare/Replay/Upgrade terminou sem chegar a Test.

## Rulings de planejamento

1. Usar migration W2-T5 `20260915010000`, não preencher o buraco histórico. Custo se errado: automação antiga pode esperar o nome anterior; documentos e testes passam a validar assinatura, não timestamp.
2. Se B entra enquanto A gera, CAS invalida A. Se B entra depois do commit A, envio A conserva A. Não remover CAS.
3. `outbox_id` é a idempotência do trace, não `selected_attempt` nem chave textual duplicada.
4. A spec promete cada turno aceito; confirmação de handoff e mídia sem texto entram com metadados LLM nulos.
5. Tools: máximo 32 chamadas, profundidade JSON 6, 50 itens/container, strings de 4.096 caracteres e 64 KiB no total. Excesso recebe marcador de truncamento.

## Dependency Map

| Task | Produz | Consumido por |
|---|---|---|
| 1 | identidade WABA congelada e entrega account-scoped | Tasks 2–4 |
| 2 | schema, RLS e porta SQL de trace/anotação | Tasks 4–5 |
| 3 | DTO e payload sanitizado | Task 4 |
| 4 | persistência atômica | Task 5/gates |
| 5 | produtor humano e consumidores filtrados | gates |
| 6 | prova fresh/upgrade/Docker | final review |

**Model mapping for dispatch:** Astra = `gpt-6-astra` (`high` para implementação/review de tarefa, `xhigh` na revisão global); Sol = `gpt-5.6-sol` (`high`); Terra = `gpt-5.6-terra` (`high`). Todo dispatch usa `fork_turns=none` e um brief em arquivo; implementadores não criam subagentes.

### Task 1: Implementar W2-T5 account-scoped de ponta a ponta

**Role:** implementador Astra; revisor Astra independente; verificador DB Terra.

**Files:**

- Create: `supabase/migrations/20260915010000_account_scoped_conversation_bridge.sql`
- Create: `runtime/tests/db/test_multi_waba_bridge.py`
- Modify: `runtime/tests/db/factories.py`
- Modify: `src/lib/whatsapp/webhook-processor.ts` e seus testes rollout/claim
- Modify: `runtime/src/agents_runtime/queueing/jobs.py`, `worker.py`, `sender.py`
- Modify: `runtime/src/agents_runtime/agent_core/responder.py`, `toucher.py`
- Modify: `runtime/src/agents_runtime/repository/engine.py`, `agent.py`, `outbox.py`, `whatsapp_accounts.py`
- Modify: `runtime/src/agents_runtime/channels/cloud_api.py`
- Modify: `runtime/tests/unit/test_cloud_api_channel.py`, `test_mission_touch_job.py`, `test_sender_records_the_outcome.py`
- Create: `runtime/tests/unit/test_multi_waba_jobs.py`
- Modify: `runtime/tests/db/test_cloud_api_channel_real_wiring.py`
- Modify: specs de trace/counter e guard decisions para apontar a migration real

**Interfaces:**

- `p_waba_id uuid` é `whatsapp_business_accounts.id`, nunca `waba_id text`.
- As cinco RPCs preservam contrato anterior e recebem `p_waba_id uuid default null` por último: `ingest_inbound_message`, `mirror_outbound_to_inbox`, `emit_ai_run_step`, `legacy_conversation_guard_state`, `mark_ai_handoff`.
- `messages.channel_account_id` guarda origem; `message_outbox.channel_account_id` recebe a mesma conta no CAS.
- Jobs, `ClaimedSend` e turno transportam a conta sem envelope paralelo.
- Sem conta: fallback apenas com exatamente uma ativa; zero/múltiplas falham sem mutação.
- Payloads já enfileirados sem `channel_account_id` continuam parseáveis como `None`; o runtime novo resolve exatamente uma conta ativa antes do LLM. Zero/múltiplas contas encerram sem LLM/outbox e seguem o erro observável existente, sem heurística.

**Step 1: RED**

Criar casos DB para duas contas A/B, mesmo org/contato e conversa compartilhada; mensagens preservam contas; mirror/progresso/guard/handoff A ignoram B; conta de outro tenant/UUID inválido/ambiguidade falham; caller legado funciona com uma ativa; catálogo prova assinaturas/grants.

Em `test_multi_waba_jobs.py`, provar payload inbound/touch antigo sem campo: uma conta ativa resolve antes da geração; zero/múltiplas contas não chamam produtor/LLM nem criam efeitos. Payload novo preserva a conta recebida e recusa conta de outro tenant.

Concorrência:

1. B entra enquanto A gera: A `SUPERSEDED`, sem outbox; próximo turno usa B.
2. A commitou e B entra antes do sender: URL, token, wamid, mirror e envio A permanecem A.

**Step 2: executar RED**

```powershell
$multiWabaRedRun = Join-Path $env:TEMP ("worder-multi-waba-red-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $multiWabaRedRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $multiWabaRedRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $multiWabaRedRun -TestTargets @('tests/db/test_multi_waba_bridge.py')
```

Expected: overloads/colunas ausentes e seleção atual por recência/primeira ativa. Erro de fixture não conta.

**Step 3: GREEN migration**

- adicionar `messages.channel_account_id` nullable sem inventar história;
- recriar cinco RPCs a partir dos corpos vivos, preservando guards/defaults/retornos;
- validar conta da org antes de dedup/mutação e limitar espelho por WABA;
- atualizar coalescer/job emission, `conclude_turn`, claim/wamid e touch a partir das versões mais recentes;
- remover overloads ambíguos e reemitir revokes/grants;
- criar `internal.whatsapp_business_account_for_number` somente para `sender_role`;
- não editar migration aplicada; canais não WhatsApp preservam comportamento.

**Step 4: call sites**

Webhook passa `account.id`; job congela conta da maior inbound `seq <= target_seq`; responder/toucher passam conta a guards/steps/handoff; worker passa ao CAS; claim retorna conta; TokenLoader usa `(conn, organization_id, channel_external_id)`; mirror/typing/mark-read usam conta do outbox.

Parser mantém `channel_account_id: UUID | None` para jobs antigos. A resolução de `None` acontece numa transação escopada antes de criar o producer; somente uma conta ativa é aceita.

**Step 5: GREEN focal**

```powershell
$multiWabaGreenRun = Join-Path $env:TEMP ("worder-multi-waba-green-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $multiWabaGreenRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $multiWabaGreenRun
pnpm exec vitest run src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts src/lib/whatsapp/__tests__/webhook-ai-sync-claim.test.ts
pnpm typecheck
uv run --directory runtime pytest tests/unit/test_cloud_api_channel.py tests/unit/test_sender_records_the_outcome.py tests/unit/test_mission_touch_job.py tests/unit/test_multi_waba_jobs.py -q
uv run --directory runtime ruff check src tests
uv run --directory runtime lint-imports
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $multiWabaGreenRun -TestTargets @(
  'tests/db/test_multi_waba_bridge.py','tests/db/test_coalescer.py',
  'tests/db/test_conclude_without_send.py','tests/db/test_outbox_claim.py',
  'tests/db/test_legacy_guard_state.py','tests/db/test_ai_run_steps.py',
  'tests/db/test_responder_guards.py','tests/db/test_cloud_api_channel_real_wiring.py'
)
```

**Step 6: commit**

```powershell
git add -- supabase/migrations/20260915010000_account_scoped_conversation_bridge.sql runtime/tests/db/test_multi_waba_bridge.py runtime/tests/db/factories.py runtime/tests/unit/test_multi_waba_jobs.py src/lib/whatsapp/webhook-processor.ts src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts src/lib/whatsapp/__tests__/webhook-ai-sync-claim.test.ts runtime/src/agents_runtime/queueing/jobs.py runtime/src/agents_runtime/queueing/worker.py runtime/src/agents_runtime/queueing/sender.py runtime/src/agents_runtime/agent_core/responder.py runtime/src/agents_runtime/agent_core/toucher.py runtime/src/agents_runtime/repository/engine.py runtime/src/agents_runtime/repository/agent.py runtime/src/agents_runtime/repository/outbox.py runtime/src/agents_runtime/repository/whatsapp_accounts.py runtime/src/agents_runtime/channels/cloud_api.py runtime/tests/unit/test_cloud_api_channel.py runtime/tests/unit/test_mission_touch_job.py runtime/tests/unit/test_sender_records_the_outcome.py runtime/tests/db/test_cloud_api_channel_real_wiring.py docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md docs/superpowers/specs/2026-09-08-auditoria-ia-guard-decisions.md
git commit -m "fix: preserve WhatsApp account identity end to end"
```

Rollback: compensação forward-only coordenada; preservar identidades e nunca restaurar heurística.

**Step 7: verificar cleanup**

Confirmar `state=stopped` nos gates de `$multiWabaRedRun` e `$multiWabaGreenRun`. Qualquer re-review executável cria terceiro run com Prepare + Replay + Test.

### Task 2: Expandir schema canônico de traces e anotações

**Role:** implementador Sol; revisor Astra com foco RLS/migration.

**Files:**

- Create: `supabase/migrations/20260915020000_accepted_agent_traces.sql`
- Create: `runtime/tests/db/test_agent_trace_schema.py`
- Modify: `src/lib/ai/__tests__/cloud-runner-guards.test.ts`

**Schema final:**

- `agent_traces.trace_source text not null default 'legacy_generated'`;
- campos nullable `outbox_id`, `channel_account_id`, `generation`, `target_seq`, `selected_attempt`;
- CHECK source `legacy_generated|runtime_accepted`, selected_attempt não negativo;
- `runtime_accepted` exige org, conversa, agente, outbox, conta, generation, target_seq e output;
- unicidade de `outbox_id` não nulo e índice `(organization_id, agent_id, trace_source, created_at desc)`;
- sem FK histórica de conversa/outbox que invalide legado ou apague trace;
- `agent_trace_annotations` preserva shape antiga, trace único, rating, correção, autor/timestamps; novo `fix` exige correção não vazia;
- RLS SELECT explícita por org, sem policy genérica FOR ALL; revogar DML PUBLIC/anon/authenticated;
- service role escreve annotations; worker só executa porta interna.

Assinatura:

```text
internal.record_accepted_trace(
  p_organization_id uuid, p_outbox_id uuid, p_conversation_id uuid,
  p_agent_id uuid, p_channel_account_id uuid, p_generation integer,
  p_target_seq integer, p_selected_attempt integer, p_provider text,
  p_model text, p_input text, p_output text, p_tool_calls jsonb,
  p_tokens integer, p_latency_ms integer
) -> uuid
```

A função `SECURITY DEFINER` usa search_path fixo, exige scope da org, valida outbox/conversa/conta/agente, compara output com payload do outbox, retorna a linha existente quando idêntica e falha em divergência.

**Step 1: RED**

Provar ausência de colunas/constraints/policies/grants; insert antigo recebe legacy; tool shape histórica intacta; tabela/linha annotation antiga preservada; fix novo sem correção recusado; authenticated/worker sem DML amplo; cross-tenant recusado; repetição idêntica estável e divergência falha.

Compatibilidade arquivada: em transação isolada, remover expansão só dentro da transação, instalar shape/linha antiga, executar a migration nova e fazer rollback. Não editar fixture selada/hash.

**Step 2: executar RED**

```powershell
$traceSchemaRedRun = Join-Path $env:TEMP ("worder-trace-schema-red-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $traceSchemaRedRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $traceSchemaRedRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $traceSchemaRedRun -TestTargets @('tests/db/test_agent_trace_schema.py')
```

**Step 3: GREEN**

Usar guards de catálogo e `IF NOT EXISTS`; reutilizar helper canônico de tenant, não o helper inseguro arquivado. Constraint incompatível com histórico entra NOT VALID e continua protegendo writes novos; validar quando não houver linha incompatível.

**Step 4: verificar**

```powershell
$traceSchemaGreenRun = Join-Path $env:TEMP ("worder-trace-schema-green-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $traceSchemaGreenRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $traceSchemaGreenRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $traceSchemaGreenRun -TestTargets @('tests/db/test_agent_trace_schema.py')
pnpm exec vitest run src/lib/ai/__tests__/cloud-runner-guards.test.ts
```

Writer TypeScript omite source e recebe default legado.

**Step 5: commit**

```powershell
git add -- supabase/migrations/20260915020000_accepted_agent_traces.sql runtime/tests/db/test_agent_trace_schema.py src/lib/ai/__tests__/cloud-runner-guards.test.ts
git commit -m "feat: add canonical accepted AI trace schema"
```

Rollback: desligar writers/leitores e compensar grants por nova migration; preservar dados.

Após review, confirmar ambos os runs em `state=stopped`; re-review usa novo Prepare + Replay + Test.

### Task 3: Definir e provar o payload sanitizado de trace

**Role:** implementador Astra; revisor Astra independente.

**Files:**

- Create: `runtime/src/agents_runtime/agent_core/trace.py`
- Create: `runtime/tests/unit/test_accepted_trace_payload.py`

**Interfaces:**

```python
@dataclass(frozen=True, slots=True)
class AcceptedTracePayload:
    agent_id: UUID
    input_text: str
    output_text: str
    selected_attempt: int | None
    provider: str | None
    model: str | None
    tool_calls: tuple[dict[str, Any], ...]
    tokens: int | None
    latency_ms: int | None

@dataclass(frozen=True, slots=True)
class ReplyDraft:
    content: dict[str, Any] | None
    trace: AcceptedTracePayload | None
```

Também definir um `AttemptTraceCapture` pequeno que recebe `CallRecord` e tool payload por índice de tentativa e constrói `AcceptedTracePayload`. Nesta Task ele é puro e ainda não altera o contrato de responder/worker; a integração inteira ocorre atomicamente na Task 4.

**Step 1: RED**

- coletor com tentativas 0/1/2, tools e métricas distintas, selecionada 0;
- agregação só de chamadas `agent_reply`; embedding/judge não entram;
- build determinístico aceita campos LLM nulos sem inventar tentativa/custo;
- tentativa inexistente falha explicitamente em vez de escolher a última.

Sanitização cobre arguments/result/error. Chaves sensíveis normalizadas (`authorization`, cookies, API/access/refresh token, client secret, secret, password, token) e valores secretos conhecidos viram `[REDACTED]`. Aplicar limites dos rulings com marcador explícito, sem modificar payload do LLM nem trilha operacional.

**Step 2: executar RED**

```powershell
uv run --directory runtime pytest tests/unit/test_accepted_trace_payload.py tests/unit/test_pre_send_judge.py tests/unit/test_shared_tool_loop.py -q
```

**Step 3: GREEN mínimo**

- dataclasses e sanitizador puro em `trace.py`;
- `AttemptTraceCapture` usa dicionários por tentativa, sem estado global;
- agregar provider/model reais e tokens/latência apenas de `agent_reply`;
- helper de build exige input/output já selecionados e não conhece DB/Meta;
- nenhum arquivo produtor/worker muda nesta Task, logo o commit intermediário preserva o contrato atual.

**Step 4: verificar**

```powershell
uv run --directory runtime pytest tests/unit/test_accepted_trace_payload.py tests/unit/test_pre_send_judge.py tests/unit/test_shared_tool_loop.py -q
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
```

**Step 5: commit**

```powershell
git add -- runtime/src/agents_runtime/agent_core/trace.py runtime/tests/unit/test_accepted_trace_payload.py
git commit -m "feat: define sanitized accepted trace payloads"
```

Rollback: revert simples do módulo/teste ainda sem consumidor.

### Task 4: Gravar trace atomicamente com o CAS

**Role:** implementador Astra; revisor Astra independente; verificador DB Terra.

**Files:**

- Create: `runtime/src/agents_runtime/repository/agent_traces.py`
- Create: `runtime/tests/unit/test_accepted_trace_producers.py`
- Create: `runtime/tests/db/test_accepted_trace_commit.py`
- Create: `runtime/tests/pipeline/test_accepted_traces.py`
- Modify: `runtime/src/agents_runtime/agent_core/responder.py`, `toucher.py`
- Modify: `runtime/src/agents_runtime/agent_core/tool_loop.py` somente se o executor injetado não bastar
- Modify: `runtime/src/agents_runtime/queueing/worker.py`
- Modify: `runtime/tests/support/constant_reply.py`
- Modify: `runtime/tests/unit/test_turn_time_limit.py`, `test_responder_is_required.py`
- Modify: `runtime/tests/db/test_inbound_rollout_revocation.py`, `test_toucher.py`
- Modify: `runtime/tests/pipeline/test_scenarios_c.py`
- Modify: `runtime/tests/db/test_responder_tool_loop.py`
- Modify: `runtime/tests/pipeline/test_real_responder.py`

**Step 1: RED**

- CAS/outbox/trace concordam em tenant, conversa, WABA, agente, generation, target_seq e output;
- CAS recusado, superseded e veto criam zero trace;
- erro real do writer desfaz version/seq, mensagem, outbox, ownership de touch e trace;
- retry após rollback conclui uma vez; redelivery após commit mantém um trace;
- outbox com trace ausente é erro, não gap silencioso;
- tentativas 0/1/2 selecionam tools/métricas da vencedora, preservando perdedoras no metering;
- blocked topic/veto não expõem trace; handoff confirmation e mídia sem texto geram trace determinístico;
- output/content permanecem iguais ao contrato anterior;
- responder, toucher, worker e todos os fakes mudam no mesmo commit.

**Step 2: executar RED**

```powershell
$acceptedTraceRedRun = Join-Path $env:TEMP ("worder-accepted-trace-red-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $acceptedTraceRedRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $acceptedTraceRedRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $acceptedTraceRedRun -TestTargets @(
  'tests/db/test_accepted_trace_commit.py','tests/pipeline/test_accepted_traces.py'
)
```

Expected: writer ausente; falha de trace inicialmente deixa commit passar, provando o defeito.

**Step 3: GREEN**

`repository/agent_traces.py` chama RPC com `Jsonb(tool_calls)`, retorna UUID, não abre/commita transação e não suprime erro.

Na mesma Task, integrar o módulo puro:

- responder/toucher mantêm tools e CallRecords por tentativa, passando o índice explicitamente;
- selecionam `outcome.selected_attempt`; input é somente a janela de conversa;
- retornam `ReplyDraft`/`TouchDraft.trace`; silêncio/veto retorna conteúdo/trace nulos;
- worker extrai `.content` e persiste `.trace` no mesmo diff; não existe commit com DTO chegando cru a `Jsonb(content)`;
- fakes/testes retornam o novo contrato sem remover asserções.

Dentro da fase 3 de inbound/touch:

```python
async with conn.transaction():
    await scope_to_organization(conn, job.organization_id)
    outcome = await engine.conclude_turn(...)
    if outcome.committed and outcome.outbox_id is not None:
        if draft.trace is None:
            raise RuntimeError("accepted outbound is missing trace metadata")
        await agent_traces.record_accepted_trace(
            conn,
            organization_id=job.organization_id,
            outbox_id=outcome.outbox_id,
            conversation_id=job.conversation_id,
            channel_account_id=job.channel_account_id,
            generation=generation,
            target_seq=target_seq,
            trace=draft.trace,
        )
```

Ownership do touch permanece na mesma transação. Não copiar try/except best-effort do metering.

**Step 4: verificar**

```powershell
uv run --directory runtime pytest tests/unit/test_accepted_trace_payload.py tests/unit/test_accepted_trace_producers.py tests/unit/test_turn_time_limit.py tests/unit/test_responder_is_required.py tests/unit/test_mission_touch_job.py -q
$acceptedTraceGreenRun = Join-Path $env:TEMP ("worder-accepted-trace-green-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $acceptedTraceGreenRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $acceptedTraceGreenRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $acceptedTraceGreenRun -TestTargets @(
  'tests/db/test_agent_trace_schema.py','tests/db/test_accepted_trace_commit.py',
  'tests/db/test_responder_tool_loop.py','tests/db/test_llm_calls_persistence.py',
  'tests/db/test_inbound_rollout_revocation.py','tests/db/test_toucher.py',
  'tests/pipeline/test_accepted_traces.py','tests/pipeline/test_real_responder.py',
  'tests/pipeline/test_scenario_judge_gate.py','tests/pipeline/test_scenarios_c.py'
)
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
```

**Step 5: commit**

```powershell
git add -- runtime/src/agents_runtime/repository/agent_traces.py runtime/src/agents_runtime/agent_core/responder.py runtime/src/agents_runtime/agent_core/toucher.py runtime/src/agents_runtime/agent_core/tool_loop.py runtime/src/agents_runtime/queueing/worker.py runtime/tests/unit/test_accepted_trace_producers.py runtime/tests/support/constant_reply.py runtime/tests/unit/test_turn_time_limit.py runtime/tests/unit/test_responder_is_required.py runtime/tests/db/test_inbound_rollout_revocation.py runtime/tests/db/test_toucher.py runtime/tests/pipeline/test_scenarios_c.py runtime/tests/db/test_accepted_trace_commit.py runtime/tests/pipeline/test_accepted_traces.py runtime/tests/db/test_responder_tool_loop.py runtime/tests/pipeline/test_real_responder.py
git commit -m "feat: persist accepted AI traces atomically"
```

Rollback: reverter writer, produtores, DTO consumer e fakes juntos, preservando traces; nunca commit parcial.

Após review, confirmar RED/GREEN em `state=stopped`; todo re-review usa novo run.

### Task 5: Entregar anotação owner/admin e separar consumidores

**Role:** implementador Sol; revisor segurança/produto Astra.

**Files:**

- Create: `src/app/api/ai/agents/[id]/traces/[traceId]/annotation/route.ts`
- Create: `src/app/api/ai/agents/[id]/traces/[traceId]/annotation/route.test.ts`
- Modify: `src/lib/ai/evals.ts`, `src/lib/ai/proposals.ts`
- Modify: `src/lib/ai/__tests__/evals.test.ts`
- Create: `src/lib/ai/__tests__/proposals-trace-source.test.ts`
- Modify: `src/components/agents/eval/EvalView.tsx` e tipos de payload existentes
- Modify: deletion-set test apenas se o novo arquivo exigir; não retirar tabelas cobertas

**API:**

```json
PUT /api/ai/agents/:agentId/traces/:traceId/annotation
{"rating":"good|bad|fix","correctionText":"required and non-empty for fix"}
```

401 sem sessão, 403 fora de owner/admin, 404 para agente/trace fora da org, 400 payload inválido, 200 com annotation. Não criar capability nova.

**Step 1: RED**

- owner/admin upsert; member/analyst/agent 403 e zero DML;
- tenant vem da sessão; agente/trace alheio 404;
- fix sem correção 400;
- eval/proposals usam somente annotations de `runtime_accepted`;
- annotation legacy não entra no dataset automático;
- histórico legacy volta separado e read-only.

**Step 2: executar RED**

```powershell
pnpm exec vitest run "src/app/api/ai/agents/[id]/traces/[traceId]/annotation/route.test.ts" src/lib/ai/__tests__/evals.test.ts src/lib/ai/__tests__/proposals-trace-source.test.ts
```

**Step 3: rota mínima**

- autenticar com `getAuthClient()`;
- rejeitar papel antes do admin client;
- confirmar `ai_agents(id,organization_id)`;
- confirmar `agent_traces(id,organization_id,agent_id)`;
- upsert annotation por trace com org/agente/autor da sessão e updated_at;
- nunca confiar em org/agente do body.

**Step 4: consumidores/UI**

- filtrar traces `runtime_accepted` antes de materializar eval/proposal;
- GET Eval retorna `acceptedTraces` e `legacyTraces`, cada uma limitada a 20 e escopada;
- EvalView reutiliza tela: respostas aceitas com botões Bom/Ruim/Corrigir, correção obrigatória, loading/erro; histórico legado read-only rotulado “gerado não confirmado”;
- botões `type=button`, labels acessíveis; sem rota de página/módulo/estado global novo.

**Step 5: verificar**

```powershell
pnpm exec vitest run "src/app/api/ai/agents/[id]/traces/[traceId]/annotation/route.test.ts" src/lib/ai/__tests__/evals.test.ts src/lib/ai/__tests__/proposals-trace-source.test.ts src/app/api/ai/agents/budget-errors.test.ts src/lib/ai/__tests__/budget-accounting.test.ts src/lib/ai/__tests__/deletion-set.test.ts
pnpm typecheck
pnpm lint
```

**Step 6: commit**

```powershell
git add -- "src/app/api/ai/agents/[id]/traces/[traceId]/annotation/route.ts" "src/app/api/ai/agents/[id]/traces/[traceId]/annotation/route.test.ts" src/lib/ai/evals.ts src/lib/ai/proposals.ts src/lib/ai/__tests__/evals.test.ts src/lib/ai/__tests__/proposals-trace-source.test.ts src/components/agents/eval/EvalView.tsx src/lib/ai/__tests__/deletion-set.test.ts
git commit -m "feat: annotate accepted AI traces safely"
```

Rollback: ocultar controles/desligar rota e filtros coordenadamente; preservar annotations.

### Task 6: Provar replay, upgrade, regressões e imagem Docker

**Role:** Terra executa sem autoria; Astra faz revisão global. Um único guardião opera o descartável.

**Files:** nenhum production file esperado; evidência somente no workspace SDD ignorado.

**Step 1: gates completos**

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
uv run --directory runtime pytest -m unit
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
```

Registrar exit codes, passed/failed/skipped e provar zero skip novo.

**Step 2: replay fresh**

```powershell
$traceRun = Join-Path $env:TEMP ("worder-accepted-trace-fresh-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $traceRun
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $traceRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $traceRun
```

Exigir identidade/sentinela, manifesto completo e DB/RLS/pipeline zero falhas.

**Step 3: upgrade separado**

```powershell
$traceUpgradeRun = Join-Path $env:TEMP ("worder-accepted-trace-upgrade-" + [guid]::NewGuid().ToString("N"))
& ./scripts/test-disposable-db.ps1 -Action PrepareUpgrade -RunDirectory $traceUpgradeRun
& ./scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $traceUpgradeRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $traceUpgradeRun -TestTargets @(
  'tests/db/app_baseline_upgrade_check.py','tests/db/test_multi_waba_bridge.py',
  'tests/db/test_agent_trace_schema.py','tests/db/test_accepted_trace_commit.py'
)
```

Comparar catálogo, grants, policies, constraints e resultados. Legado permanece legado e nenhum dado é apagado.

**Step 4: build/smoke Docker**

```powershell
docker build -t worder-runtime:accepted-trace runtime
docker run --rm --entrypoint python worder-runtime:accepted-trace -c "import agents_runtime"
docker run --rm --entrypoint id worder-runtime:accepted-trace -u
```

Se for necessário subir profile, usar apenas `runtime/docker-compose.yml --profile bancada`, provar canal externo ausente e parar o mesmo projeto. Nunca prune global ou containers alheios.

**Step 5: provar cleanup real**

`Action Test` já chama `stop()` no finally. Confirmar `state=stopped` em `$traceRun` e `$traceUpgradeRun` e provar remoção somente dos recursos desses diretórios. Se uma rodada parar antes de Test, chamar `Action Stop` para aquele run específico.

**Step 6: revisão global**

Gerar review package do merge-base a HEAD. Revisor recebe spec, plano, ledger, diff, rulings, evidências fresh/upgrade/app/runtime/Docker e prova de zero push/deploy. Critical/Important entram numa única fix wave e scoped re-review. Depois usar `verification-before-completion` e `finishing-a-development-branch`.

## Production Gate — fora desta execução local

Antes de produção:

1. autorização separada para inventário read-only remoto de tabelas, dados, policies, grants e índices;
2. decisão explícita se produção divergir do replay;
3. drenar workers antigos ou definir início da garantia após rollout completo;
4. aplicar expansão antes do runtime novo;
5. smoke tenant/WABA;
6. autorização separada para push, deploy e migrations.

O plano termina com branch local revisada e evidência Docker; não promove produção.
