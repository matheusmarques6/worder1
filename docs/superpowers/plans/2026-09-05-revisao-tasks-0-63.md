# Tasks 0–63 Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revalidar cada entrega das fases 0–6 e dos itens 1–63, corrigir regressões com TDD mínimo e terminar com app, runtime e banco verdes.

**Architecture:** O controlador congela um SHA por fase e entrega briefs autocontidos a auditores read-only. Até três auditorias independentes podem rodar em paralelo; qualquer escrita é serial, seguida por review independente e re-review SDD. Evidência histórica é reutilizada, mas todo veredito é confirmado contra o código atual.

**Tech Stack:** Next.js 14, TypeScript 5, Vitest, Python 3.13, pytest, Ruff, import-linter, PostgreSQL/Supabase CLI e Docker.

**Spec:** `docs/superpowers/specs/2026-09-05-revisao-tasks-0-63-design.md`

## Global Constraints

- Trabalhar somente na worktree `.worktrees/review-tasks-0-63-sdd`, branch `review/tasks-0-63-sdd`.
- Preservar a ordem de correção 1 → 63; auditorias read-only podem paralelizar apenas sobre o mesmo SHA congelado.
- Máximo de três auditores read-only simultâneos; máximo de um agente escritor.
- Todo spawn usa `fork_turns: "none"`, modelo e esforço explícitos; nenhum subagente lança subagentes.
- Reutilizar os artefatos antigos em `C:/Users/Usuario/worder/worder1/.superpowers/sdd/AUDITORIA-IA-2026-08-28-CHECKLIST/`; confirmar tudo contra o checklist e o HEAD atual.
- Todo bugfix segue RED → GREEN; nenhum código de produção entra antes de um teste falhar pelo motivo esperado.
- Aplicar Ponytail full: reutilização antes de adição, stdlib/nativo antes de dependência, menor diff no ponto compartilhado por todos os chamadores.
- Não implementar automaticamente as nove pendências declaradas na task 63 nem itens 64–95; somente verificar os cinco XFAILs do item 95.
- Não chamar APIs externas reais, não usar credenciais de produção e não acessar banco de produção.
- Docker/Supabase local está autorizado. Confirmar a identidade do stack e portas antes de conectar.
- Todo gate `db`/`pipeline` usa explicitamente `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres` no mesmo processo; o default 54322 é proibido nesta execução.
- O stack 55322 é único: replay de migrations e testes `db`/`pipeline` são serializados. Antes deles, encerrar testes concorrentes e confirmar projeto/porta; fixtures podem truncar tabelas.
- As cinco falhas iniciais de Vitest são baseline permitido somente até as Tasks 96–97 desta execução; qualquer falha nova bloqueia a fase.
- `pnpm-workspace.yaml` é configuração local temporária para aprovar apenas `esbuild` e `unrs-resolver`; nunca commitar e remover na Task 98.
- Não tocar o `.claude/` não rastreado da árvore original.

---

## Shared Audit and Remediation Protocol

Cada auditoria grava `.superpowers/sdd/2026-09-05-revisao-tasks-0-63/task-N-audit.md` com:

1. requisito reconstruído e commits/diffs examinados;
2. arquivos e todos os chamadores lidos;
3. comandos executados, exit code e contagens;
4. veredito `SPEC`, `CURRENT`, `PONYTAIL` e `TESTS`;
5. findings Critical/Important/Minor com `arquivo:linha`;
6. decisão `CLEAN`, `FIX_REQUIRED`, `KNOWN_GAP` ou `NEEDS_CONTEXT`.

Para cada `FIX_REQUIRED`, o controlador registra `BASE`, retoma ou lança um implementador, exige o
RED do teste direcionado, aceita apenas o menor GREEN, gera `review-package`, lança reviewer e segue
o loop de até cinco rodadas descrito pelo SDD. Um relatório limpo não cria commit vazio.

Gates direcionados usam estes comandos, reduzidos aos arquivos nomeados em cada task:

```powershell
pnpm typecheck
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
$env:SUPABASE_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'
```

Cada task abaixo fornece o comando direcionado com o caminho literal. O gate amplo por fase repete
os gates afetados e compara com o baseline documentado. A última linha é obrigatória na mesma sessão
antes de qualquer pytest com marker `db`/`pipeline`; cada brief DB repete a DSN e exige confirmação
da porta. Nunca usar o default 54322.

## Agent Launch Matrix

| Role | Model / effort | Scope | Reads | Executes | Writes |
|---|---|---|---|---|---|
| Read-only auditor | `gpt-5.6-terra` / `high` | one task; up to three on one frozen SHA | checklist item, historical SDD artifacts/commits, every current caller, named tests | targeted read-only gate; DB only on isolated Supabase | `task-N-audit.md` only |
| Security/DB auditor | `gpt-6-astra` / `high` | Tasks 0, 1, 4, 8, 18–20, 24–26, 32, 43, 46, 49–50 | migrations, grants/RLS, trust boundary, query plan and callers | migration replay, pytest DB/pipeline, EXPLAIN, targeted app gate | audit artifact only |
| Fix implementer | `gpt-5.6-terra` / `high` | exactly one `FIX_REQUIRED`, serial in task order | approved brief, audit, callers and RED test | RED → minimal GREEN → local regression | code/test plus `task-N-report.md` |
| Mechanical deletion implementer | `gpt-5.6-luna` / `medium` | Tasks 54–61 only when the audit finds a concrete residue | deletion contract, import/export graph and fitness tests | deletion-set, typecheck/import-linter | smallest deletion diff plus report |
| Task reviewer | `gpt-6-astra` / `high` | one implementation diff | brief, report, base→head review package | reruns decisive test when needed | `task-N-review.md`; no code |
| Final reviewer | `gpt-6-astra` / `ultra` | whole branch | spec, plan, ledger, every audit/review and base→HEAD diff | inspects final gate evidence | final review only |

Read-only waves are `(1,2,3)`, `(4,5,6)`, `(7,8)`, then groups of at most three in numeric
order through 63. Task 0 runs alone because it owns stack identity/migrations. Findings return to one
ordered queue; the controller resolves Task N completely before accepting any write for Task N+1.
No phase advances until its differential gate and integrated review pass. Tasks 96–98 run only after
the Task 63 review artifact is final. Paralelismo cobre leitura e testes unitários sem estado; qualquer
mutação temporária da árvore, teste DB/pipeline ou migration replay espera todos os outros workers e
roda exclusivamente.

### Task 0: Review Phase 0 CI foundations

**Files:**
- Inspect: `supabase/migrations/20260621_phase0_foundations.sql`
- Inspect: `supabase/migrations/20260817000006_segment_memberships_snapshot.sql`
- Inspect: `runtime/src/agents_runtime/repository/outbox.py`
- Test: `runtime/tests/unit/test_no_sql_outside_repository.py`
- Evidence: `.superpowers/sdd/2026-09-05-revisao-tasks-0-63/task-0-audit.md`

**Interfaces:**
- Consumes: schema limpo, tabelas opcionais e fronteira `domain → repository → psycopg`.
- Produces: baseline confiável de migrations e ownership de `ClaimedSend` para as tasks seguintes.

- [ ] Conferir os três diffs históricos `153d6f2c`, `3672dfc7` e `52e43477`, incluindo guards de tabela e os nove call sites de `ClaimedSend`.
- [ ] Confirmar containers/portas com `docker ps` e `supabase status`; iniciar um stack desta worktree sem reutilizar o Postgres de outro projeto.
- [ ] Rodar `uv run --directory runtime lint-imports` e `uv run --directory runtime pytest tests/unit/test_no_sql_outside_repository.py -m unit`.
- [ ] Aplicar todas as migrations no stack limpo e rodar `uv run --directory runtime pytest -m "db or pipeline"`; registrar contagens e qualquer diferença de plataforma.
- [ ] Gravar os três vereditos separados e só então congelar o SHA da Fase 1.

### Task 1: Review current_user startup assertion

**Files:**
- Inspect: `runtime/src/agents_runtime/repository/scope.py`
- Inspect: `runtime/src/agents_runtime/app.py`
- Inspect: `runtime/tests/db/conftest.py`
- Inspect: `runtime/DEPLOY.md`
- Test: `runtime/tests/db/test_startup_rls_guard.py`

