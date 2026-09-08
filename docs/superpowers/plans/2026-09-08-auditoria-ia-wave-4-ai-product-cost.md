# Auditoria IA — Wave 4: AI Product and Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver as decisões e contratos dos itens 65, 67, 69, 72, 73, 75, 76, 77, 83, 85 e 89, com atribuição correta de tentativa, custo observável e preview honesto.

**Architecture:** Reutilizar `guarded_reply`, `MeteredLlm`, `trackAiUsage`, o compilador de prompt e as tabelas existentes. Produto escolhe primeiro semântica de custo, RAG, estado do preview e consumidores de telemetria; código dependente só entra no branch correspondente à decisão registrada. Shadow e agendamento não ganham implementação sem consumidor confirmado.

**Tech Stack:** Next.js/React, TypeScript/Vitest, Python >=3.13/pytest, psycopg3, Supabase/PostgreSQL descartável, uv, pnpm, ferramentas HTTP e metering existentes.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- Decisão de produto retorna ao usuário antes de implementação.
- Critical ou Important bloqueia a tarefa e a onda.
- definição da consulta RAG antes de conhecimento no preview;
- definição do estado verdadeiro do preview antes de remover fantasmas;
- política de cobrança antes de instrumentar gastos invisíveis;
- Se não houver consumidor confirmado para shadow/agendamento, o caminho morto será removido em vez de ampliado.
- Trabalhar somente em `.worktrees/sync-remote-ai-2026-09-08`, branch `integration/sync-remote-ai-2026-09-08`; Ondas 0–3 aceitas antes de iniciar mudanças de runtime.
- Dinheiro do toque continua determinado por `concession_request` antes da geração. `create_coupon` nunca entra no tool-loop proativo.
- Custo ausente permanece `null`/`None`; custos de todas as tentativas existem mesmo quando apenas uma tentativa fornece o texto vencedor.
- Os comandos deste documento são para execução posterior. Escrever o plano não autoriza executar testes, Docker, DDL ou commits agora.

---

## Operação SDD e mapa de arquivos

Controlador `gpt-6-astra/high`; implementador de custo/traces/tools `gpt-5.6-sol/high`; UI e integração `gpt-5.6-terra/high`; remoção mecânica `gpt-5.6-luna/medium`; revisor de tarefa Sol high, Astra high para dinheiro/DB; verificador Terra high; guardião DB Astra high; revisão final Astra xhigh. Todo dispatch é fresco, `fork_turns:"none"`, modelo/esforço explícitos; nenhum implementador cria subagentes.

O controlador cria o workspace individual do plano com `scripts/sdd-workspace`, registra BASE e tabela de interfaces/arquivos compartilhados, e extrai brief de uma task por vez. Spec PASS e Quality APPROVED são ambos obrigatórios; review package usa BASE..HEAD da tarefa. Até três correções no agente original; rodadas quatro/cinco em agente fresco superior. Critical/Important residual bloqueia. O guardião DB trabalha sozinho e reapresenta a prova de identidade/sentinela antes de cada gate destrutivo.

| Pacote | Tasks | Responsabilidade e fronteira |
|---|---|---|
| W4-T1 — 65/67 | 1–3 | Contrato do consumidor; tentativa vencedora; persistência/contadores |
| W4-T2 — 69/85 | 4–6 | Política de cobrança; orçamento desconhecido; cinco superfícies pagas |
| W4-T3 — 72/75 | 7–8 | Query explícita e inclusão de conhecimento no compilador/preview |
| W4-T4 — 73 | 9 | Tool-loop compartilhado, somente custom read-only no toque |
| W4-T5 — 76/77 | 10 | Decisão de estado/ghost e apresentação acessível |
| W4-T6 — 83/89 | 11 | Decisão de consumidor de shadow/agendamento; retirada condicional |

Arquivos novos de decisão são artefatos necessários, não configuração especulativa. Branches extensos que introduzem capacidade nova exigem especificação aprovada e plano filho concreto antes de código; a task registra essa dependência e o item não é declarado implementado até seu gate. Não há aprovação implícita de feature pelo simples fato de uma opção aparecer neste plano.

Namespace coordenado de migrations: W2 termina em `20260910020800`; W3 usa `20260910030000`; W4 reserva `20260910040000_runtime_trace_attribution.sql` e `20260910040001_ai_usage_billable_budget.sql`. Para cada branch SQL executado, o guardião comprova tanto replay do zero do manifesto completo quanto upgrade sequencial de base W0→W1→W2→W3 para W4, comparando schema, grants, índices e resultados. Não reaplicar uma migration isolada fora de ordem.

### Task 1: Definir quem consome traces e contadores (W4-T1, decisão)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md`.
- Read: `src/lib/ai/proposals.ts`, `src/lib/ai/evals.ts`, `runtime/src/agents_runtime/judges/pre_send.py::GuardedOutcome`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`.
- Read: `supabase/migrations/20260812000001_agents_baseline_prereqs.sql`, `supabase/migrations-archive/20260613_agent_stats_rpcs.sql`.

**Interfaces:**

- Consumes: `agent_traces(output,tool_calls,agent_id,conversation_id,tokens,latency_ms)` e consumidores reais de `ai_agent_id` em `whatsapp_cloud_messages`; contadores `ai_agents.total_messages`, `total_tokens_used`, `avg_response_time_ms`, `total_conversations` e `ai_agent_actions.times_triggered/last_triggered_at`.
- Produces: semântica aprovada do evento contado e do trace, destino e retenção. Tasks 2/3 usam essa decisão, sem inferir que “gerado” significa “enviado”.

- [ ] **Step 1 (4 min): Revalidar os consumidores.** `rg -n 'agent_traces|total_messages|total_tokens_used|avg_response_time_ms|total_conversations|times_triggered|last_triggered_at|ai_agent_id' src/lib/ai/proposals.ts src/lib/ai/evals.ts src/components/ai-hub src/app/api/ai runtime/src`. Registrar nomes dos leitores alcançáveis; o componente `AIAgentCard` citado no checklist já foi removido, portanto não é prova de superfície ativa.
- [ ] **Step 2 (4 min): Apresentar as opções.** Traces: A registrar cada geração observada, com estado explícito `drafted/committed/superseded/blocked`, e consumidores escolhem estados; B registrar somente resultado CAS aceito. Contadores: A derivar estatísticas dos dados existentes e retirar exposição de contadores congelados; B manter colunas e atualizar atomicamente com idempotência. Ações antigas: A remover contadores sem consumidor, B conservar somente se o dono indicar ação executável e superfície que usa o número. Não promover RPC arquivada como se isso criasse um escritor runtime.
- [ ] **Step 3 (3 min): Definir denominadores concretos.** Para cada contador escolhido: mensagens conta bolhas ou turnos; conversas conta primeira atribuição ou primeira mensagem; tokens inclui quais finalidades/tentativas; tempo médio usa geração ou envio. Atribuição de `ai_agent_id` no espelho deve usar identidade WABA da Onda 2 e agente do turno, não “agente ativo agora”.
- [ ] **Step 4 (2 min): RED/GREEN documental.** `rg -n 'Escolha aprovada|Evento contado|Consumidor|Retenção|Resposta do usuário' docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md`. RED: falta resposta/consumidor; GREEN: todas as cinco dimensões preenchidas com resposta real e exemplos de retry, veto e superseded. Enquanto aguarda, Task 2 pode executar o contrato interno de identidade, sem persistir conteúdo.
- [ ] **Step 5 (2 min): Commit.** `git add docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md`; `git commit -m "docs: define trace and counter consumers"`. Controlador Astra; revisor Astra independente. Rollback documental por decisão substitutiva, sem alteração em dados externos.

### Task 2: Identificar a tentativa vencedora sem mudar a escolha do juiz (W4-T1)

**Files:**

- Modify: `runtime/src/agents_runtime/judges/pre_send.py::GuardedOutcome`, `guarded_reply`.
- Modify: `runtime/tests/unit/test_pre_send_judge.py`.

**Interfaces:**

- Consumes: `Generator(attempt: int, feedback: tuple[str,...]) -> Awaitable[str]`; tentativas indexadas a partir de zero.
- Produces: campo novo `GuardedOutcome.selected_attempt: int | None = None`; `None` quando nada pode sair; mantém `draft`, `judgements`, `attempts`, `blocked_by`. Não usar `attempts - 1` para deduzir a vencedora.

- [ ] **Step 1 (4 min): Escrever teste que distingue primeira/última tentativa.** No teste existente, reutilizar `Generator`, `ScriptedJudge`, `standard_failure`, `critical_failure` e a fixture `SAFETY`. O caso com scores diferentes usa `Judgement` explícito e rubrica utilizável:

```python
async def test_selected_attempt_is_the_best_not_the_last():
    from agents_runtime.judges.pre_send import FAIL, Judgement, RubricVerdict
    scores = iter((0.8, 0.4, 0.3))
    async def judge(draft, context):
        value = next(scores)
        rubric = RubricVerdict("tom", FAIL, value, ("tom-amigavel",))
        return Judgement(outcome=FAIL, score=value, rubrics=(rubric,), rationale="roteiro")
    outcome = await guarded_reply(Generator(), judge)
    assert outcome.draft == "rascunho 0"
    assert outcome.selected_attempt == 0
    assert outcome.attempts == 3