**Interfaces:**
- Consumes: conexões criadas por `app._connect` e propriedades PostgreSQL `rolsuper`/`rolbypassrls`.
- Produces: garantia de que nenhuma conexão de runtime nasce com bypass de RLS.

- [ ] Ler o item 1, `83bc6da9`, reaberturas posteriores e todos os chamadores de `assert_rls_enforced`.
- [ ] Confirmar que pulse, workers e sender passam pelo mesmo seam e que ausência da env recusa startup.
- [ ] Rodar `uv run --directory runtime pytest tests/db/test_startup_rls_guard.py -m db` no stack isolado.
- [ ] Registrar vereditos; qualquer caminho de conexão sem guarda é `FIX_REQUIRED` Critical.

### Task 2: Review authentication in /api/agents/status

**Files:**
- Inspect: `src/app/api/agents/status/route.ts`
- Test: `src/app/api/agents/status/route.test.ts`

**Interfaces:**
- Consumes: `requireOrgFromAuth` e cookie/Bearer da sessão.
- Produces: escrita sempre escopada ao usuário e organização autenticados.

- [ ] Conferir `4a32aee8` e localizar todos os chamadores da rota.
- [ ] Verificar 401 sem sessão, IDs do corpo ignorados e ausência de oráculo cross-tenant.
- [ ] Rodar `pnpm exec vitest run src/app/api/agents/status/route.test.ts` e `pnpm typecheck`.
- [ ] Registrar vereditos e exigir teste negativo antes de qualquer correção.

### Task 3: Review authentication in /api/queue/agents

**Files:**
- Inspect: `src/app/api/queue/agents/route.ts`
- Test: `src/app/api/queue/agents/route.test.ts`

**Interfaces:**
- Consumes: `requireOrgFromAuth` e filtro público `status`.
- Produces: leitura de `agent_status/profiles` sem enumeração cross-tenant.

- [ ] Conferir `662cf6eb`, a distinção entre tenancy e filtro legítimo, e todos os chamadores.
- [ ] Verificar que `organization_id` do cliente nunca governa a consulta e `status` continua funcional.
- [ ] Rodar `pnpm exec vitest run src/app/api/queue/agents/route.test.ts` e `pnpm typecheck`.
- [ ] Registrar vereditos; vazamento de profile é Critical.

### Task 4: Review organization scope in LLM history

**Files:**
- Inspect: `src/app/api/whatsapp/ai/route.ts`
- Inspect: history loader localizado pelo símbolo `loadOwnHistory`
- Test: `src/app/api/whatsapp/ai/route.test.ts`

**Interfaces:**
- Consumes: ownership em `whatsapp_conversations`, sem coluna fictícia em `whatsapp_messages`.
- Produces: histórico inexistente para conversa alheia e zero leitura do segredo antes da guarda.

- [ ] Conferir `6e02dc15`, os dois handlers e todos os chamadores de `loadOwnHistory`.
- [ ] Traçar a consulta para provar que a posse é validada antes da leitura de mensagens.
- [ ] Rodar `pnpm exec vitest run src/app/api/whatsapp/ai/route.test.ts` e `pnpm typecheck`.
- [ ] Registrar vereditos; qualquer leitura cross-tenant é Critical.

### Task 5: Review unified embedding space

**Files:**
- Inspect: `src/lib/ai/embeddings.ts`
- Inspect: `runtime/src/agents_runtime/agent_core/llm.py`
- Inspect: `runtime/src/agents_runtime/repository/knowledge.py`
- Inspect: embedding migrations in `supabase/migrations/`
- Test: `src/lib/ai/__tests__/hub-runtime-parity.test.ts`
- Test: `runtime/tests/db/test_embedding_provenance.py`

**Interfaces:**
- Consumes: modelo, dimensão e `SEARCHABLE_SPACES` compartilhados por writers/readers.
- Produces: embeddings pesquisáveis somente no espaço que os gerou.

- [ ] Conferir `e1d3a1a8`, constraint de paridade null/model e todos os escritores de embedding.
- [ ] Procurar modelos/dimensões hardcoded fora das fontes canônicas e validar o filtro da busca.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/hub-runtime-parity.test.ts` e `uv run --directory runtime pytest tests/db/test_embedding_provenance.py -m db`.
- [ ] Registrar vereditos; modelo divergente ou vetor associado ao chunk errado é Important.

### Task 6: Review media fields in runtime ingest payload

**Files:**
- Inspect: `src/lib/whatsapp/webhook-processor.ts`
- Test: `src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts`
- Test: `src/lib/whatsapp/inbound-media.test.ts`

**Interfaces:**
- Consumes: mensagem Cloud com `media_id`, `mime_type` e `caption`.
- Produces: `p_content` multimídia sem mudar a forma exata de mensagens textuais.

- [ ] Conferir o hunk conjunto `cc2a8dcb` e a correção posterior que preservou ingestão de tipos não suportados.
- [ ] Traçar a serialização da mensagem até `ingest_inbound_message`.
- [ ] Rodar `pnpm exec vitest run src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts src/lib/whatsapp/inbound-media.test.ts`.
- [ ] Gravar veredito próprio para o payload, separado da Task 7.

### Task 7: Review unsupported-type routing

**Files:**
- Inspect: `src/lib/whatsapp/webhook-processor.ts`
- Test: `src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts`

**Interfaces:**
- Consumes: resultado único de `routeInboundForAi`.
- Produces: tipo não suportado entra no histórico, cancela agendamento e não abre turno.

- [ ] Conferir `cc2a8dcb` e `31200c28`, incluindo o teste originalmente errado e sua reescrita.
- [ ] Comparar os ramos legacy/runtime e confirmar que não há cálculo duplicado do route.
- [ ] Rodar `pnpm exec vitest run src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts` e `pnpm typecheck`.
- [ ] Gravar veredito próprio; perda do histórico ou resposta a sticker/documento é Important.

### Task 8: Review ai_agent_chunks indexes

**Files:**
- Inspect: `supabase/migrations/20260828000002_ai_agent_chunks_indexes.sql`
- Inspect: `runtime/src/agents_runtime/repository/knowledge.py`
- Test: `runtime/tests/db/test_ai_agent_chunks_indexes.py`

**Interfaces:**
- Consumes: operador `<=>`, `vector_cosine_ops` e filtro de organização.
- Produces: HNSW utilizável e btree de organização sob guarda de existência da tabela.

- [ ] Conferir `55972096`, o `indexdef` e a query copiada do repository.
- [ ] Rodar `uv run --directory runtime pytest tests/db/test_ai_agent_chunks_indexes.py -m db` e capturar `EXPLAIN`.
- [ ] Não criar índice composto sem evidência de dados; registrar a condição de reabertura existente.
- [ ] Executar o gate diferencial da Fase 1: Vitest completo, typecheck, build, Ruff, import-linter, unit e DB/pipeline; aceitar somente as cinco falhas baseline já nomeadas.

### Task 9: Review rollout-aware coalescer

**Files:**
- Inspect: rollout/coalescer migrations in `supabase/migrations/`
- Test: `runtime/tests/db/test_coalesce_by_rollout.py`
- Test: `runtime/tests/db/test_coalescer.py`

**Interfaces:**
- Consumes: `ai_runtime_rollout` e `p_limit`.
- Produces: jobs somente para runtime e limpeza legacy com orçamento independente.

- [ ] Conferir `bb9acd8d` e `e9995c1d`, inclusive ausência de rollout e competição de lotes.
- [ ] Rodar `uv run --directory runtime pytest tests/db/test_coalesce_by_rollout.py tests/db/test_coalescer.py -m db`.
- [ ] Verificar atomicidade de geração, fila e limpeza sem bump para legacy.
- [ ] Registrar vereditos; starvation ou job após flip-back é Important.

### Task 10: Review channel-status correlation

**Files:**
- Inspect: `src/lib/whatsapp/webhook-processor.ts`
- Inspect: `src/app/api/whatsapp/cloud/webhook/route.ts`
- Inspect: `src/app/api/workers/whatsapp-webhook/route.ts`
- Inspect: correlation migrations in `supabase/migrations/`
- Test: `src/lib/whatsapp/__tests__/webhook-status-correlate.test.ts`
- Test: `runtime/tests/db/test_correlate_outbox_status.py`

**Interfaces:**
- Consumes: `biz_opaque_callback_data`, Meta status e erro opcional.
- Produces: transições válidas de outbox, inclusive `sent → failed`, sem regressão terminal.

- [ ] Conferir `70503186`, `0b515ba8` e `564d024b`, todos os estados e grants da RPC.
- [ ] Rodar os dois testes direcionados com Vitest e pytest DB.
- [ ] Confirmar que `delivered/read` colapsam em `sent` e falha preserva o motivo.
- [ ] Registrar vereditos; status quente que não correlaciona é Important.

### Task 11: Review rollout-aware pending cron

**Files:**
- Inspect: `src/app/api/cron/reprocess-whatsapp-pending/route.ts`
- Inspect: `src/lib/ai/runtime-rollout.ts`
- Test: `src/app/api/cron/reprocess-whatsapp-pending/route.test.ts`
- Test: `src/lib/ai/__tests__/runtime-rollout.test.ts`

**Interfaces:**
- Consumes: modo por organização para cada linha do lote.
- Produces: runtime ignorado sem apagar `ai_pending`; legacy continua reprocessável.

- [ ] Conferir `e957b389`, fase por linha e regra: erro usa cache stale da organização; somente cache frio cai para legacy.
- [ ] Rodar os dois Vitests nomeados; registrar a lacuna de cache `runtime` expirado + erro, que deve manter `ai_enqueued=0`.
- [ ] Verificar contadores scanned/enqueued/failed e ausência da RPC fora do stream como fato histórico da Task 49.
- [ ] Registrar vereditos; modo calculado por lote é Important.

### Task 12: Review runtime-aware conversation badge

**Files:**
- Inspect: `src/lib/ai/conversation-ai-status.ts`
- Test: `src/lib/ai/__tests__/conversation-ai-status.test.ts`

**Interfaces:**
- Consumes: runtime mode, `ai_enabled`, schedule, cooldown, teto, `activate_on` e `stop_on_human_reply`.
- Produces: status/badge com a mesma régua de guards em legacy e runtime após Tasks 30/37.

- [ ] Conferir `ae34087c` e as mudanças posteriores das Tasks 30/37 que removeram o early return do runtime.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/conversation-ai-status.test.ts`.
- [ ] Confirmar `activate_on`, cooldown, teto, `stop_on_human_reply` e schedule nos dois motores.
- [ ] Classificar o contrato posterior como CURRENT, não restaurar o early return histórico.