```

`Judgement.usable` depende de `bool(rubrics)`, portanto a rubrica concreta é necessária. O teste exerce o ramo de melhor score real, sem monkeypatch da seleção.
- [ ] **Step 2 (2 min): RED.** `uv run --directory runtime pytest tests/unit/test_pre_send_judge.py -k selected_attempt -q`; esperado: atributo inexistente. Acrescentar PASS na segunda tentativa, CRITICAL depois de uma tentativa utilizável, juiz inutilizável e teto durante geração/julgamento; todos afirmam índice ou `None`.
- [ ] **Step 3 (4 min): Estender o acumulador existente.**

```python
selected_attempt: int | None = None
```

Adicionar esse campo ao final de `GuardedOutcome`; `best` passa a `tuple[str, Judgement, int] | None`, armazenado como `(draft, judgement, attempt)`. No retorno PASS, passar `selected_attempt=attempt`; ao desempacotar best, usar `best_draft, judgement, selected_attempt = best` e retornar `draft=best_draft,last_draft=draft`, preservando a última geração separadamente. Retornos bloqueados mantêm índice `None`. Empate preserva a primeira tentativa porque a comparação continua `>`.
- [ ] **Step 4 (3 min): GREEN.** `uv run --directory runtime pytest tests/unit/test_pre_send_judge.py tests/unit/test_llm_metering.py -q`; `uv run --directory runtime ruff check .`. Provar explicitamente que o último rascunho bloqueado continua disponível; não reescrever `last_draft` com a vencedora por conveniência do trace.
- [ ] **Step 5 (2 min): Commit.** `git add runtime/src/agents_runtime/judges/pre_send.py runtime/tests/unit/test_pre_send_judge.py`; `git commit -m "fix: identify the selected generation attempt"`. Sol implementa, Astra revisa. Rollback: revert simples, antes de retirar consumidores adicionados na Task 3.

### Task 3: Traces atribuídos e contadores compatíveis (W4-T1, condicional)

**Files:**

- Modify: `runtime/src/agents_runtime/agent_core/responder.py::generate`, `run_turn_tool`; `runtime/src/agents_runtime/agent_core/toucher.py`; `runtime/src/agents_runtime/queueing/worker.py`.
- Create: `runtime/src/agents_runtime/repository/agent_traces.py`.
- Create: `runtime/tests/db/test_runtime_agent_traces.py`.
- Create: `supabase/migrations/20260910040000_runtime_trace_attribution.sql`, após verificar unicidade no manifesto.
- Modify: `src/lib/ai/proposals.ts` apenas se a opção A da Task 1 exigir filtro de estado.
- Read: `internal.mirror_outbound_to_inbox` e `internal.conclude_turn` na última migration aprovada na Onda 2; não copiar versão antiga sem WABA.

**Interfaces:**

- Consumes: `selected_attempt`; `ToolCall(id,name,arguments)`, `run_tool` e `GuardedOutcome`; escolha da Task 1.
- Produces: `record_agent_trace(conn, *, organization_id: UUID, conversation_id: UUID, agent_id: UUID, provider: str, model: str, input_text: str, output_text: str, tool_calls: list[dict], runtime_key: str, selected_attempt: int) -> UUID`; retorna ID estável por tentativa de job, com organização autenticada pelo scope. Nenhum conteúdo vai para `internal.llm_calls`.

- [ ] **Step 1 (4 min): RED de atribuição e retry.** Usar no novo teste DB `ScriptedLlm`, fábricas de `test_responder_tool_loop.py` e três tentativas distintas; primeira tool consulta estoque, segunda rastreio, terceira nenhuma, com primeira vencedora. Esperar em `agent_traces` texto e tools somente da tentativa zero; reentrega do mesmo job não duplica. Acrescentar org B e afirmar que o worker A não lê/escreve trace B. Comando guardião: `uv run --directory runtime pytest tests/db/test_runtime_agent_traces.py -q`; esperado: tabela sem `runtime_key`/sem escritor.
- [ ] **Step 2 (4 min): Acumular tools por tentativa no escopo de geração.**

```python
attempt_tools: dict[int, list[dict]] = {}
```

No início de `generate(attempt, feedback)`, `attempt_tools[attempt] = []`; passar `attempt` ao `run_turn_tool` local, e depois do resultado persistido por `run_tool`, acrescentar `{ "id": call.id, "name": call.name, "arguments": dict(call.arguments), "result": payload }` à lista. Nunca acumular em variável de processo. Na seleção, `attempt_tools.get(outcome.selected_attempt, [])`; ferramentas realizadas em tentativa perdedora continuam em `internal.tool_calls` e seus custos não somem.
- [ ] **Step 3 (5 min): Persistir no ponto aprovado na Task 1.** Adicionar `runtime_key text` e `selected_attempt integer` nullable à tabela existente; índice único parcial `(organization_id,runtime_key) where runtime_key is not null`; não alterar linhas históricas. Chave reativa `reply:{conversation_id}:{generation}:{target_seq}`; toque usa a chave idempotente de negócio aprovada na Onda 2, nunca o índice da tentativa como identidade do job. Repositório escreve dentro de transação escopada e usa `ON CONFLICT` compatível com o índice.

```sql
alter table public.agent_traces add column if not exists runtime_key text;
alter table public.agent_traces add column if not exists selected_attempt integer;
create unique index if not exists agent_traces_runtime_key_uniq
on public.agent_traces(organization_id, runtime_key) where runtime_key is not null;
```

Branch A, trace de observação: adicionar também estado restrito aprovado e consumidores filtram explicitamente os estados aceitos; CAS recusado marca `superseded`, veto marca `blocked`. Branch B, somente CAS aceito: transportar atribuição num resultado interno tipado até o worker e persistir na mesma transação de `conclude_turn`; não acrescentar metadata privada ao JSON enviado à Meta. Esse branch muda a interface responder→worker: antes de implementar, escrever e aprovar o plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-accepted-trace-transport.md`, enumerando todos os consumidores de `Responder`/`TouchDraft` e seus testes. A Task 3 só fecha após executar esse plano filho; não escolher branch A para evitar essa dependência.
- [ ] **Step 4 (5 min): Aplicar a opção de contadores aprovada.** Branch A derivado: corrigir apenas leitores confirmados para derivar do registro de turnos/envios/metring escolhido; retirar labels que afirmam totais congelados, manter histórico armazenado. Branch B materializado: um evento idempotente no commit/envio alimenta `ai_agent_id` no espelho e soma contadores em SQL na mesma transação; usar a chave de negócio da Onda 2 como dedup, testar tentativa repetida/bolhas/superseded. Não promover as RPCs arquivadas; escrever plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-materialized-agent-counters.md` com o evento e denominadores da Task 1 antes de DDL dependente. Campos de ações sem consumidor são documentados como retirados de produto; nenhuma tabela é apagada.
- [ ] **Step 5 (3 min): GREEN, custo e isolamento.** Guardião executa `uv run --directory runtime pytest tests/db/test_runtime_agent_traces.py tests/db/test_llm_calls_persistence.py tests/db/test_responder_tool_loop.py -q`; comprovar RLS com roles reais e duas orgs, retry sem dupla contagem, tentativa perdedora com custo ainda presente. Se TS mudou: `pnpm exec vitest run src/lib/ai/__tests__`; `pnpm typecheck`. Runtime: Ruff/Import Linter.
- [ ] **Step 6 (2 min): Commit e rollback.** Commit `fix: attribute runtime traces to the selected attempt`, somente arquivos efetivamente aprovados. Sol implementa/Astra revisa. Rollback de aplicação desliga novo escritor/leitor em ordem reversa; manter colunas nullable e registros históricos para inspeção, compensar grants por migration nova. Não apagar traces nem recontar produção automaticamente.

### Task 4: Política de gasto desconhecido e cinco superfícies pagas (W4-T2, decisão)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-cost-policy.md`.
- Read: `src/lib/ai/budget.ts`, `src/lib/ai/cost-tracker.ts`, `src/lib/ai/embeddings.ts`, `src/lib/ai/media/transcription.ts`, `src/lib/segments/ai-generator.ts`, `src/lib/services/whatsapp/ai-chatbot-service.ts`, `src/app/api/ai/usage/route.ts`.