### Task 13: Review canonical auto-disabled reasons

**Files:**
- Inspect: `src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.ts`
- Inspect: `src/lib/ai/disabled-reasons.ts`
- Test: `src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.test.ts`

**Interfaces:**
- Consumes: `AUTO_DISABLED_REASONS` canônico.
- Produces: reativação sem whitelist duplicada e sem incluir pausa manual.

- [ ] Conferir `0fc5f634` e confirmar por busca que o runtime ainda não escreve os motivos alegados originalmente.
- [ ] Rodar o teste da rota e typecheck.
- [ ] Confirmar que um motivo sintético acrescentado à lista canônica é observado pela rota.
- [ ] Registrar a redefinição de escopo e o achado de produto, sem fabricar writer inexistente.

### Task 14: Review synchronous fallback claim

**Files:**
- Inspect: `src/lib/whatsapp/webhook-processor.ts`
- Inspect: `src/lib/ai/cloud-runner.ts`
- Test: `src/lib/whatsapp/__tests__/webhook-ai-sync-claim.test.ts`

**Interfaces:**
- Consumes: claim atômico de `ai_pending`.
- Produces: um único send; falha transitória libera e permanente consome o claim.

- [ ] Conferir `91d51603` e `7908ff27`, incluindo os chamadores QStash e síncrono.
- [ ] Rodar `pnpm exec vitest run src/lib/whatsapp/__tests__/webhook-ai-sync-claim.test.ts`.
- [ ] Verificar encadeamento de duas entregas e registrar a lacuna DB de atomicidade como conhecida.
- [ ] Qualquer correção precisa reproduzir double-send ou mute com teste antes do código.

### Task 15: Review runtime-rollout documentation contract

**Files:**
- Inspect: `src/lib/ai/runtime-rollout.ts`
- Test: `src/lib/ai/__tests__/runtime-rollout.test.ts`

**Interfaces:**
- Consumes: cache stale e fallback legacy.
- Produces: comentários que descrevem exatamente o comportamento atual.

- [ ] Conferir `6e4dbfad` e `16a5f11b` e buscar todas as cópias das frases corrigidas.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/runtime-rollout.test.ts`.
- [ ] Comparar cada docstring com os ramos de erro/cache; registrar a falta do caso cache `runtime` expirado + erro retornando `runtime`.
- [ ] Registrar vereditos; texto histórico datado não deve ser reescrito.

### Task 16: Review real database import boundary

**Files:**
- Inspect: `runtime/pyproject.toml`
- Inspect: deleted `runtime/src/agents_runtime/repository/driver.py` through git history
- Test: import-linter contracts

**Interfaces:**
- Consumes: todos os módulos top-level de `agents_runtime` e pacote externo `psycopg`.
- Produces: proibição de import direto fora de repository/app com exceções nomeadas.

- [ ] Conferir `6255fc18` e `2f55f367`, lista de módulos e exceções atuais.
- [ ] Rodar `uv run --directory runtime lint-imports`.
- [ ] Inspecionar as três contracts e cobertura dos módulos sem mutar a árvore compartilhada.
- [ ] Registrar veredito separado da Task 17; uma sala não coberta é Important.

### Task 17: Review SET ROLE SQL detector

**Files:**
- Inspect: `runtime/tests/unit/test_no_sql_outside_repository.py`
- Inspect: call sites de `SET ROLE` em `runtime/src/`

**Interfaces:**
- Consumes: detector AST/regex e dívida nomeada por arquivo.
- Produces: qualquer SQL novo fora do repository detectado sem afrouxar o gate.

- [ ] Conferir `b927016d`, os quatro call sites originais e a contagem atual.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_no_sql_outside_repository.py -m unit`.
- [ ] Inspecionar os casos positivos/negativos do detector sem plantar SQL na árvore compartilhada.
- [ ] Executar gate diferencial da Fase 2 completo e lançar review integrado da fase.

### Task 18: Review crawler SSRF boundary

**Files:** `src/lib/ai/ssrf-guard.ts`, `src/lib/ai/crawler.ts`, `src/lib/ai/__tests__/ssrf-guard.test.ts`, `src/lib/ai/__tests__/crawler.test.ts`.

**Interfaces:** URL não confiável → resolução DNS/redirect → fetch permitido ou bloqueio seguro.

- [ ] Conferir os commits `84daa998` e `9cc62ece`, incluindo todos os chamadores do crawler.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/ssrf-guard.test.ts src/lib/ai/__tests__/crawler.test.ts`.
- [ ] Validar IPv4/IPv6 privados e redirects sem rede externa real; registrar DNS rebinding como limitação declarada, não exigir pinagem de IP fora do escopo.
- [ ] Registrar bypass de trust boundary como Critical; correção somente com reprodução RED.

### Task 19: Review custom-tool SSRF boundary

**Files:** `runtime/src/agents_runtime/tools/custom_http.py`, `runtime/src/agents_runtime/tools/ssrf_guard.py`, `runtime/tests/unit/test_custom_http_tool.py`, `runtime/tests/unit/test_ssrf_guard.py`, `src/app/api/ai/custom-tools/[id]/test/route.ts`, `src/app/api/ai/custom-tools/[id]/test/route.test.ts`.

**Interfaces:** configuração de tool não confiável → request validado → resposta limitada e sanitizada.

- [ ] Rastrear URL inicial, cada redirect, download de mídia e limites de corpo/timeout nos dois runtimes.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_custom_http_tool.py tests/unit/test_ssrf_guard.py -m unit` e o Vitest da rota.
- [ ] Confirmar que ambos os lados reutilizam suas guards existentes, sem adicionar cliente HTTP ou abstração nova.
- [ ] Registrar divergência TS/Python explorável como Critical.

### Task 20: Review account-scoped Meta token

**Files:** `runtime/src/agents_runtime/channels/cloud_api.py`, `runtime/src/agents_runtime/repository/`, `runtime/tests/db/test_whatsapp_token_by_account.py`.

**Interfaces:** account/organization → token criptografado correto → chamada Meta do mesmo tenant.