**Interfaces:**

- Consumes: `BudgetCheckResult(allowed,budgetUsd,spentUsd,hasUnknownCost)`, `TrackAiUsageInput`, custos `null` existentes.
- Produces: política aprovada por motivo de desconhecimento e tabela de pagador por superfície; Tasks 5/6 não podem atribuir cobrança antes dessa tabela.

- [ ] **Step 1 (4 min): Escrever opções separadas para os dois motivos.** Erro de leitura DB: continuar atendimento com alerta versus bloquear explicitamente com erro distinto de orçamento estourado. Modelo sem preço: continuar com custo parcial versus bloquear; terceira opção de N chamadas desconhecidas exige N e janela aprovados, armazenamento/dedup e plano filho antes de código. O default de USD 50 não limita custo desconhecido; não usar essa quantia como prova de teto efetivo.
- [ ] **Step 2 (4 min): Inventariar pagador e limite por superfície.** Linhas: copiloto/`callOpenAI` (dois chamadores), segmento Anthropic (cada tentativa do retry), embedding unitário/cache miss, embedding batch (por request ao provedor), transcrição. Para cada linha: chave de quem, pagador plataforma/organização, participa do teto sim/não, feature do log, ausência de usage e erro de persistência. Chamada de metadados/validação de chave não é inferência e fica fora.
- [ ] **Step 3 (3 min): Definir reconciliação.** Opções: separar custo da plataforma em destino próprio aprovado ou conservar `ai_usage_logs` com marcador explícito e atualizar soma/unknown apenas das linhas billable. Na segunda opção, linhas antigas mantêm regra anterior, novas linhas registram `metadata.billable` booleano; a UI mostra ambos com rótulos distintos. Decidir destino e retenção sem publicar prompt, áudio, chave ou header de autorização.
- [ ] **Step 4 (2 min): RED/GREEN documental.** `rg -n 'Resposta do usuário|Pagador|Participa do teto|Erro DB|Modelo sem preço|Destino' docs/superpowers/specs/2026-09-08-auditoria-ia-cost-policy.md`. RED enquanto existir decisão sem resposta. GREEN exige todas as linhas com resposta inequívoca e exemplos de 49/50/51 USD, chamada sem preço e indisponibilidade DB; não preencher resposta com recomendação do checklist.
- [ ] **Step 5 (2 min): Commit.** `git add docs/superpowers/specs/2026-09-08-auditoria-ia-cost-policy.md`; `git commit -m "docs: record AI billing and unknown-cost policy"`. Astra conduz/revisa; nenhuma chamada paga real. Rollback documental por revisão assinada da política.

### Task 5: Fazer o budget expressar a política aprovada (W4-T2)

**Files:**

- Modify: `src/lib/ai/budget.ts`, `src/lib/ai/__tests__/budget.test.ts`.
- Modify: `src/app/api/ai/usage/route.ts`, `src/lib/ai/__tests__/cost-tracker.test.ts` se o contrato de pagador exigir.
- Create: `supabase/migrations/20260910040001_ai_usage_billable_budget.sql` somente para branch de pagador misto.
- Read: `supabase/migrations/20260902000003_ai_usage_logs_cost_usd_unknown.sql` e chamadores de `checkAiBudget`.

**Interfaces:**

- Consumes: `checkAiBudget(organizationId, options) -> Promise<BudgetCheckResult>` e política da Task 4.
- Produces: adiciona `unknownReason?: 'lookup_error' | 'unpriced_model'`; mantém gasto conhecido separado do desconhecido. Se bloquear indisponibilidade, usa erro próprio `AiBudgetUnavailableError` com status 503; orçamento realmente excedido continua `AiBudgetExceededError` 402.

- [ ] **Step 1 (4 min): Acrescentar testes usando mocks existentes.** Cobrir erro em `ai_budgets`, erro RPC, erro do fallback e catch-all; modelo sem preço com consulta válida; cache frio/quente, `skipCache`, `throwOnExceeded`, limites exato/abaixo/acima. Núcleo de nova expectativa para lookup:

```ts
expect(result.unknownReason).toBe('lookup_error')
expect(result.spentUsd).toBe(0)
expect(result.hasUnknownCost).toBe(false)
```

`spentUsd=0` nesse ramo conserva o campo legado, mas só pode ser apresentado acompanhado do motivo “consulta indisponível”, nunca como gasto total. No ramo de custo parcial, exigir `unknownReason === 'unpriced_model'` e soma conhecida preservada. `allowed` vem da opção aprovada, explicitamente copiada para os testes.
- [ ] **Step 2 (2 min): RED.** `pnpm exec vitest run src/lib/ai/__tests__/budget.test.ts`; esperado: `unknownReason` ausente e/ou bloqueio não implementado.
- [ ] **Step 3 (4 min): Aplicar o menor branch.** Para continuidade, acrescentar apenas o motivo aos retornos existentes e ao cache, mantendo warnings. Para bloqueio, lançar erro distinto em todos os ramos de consulta e não capturá-lo no catch-all como permitido:

```ts
export class AiBudgetUnavailableError extends Error {
  readonly status = 503
  constructor() { super('Não foi possível verificar o orçamento de IA') }
}
```

No catch externo, `if (err instanceof AiBudgetUnavailableError || err instanceof AiBudgetExceededError) throw err`; os chamadores existentes devem preservar o motivo e status. Modelo sem preço segue seu branch próprio, nunca simular um custo inventado para disparar 402.
- [ ] **Step 4 (5 min): Branch de pagador misto.** Só se Task 4 aprovou `ai_usage_logs` com `metadata.billable`, aplicar o mesmo predicado à RPC de soma, ao fallback TS e ao cálculo de unknown no endpoint de usage:

```sql
and (metadata ->> 'billable') is distinct from 'false'
```

```ts
if (r.metadata?.billable === false) continue
```

Fallback seleciona `cost_usd,metadata`. Testes: 10 USD billable + 90 USD plataforma + uma linha plataforma null resulta gasto de orçamento 10 e `hasUnknownCost=false`; adicionar linha billable null muda apenas unknown; linha histórica sem metadata conserva cobrança anterior. Guardião comprova RPC/fallback equivalentes em DB descartável.
- [ ] **Step 5 (3 min): GREEN.** `pnpm exec vitest run src/lib/ai/__tests__/budget.test.ts src/lib/ai/__tests__/cost-tracker.test.ts`; `pnpm typecheck`. Se houve SQL, guardião faz replay e teste real de RPC, incluindo duas organizações. Não misturar budget da organização A no cache B.
- [ ] **Step 6 (2 min): Commit e rollback.** `git commit -m "fix: apply explicit unknown AI budget policy"` após `git add` dos arquivos desta task. Sol implementa/Astra revisa. Rollback: reverter consumidores e policy juntos; preservar metering, `null` e campos históricos; compensação de RPC via migration nova, sem backfill automático de preços.

### Task 6: Instrumentar os gastos invisíveis no limite do request pago (W4-T2)

**Files:**

- Modify: `src/lib/services/whatsapp/ai-chatbot-service.ts::callOpenAI`, `processWithAI`, `getCopilotSuggestion`.
- Modify: `src/lib/segments/ai-generator.ts::generateSegmentRule` e `src/app/api/segments/ai/generate/route.ts`.
- Modify: `src/lib/ai/embeddings.ts::generateEmbedding`, `generateEmbeddingsBatch`; `src/lib/ai/rag.ts`; `src/app/api/ai/process/document/route.ts`; `src/app/api/ai/agents/[id]/integrations/[integrationId]/sync/route.ts`.
- Modify: `src/lib/ai/media/transcription.ts::transcribeAudio`, `src/lib/ai/cloud-runner.ts`.
- Modify: `src/lib/ai/cost-tracker.ts::trackAiUsage`, `src/lib/ai/__tests__/cost-tracker.test.ts`, para observar erro retornado pelo PostgREST.
- Modify: `src/lib/ai/__tests__/embeddings.test.ts`, `src/lib/ai/media/__tests__/transcription.test.ts`.
- Create: `src/lib/ai/__tests__/paid-request-metering.test.ts`.

**Interfaces:**