- [ ] Conferir os commits da task e todos os loaders de credencial usados por envio e download.
- [ ] Rodar `uv run --directory runtime pytest tests/db/test_whatsapp_token_by_account.py -m db` no stack isolado.
- [ ] Provar por fixtures de dois tenants que não há fallback cruzado nem leitura global.
- [ ] Registrar vazamento de tenant como Critical.

### Task 21: Review fail-open WhatsApp agent route

**Files:** `src/app/api/whatsapp/agents/me/route.ts`, teste co-localizado, `src/hooks/useAgentPermissions.tsx`, `src/hooks/useAgentPermissions.logic.test.ts`.

**Interfaces:** falha de consulta/autorização → resposta fechada e explícita, nunca sucesso permissivo.

- [ ] Ler a rota, helper de auth e o único consumidor; conferir negação durante loading/falha.
- [ ] Rodar os Vitests da rota e `src/hooks/useAgentPermissions.logic.test.ts`, além de `pnpm typecheck`.
- [ ] Confirmar organização ausente, erro Supabase, usuário não autorizado e cliente em carregamento.
- [ ] Registrar fail-open de auth como Critical.

### Task 22: Review current removal of knowledge deletion route

**Files:** histórico de `src/app/api/ai/knowledge/route.ts`, `src/lib/ai/__tests__/deletion-set.test.ts`, referências encontradas por `rg -n "api/ai/knowledge" src`.

**Interfaces:** endpoint removido pela Task 61 → ausência deliberada e nenhum chamador órfão.

- [ ] Reconstruir o problema de ordem do delete no diff histórico e conciliá-lo com a remoção posterior.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/deletion-set.test.ts` e `pnpm typecheck`.
- [ ] Confirmar ausência do route e de consumidores atuais.
- [ ] Classificar a remoção posterior como CURRENT, sem recriar uma rota morta.

### Task 23: Review AI respond route removal/current contract

**Files:** histórico de `src/app/api/ai/respond/route.ts`, `src/lib/ai/__tests__/deletion-set.test.ts`, chamadores encontrados por `rg -n "api/ai/respond|ai/respond" src`.

**Interfaces:** endpoint histórico → ausência deliberada e nenhum chamador órfão.

- [ ] Reconstruir o requisito da task e conciliá-lo com a remoção posterior da Task 61.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/deletion-set.test.ts` e `pnpm typecheck`.
- [ ] Confirmar que nenhum route import, teste ou documentação operacional depende do endpoint.
- [ ] Classificar a remoção posterior como CURRENT, não como regressão.

### Task 24: Review organization scope in activity views

**Files:** `src/lib/ai/activity.ts`, `src/lib/ai/__tests__/activity.test.ts`, `src/app/api/ai/activity/route.ts`, `runtime/tests/db/test_activity_views.py`, `supabase/migrations/20260813000013_activity_compat_views.sql`.

**Interfaces:** organização autenticada → views/consultas de atividade → somente linhas do tenant.

- [ ] Ler migration, helper, rota e todos os chamadores; conferir `84fc4c62`.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/activity.test.ts` e `uv run --directory runtime pytest tests/db/test_activity_views.py -m db`.
- [ ] Provar isolamento com duas organizações e filtro obrigatório em todas as views.
- [ ] Registrar vazamento cross-tenant como Critical.

### Task 25: Review internal authentication

**Files:** `src/lib/internal-auth.ts`, `src/lib/internal-auth.test.ts`, rotas que importam o helper.

**Interfaces:** segredo/header interno → comparação segura → autorização fechada.

- [ ] Buscar todos os chamadores e comparar os modos de autenticação aceitos.
- [ ] Rodar `pnpm exec vitest run src/lib/internal-auth.test.ts` e os testes das rotas afetadas listados pelo auditor.
- [ ] Validar segredo ausente, malformado e incorreto sem logar o valor.
- [ ] Registrar bypass ou timing-sensitive comparison como Critical.

### Task 26: Review Shopify webhook verification

**Files:** `src/app/api/integrations/shopify/webhook/verify.ts`, `src/app/api/integrations/shopify/webhook/verify.test.ts`, `src/app/api/webhooks/shopify/verify.ts`, `src/app/api/webhooks/shopify/verify.test.ts`.

**Interfaces:** raw body + HMAC → comparação autêntica antes de parsear/processar.

- [ ] Conferir duplicação entre os dois verificadores e todos os chamadores.
- [ ] Rodar os dois Vitests direcionados.
- [ ] Validar body alterado, assinatura inválida/ausente e encoding, preservando comparação constante.
- [ ] Propor consolidação somente se reduzir código sem ampliar superfície.

### Task 27: Review Gemini key transport

**Files:** `src/lib/whatsapp/ai-providers.ts`, `src/lib/whatsapp/ai-providers.test.ts`, consumidores da lista de providers.

**Interfaces:** chave Gemini server-side → header autorizado, nunca query string ou log de URL.

- [ ] Conferir `1d23c5ce`, todos os imports e as URLs/headers efetivamente construídos.
- [ ] Rodar `pnpm exec vitest run src/lib/whatsapp/ai-providers.test.ts`.
- [ ] Buscar chave em query strings, logs, erros e bundles client-side.
- [ ] Registrar exposição de segredo como Critical.

### Task 28: Review structured runtime logging

**Files:** `runtime/src/agents_runtime/obs/logging.py`, `runtime/src/agents_runtime/obs/telemetry.py`, `runtime/tests/unit/test_obs.py`.

**Interfaces:** evento interno → log estruturado correlacionável e redigido.

- [ ] Conferir contexto, correlation ids e redaction contra todos os chamadores.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_obs.py -m unit` e `uv run --directory runtime ruff check .`.
- [ ] Validar exceção e campos sensíveis sem duplicar logs.
- [ ] Executar gate diferencial da Fase 3 completo e lançar review integrado da fase.

### Task 29: Review runtime fork/ownership map

**Files:** `runtime/FORK.md`, `runtime/src/agents_runtime/`, imports e entrypoints citados no documento.

**Interfaces:** mapa de ownership/fork → módulos atuais e fronteiras operacionais reais.

- [ ] Comparar cada afirmação de `FORK.md` com caminhos, imports e entrypoints atuais.
- [ ] Rodar `uv run --directory runtime lint-imports` e `uv run --directory runtime pytest tests/unit/test_no_sql_outside_repository.py -m unit`.
- [ ] Remover ou corrigir somente documentação comprovadamente obsoleta; não criar arquitetura futura.
- [ ] Registrar módulo sem dono ou fronteira falsa como Important.

### Task 30: Review behavior guards parity

**Files:** `runtime/src/agents_runtime/agent_core/guards.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/tests/unit/test_behavior_guards.py`, `runtime/tests/db/test_responder_guards.py`, `src/lib/ai/guards.ts`, `src/lib/ai/cloud-runner.ts`, `src/lib/ai/conversation-ai-status.ts`, `src/lib/ai/__tests__/guards.test.ts`, `src/lib/ai/__tests__/cloud-runner-guards.test.ts`, `src/lib/ai/__tests__/conversation-ai-status.test.ts`.

**Interfaces:** estado da conversa/agente → permissão ou bloqueio equivalente nos runtimes.

- [ ] Mapear os oito guards, seus dois produtores Python, handoff/alerta persistente e status/badge TS.
- [ ] Rodar os dois pytest e os três Vitests nomeados.
- [ ] Validar pausa manual, opt-out, agente inativo, concorrência e paridade da UI.
- [ ] Corrigir a camada compartilhada, nunca guardas duplicadas nos chamadores.

### Task 31: Review honest media degradation

**Files:** `runtime/src/agents_runtime/agent_core/media.py`, `runtime/tests/unit/test_inbound_media.py`, `runtime/tests/db/test_responder_guards.py`, `src/lib/whatsapp/inbound-media.test.ts`, `src/lib/ai/media/`.

**Interfaces:** áudio/imagem → caption como texto ou `media_fallback.mode=handoff`, sem fingir STT/visão inexistente.

- [ ] Traçar caption e fallback até responder/handoff, comparando com o caminho legado.
- [ ] Rodar pytest inbound-media/responder-guards e `pnpm exec vitest run src/lib/whatsapp/inbound-media.test.ts`.
- [ ] Validar áudio/imagem sem legenda, caption presente e tipos já suportados.
- [ ] Registrar resposta fabricada em mídia não compreendida como Important.