- Consumes: `trackAiUsage(input: TrackAiUsageInput): Promise<void>` e tabela de pagador aprovada; não duplica log quando chamador já usa tracker.
- Produces: `generateEmbedding(text, apiKey, organizationId): Promise<number[]>`; `generateEmbeddingsBatch(texts, apiKey, organizationId): Promise<number[][]>`; `transcribeAudio` acrescenta `organizationId: string` ao objeto existente; `callOpenAI` recebe contexto de organização explícito de seus dois chamadores; `generateSegmentRule` exige `opts.orgId` antes de emitir request pago quando registro por organização for obrigatório.

Cada lote abaixo tem cinco ações separadas: escrever o teste, executar RED, aplicar o patch mínimo, executar GREEN e staging/commit/review. A política e o pagador vêm da Task 4; nenhum lote redefine cobrança.

- [ ] **Step 1 (4 min): Lote tracker — escrever teste de erro PostgREST.** Em `cost-tracker.test.ts`, reutilizar `insertMock` e `warnSpy` do describe existente:

```ts
insertMock.mockResolvedValueOnce({ data: null, error: { message: 'write refused' } })
await trackAiUsage({ organizationId: 'org-a', provider: 'openai', model: 'gpt-4o-mini',
  feature: 'copilot', promptTokens: 10, completionTokens: 5 })
expect(warnSpy).toHaveBeenCalledWith('[trackAiUsage]', 'write refused')
```

- [ ] **Step 2 (2 min): Lote tracker — executar RED.** `pnpm exec vitest run src/lib/ai/__tests__/cost-tracker.test.ts`; esperado: ausência do warning de escrita recusada.

- [ ] **Step 3 (3 min): Lote tracker — patch mínimo.** Em `cost-tracker.ts`, capturar `{ error }` no retorno do `insert` existente e acrescentar `if (error) throw error` antes de sair do try; o catch existente conserva logging não bloqueante.

```ts
if (error) throw error
```

- [ ] **Step 4 (2 min): Lote tracker — executar GREEN.** `pnpm exec vitest run src/lib/ai/__tests__/cost-tracker.test.ts`; esperado: todos passam, incluindo warning de erro PostgREST.

- [ ] **Step 5 (3 min): Lote tracker — staging/commit/review.** `git add src/lib/ai/cost-tracker.ts src/lib/ai/__tests__/cost-tracker.test.ts`; `git commit -m "fix: report rejected AI usage writes"`; reviewer Astra registra Spec PASS e Quality APPROVED no pacote deste lote.

- [ ] **Step 6 (5 min): Lote embedding unitário — escrever teste de identidade/cache.** Em `embeddings.test.ts`, importar também `generateEmbedding`, mockar `trackAiUsage` e Redis com get que retorna primeiro null e depois vetor de 1536 números; preservar exports `CACHE_PREFIX/CACHE_TTL` reais. Mock de fetch retorna `{data:[{embedding:Array(1536).fill(0)}],usage:{prompt_tokens:7}}`. Executar duas chamadas `generateEmbedding('frete','sk-teste','org-a')`; exigir uma fetch, um log de sete input tokens e zero output tokens. Segunda organização com cache já preenchido exige zero logs adicionais, pois não houve request pago.

No mesmo teste unitário, incluir fetch rejeitado, HTTP não-OK, JSON sem usage e falha do cache após parse: uma linha por request pago, custo null quando ausente e nenhuma duplicação após falha do cache. Budget bloqueado antes de fetch produz zero registros; esses casos usam mocks, não chamadas reais.

- [ ] **Step 7 (2 min): Lote embedding unitário — executar RED.** `pnpm exec vitest run src/lib/ai/__tests__/embeddings.test.ts -t 'unitário'`; esperado: tracker não chamado.

- [ ] **Step 8 (5 min): Lote embedding unitário — patch mínimo.** Acrescentar terceiro argumento obrigatório `organizationId: string` somente ao gerador unitário; validar organização antes de fetch, após retorno por cache. `RAGService.search` chama `generateEmbedding(query,this.openaiKey,this.organizationId)`. No cache miss, aplicar budget se billable; após parse do response, usar:

```ts
await trackAiUsage({
  organizationId,
  provider: 'openai',
  model: OPENAI_EMBEDDING_MODEL,
  feature: 'embedding',
  promptTokens: data.usage?.prompt_tokens,
  completionTokens: data.usage ? 0 : undefined,
  metadata: { billable },
})
```

`billable` é o booleano aprovado para essa superfície na Task 4, escrito no call site. Preservar vetor/cache e excluir texto/chave do log.

O patch unitário mantém um booleano local por request indicando registro concluído; marcar após sucesso metrado. No catch, registrar `success:false,costUsdOverride:null` somente se ainda não houve registro, preservando o erro original. Falha de cache posterior não gera nova linha.

- [ ] **Step 9 (3 min): Lote embedding unitário — executar GREEN.** `pnpm exec vitest run src/lib/ai/__tests__/embeddings.test.ts -t 'unitário'`; `pnpm typecheck`. Esperado: cache hit não gera request/log; cache miss registra uso uma vez.

- [ ] **Step 10 (3 min): Lote embedding unitário — staging/commit/review.** `git add src/lib/ai/embeddings.ts src/lib/ai/rag.ts src/lib/ai/__tests__/embeddings.test.ts`; `git commit -m "fix: meter individual embedding requests"`; review Astra exige Spec PASS e Quality APPROVED antes do batch.

- [ ] **Step 11 (5 min): Lote embedding batch — escrever teste de requests.** No teste de batch existente de 101 textos, acrescentar `usage:{prompt_tokens:10}` ao primeiro response de 100 e `usage:{prompt_tokens:2}` ao segundo de 1. Executar `generateEmbeddingsBatch(texts,'sk-teste','org-a')`; exigir duas fetch e dois logs, tokens `[10,2]`, todos com organização A. Caso batch inteiramente em cache exige zero fetch/log.

Escrever também no lote batch os casos de falha HTTP/rede no segundo batch, usage ausente e falha posterior do cache: o primeiro request mantém seu registro, o segundo deixa exatamente uma linha de falha com custo null e batch bloqueado antes de fetch não deixa linha.

- [ ] **Step 12 (2 min): Lote embedding batch — executar RED.** `pnpm exec vitest run src/lib/ai/__tests__/embeddings.test.ts -t 'lote'`; esperado: batch não registra os dois requests.

- [ ] **Step 13 (5 min): Lote embedding batch — patch mínimo.** Acrescentar terceiro argumento `organizationId` ao batch e passá-lo em `src/app/api/ai/process/document/route.ts` e `src/app/api/ai/agents/[id]/integrations/[integrationId]/sync/route.ts`, ambos derivados da organização já autenticada pela rota. Dentro do laço `for (let i=0;i<toGenerate.length;i+=batchSize)`, aplicar budget antes do fetch se billable e o mesmo registro de embedding após parse de cada response; nunca log por item de `data.data`.

O patch batch mantém seu indicador de registro dentro de cada iteração; erro HTTP/rede escreve uma linha `success:false,costUsdOverride:null` se o request ainda não foi metrado. Não reaproveitar o estado de registro do batch anterior.

- [ ] **Step 14 (3 min): Lote embedding batch — executar GREEN.** `pnpm exec vitest run src/lib/ai/__tests__/embeddings.test.ts`; `pnpm typecheck`. Esperado: dois requests geram dois logs, sem perda de ordenação/cache.

- [ ] **Step 15 (3 min): Lote embedding batch — staging/commit/review.** `git add src/lib/ai/embeddings.ts src/lib/ai/__tests__/embeddings.test.ts src/app/api/ai/process/document/route.ts 'src/app/api/ai/agents/[id]/integrations/[integrationId]/sync/route.ts'`; `git commit -m "fix: meter batched embedding requests"`; review Astra exige Spec PASS e Quality APPROVED.

- [ ] **Step 16 (5 min): Lote transcrição — escrever testes de custo desconhecido.** Em `transcription.test.ts`, importar/mocar tracker; acrescentar `organizationId:'org-a'` ao objeto de cada chamada. No teste que já retorna `{text:' olá '}`, acrescentar:

```ts
expect(trackAiUsage).toHaveBeenCalledWith(expect.objectContaining({
  organizationId: 'org-a', provider: 'groq', model: 'whisper-large-v3',
  feature: 'transcription', costUsdOverride: null,
}))
```

Caso erro HTTP 502 e caso fetch rejeitado devem gerar exatamente um registro `success:false,costUsdOverride:null`.

- [ ] **Step 17 (2 min): Lote transcrição — executar RED.** `pnpm exec vitest run src/lib/ai/media/__tests__/transcription.test.ts`; esperado: tracker não chamado em sucesso/falha.

- [ ] **Step 18 (5 min): Lote transcrição — patch mínimo.** Acrescentar campo obrigatório `organizationId` em `transcribeAudio(params)`; `cloud-runner.ts` passa a organização do turno. Registro de sucesso após response.json e antes do return:

```ts
await trackAiUsage({ organizationId, provider: config.provider, model: config.model,
  feature: 'transcription', success: true, costUsdOverride: null,
  metadata: { billable } })
```

Não derivar tokens de tamanho do áudio. Budget antes do fetch somente no branch billable; erro HTTP/rede registra uma única vez e relança o mesmo erro para o chamador.

- [ ] **Step 19 (3 min): Lote transcrição — executar GREEN.** `pnpm exec vitest run src/lib/ai/media/__tests__/transcription.test.ts`; `pnpm typecheck`. Esperado: uma linha por tentativa, custo null e resposta preservada.

- [ ] **Step 20 (3 min): Lote transcrição — staging/commit/review.** `git add src/lib/ai/media/transcription.ts src/lib/ai/media/__tests__/transcription.test.ts src/lib/ai/cloud-runner.ts`; `git commit -m "fix: meter audio transcription requests"`; review Astra exige Spec PASS e Quality APPROVED.

- [ ] **Step 21 (5 min): Lote copiloto — escrever testes pelos dois chamadores.** Em `paid-request-metering.test.ts`, describe `copiloto`: mock de conversa para `getCopilotSuggestion('conv-a','org-a','oi')` retorna `{ai_agent_id:null}`, histórico vazio e fetch `{choices:[{message:{content:'Olá'}}],usage:{prompt_tokens:11,completion_tokens:4}}`; nenhuma busca RAG nesse fixture. Expectativa:

```ts
expect(await getCopilotSuggestion('conv-a', 'org-a', 'oi'))
  .toEqual({ data: { suggestion: 'Olá' } })
expect(trackAiUsage).toHaveBeenCalledWith(expect.objectContaining({
  organizationId: 'org-a', feature: 'copilot', promptTokens: 11, completionTokens: 4,
}))
```

Adicionar cenário de `processWithAI` com objeto de conversa `{id:'conv-a',ai_agent_id:'agent-a',contact_name:'Ana',contact_phone:'551100000000',tags:[]}` tipado como `Conversation` importado de `services/whatsapp/types`. Mock de `ai_agents.single` retorna `{id:'agent-a',system_prompt:'Atenda',model:'gpt-4o-mini',temperature:0.7,max_tokens:300,max_interactions:null,handoff_keywords:[],total_messages:0}`; mock do histórico retorna `{data:[]}` e update do contador resolve `{error:null}`. Chamar `processWithAI(conversation,'oi','org-a')`; exigir `{data:{response:'Olá',shouldHandoff:false}}` e um único log com organização A e tokens 11/4. As cadeias Supabase expõem `select/eq/neq/order` que retornam a própria chain, `single/limit` que resolvem esses dados e `update().eq()` que resolve o resultado definido. Chave fictícia `OPENAI_API_KEY=sk-test` somente via `vi.stubEnv`.

Os testes do copiloto incluem fetch rejeitado, HTTP não-OK e usage ausente, exigindo uma linha por request emitido, nenhuma por bloqueio pré-request e nenhum segredo nos argumentos do tracker: `expect(JSON.stringify(vi.mocked(trackAiUsage).mock.calls)).not.toContain('sk-test')`.

- [ ] **Step 22 (2 min): Lote copiloto — executar RED.** `pnpm exec vitest run src/lib/ai/__tests__/paid-request-metering.test.ts -t copiloto`; esperado: ambos os chamadores fazem request sem log.

- [ ] **Step 23 (5 min): Lote copiloto — patch mínimo no helper.** Mudar assinatura privada para `callOpenAI(organizationId: string, messages: ChatMessage[], model='gpt-4o-mini', temperature=0.7, maxTokens=500): Promise<string|null>`; atualizar os dois chamadores, sem registro externo adicional. Após `const data=await response.json()`:

```ts
await trackAiUsage({ organizationId, provider: 'openai', model,
  feature: 'copilot', promptTokens: data.usage?.prompt_tokens,
  completionTokens: data.usage?.completion_tokens, metadata: { billable } })
```

Budget antes do fetch apenas quando billable. Modelo sem usage fica null pelo tracker; erro de rede/HTTP registra uma vez como desconhecido.

O patch do helper controla um indicador de registro por invocação: falha anterior ao registro envia `success:false,costUsdOverride:null` uma vez e propaga erro sanitizado. Nunca anexar prompt, resposta bruta ou header Authorization.

- [ ] **Step 24 (3 min): Lote copiloto — executar GREEN.** `pnpm exec vitest run src/lib/ai/__tests__/paid-request-metering.test.ts -t copiloto`; `pnpm typecheck`. Esperado: ambos os chamadores registram organização/tokens corretos uma vez.

- [ ] **Step 25 (3 min): Lote copiloto — staging/commit/review.** `git add src/lib/services/whatsapp/ai-chatbot-service.ts src/lib/ai/__tests__/paid-request-metering.test.ts`; `git commit -m "fix: meter shared inbox AI calls"`; review Astra exige Spec PASS e Quality APPROVED.

- [ ] **Step 26 (5 min): Lote segmentos — escrever teste de cada tentativa.** No mesmo arquivo de teste, describe `segmento`: `vi.stubEnv('ANTHROPIC_API_KEY','sk-ant-test')`; primeiro fetch devolve content sem tool_use com usage 10/2; segundo retorna tool_use `create_segment` válido com usage 12/3. Regra válida:

```ts
const rule = { version: 2, root: { type: 'group', logic: 'AND', children: [
  { type: 'profile', field: 'predicted_clv', operator: 'gte', value: 500 },
] } }
const result = await generateSegmentRule('clientes com CLV alto', { orgId: 'org-a' })
expect(result.ok).toBe(true)
expect(result.attempts).toBe(2)
expect(trackAiUsage).toHaveBeenCalledTimes(2)
expect(vi.mocked(trackAiUsage).mock.calls.map(([x]) => x.promptTokens)).toEqual([10, 12])
```

O segundo response usa `content:[{type:'tool_use',name:'create_segment',input:rule}]`.

Os testes de segmento cobrem também HTTP não-OK, fetch rejeitado e usage ausente em uma tentativa, além de validação que falha depois do registro. Exigir uma linha por request, custo null quando desconhecido e zero para tentativa bloqueada antes de fetch; validação reprovada não apaga nem duplica o registro.

- [ ] **Step 27 (2 min): Lote segmentos — executar RED.** `pnpm exec vitest run src/lib/ai/__tests__/paid-request-metering.test.ts -t segmento`; esperado: faltam dois logs das duas tentativas.

- [ ] **Step 28 (5 min): Lote segmentos — patch mínimo.** `generateSegmentRule` exige organização antes de fetch quando o destino aprovado é org-scoped; rota `segments/ai/generate` já passa `orgId`, conservar sua origem autenticada. Dentro de cada tentativa, registrar imediatamente após parse, antes de validar `toolUse`:

```ts
await trackAiUsage({ organizationId: opts.orgId, provider: 'anthropic', model: MODEL,
  feature: 'segment_generation', promptTokens: data.usage?.input_tokens,
  completionTokens: data.usage?.output_tokens, metadata: { billable, attempt } })
```

Narrow de `opts.orgId` deve ocorrer antes do laço para satisfazer `organizationId:string`. Budget antes de cada fetch quando billable; logging fora do ramo `validation.ok`.

O patch do segmento inicializa indicador de registro dentro de cada tentativa. Catch anterior ao registro deixa uma linha `success:false,costUsdOverride:null` antes do retry; catch posterior conserva a linha existente. Erro registrado é sanitizado, sem prompt/response/header.

- [ ] **Step 29 (3 min): Lote segmentos — executar GREEN.** `pnpm exec vitest run src/lib/ai/__tests__/paid-request-metering.test.ts -t segmento`; `pnpm typecheck`. Esperado: retry é cobrado/registrado segundo política e cada response deixa uma linha.

- [ ] **Step 30 (3 min): Lote segmentos — staging/commit/review.** `git add src/lib/segments/ai-generator.ts src/app/api/segments/ai/generate/route.ts src/lib/ai/__tests__/paid-request-metering.test.ts`; `git commit -m "fix: meter every segment generation attempt"`; review Astra exige Spec PASS e Quality APPROVED.

- [ ] **Step 31 (3 min): Executar gate integrado.** `pnpm exec vitest run src/lib/ai/__tests__/paid-request-metering.test.ts src/lib/ai/__tests__/embeddings.test.ts src/lib/ai/media/__tests__/transcription.test.ts src/lib/ai/__tests__/cost-tracker.test.ts`; `pnpm typecheck`. Esperado: todos os lotes verdes no mesmo commit.