### Task 32: Review Meta-tier throttle breaker

**Files:** `runtime/src/agents_runtime/queueing/sender.py`, migrations `20260901000004` a `20260901000008`, `runtime/tests/db/test_send_guard.py`, `runtime/tests/db/test_send_guard_wiring.py`.

**Interfaces:** resultado Graph por `phone_number_id`/tier → breaker SQL, cooldown e half-open.

- [ ] Traçar uma chamada Graph completa até registro/consulta do breaker por conta.
- [ ] Rodar `uv run --directory runtime pytest tests/db/test_send_guard.py tests/db/test_send_guard_wiring.py -m db`.
- [ ] Validar 5 falhas/30 s, half-open de 3 sucessos e excessos 10/20/50 → 1/5/10 min.
- [ ] Registrar tier/account errado ou breaker não invocado como Critical.

### Task 33: Review Shopify retry and rate limit

**Files:** `runtime/src/agents_runtime/connectors/shopify.py`, `runtime/tests/unit/test_shopify_connector.py`, `runtime/tests/unit/test_no_direct_clock.py`.

**Interfaces:** request Shopify/cupom → retry com `Clock` e orçamento total de 6 s → resultado confirmado.

- [ ] Ler connector e callers, com foco em 422 de price-rule, `discount_code`, 429 e retry budget.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_shopify_connector.py tests/unit/test_no_direct_clock.py -m unit`.
- [ ] Validar 422 sem confirmação, 429, `Retry-After` e teto cumulativo de 6 s.
- [ ] Reusar cliente/política já instalados; não criar wrapper adicional.

### Task 34: Review Cloud API template shape

**Files:** `runtime/src/agents_runtime/channels/cloud_api.py`, `runtime/tests/unit/test_cloud_api_channel.py`, `runtime/tests/db/test_whatsapp_template_shape.py`, `runtime/tests/db/test_cloud_api_channel_real_wiring.py`, `src/lib/whatsapp/template-components.ts`, `src/lib/whatsapp/template-components.test.ts`.

**Interfaces:** template interno → payload Meta válido e account-scoped.

- [ ] Comparar builder TS/Python, todos os tipos de componente e chamadores.
- [ ] Rodar os três pytest nomeados com seus markers e `pnpm exec vitest run src/lib/whatsapp/template-components.test.ts`.
- [ ] Validar ordem, botão, mídia, variável ausente e rejeição Meta simulada.
- [ ] Registrar payload divergente que impede envio como Important.

### Task 35: Review WhatsApp API version pinning

**Files:** `src/lib/whatsapp/api-version.ts`, `runtime/src/agents_runtime/channels/cloud_api.py`, `runtime/src/agents_runtime/connectors/shopify.py`, `render.yaml`, `runtime/DEPLOY.md`, arquivos `.env.example`.

**Interfaces:** versão configurada → todos os URLs/documentos de deploy usam a mesma fonte de verdade.

- [ ] Verificar somente Meta runtime `v22.0`, Shopify runtime `2026-04` e preservação de `AGENTS_META_API_VERSION`; registrar Ads/Instagram/pixel TS como fora do par.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_shopify_connector.py -m unit`, buscas dirigidas e `pnpm typecheck`.
- [ ] Conferir `runtime/.env.piloto.example`, Render e DEPLOY sem impor fonte única entre superfícies não pareadas.
- [ ] Preferir constante/config existente; não criar registry de versões.

### Task 36: Review missing Python providers

**Files:** `runtime/src/agents_runtime/agent_core/providers.py`, `runtime/src/agents_runtime/agent_core/direct_providers.py`, `runtime/tests/unit/test_provider_cascade.py`, `runtime/tests/unit/test_no_provider_network.py`.

**Interfaces:** Groq/DeepSeek/Gemini/alias `google` + `base_url` da organização → cliente OpenAI-compatible correto.

- [ ] Traçar seleção, aliases, endpoints e `base_url` organization-scoped.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_provider_cascade.py tests/unit/test_no_provider_network.py -m unit`.
- [ ] Provar os quatro providers sem rede real e sem adapter novo.
- [ ] Registrar provider que ignora `base_url`/key do tenant como Critical.

### Task 37: Review migrated-org usage trail and status

**Files:** `supabase/migrations/20260902000001_ai_usage_logs_bridge.sql`, `runtime/tests/unit/test_ai_usage_logs_bridge.py`, `runtime/tests/db/test_llm_calls_persistence.py`, `src/lib/ai/conversation-ai-status.ts`, `src/lib/ai/bot-badge.ts`, `src/lib/ai/__tests__/conversation-ai-status.test.ts`, `src/lib/ai/__tests__/bot-badge.test.ts`.

**Interfaces:** `internal.llm_calls` → `public.ai_usage_logs`; runtime mode → status/badge honesto.

- [ ] Conferir bridge, persistência e consumidores; manter `agent_traces` explicitamente fora (item 65).
- [ ] Rodar pytest bridge/persistence e os dois Vitests de status/badge.
- [ ] Validar organização migrada, runtime desligado e ausência de trace sem alegar paridade inexistente.
- [ ] Registrar uso não espelhado ou UI enganosa como Important.

### Task 38: Review read receipt and typing indicator

**Files:** `supabase/migrations/20260902000002_claim_outbox_last_inbound_wamid.sql`, `runtime/src/agents_runtime/repository/outbox.py`, `runtime/src/agents_runtime/repository/engine.py`, `runtime/src/agents_runtime/queueing/sender.py`, `runtime/src/agents_runtime/channels/cloud_api.py`, `runtime/tests/db/test_outbox_claim.py`, `runtime/tests/unit/test_humanize.py`, `runtime/tests/unit/test_cloud_api_channel.py`.

**Interfaces:** último WAMID inbound + bolha humanizada de texto → `status: read` e `typing_indicator` best-effort.

- [ ] Traçar claim do último WAMID e payloads Meta até o sender.
- [ ] Rodar pytest DB `test_outbox_claim.py` e unit `test_humanize.py test_cloud_api_channel.py`.
- [ ] Validar best-effort, silêncio sem WAMID e ausência do indicador para conteúdo não textual.
- [ ] Executar gate diferencial da Fase 4 completo e lançar review integrado da fase.

### Task 39: Review transcript and prompt assembly

**Files:** `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/prompt_compiler.py`, `runtime/src/agents_runtime/repository/agent.py`, `runtime/src/agents_runtime/server.py`, `runtime/tests/unit/test_prompt_compiler_blocks.py`, `runtime/tests/db/test_agent_loaders.py`, `runtime/tests/db/test_responder_guards.py`, `runtime/tests/db/test_server.py`.

**Interfaces:** chat carregado uma vez → bloco CONVERSA uma vez no turno; dump completo permanece apenas no preview.

- [ ] Traçar loader, responder, compiler e server até a montagem final; conferir `7ec48247`.
- [ ] Rodar o teste unit `TestTheConversationBlockDoesNotDuplicateTheChatArray` e os três arquivos DB nomeados.
- [ ] Validar uma única cópia no turno e divergência deliberada do preview.
- [ ] Registrar dado cross-tenant como Critical e duplicação como Important.

### Task 40: Review provider client lifecycle

**Files:** `runtime/src/agents_runtime/agent_core/providers.py`, `runtime/src/agents_runtime/agent_core/direct_providers.py`, `runtime/src/agents_runtime/agent_core/openrouter.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/tests/unit/test_agent_llm_closes_after_the_turn.py`.

**Interfaces:** cliente HTTPX BYO por turno → fechamento em sucesso/exceção/cancelamento; cliente da plataforma permanece aberto.

- [ ] Traçar ownership retornado por cada provider e os dois consumers.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_agent_llm_closes_after_the_turn.py -m unit`.
- [ ] Validar sucesso, cancelamento, exceção e cliente de plataforma não fechado.
- [ ] Não adicionar context manager novo se o existente puder ser usado diretamente.

### Task 41: Review per-turn LLM budget

**Files:** `runtime/src/agents_runtime/agent_core/metering.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/judges/pre_send.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/tests/unit/test_llm_metering.py`, `runtime/tests/unit/test_pre_send_judge.py`.

**Interfaces:** `TurnBudget` compartilhado → gate antes de cada rede LLM em responder/toucher/judge.

- [ ] Traçar todas as chamadas de rede e confirmar `TestEveryMeteredCallSiteIsBudgeted`.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_llm_metering.py tests/unit/test_pre_send_judge.py -m unit`.
- [ ] Validar cap compartilhado e bloqueio antes da rede em responder e toucher.
- [ ] Corrigir no ponto comum do medidor, não em cada provider.

### Task 42: Review provider-derived unknown cost

**Files:** `src/lib/ai/cost-tracker.ts`, `src/lib/ai/budget.ts`, `src/lib/ai/__tests__/cost-tracker.test.ts`, `src/lib/ai/__tests__/budget.test.ts`, `supabase/migrations/20260902000003_ai_usage_logs_cost_usd_unknown.sql`, `runtime/tests/unit/test_ai_usage_logs_bridge.py`.

**Interfaces:** preço retornado pelo provider → custo conhecido ou `null` + `hasUnknownCost`, nunca `$0` inventado.

- [ ] Traçar cost tracker/budget, migration e bridge Python.
- [ ] Rodar os dois Vitests e `uv run --directory runtime pytest tests/unit/test_ai_usage_logs_bridge.py -m unit`.
- [ ] Aplicar migration no Postgres isolado e validar modelo desconhecido como `null`, conhecido e null histórico.
- [ ] Registrar custo desconhecido tratado como zero como Important.

### Task 43: Review knowledge retrieval/RAG

**Files:** `src/lib/ai/rag.ts`, `supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql`, `src/lib/debug-guard.ts`, `src/lib/debug-guard.test.ts`, `runtime/tests/db/test_knowledge_retrieval.py` como referência Python.

**Interfaces:** RAG TS → RPC organization-scoped sem full scan; `/api/ai/test` → segredo de debug fechado.

- [ ] Confirmar remoção do fallback de full scan, assinatura/grants da RPC e todos os callers.
- [ ] Rodar `pnpm exec vitest run src/lib/debug-guard.test.ts`, `pnpm typecheck` e aplicar/testar a RPC no Postgres isolado.
- [ ] Validar tenant, função ausente e segredo de debug ausente/incorreto; não inventar Vitest RAG inexistente.
- [ ] Registrar bypass RLS como Critical e consulta não indexável como Important.

### Task 44: Review responder/toucher seam parity

**Files:** `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/src/agents_runtime/agent_core/llm.py`, `runtime/src/agents_runtime/agent_core/prompt_compiler.py`, `runtime/src/agents_runtime/judges/pre_send.py`, `runtime/tests/unit/test_pre_send_judge.py`, `runtime/tests/db/test_toucher.py`, `runtime/tests/db/test_responder_guards.py`.

**Interfaces:** responder/toucher → mesmo envelope JSON, handoff, `delivery_flags` e tools anunciadas.

- [ ] Comparar os quatro seams sem prescrever fatoração de `_prepare_turn`, explicitamente recusada no checklist.
- [ ] Rodar pytest pre-send unit e toucher/responder-guards DB.
- [ ] Validar envelope, retorno de handoff, flags e tools em ambos os fluxos.
- [ ] Registrar divergência comportamental como Important; duplicação estrutural isolada como Ponytail.

### Task 45: Review preview and runtime server contract

**Files:** `runtime/src/agents_runtime/server.py`, `runtime/src/agents_runtime/agent_core/prompt_compiler.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/src/agents_runtime/repository/moments.py`, `runtime/src/agents_runtime/commerce/moments.py`, `runtime/tests/unit/test_agent_block_has_one_producer.py`, `runtime/tests/unit/test_listener_connects_in_one_guarded_place.py`, `runtime/tests/unit/test_prompt_compiler_blocks.py`, `runtime/tests/db/test_server.py`.

**Interfaces:** preview e turno → mesmos `AgentBlock`/restrições de momentos; transcript, RAG e `window_open` permanecem divergências deliberadas.

- [ ] Comparar produtores de AgentBlock e momentos, registrando as três divergências deliberadas.
- [ ] Rodar os três pytest unit nomeados e `uv run --directory runtime pytest tests/db/test_server.py -m db`.
- [ ] Validar um produtor do bloco, listener guardado e preview sem side effects; não exigir teste de rota inexistente.
- [ ] Registrar divergência material de prompt como Important.

### Task 46: Review incentive expiry sweep index

**Files:** `supabase/migrations/20260903000001_incentive_grants_expiry_sweep_idx.sql`, `supabase/migrations/20260813000011_grant_lifecycle.sql`, `runtime/src/agents_runtime/queueing/sender.py`, `runtime/tests/db/test_grant_lifecycle.py`.

**Interfaces:** sweep cross-org `expire_incentive_grants` → índice parcial compatível com o predicado.

- [ ] Comparar o predicado real da função com definição/catálogo do índice.
- [ ] Aplicar migrations e rodar `uv run --directory runtime pytest tests/db/test_grant_lifecycle.py -m db`.
- [ ] Rodar `EXPLAIN (ANALYZE, BUFFERS)` com dados sintéticos; o teste de lifecycle preserva resultado, não prova o plano.
- [ ] Só alterar índice com evidência do planner e custo de escrita registrado.

### Task 47: Review rejected outbox outcome handling

**Files:** `runtime/src/agents_runtime/queueing/sender.py`, `runtime/src/agents_runtime/repository/outbox.py`, `runtime/src/agents_runtime/obs/telemetry.py`, `runtime/tests/unit/test_sender_records_the_outcome.py`, `runtime/tests/db/test_correlate_outbox_status.py`.

**Interfaces:** `mark_outbox_sent/failed` recusado → span/chip honestos e hold transitório reencaminhado.

- [ ] Traçar o retorno descartado nos caminhos sent e três failed, incluindo hold transitório.
- [ ] Rodar os dois testes nomeados com markers corretos.
- [ ] Validar escrita aceita/recusada, requeue e chip terminal sem mentir.
- [ ] Registrar perda silenciosa ou estado terminal falso como Critical.

### Task 48: Review health check connection lifecycle

**Files:** `runtime/src/agents_runtime/server.py`, `runtime/src/agents_runtime/app.py`, `runtime/src/agents_runtime/__main__.py`, `runtime/tests/unit/test_healthz_reuses_one_connection.py`, `runtime/tests/db/test_server.py`.

**Interfaces:** `/healthz` → uma conexão guardada por processo via `app._connect`, reaberta se quebrar e fechada no shutdown.

- [ ] Traçar conexão exclusiva do healthz, lock, reabertura RLS-guarded e shutdown; pooling de turnos fica fora.
- [ ] Rodar os testes unit e DB nomeados.
- [ ] Validar banco indisponível, pool fechado e chamadas repetidas.
- [ ] Evitar framework/health abstraction; corrigir o lifecycle existente.

### Task 49: Review versioned database RPC consumers

**Files:** `supabase/migrations/20260903000002_get_active_agent_for_conversation_versioned.sql`, `supabase/migrations/20260902000001_ai_usage_logs_bridge.sql`, `runtime/tests/unit/test_ai_usage_logs_bridge.py`, `src/lib/ai/cloud-runner.ts`, `src/lib/ai/cloud-sender.ts`, `src/lib/ai/cloud-sender.test.ts`, `src/lib/ai/conversation-ai-status.ts`, `src/lib/ai/__tests__/conversation-ai-status.test.ts`.

**Interfaces:** três callers TS → `get_active_agent_for_conversation` versionada; grant de `ai_usage_logs` permanece guardado.

- [ ] Conferir a única RPC promovida, seus três `.rpc()` e o guard do `GRANT` separado.
- [ ] Rodar os três testes direcionados e os testes DB da RPC localizados.
- [ ] Aplicar o stream completo de migrations do zero e validar função/grant/callers.
- [ ] Registrar breaking change sem compatibilidade como Critical.

### Task 50: Review hot-query indexes

**Files:** `supabase/migrations/20260903000003_shopify_orders_org_email_lower_idx.sql`, `supabase/migrations/20260903000004_whatsapp_cloud_conversations_org_wa_id_idx.sql`, `runtime/src/agents_runtime/repository/orders.py`, `runtime/tests/unit/test_no_max_seq.py`.

**Interfaces:** filtros/joins reais → índice compatível → plano sem scan evitável, preservando writes.

- [ ] Verificar somente `shopify_orders (organization_id, lower(email))` e `whatsapp_cloud_conversations (organization_id, wa_id)`; opt-out/cupom ficam fora.
- [ ] No Supabase isolado, rodar migrations e `EXPLAIN (ANALYZE, BUFFERS)` com dados sintéticos suficientes para o planner.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_no_max_seq.py -m unit` e inventário dos índices no banco vivo.
- [ ] Só remover/adicionar índice com plano comprovado; registrar custo de escrita e rollback.