- [ ] **Step 32 (3 min): Registrar reconciliação sintética.** Report deve mostrar quantidade de requests = logs incluindo retries/erros, excluindo cache hit e bloqueio pré-request; comparar tokens/custo por pagador no descartável conforme Task 5. Fatura real continua dependência externa.

- [ ] **Step 33 (2 min): Conferir assinaturas dos chamadores.** `rg -n 'generateEmbedding\(|generateEmbeddingsBatch\(|transcribeAudio\(|callOpenAI\(|generateSegmentRule\(' src`; registrar que todo chamador entrega organização autenticada.

Rollback desta task: reverter os commits dos lotes na ordem inversa, retirando escritores e assinaturas juntos; manter linhas coletadas e o contrato de null. `cost-tracker.ts` e seu teste pertencem explicitamente ao commit do primeiro lote. Sol implementa/Astra revisa; cada lote exige os dois veredictos antes do próximo. Nenhuma biblioteca nova de billing.

### Task 7: Decidir query RAG, conteúdo e preço do preview (W4-T3, decisão)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-rag-preview-decisions.md`.
- Read: `runtime/src/agents_runtime/agent_core/responder.py::_knowledge`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/src/agents_runtime/server.py::_preview`, `runtime/src/agents_runtime/tools/knowledge.py::SearchKnowledge`.
- Read: `src/app/api/ai/preview-prompt/route.ts`, `src/components/ai-hub/RadialView.tsx`, `runtime/src/agents_runtime/agent_core/prompt_compiler.py`.

**Interfaces:**

- Consumes: consulta reativa das mensagens pending de autor contact; toque tem `resolved.objective` e transcript, preview sem contato usa `conversation_id="preview"` somente como representação, nunca como FK.
- Produces: escolha entre objetivo da missão, últimas N falas do contato, ou híbrido com fallback definido; escolha preview sem RAG versus busca explícita cobrada, com pagador da Task 4.

- [ ] **Step 1 (4 min): Preparar três exemplos.** Contato frio com transcript vazio; carrinho abandonado e conversa antiga sobre troca; missão com delta do nó mudando o objetivo. Escrever a query resultante de cada alternativa, limite de N/caracteres e tratamento da query vazia; não escolher N automaticamente.
- [ ] **Step 2 (4 min): Decidir preview.** A manter ausência explícita, sem cliente LLM no listener e sem cobrança; B busca com query digitada, chave BYO/limite/metring e trilha própria sem FK fictícia. Não chamar `run_tool` com `conversation_id="preview"`: ele sempre grava `tool_calls`. B exige endpoint/contrato de busca de preview aprovado e plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-paid-knowledge-preview.md` antes de implementação desse caminho; deve incluir cancelamento, tenant, custo, retenção e fechar cliente HTTP.
- [ ] **Step 3 (3 min): RED/GREEN documental.** Critério RED: duas consultas possíveis para o mesmo cenário ou ausência de pagador. GREEN: cada cenário tem query exata aprovada e preview tem capacidade/custo/resultado de query vazia explicitamente escolhidos; `rg -n 'Resposta do usuário|Contato frio|Delta|Pagador|Query vazia' docs/superpowers/specs/2026-09-08-auditoria-ia-rag-preview-decisions.md` dá os registros, não prova aprovação sozinho.
- [ ] **Step 4 (2 min): Commit.** `git add docs/superpowers/specs/2026-09-08-auditoria-ia-rag-preview-decisions.md`; `git commit -m "docs: decide proactive RAG and preview scope"`. Astra conduz; Sol/Astra revisam. Rollback é revisão da decisão; nenhuma embedding paga na decisão.

### Task 8: Query explícita e conhecimento com um produtor de prompt (W4-T3)

**Files:**

- Modify: `runtime/src/agents_runtime/agent_core/responder.py::_knowledge`, `build_responder`; `runtime/src/agents_runtime/agent_core/toucher.py::build_toucher`; `runtime/src/agents_runtime/agent_core/prompt_compiler.py::compile_prompt`.
- Create: `runtime/tests/unit/test_knowledge_query_contract.py`.
- Modify: `runtime/tests/db/test_toucher.py`, `runtime/tests/unit/test_agent_block_has_one_producer.py` apenas se importar `compile_prompt` precisar de ajuste.
- Read: `runtime/src/agents_runtime/server.py::_serialize`, `runtime/tests/db/test_server.py`.

**Interfaces:**

- Consumes: política da Task 7; `_knowledge` continua usando `SearchKnowledge`, `run_tool`, `ToolContext` e `MeteredLlm` existentes.
- Produces: `_knowledge(conn, job, enabled_tools, query: str, embedder, clock, limit) -> tuple[str,...]`; `compile_prompt` ganha argumento nomeado opcional `knowledge: tuple[str,...] = ()`, renderizado pelo próprio compilador como `RenderedBlock` com `kind="KNOWLEDGE"`; responder e toucher passam os mesmos chunks ao prompt e a `JudgeContext.knowledge`.

- [ ] **Step 1 (4 min): RED unit da consulta sem trabalho e do bloco único.** Mockar `run_tool` com `AsyncMock` e chamar `_knowledge` com `query=""` ou tools vazias; esperar tuple vazio/zero tool. Para query válida, retornar `ToolResult(tool="search_knowledge", success=True, output={"chunks":[{"content":"Frete em 3 dias"}]})` de `agents_runtime.tools.base` e exigir argumentos `{query:"frete do carrinho"}`. Para compilar, importar `full_compile` de `tests.unit.test_prompt_compiler_blocks` e chamar `full_compile(knowledge=("Frete em 3 dias",))`; exigir uma ocorrência e um bloco `KNOWLEDGE`. Sem chunks, nenhum texto inventado.

```python
assert sum(block.kind == "KNOWLEDGE" for block in compiled.blocks) == 1
assert compiled.text.count("Frete em 3 dias") == 1
assert next(b for b in compiled.blocks if b.kind == "KNOWLEDGE").ghost is False
```

- [ ] **Step 2 (2 min): RED.** `uv run --directory runtime pytest tests/unit/test_knowledge_query_contract.py -q`; esperado: keyword `query`/`knowledge` ainda não aceito.
- [ ] **Step 3 (4 min): Substituir a query implícita por parâmetro explícito.** Responder calcula exatamente a query anterior; toucher calcula somente o branch aprovado:

```python
query = " ".join(message.text for message in pending if message.author == "contact")
```

```python
# Branch objetivo, somente se aprovado na Task 7:
query = resolved.objective
```

Branch cauda usa N aprovado e filtra autor contact antes de juntar; branch híbrido define ordem/separador e fallback conforme registro. Reutilizar `_knowledge` sem cópia do executor. No toque criar `TurnBudget` antes do retrieval e passá-lo também ao embedder, agente e juiz; o teto da Onda 3 engloba tudo.
- [ ] **Step 4 (5 min): Mover o bloco existente para o compilador.** No final da tupla de blocos de `compile_prompt`, acrescentar `*((RenderedBlock(kind="KNOWLEDGE", text="# CONHECIMENTO\n" + "\n".join(f"- {chunk}" for chunk in knowledge)),) if knowledge else ())`. Preservar os cinco blocos anteriores e remover a concatenação de `system` do responder. `source_ids` só recebe IDs reais se o contrato do resultado for estendido; não fabricar IDs de chunk a partir do texto. O default é mapping vazio e a proveniência continua na trilha da tool já existente.
- [ ] **Step 5 (5 min): Teste DB de toque sem contato prévio.** Em `test_toucher.py`, reutilizar `_job`, `_toucher`, `org`, `create_mission`; query/fallback conforme decisão. Instrumentar embedder e juiz com doubles para confirmar mesma coleção de chunks no system prompt e contexto do juiz, zero chamada quando busca desabilitada, custo recorded uma vez. Org B com chunk exclusivo não entra no contexto de A. Preview opção A continua sem LLM e sem bloco de conhecimento; opção B precisa do plano filho aprovado, e não se fecha o item 75 apenas com o bloco novo.
- [ ] **Step 6 (3 min): GREEN e commit.** Unit focal, `uv run --directory runtime ruff check .`, `uv run --directory runtime lint-imports`; guardião: `uv run --directory runtime pytest tests/db/test_toucher.py tests/db/test_server.py -q`. Commit `fix: share explicit knowledge context across AI turns`. Sol implementa/Astra revisa. Rollback de assinaturas e consumidores no mesmo revert; dados vetoriais existentes permanecem intactos.

### Task 9: Tool-loop proativo com tools custom read-only (W4-T4, item 73)

**Files:**

- Create: `runtime/src/agents_runtime/agent_core/tool_loop.py`.
- Modify: `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`.
- Create: `runtime/tests/unit/test_shared_tool_loop.py`.
- Modify: `runtime/tests/db/test_toucher.py`, `runtime/tests/db/test_responder_tool_loop.py`.
- Read: `runtime/src/agents_runtime/tools/custom_http.py`, `runtime/src/agents_runtime/repository/custom_tools.py`, `runtime/src/agents_runtime/tools/base.py`.

**Interfaces:**

- Consumes: `ChatRequest`, `Message`, `ToolSpec`, `ToolCall`, `LlmPort`; `load_enabled_custom_tools(conn)` sob RLS; `run_tool` como único executor com trilha.
- Produces: `async def generate_with_tools(chat: LlmPort, *, model: str, messages: tuple[Message,...], tools: tuple[ToolSpec,...], execute: Callable[[ToolCall], Awaitable[str]], think: bool=False) -> str`; `MAX_TOOL_ROUNDS = 3` passa a morar nesse módulo. Responder importa e reexporta a constante para preservar importadores de teste existentes. Dois consumidores reais justificam a extração; sem framework de tools.

- [ ] **Step 1 (4 min): Escrever teste unitário do ciclo e do teto.** Usar `ScriptedLlm` que aceita `tool_rounds`, `reply`, registra `asked`; execute é `AsyncMock(return_value='{"stock":2}')`. Oferta: `ToolSpec("stock","consulta",{"type":"object"})`; pedido: `ToolCall("call-1","stock",{})`. Exigir pergunta tool seguida por resposta role=tool com ID correlacionado e retorno de texto. No caso de pedidos contínuos, todas as rounds permitidas são registradas e a chamada final tem `tools == ()`.

```python
assert result == "Há duas unidades"
execute.assert_awaited_once_with(ToolCall("call-1", "stock", {}))
assert any(m.role == "tool" and m.tool_call_id == "call-1"
           for m in llm.asked[-1].messages)
```

- [ ] **Step 2 (2 min): RED.** `uv run --directory runtime pytest tests/unit/test_shared_tool_loop.py -q`; esperado: módulo inexistente. Não chamar provedor nem endpoint de loja real.
- [ ] **Step 3 (5 min): Extrair o loop existente, sem mudar a semântica.**

```python
async def generate_with_tools(chat, *, model, messages, tools, execute, think=False):
    history = list(messages)
    for _ in range(MAX_TOOL_ROUNDS):
        answer = await chat.chat(ChatRequest(model=model, messages=tuple(history),
                                            think=think, tools=tools))
        if not answer.tool_calls:
            return answer.text
        history.append(Message(role="assistant", content=answer.text,
                               tool_calls=answer.tool_calls))
        for call in answer.tool_calls:
            history.append(Message(role="tool", content=await execute(call),
                                   tool_call_id=call.id))
    answer = await chat.chat(ChatRequest(model=model, messages=tuple(history), think=think))
    return answer.text
```

Adicionar imports/assinatura tipada declarados em Interfaces. No responder, preservar construção de feedback e executor, inclusive atribuição por tentativa da Task 3. Não adicionar desembrulho: `guarded_reply` já o faz.
- [ ] **Step 4 (5 min): Ligar somente custom tools no toucher.** Carregar `custom_rows` na transação inicial escopada; construir `CustomHttpTool(row, base_secret=base_secret)` e `tool_spec_for(row)` como no responder. Executor chama `run_tool` com org/conversa do job e serializa sucesso/erro como JSON; tool desconhecida retorna erro sem executar. Nunca incluir `CREATE_COUPON_SPEC` ou `CreateCoupon` no toque. Reusar o `chat` metrado e `TurnBudget` da Task 8, mantendo `think=False` do comportamento atual.
- [ ] **Step 5 (5 min): RED/GREEN DB do produto.** No `test_toucher.py`, usar custom tool HTTP com `httpx.MockTransport` e catálogo de org A; agente pede estoque e recebe resultado. Assertar tool_calls persistidas, tool desativada ausente, org B ausente, `create_coupon` ausente mesmo se configurada na missão, e concessão pré-materializada emitida no máximo uma vez. Executar pelo guardião `uv run --directory runtime pytest tests/db/test_toucher.py tests/db/test_responder_tool_loop.py -q`. O teste novo deve falhar antes de ligar o toucher ao helper.
- [ ] **Step 6 (3 min): Gates e commit.** `uv run --directory runtime pytest tests/unit/test_shared_tool_loop.py tests/unit/test_llm_metering.py -q`; Ruff; Import Linter. Commit `feat: enable read-only custom tools on proactive turns`. Sol implementa/Astra revisa. Rollback: reverter os dois consumidores e helper juntos; conservar trilhas de chamadas e dinheiro já materializado. Item 73 não autoriza nova porta de concessão.

### Task 10: Decidir e renderizar estado/ghost do preview (W4-T5)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-preview-state-decision.md`.
- Modify: `src/components/ai-hub/RadialView.tsx::PreviewBlock`, render de `preview.map`.
- Modify: `src/styles/agents-theme.css`.
- Create: `src/components/ai-hub/RadialView.test.tsx`.
- Modify: `runtime/src/agents_runtime/server.py::_preview`, `runtime/tests/db/test_server.py` somente se escolhido estado parcial de organização.

**Interfaces:**

- Consumes: `RenderedBlock(kind,text,ghost,source_ids)` serializado pelo runtime; `StateBlock` possui três campos de organização e cinco de conversa.
- Produces: `PreviewBlock` declara `ghost: boolean`; exibição mantém cabeçalhos portugueses do compilador e distingue ausência visualmente e por texto. Estado parcial nunca se apresenta como retrato completo de uma conversa.

- [ ] **Step 1 (4 min): Registrar opções antes da edição.** Estado: A manter ghost completo até haver conversa; B mostrar momentos da organização com label explícito “Dados da organização; contato e promessas não incluídos”. Ghost: A rótulo “Não disponível neste preview” e borda tracejada/texto secundário; B ocultar conteúdo ghost e exibir resumo de blocos ausentes. O usuário escolhe; não transformar essas opções em aprovação automática. Critério de aceite: leitor distingue dado real, dado parcial e exemplo sem depender apenas de cor.
- [ ] **Step 2 (3 min): Commit da decisão antes de implementar.** RED documental é ausência da resposta; GREEN é resposta/dono/data e exemplos de três blocos (real, ghost, parcial). `git add docs/superpowers/specs/2026-09-08-auditoria-ia-preview-state-decision.md`; `git commit -m "docs: decide preview state and missing-content display"`.
- [ ] **Step 3 (5 min): Escrever teste renderizado sem dependência DOM nova.** Vitest roda em Node e não há Testing Library/jsdom instalado. Extrair e exportar `PromptPreviewBlock({block}:{block:PreviewBlock})` no próprio `RadialView.tsx`, consumido pelo map existente e testado com `renderToStaticMarkup` de `react-dom/server`. Teste:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PromptPreviewBlock } from './RadialView'
it('declares missing content and preserves Portuguese headers', () => {
  const missing = renderToStaticMarkup(<PromptPreviewBlock block={{
    kind: 'STATE', text: '# ESTADO\nSem conversa', ghost: true,
  }} />)
  expect(missing).toContain('Não disponível neste preview')
  expect(missing).toContain('preview-ghost')
  const real = renderToStaticMarkup(<PromptPreviewBlock block={{
    kind: 'AGENT', text: '# AGENTE\nDuda', ghost: false,
  }} />)
  expect(real).toContain('# AGENTE')
  expect(real).not.toContain('preview-ghost')
})
```

`pnpm exec vitest run src/components/ai-hub/RadialView.test.tsx`; RED esperado: export ainda ausente. O teste corresponde à opção visual A; para B a expectativa exige resumo de ausência. Verificar o fluxo de fetch/fallback no browser após GREEN com `agentToHub({id:'ag-1',name:'Duda'})` como fixture, sem instalar biblioteca de teste.
- [ ] **Step 4 (4 min): Aplicar o branch visual aprovado.** Para opção A, `PromptPreviewBlock` retorna o trecho abaixo; o map usa `preview.map((block, i) => <PromptPreviewBlock key={block.kind + '-' + i} block={block} />)`:

```tsx
<div className={block.ghost ? 'preview-ghost' : undefined}>
  {block.ghost && <span>Não disponível neste preview</span>}
  {block.text}{'\n\n'}