### Task 51: Review Shopify idempotent retry identity

**Files:** `runtime/src/agents_runtime/connectors/shopify.py`, `runtime/src/agents_runtime/commerce/offer_engine.py`, `runtime/tests/unit/test_shopify_connector.py`, `runtime/tests/pipeline/test_scenarios_c.py` apenas como evidência da função DLQ órfã.

**Interfaces:** código de desconto já tomado → confirmar quatro termos da `PriceRule` ou falhar fechado.

- [ ] Traçar retry do cupom e os quatro campos comparados; corrida DLQ/unique ficam nos itens 81/82.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_shopify_connector.py -m unit`, focando `TestIdempotentRetry`.
- [ ] Validar escala decimal, `usage_limit` string, campo ausente e divergência fechada.
- [ ] Registrar reuso de regra divergente como Critical.

### Task 52: Review disabled cascade ownership contract

**Files:** `runtime/src/agents_runtime/agent_core/providers.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/tests/unit/test_provider_cascade.py`, `runtime/tests/unit/test_agent_llm_closes_after_the_turn.py`.

**Interfaces:** degrau 3 desligado → ownership explícito do LLM impede fechamento futuro do cliente de plataforma.

- [ ] Confirmar que o degrau 3 continua desativado e quem construiu/possui cada port.
- [ ] Rodar os dois pytest unit nomeados, incluindo `TestWhoBuiltThePort`.
- [ ] Validar cliente da plataforma não fechado; não editar env/deploy nesta task.
- [ ] Não ativar cascade nem criar adapter.

### Task 53: Review pinned never-say-AI judge policy

**Files:** `runtime/src/agents_runtime/repository/agent.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`, `runtime/src/agents_runtime/agent_core/prompt_compiler.py`, `runtime/src/agents_runtime/judges/pre_send.py`, `runtime/tests/db/test_agent_loaders.py`, `runtime/tests/unit/test_pre_send_judge.py`.

**Interfaces:** literal pinado no loader → `JudgeContext` de responder/toucher; não é coluna nem regra do prompt.

- [ ] Traçar loader → responder/toucher → judge e provar que a disclosure line do prompt não muda.
- [ ] Rodar os testes DB/unit existentes e registrar a ausência da prova loader→flows como `KNOWN_GAP` da Task 63; não implementá-la neste escopo.
- [ ] Validar true/false sem alegar coluna ou preview.
- [ ] Executar gate diferencial da Fase 5 completo e lançar review integrado da fase.

### Task 54: Review mojibake prevention in two fixtures

**Files:** `runtime/tests/unit/test_secret_box_vectors.py`, `runtime/tests/unit/test_humanize.py`, `runtime/tests/unit/test_text_io_declares_its_encoding.py`.

**Interfaces:** duas fixtures textuais → leitura UTF-8 explícita sem mojibake silencioso no Windows.

- [ ] Conferir exatamente as leituras nas linhas apontadas e o fitness AST.
- [ ] Rodar `uv run --directory runtime pytest tests/unit/test_text_io_declares_its_encoding.py -m unit`; Ruff não substitui esse gate.
- [ ] Confirmar que as duas formas `Path(...)/... .read_text()` são detectadas.
- [ ] Usar parâmetros stdlib; não criar helper de I/O.

### Task 55: Review deleted action chain

**Files:** cadeia TS `actions-engine`/intent/sentiment removida, `src/lib/ai/engine.ts`, `src/lib/ai/__tests__/deletion-set.test.ts`, resíduo histórico `sql/ai-agents-complete-migration.sql`.

**Interfaces:** remoção D8 → pós-processamento preservado; triggers intent/sentiment/time deliberadamente não migrados; tabela `ai_agent_actions` não dropada.

- [ ] Conferir diff e buscar cada símbolo removido sem confundir o SQL fora do stream com migration ativa.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/deletion-set.test.ts`, `pnpm typecheck` e `pnpm build`.
- [ ] Confirmar `engine.ts` pós-processamento e registrar a perda deliberada dos triggers, sem inventar substituição.
- [ ] Registrar import/runtime path órfão como Important.

### Task 56: Review deleted prompt/test layers

**Files:** histórico de `runtime/src/agents_runtime/agent_core/prompt.py` e `runtime/tests/unit/test_prompt_layers.py`, `runtime/tests/unit/test_prompt_compiler_blocks.py`, `runtime/tests/unit/test_agent_block_has_one_producer.py`, `runtime/tests/unit/test_think_gate.py`, `runtime/src/agents_runtime/repository/missions.py`.

**Interfaces:** prompt antigo removido → `AgentConfig`/`TenantPolicy` e guards ativos preservados; seleção por `event_type` segue lacuna da 63.

- [ ] Comparar arquivos removidos com imports e tipos atuais.
- [ ] Rodar os três pytest unit nomeados e `uv run --directory runtime lint-imports`.
- [ ] Confirmar guards/tipos preservados e que `test_mission_resolver.py::TestArbitration` não prova `event_type`.
- [ ] Registrar duplicação sobrevivente como Ponytail; comportamento perdido como Important.

### Task 57: Review eval harness deletion/pack retention

**Files:** `runtime/src/agents_runtime/evals/pack/`, `runtime/src/agents_runtime/evals/pack.py`, `runtime/src/agents_runtime/evals/rubrics.py`, `runtime/Dockerfile`, `runtime/tests/unit/test_pack_traceability.py`, `runtime/tests/unit/test_responder_factory.py`, `runtime/tests/unit/test_rubric_scoring.py`, histórico do harness/persistência removidos.

**Interfaces:** harness/persistência removidos → pack JSON, loader e rubricas de produção preservados e copiados no container.

- [ ] Traçar uso de pack/rubrics, Docker COPY e ausência do harness.
- [ ] Rodar os três pytest unit nomeados.
- [ ] Confirmar JSONs necessários no build do container; não deletar pack vivo por associação ao harness.
- [ ] Validar que a remoção não eliminou gate de produção.

### Task 58: Review deleted integration route/test

**Files:** histórico de `src/lib/ai/whatsapp-integration.ts`, histórico de `src/app/api/ai/test/webhook/route.ts`, sucessor `src/app/api/ai/test/cloud-webhook/route.ts`, `scripts/test-ai-system.sh`, `test-commands.sh`, `src/lib/ai/__tests__/deletion-set.test.ts`.

**Interfaces:** superfície HTTP removida → nenhum consumidor ou artefato de build restante.

- [ ] Confirmar as duas remoções e buscar imports/comentários/curls antigos.
- [ ] Rodar deletion-set, `pnpm typecheck` e `pnpm build`.
- [ ] Confirmar que o sucessor exige `accountId`/`skipSend` e que os curls antigos não alegam contrato falso.
- [ ] Não redirecionar o endpoint removido para o sucessor incompatível.

### Task 59: Review Python tool registry/customer deletion

**Files:** histórico de `runtime/src/agents_runtime/tools/registry.py` e `runtime/src/agents_runtime/tools/customer.py`, `runtime/tests/db/test_tools.py`, `runtime/tests/unit/test_mission_resolver.py`, `src/lib/ai/__tests__/hub-runtime-parity.test.ts`; registries TS permanecem vivos.

**Interfaces:** registries Python deletados → dispatch ativo preservado; registry/catalog TS permanecem fora da remoção.

- [ ] Conferir ausência dos dois módulos e imports Python sem exigir remoção dos registries TS.
- [ ] Rodar `uv run --directory runtime lint-imports`, `uv run --directory runtime pytest tests/db/test_tools.py -m db` e o Vitest de parity.
- [ ] Registrar `enabled_tools` desconhecida silenciosa como lacuna da Task 63, não como guard já existente.
- [ ] Registrar tool habilitada sem implementação como Important.

### Task 60: Review residual dead code and polling

**Files:** cache/RAG e `scenario_prompts` removidos via histórico, `runtime/tests/unit/test_weighted_polling.py`, `runtime/tests/unit/test_agent_block_has_one_producer.py`, `runtime/tests/unit/test_purchase_prompt.py`, `runtime/tests/db/test_purchase_history.py`, `q_scheduled` e `pending_defaults.py` preservados.