</div>
```

```css
.prompt-box .preview-ghost {
  border-left: 2px dashed currentColor;
  padding-left: 8px;
  font-style: italic;
}
```

Usar a mesma classe/rótulo no fallback, remover classes `.ghost` que não tinham CSS; preservar contraste sem opacidade arbitrária. Para opção B, filtrar blocos ghost do conteúdo e listar seus nomes no resumo, com o mesmo teste de acessibilidade. Não renderizar markdown/HTML não sanitizado: texto React continua texto.
- [ ] **Step 5 (5 min): Branch estado parcial, somente se aprovado.** `_preview` já lê `active_moments` dentro da transação; calcular `moment_view = resolve_moments(active_moments, promote=resolved.promote_moment)` quando existe resolved. Passar ao compilador `StateBlock(moment_ids=tuple(str(m) for m in moment_view.moment_ids), moment_facts=moment_view.facts, moment_public_claim=moment_view.public_claim, grant_id=None, grant_lines=(), ledger_lines=(), contact_facts=(), purchase_lines=())`. O label parcial deve ser metadado explícito do preview aprovado, não texto injetado no prompt do turno. Teste DB afirma momento da org A presente, B ausente e campos de conversa ausentes; alternativa A não muda Python.
- [ ] **Step 6 (3 min): GREEN, revisão e rollback.** `pnpm exec vitest run src/components/ai-hub/RadialView.test.tsx`; `pnpm typecheck`; gate DB de server somente se houve Python. Commit `fix: distinguish real and missing preview content`. Terra implementa/Sol revisa. Rollback reverte UI e mudança condicional de estado no mesmo commit; preservar a decisão como histórico. Browser smoke em viewport estreita só na execução posterior, pela skill de browser.

### Task 11: Confirmar consumidores de shadow/agendamento e retirar reservas sem uso (W4-T6)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-shadow-scheduled-decision.md`.
- Modify, branch remoção: `runtime/src/agents_runtime/repository/agent.py::TenantSettings`, `load_tenant_policy`; `runtime/tests/db/test_agent_loaders.py`, `runtime/tests/unit/test_agent_block_has_one_producer.py`.
- Modify, branch remoção: `runtime/src/agents_runtime/config.py`, `runtime/src/agents_runtime/queueing/polling.py`, `runtime/src/agents_runtime/agent_core/mission_resolver.py`, `runtime/docs/testes-e-cicd.md`, `core/requisitos-e-entidades.md`, `core/agentes-por-evento.md`, `core/STATUS-agentes-por-evento.md`.
- Delete, somente se decidido: `runtime/src/agents_runtime/agent_core/pending_defaults.py`.
- Read: `runtime/src/agents_runtime/app.py`, `runtime/src/agents_runtime/queueing/__init__.py`.
- Modify, branch remoção: `runtime/tests/unit/test_weighted_polling.py`, `runtime/tests/unit/test_retry_limits.py`.

**Interfaces:**

- Consumes: `TenantSettings.shadow_until` sempre None, zero leitores; `q_scheduled` em pesos/retry e promoção por idade, sem handler no app; `pending_defaults.py` é endereço de uma decisão ainda não tomada.
- Produces: decisão explícita de consumidor e, se ausência confirmada, remove capacidade morta de polling/documentação sem apagar fila/mensagens. Se consumidor confirmado, especificação e plano filho aprovados antes de qualquer handler/shadow.

- [ ] **Step 1 (4 min): Registrar duas decisões ligadas.** Shadow: consumidor de revisão/alerta real, janela, avaliação extra e retenção; documentação antiga de “sete primeiros dias” não prova escritor/consumidor. Agendamento: fila passa a despachar follow-up ou produto usa outro caminho? Se despacha: pesos, promoção de scheduled aos dez minutos, caps/arbitragem e endereço dos números precisam de aprovação. Não copiar RNF-022 8:4:2:1 como resposta à promoção não documentada.
- [ ] **Step 2 (3 min): RED/GREEN documental.** RED enquanto consumidor, destino e números não foram confirmados; `rg -n 'Consumidor confirmado|Resposta do usuário|Pesos|Promoção|pending_defaults' docs/superpowers/specs/2026-09-08-auditoria-ia-shadow-scheduled-decision.md`. GREEN: resposta real por capacidade. Sem consumidor confirmado, aplica-se a remoção determinada pela spec, registrando a ausência como evidência e sem inventar implementação.
- [ ] **Step 3 (5 min): Branch remoção, escrever regressão.** Em teste existente de polling, fazer um ciclo completo com INBOUND/DOMAIN_EVENTS/EVALS sempre disponíveis e afirmar `Counter` com 8/4/1, sem SCHEDULED. Para tenant policy, teste de construção/carregamento não menciona `shadow_until`; nenhum valor de config morto é carregado. Executar `uv run --directory runtime pytest -m unit -k 'polling or agent_block'`; RED esperado: janela ainda tem scheduled ou dataclass exige campo retirado no teste. Não apagar cobertura de ordem/ausência de starvation.
- [ ] **Step 4 (5 min): Branch remoção, mínimo de código.** Retirar `shadow_until` da dataclass, SELECT pinado e construtor, ajustando índices de row. Em `_weights`, usar `{INBOUND:8, DOMAIN_EVENTS:4, EVALS:1}`; retirar retry/promoção de scheduled e o ramo de `effective_queue`. Retirar `pending_defaults.py` somente quando decisão diz que os números não aterrissarão nele; atualizar as três referências em docs e docstring de `arbitrate`. Não apagar constante de nome, migration da fila ou DLQ enquanto a Onda 2 ainda puder precisar drenar mensagens históricas. Parar de pollar fila viva exige comprovar zero backlog ou destinação aprovada no descartável antes da promoção.
- [ ] **Step 5 (4 min): Branch capacidade confirmada, entregar o contrato antes do código.** Criar pela skill writing-plans os planos filhos `docs/superpowers/plans/2026-09-08-auditoria-ia-shadow-runtime.md` e/ou `docs/superpowers/plans/2026-09-08-auditoria-ia-scheduled-touch.md`, apenas para capacidades confirmadas. Incluir payload `MissionTouchJob`, chave de negócio/idempotência da Onda 2, handler real em `app.py`, contador/telemetria com consumidor da Task 1, caps e pesos aprovados, testes negativos de duplicidade/cancelamento/tenant e rollback sem purgar fila. Esta é uma task de decisão, não autorização para inventar esses valores; os itens 83/89 ficam dependentes desses planos até seus gates concluírem.
- [ ] **Step 6 (3 min): GREEN e commit por branch.** Remoção: `uv run --directory runtime pytest -m unit`; Ruff; Import Linter; guardião roda loader e pipeline de polling sob banco isolado. Busca `rg -n 'shadow_until|pending_defaults|promote_scheduled_after' runtime/src core runtime/docs` não pode deixar promessa ativa de capacidade retirada. Commit `refactor: remove unconsumed shadow and scheduled paths` somente quando esse branch for escolhido. Branch capacidade confirmada com planos filhos: commit documental e registro explícito de dependência, sem declarar feature entregue.
- [ ] **Step 7 (2 min): Rollback.** Código removido é recuperável por revert; nenhuma fila/tabela/coluna operacional é apagada. Agendamento jamais volta a pollar backlog sem o gate de idempotência da Onda 2. Astra implementa decisões/integração excepcional; Luna só recebe remoção já completamente decidida; Astra independente revisa.

## Gate de saída da onda e autorrevisão do executor

- [ ] Verificar correspondência: 65→Tasks 1–3; 67→1/3; 69→4/5; 85→4/6; 72/75→7/8; 73→9; 76/77→10; 83/89→11. Todo branch não executado recebe status e dependência, nunca checkbox de código concluído.
- [ ] Verificador Terra executa no commit final `pnpm test`, `pnpm typecheck`, `pnpm build`; runtime `uv run --directory runtime pytest -m unit`, `uv run --directory runtime ruff check .`, `uv run --directory runtime lint-imports`.
- [ ] Guardião Astra executa replay integral do zero E upgrade sequencial W0→W1→W2→W3→W4, além de DB/RLS/pipeline conforme a Onda 0, serialmente. Comparar assinaturas, grants e comportamento nas duas rotas. Testes de custo verificam null, limites, arredondamento, pagador e reconciliação; testes de tools verificam teto de tempo/chamadas, cancelamento, tenant e ausência de concessão via modelo.
- [ ] Revisor Astra xhigh recebe diff integral BASE..HEAD, todos os documentos de decisão, reports e dependências dos planos filhos. Sem decisão do usuário ou consumidor confirmado, a revisão não pode aceitar o branch dependente como implementado.
- [ ] Controlador registra no checklist: corrigido/testado, removido, decidido ou dependência externa comprovada. A Onda 7 continua responsável pela comparação/relatório final; nenhuma publicação, migration remota, push ou deploy nesta onda.