**Interfaces:** leftovers deletados → `first_order_at`/`ChannelBlock.constraints` ausentes; `q_scheduled`/pending defaults permanecem por RNF-022.

- [ ] Conferir cache/RAG morto, `scenario_prompts`, `first_order_at` e constraints removidos.
- [ ] Rodar os três pytest unit nomeados e `uv run --directory runtime pytest tests/db/test_purchase_history.py -m db`.
- [ ] Confirmar `q_scheduled` e `pending_defaults.py` preservados; não classificá-los como dead code.
- [ ] Preferir apagar apenas leftovers comprovados, sem facade.

### Task 61: Review orphan route deletion

**Files:** histórico das rotas `whatsapp/conversations/[id]/ai`, `ai/respond`, `ai/knowledge`, `ai/models`, hook `useAgents`, `ai/agents/[id]/integrations` e analytics AI; `src/hooks/index.ts`, `src/components/whatsapp/analytics/index.ts`, `src/lib/ai/__tests__/deletion-set.test.ts`.

**Interfaces:** árvore App Router → somente endpoints com consumidores/requisitos atuais.

- [ ] Enumerar os seis alvos e remoções de barris; preservar forwarders Meta e `action_whatsapp_ai` explicitamente fora.
- [ ] Rodar deletion-set, `pnpm typecheck` e `pnpm build`.
- [ ] Conferir Tasks 22/23 e o risco RLS histórico do primeiro alvo, registrando a evolução do contrato.
- [ ] Restaurar rota somente mediante caller real e teste RED.

### Task 62: Review environment contract drift

**Files:** `.env.example`, `runtime/.env.bancada.example`, `runtime/.env.piloto.example`, `render.yaml`, `runtime/DEPLOY.md`, `src/lib/ai/__tests__/env-example-parity.test.ts`, `runtime/tests/unit/test_channel_env.py`, `runtime/tests/unit/test_responder_is_required.py`.

**Interfaces:** variáveis documentadas/deploy → loaders TS/Python → startup determinístico.

- [ ] Comparar nomes, defaults, segredos, obrigatoriedade e variáveis não usadas nos arquivos que existem.
- [ ] Rodar o Vitest de env parity e os dois pytest unit nomeados, além de typecheck/Ruff.
- [ ] Validar produção simulada com segredo ausente sem expor valores.
- [ ] Preservar `AGENTS_CHANNEL` ausente da bancada como contrato de segurança; remover config morta, nunca segredo real.

### Task 63: Review completion proof and declared live gaps

**Files:** `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`, implementações/testes ligados às nove lacunas, `runtime/tests/unit/test_node_delta.py`, `runtime/tests/unit/test_llm_port.py`, `src/lib/ai/__tests__/embeddings.test.ts`, testes de env/paridade.

**Interfaces:** checklist/evidência → implementação atual → conclusão honesta; nenhum XFAIL vira XPASS silencioso.

- [ ] Auditar `agent_llm_from_org_keys/no_org_llm_key` em responder/toucher contra provider-cascade, resolved-names e fluxos DB.
- [ ] Auditar `mission.event_type` em `repository/missions.py` e desenhar o gate DB em `test_agent_loaders.py`.
- [ ] Auditar `last_order_at=max(...)` em `repository/orders.py` contra `test_purchase_history.py`.
- [ ] Auditar transcript/`exclude_inbound_after_seq` em `repository/agent.py` contra `test_agent_loaders.py`.
- [ ] Auditar origem de `tool_calls.tool_name` no responder contra `test_responder_tool_loop.py`.
- [ ] Auditar RLS de uma tool não-knowledge usando `test_create_coupon_tool.py` com tenant estranho.
- [ ] Auditar loader→responder/toucher de `never_say_ai` contra judge e testes DB.
- [ ] Auditar `server._read_request` malformado e especificar unit puro do parser.
- [ ] Auditar `enabled_tools` desconhecida contra `test_mission_resolver.py` e decisão documentada em `FORK.md`.
- [ ] Rodar os testes direcionados existentes e `uv run --directory runtime pytest tests/unit/test_node_delta.py tests/unit/test_llm_port.py -m unit -q -rxX`.
- [ ] Exigir exatamente os cinco XFAILs conhecidos do item 95; qualquer XPASS ou regressão falha o gate.
- [ ] Rodar `pnpm exec vitest run src/lib/ai/__tests__/embeddings.test.ts` e testes de env/paridade localizados.
- [ ] Não implementar as nove lacunas: produzir `KNOWN_GAP` com evidência e recomendação priorizada.
- [ ] Executar gate diferencial da Fase 6 completo e lançar review integrado da fase.

### Task 96: Repair report date/timezone baseline failures

**Files:** `src/lib/reports/utils.ts`, `src/tests/reports-utils.test.ts`, todos os chamadores encontrados por `rg -n "formatDate\(|formatDateRange\(" src`.

**Interfaces:** data civil ISO/data instantânea → exibição pt-BR sem deslocar o dia civil.

- [ ] Invocar `superpowers:systematic-debugging`; reproduzir isoladamente as três falhas atuais e identificar se o contrato distingue date-only de timestamp.
- [ ] Ler todos os callers e escolher a menor correção no helper compartilhado.
- [ ] Escrever/ajustar um teste RED que fixe date-only e um timestamp com offset antes do código de produção.
- [ ] Rodar `pnpm exec vitest run src/tests/reports-utils.test.ts` até GREEN e depois testes de relatórios relacionados.
- [ ] Lançar reviewer SDD independente; não trocar timezone global nem adicionar biblioteca de datas.

### Task 97: Repair DOCX/PDF extractor baseline failures

**Files:** `src/lib/ai/processors/file-extractor.ts`, `src/lib/ai/processors/file-extractor.test.ts`, `src/lib/ai/processors/file-extractor.integration.test.ts`, fixtures criadas pelos testes.

**Interfaces:** bytes de arquivo suportado → texto real extraído dentro do timeout; arquivo inválido → erro controlado.

- [ ] Invocar `superpowers:systematic-debugging`; reproduzir separadamente timeout DOCX e corrupção/metadata PDF.
- [ ] Inspecionar geração das fixtures e lifecycle das libs antes de alterar timeout ou parser.
- [ ] Preservar testes RED mínimos para DOCX válido e PDF válido; não mascarar corrupção aumentando timeout.
- [ ] Aplicar a menor correção na fixture ou produção conforme a causa comprovada.
- [ ] Rodar os dois arquivos de teste direcionados e lançar reviewer SDD independente.

### Task 98: Final gates, Ponytail audit and SDD review

**Files:** todos os arquivos alterados, ledger/briefs/reports/reviews em `.superpowers/sdd/2026-09-05-revisao-tasks-0-63/`, checklist e este plano.

**Interfaces:** evidência por task/fase → branch revisada → resultado reproduzível e pronto para integração.

- [ ] Confirmar ledger completo para Tasks 0–63 e 96–97, sem finding Critical/Important aberto que esteja dentro do escopo autorizado.
- [ ] Rodar `pnpm test`, `pnpm typecheck` e `pnpm build` do zero e registrar contagens/exit codes.
- [ ] Rodar `uv run --directory runtime ruff check .`, `uv run --directory runtime lint-imports`, `uv run --directory runtime pytest -m unit` e, no Supabase isolado, `uv run --directory runtime pytest -m "db or pipeline"`.
- [ ] Confirmar que o item 95 permanece com os cinco XFAILs declarados e nenhum XPASS.
- [ ] Executar auditoria Ponytail do diff: apagar duplicação/abstração/dependência desnecessária sem ampliar escopo.
- [ ] Gerar review-package do `0b37f0a7` ao HEAD e lançar reviewer final `gpt-6-astra` com esforço `ultra` para spec, correção, segurança, eficiência e cobertura.
- [ ] Corrigir blockers pelo loop SDD, repetir todos os gates após o último diff e aplicar `superpowers:verification-before-completion`.
- [ ] Remover o `pnpm-workspace.yaml` local temporário na Task 98 e confirmar `git status --short` sem artefatos acidentais.
- [ ] Aplicar `superpowers:finishing-a-development-branch` e apresentar opções de integração sem merge automático.
