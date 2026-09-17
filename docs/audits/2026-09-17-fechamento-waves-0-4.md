# Fechamento das Waves 0–4 da auditoria do motor de IA

SHA final (código): `c53ec1815dc6d27c02cc788fff1ce35b6c5df7cf`
Branch: `fix/ai-engine-schema-baseline` (worktree `.worktrees/sync-remote-ai-2026-09-08`)
Data: 2026-09-17 (fechamento original) / 2026-09-17 (fix round 1 — Task 6 reaberta)
Plano: `docs/superpowers/plans/2026-09-17-fechamento-waves-0-4-auditoria-ia.md` (Task 8/8)

Este documento fecha o registro, não o código: reconcilia o checklist e os planos das ondas com o
que as Tasks 1–7 entregaram, e roda a bateria completa de gates no SHA final. Nada aqui autoriza
push, merge, migration remota ou deploy — essa continua sendo a Wave 7.

**Nota de proveniência dos SHAs.** A primeira rodada desta task rodou contra `d6b49b36` (Task 6) e
`62508bd1` (Task 7); a bateria de banco achou uma regressão real (ver "Fix round 1" abaixo). A Task
6 foi REABERTA para corrigi-la — não foi remendada por fora —, e durante esse conserto um `amend`
pousou no commit errado e foi recuperado por `reset` + `cherry-pick`. O controlador verificou a
recuperação: os oito commits ficaram na ordem certa, a árvore limpa, e os dois patches reaplicados
são byte-idênticos aos originais. Resultado: **Task 6 é agora `00ec603b`** (era `d6b49b36`) e
**Task 7 é agora `c53ec181`** (era `62508bd1`); Tasks 1–5 não mudaram de SHA. O commit documental
desta task (este arquivo) também mudou de SHA no processo — era `af8b866b`, passou por `0aed9562`
e o tip real, depois da revisão final desta fila, é `1d73daef`. Todas as referências abaixo já
usam os SHAs corrigidos.

## Os sete commits reconciliados

| Commit | Assunto | Decisão(ões) |
|---|---|---|
| `252951ab` | require real internal authentication on header-trusting routes | Item 71 (família); auth surface do item 80 |
| `fcc16f2d` | retain human replies in the runtime transcript | W2-T2a |
| `632619aa` | maintain runtime state independently from message delivery | W2-T2b (M2=A) — itens 78, 79 |
| `a189070e` | prevent coupon collisions without rewriting grant history | W2-T4 — item 82 |
| `c48cc09e` | apply guard policy without redundant message scans | W3-T6a |
| `00ec603b` (era `d6b49b36`) | diagnose missing missions and enforce single active agent | W3-GD-05 (fechado), W3-GD-06 (parcial), W3-GD-07 (fechado — ver "Fix round 1") |
| `c53ec181` (era `62508bd1`) | stop presenting frozen agent totals as live activity | W4-TC-02 (parcial) — item 67 |

Cada um está descrito em detalhe em `.superpowers/sdd/2026-09-17-fechamento-waves-0-4-auditoria-ia/task-{1..7}-report.md`, com RED/GREEN, desvios e review independente (0 Critical/0 Important em todos, exceto os Important fechados em fix rounds das Tasks 2 e 3). `00ec603b` carrega, além do conteúdo original de W3-GD-05/06/07, a correção da regressão de fixture — ver "Fix round 1". O ledger completo, com todos os rulings do controlador, está em `progress.md` no mesmo diretório.

## Bateria de gates estáticos — SHA `c53ec181`

| Gate | Comando | Exit code | Nota |
|---|---|---|---|
| Lint | `pnpm lint` | **0** | `next lint --max-warnings=0`, zero avisos |
| Typecheck | `pnpm typecheck` | **0** | `tsc --noEmit`, zero diagnósticos |
| Testes JS | `pnpm test` | **0** | Rodado serialmente (ver nota de flake abaixo): 260 arquivos, 2723 passed, 3 skipped, 0 failed |
| Build | `pnpm build` | **0** | `Compiled successfully`; 139 páginas não-API + 543 rotas `/api` (681 entradas em `Route (app)` no total). O número "148 páginas" do brief da task não bate com a contagem real desta árvore — não investigado mais a fundo, registrado honestamente em vez de forçado |
| Unit runtime | `uv run --directory runtime pytest -m unit -q` | **0** | 1957 passed, 1142 deselected |
| Ruff | `uv run --directory runtime ruff check .` | **0** | limpo |
| Import Linter | `uv run --directory runtime lint-imports` | **0** | limpo |
| Diff whitespace | `git diff --check` | **0** | limpo |

Estes oito resultados foram medidos na primeira rodada, contra a cadeia de commits que na época
terminava em `62508bd1` (hoje `c53ec181` — mesmo conteúdo de diff, byte-idêntico, só o SHA mudou na
recuperação). **Fix round 1** (Task 6 reaberta, novo tip `00ec603b`→`c53ec181`) tocou só
`runtime/tests/db/factories.py`, três arquivos de teste (`test_knowledge_retrieval.py`,
`test_responder_guards.py`, `test_tools.py`) e a migration já existente — nenhum arquivo em `src/`, `next.config.js` ou
configuração de build. Por isso, no fix round, só `pnpm lint`, `pnpm typecheck` e a suíte unit do
runtime foram re-executados (exit **0** os três, ver seção "Fix round 1"); `pnpm build` e o
`pnpm test` completo não foram repetidos porque nada no diff desde o antigo `62508bd1`/`c53ec181`
poderia afetá-los — a única superfície de app tocada por Task 7 (`src/app/api/ai/test/route.ts` +
seu teste) é byte-idêntica à que já passou nos dois gates na primeira rodada.

**Nota sobre o flake auto-infligido em `pnpm test`:** a primeira tentativa desta bateria rodou
`pnpm build`, `uv run pytest -m unit` e `pnpm test` **em paralelo** (decisão minha, para ganhar
tempo) e produziu 2 falhas: `file-extractor.integration.test.ts` (timeout DOCX/mammoth) e
`send-batch/route.test.ts` (timeout 5000ms). O primeiro é um flake **já documentado antes desta
fila** — `.superpowers/sdd/2026-09-08-auditoria-ia-wave-0-baseline/progress.md`: "a full suite
executou 1874 testes verdes e encontrou um timeout DOCX/mammoth em
`src/lib/ai/processors/file-extractor.integration.test.ts`, arquivo e código fora do diff da
tarefa; não usado como verde nem ocultado" — mesmo arquivo, mesmo sintoma, commits `2cce098..a8e5874`
de 2026-09-08 (antes de qualquer uma das sete tasks). O segundo (`send-batch`) é exatamente o teste
que a Task 1 escreveu/verificou em 393ms isolado (`task-1-report.md`); sob contenção de CPU de três
processos pesados simultâneos ele passou de 5s de timeout. Rodei os dois arquivos isolados
(`RETEST_EXIT=0`, 8/8 passed) e depois `pnpm test` inteiro serialmente, sem nada concorrente
(`TEST_EXIT2=0`) — exit 0 real é o que está na tabela.

## Bateria de banco no executor descartável

Ruling do controlador: `supabase/schema-snapshot.json` só é regenerado se as suítes acusarem drift.
**As cinco migrations novas (`20260917010000`…`20260917050000`) não criam nem alteram tabela/view
nenhuma** — só funções, triggers e índices — então `src/test/schema-drift.test.ts` (estático,
compara `src/`/`worker/` contra o retrato já commitado, sem tocar banco) continua passando sem
mudança, confirmado dentro do `pnpm test` acima. **`schema-snapshot.json` não foi tocado.**

### Rodada original — achou a regressão (histórico, preservado como evidência)

**Lane FULL, nonce `4677ca4301694a138beee503c8aee186`:** Prepare `0`, Replay `0` (manifesto com 122
migrations, as cinco novas em ordem), Test **`1`** — falhou no estágio `db`: RLS coletado 145
(nunca executado, fail-fast), DB 950 testes com **1 failure + 8 errors**, pipeline nunca rodou.
Stop automático `0`, `state=stopped`. Limpeza confirmada.

**Diagnóstico direto, nonce `0638234f62e645d481eb04e563a0cec8`:** o executor redige mensagens de
falha por desenho; abri um nonce próprio (Prepare `0`, Replay `0`) e roda `pytest` direto contra a
DSN aprovada para ver o erro real:

```
psycopg.errors.UniqueViolation: duplicate key value violates unique constraint
"ai_agents_single_active_per_org"
DETAIL: Key (organization_id)=(...) already exists.
```

em `tests/db/factories.py:344` (`create_agent`), disparado por
`tests/db/test_agent_loaders.py::TestTheActiveVersion::test_it_loads_the_version_that_is_active`
(1 failure) e por todo `tests/db/test_toucher.py::TestKnowledgeContext` (8 errors de fixture — mesma
cadeia de chamada). Stop manual `0`. Limpeza confirmada.

**Lane de upgrade, nonce `22828eb94bc848d183caf5040e8ae009`:** PrepareUpgrade `0`, Upgrade `0`
(manifesto confirma as cinco migrations novas em ordem), Test **`1`** — mesma falha, mesma
assinatura, nos mesmos nove nós. Stop automático `0`. Limpeza confirmada.

**Causa raiz, na época:** `supabase/migrations/20260917050000_single_active_agent.sql` (Task 6,
W3-GD-07, então `d6b49b36`) cria `create unique index … on public.ai_agents (organization_id) where
is_active`. `ai_agents.is_active` é `boolean default true` (`20260812000001:663`).
`runtime/tests/db/factories.py::create_agent` inseria uma linha `ai_agents` NOVA a cada chamada sem
tocar `is_active` — nascia sempre ativa. Qualquer teste chamando `create_agent_version` mais de uma
vez para a MESMA organização sem desativar a anterior colidia com o índice novo.
`test_agent_loaders.py` e `test_toucher.py` são anteriores a todas as sete tasks por muitos commits
— não era flake pré-existente, era regressão nova desta branch, que passou batida porque a Task 6
só rodou os arquivos focais que ela própria tocou (41 testes) e a suíte unit Python (sem banco),
nunca a suíte `-m db` inteira (950 testes).

### Fix round 1 — Task 6 reaberta, regressão corrigida

O controlador reabriu a Task 6 em vez de remendar por fora: `create_agent` agora nasce
`is_active=False` por padrão — o mesmo default que o app já manda no POST
(`is_active: body.is_active ?? false`) — e `create_agent_version(status="active")` ativa pela mesma
porta que a produção usa (`update … set is_active=true where id=…`), em vez de depender do default
da coluna. Uma revisão independente confirmou que nenhum chamador real precisa de dois agentes
ativos simultâneos na mesma organização — a decisão W3-GD-07 continua valendo sem alteração,
intacta.

Com o fix aplicado (`00ec603b`), a bateria de banco foi re-executada do zero, nonces novos, `Stop`
no final dos dois lanes:

**Lane FULL, nonce `4c48b95f1d0d4ee5a77704f24f930f09`:** Prepare `0`, Replay `0` (manifesto: 122
migrations, as cinco novas em ordem), Test **`0`** — DB 950/950, RLS 145/145, pipeline 45/45, zero
failures/errors/skips nas três. Stop automático `0`, `state=stopped`. Limpeza confirmada (zero
containers/volumes `waudit-4c48b95f...`).

**Lane de upgrade — houve uma volta em falso, registrada por transparência:**
- Duas tentativas anteriores de `Test` (nonces `c77ff93ea7754d19b953f1ee9486dfa5` e
  `e30e60ccddb84b84a43f7c67f3a9c97e`) foram mortas pelo próprio orquestrador de background por
  baixa memória do host ("system running low on memory") — o host tinha ~1,1–1,6 GB livres de
  15,87 GB durante boa parte deste fix round, por causa de outras cargas no mesmo desktop
  compartilhado, não deste código. Cada kill deixou um `.executor.lock` órfão (PID morto confirmado
  antes de remover) e containers/volume pendurados; ambos foram limpos manualmente com `Stop`
  explícito antes de qualquer nonce novo, nenhum reuso de nonce interrompido.
- Nonce `934f37d3240b4f45a6f14871f86c04fb` (primeira tentativa que rodou até o fim, em foreground):
  PrepareUpgrade `0`, Upgrade `0`, Test **`1`** — mas **só no estágio `pipeline`**: DB 950/950 e RLS
  145/145 já vieram zero failures/errors; pipeline teve 1 falha em 45,
  `tests.pipeline.test_scenarios_c::test_failed_release_recovers_by_lease_and_visibility_expiry`.
  Esse teste usa constantes de tempo em milissegundos (`AGENTS_TURN_TIMEOUT_MS=20`,
  `AGENTS_LEASE_MS=100`, `AGENTS_VT_MS=100`) e não foi tocado por nenhum dos oito commits desta fila
  (`git log` mostra `250a7e45`/`62b16280`/`c28e1b9d` como toques mais recentes, nenhum desta fila) —
  candidato claro a flake de tempo sob a mesma pressão de memória que já tinha matado dois runs.
  Stop automático `0`, limpeza confirmada, nonce descartado (não reutilizado).
- Nonce `09b119de4a6448a79f43fdb3381f8942` (retry completo, PrepareUpgrade→Upgrade→Test→Stop):
  PrepareUpgrade `0`, Upgrade `0`, Test **`0`** — DB 950/950, RLS 145/145, **pipeline 45/45**, zero
  failures/errors/skips nas três. `state=stopped`. Limpeza confirmada. A repetição limpa no mesmo
  código, mesmo host, confirma que a falha de pipeline do nonce anterior foi flakiness de ambiente
  sob pressão de memória, não regressão determinística — ao contrário da falha de `db` da rodada
  original, que se repetiu identicamente duas vezes antes do fix.

**Resultado final, autoritativo:** FULL replay (`4c48b95f...`) e upgrade (`09b119de...`) ambos
verdes, DB 950/950 + RLS 145/145 + pipeline 45/45 nos dois lanes, manifesto com as cinco migrations
novas em ordem nos dois, zero containers/volumes residuais em qualquer nonce usado nesta task
(originais, diagnóstico, kills por memória, e as rodadas finais).

### Lição de processo

Suítes focais escondem quebra cross-arquivo: a Task 6 rodou só os testes que ela própria tocou (41
casos) e a suíte unit Python inteira (que não toca banco), e isso bastou para aprovar review e
fechar a task — a colisão com `test_agent_loaders.py`/`test_toucher.py` só apareceu quando a
bateria de fechamento rodou a suíte `-m db` completa (950 testes) num commit só. Sem esse gate de
fechamento correndo a suíte inteira, a regressão teria ido para o registro como fechada. Dito sem
enfeite: o motivo de existir uma task de fechamento que roda tudo de novo, no mesmo commit, é
exatamente este.

## Tabela de ondas 0–4: condição de saída × evidência

| Onda | Condição de saída (do próprio plano) | Estado em `c53ec181` |
|---|---|---|
| **0 — Baseline** | Catálogo revalidado; executor descartável provado; baseline canônico replay/upgrade; CI usa o mesmo executor | W0-T1 completo (`2cce098..a8e5874`). W0-T2 entregue pelo plano filho E0 (`docs/superpowers/plans/2026-09-08-auditoria-ia-disposable-db-executor.md`) — é o mesmo executor usado nesta task. W0-T3 entregue pelo plano filho de baseline, fresh GREEN em `f75db83a` (DB 799/799, RLS 76/76, pipeline 32/1 skip Windows conhecido). W0-T4 entregue pelas tasks "7A Linux zero-skip" do mesmo plano filho (`97d0265a`, `71cf6d51`) — `.github/workflows/runtime.yml` já usa o executor. Ver `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-0-baseline.md` (nota atualizada nesta task). |
| **1 — Security** | Convite não confiável, RLS intratenant, 71/80 (debug), 94, fail-open cron, prompt injection, 303/unsupported | Fechado em rodada anterior a esta fila (ver autorrevisão no próprio plano, T1–T7 com commits próprios). Item 80 desta onda (a superfície `X-Internal` citada dentro dele) reforçado por `252951ab` nesta task. As duas queries de comércio por e-mail que motivaram o achado central do item 80 já têm `organization_id` (`commerce-context.ts:17,22`, extraídas de `send-batch/route.ts` e escopadas por `2524ddf1`, antes desta fila) — verificado nesta task, não há vazamento cross-tenant pendente aqui. |
| **2 — State/queues/cutover** | ai_pending, takeover humano, 78/79 housekeeping/manual_review, 81 DLQ, 82 cupons, multi-WABA, opt-out, 90, 70 | T1 (ai_pending) e T6 (multi-WABA/W2-T5, migration `20260915010000`) fechados em rodada anterior. **Nesta task:** T2/W2-T2a fechado (`fcc16f2d`, transcript humano); T3/W2-T2b fechado (`632619aa`, M2=A, housekeeping sem canal + `confirm_sender_delivery`, itens 78/79); T5/W2-T4 fechado (`a189070e`, item 82, unique de cupom + prefixo completo). M1 (histórico multi-WABA compartilhado vs. separado) e reconciliação de cupons já emitidos permanecem decisões abertas — ver "não fechado" abaixo. |
| **3 — Contracts/limits** | Item 63 e achados adicionais do guard state; prazos/cancelamento; envelope de conexões | Item 63 e quatro dos oito achados adicionais fechados em rodada anterior (`f9bb5e8a`, `ecc292ea`, `1f7c7107`). **Nesta task:** W3-T6a fechado (`c48cc09e`, "duas varreduras"); W3-GD-05 fechado (`00ec603b`, alerta de missão ausente sobrevive a guard que cala); W3-GD-06 **parcial** (metade que bloqueia fechada, metade positiva parked — sem sinal autoritativo); W3-GD-07 **fechado** (`00ec603b`) — migration, teste focal e agora a bateria completa de DB/RLS/pipeline nos dois lanes, todos verdes, depois do fix round que corrigiu `tests/db/factories.py` (ver "Fix round 1"). Nota do gate de saída da Onda 3 substituída — ver `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-3-contracts-limits.md`. |
| **4 — AI product/cost** | 65/67/69/72/73/75/76/77/83/85/89, shadow/scheduled | Fora do escopo desta task, exceto W4-TC-02. **Nesta task:** W4-TC-02 fechado parcialmente (`c53ec181`, item 67) — a ÚNICA superfície que apresentava os contadores congelados como atividade viva (`src/app/api/ai/test/route.ts:215`) foi corrigida; o achado central do item 67 (ausência de escritor no runtime para os quatro contadores) **continua aberto e real**. Os demais itens da onda (65, 69, 72/73/75, 76/77, 83, 85, 89) e a decisão shadow/scheduled não foram tocados por esta fila. |

## Disposição do banco descartável — resumo de nonces

| Nonce | Lane | Ações | Resultado | Limpeza |
|---|---|---|---|---|
| `4677ca4301694a138beee503c8aee186` | FULL replay (rodada original) | Prepare→Replay→Test→Stop(auto) | 0/0/**1**/0 — achou a regressão | zero containers/volumes |
| `0638234f62e645d481eb04e563a0cec8` | Diagnóstico (rodada original) | Prepare→Replay→(pytest manual)→Stop(manual) | 0/0/—/0 | zero containers/volumes |
| `22828eb94bc848d183caf5040e8ae009` | Upgrade (rodada original) | PrepareUpgrade→Upgrade→Test→Stop(auto) | 0/0/**1**/0 — mesma regressão | zero containers/volumes |
| `4c48b95f1d0d4ee5a77704f24f930f09` | FULL replay (fix round 1) | Prepare→Replay→Test→Stop(auto) | 0/0/**0**/0 — 950/145/45 verde | zero containers/volumes |
| `934f37d3240b4f45a6f14871f86c04fb` | Upgrade (fix round 1, tentativa 1) | PrepareUpgrade→Upgrade→Test→Stop(auto) | 0/0/**1**/0 — DB/RLS verdes, 1 flake de pipeline sob pressão de memória do host | zero containers/volumes |
| `09b119de4a6448a79f43fdb3381f8942` | Upgrade (fix round 1, retry final) | PrepareUpgrade→Upgrade→Test→Stop(auto) | 0/0/**0**/0 — 950/145/45 verde | zero containers/volumes |

Duas tentativas adicionais (Prepare+Replay, sem nonce de Test completo) foram mortas pelo próprio
orquestrador de background por baixa memória do host durante o fix round; cada uma deixou um
`.executor.lock` órfão (PID confirmado morto antes de remover) e um container/volume pendurado, e
cada um foi limpo com `Stop` explícito antes de abrir o próximo nonce — nenhum nonce interrompido
foi reutilizado. Manifesto de todos os lanes contém as cinco migrations novas em ordem
(`20260917010000_human_outbound_transcript.sql`, `20260917020000_confirm_sender_delivery.sql`,
`20260917030000_unique_coupon_codes.sql`, `20260917040000_guard_state_contract.sql`,
`20260917050000_single_active_agent.sql`).

## O que NÃO está fechado

- **Waves 5, 6 e 7 — intocadas.** Esta fila cobriu só as sete tasks das Waves 0–4 listadas acima; a
  Wave 7 (promoção) continua sendo a única autorizada a decidir push/merge/deploy, e nada nesta task
  aproxima essa decisão.
- **W3-GD-06, metade positiva — parked por falta de sinal autoritativo.** Distinguir "conversa
  genuinamente nova" de "ponte legada quebrada" continua sem implementação. Investigação exaustiva
  (Task 6) descartou três candidatos (ausência de `channel_identities`, `job.channel_account_id`
  não-nulo, cruzar espelho de outra WABA) por regredirem testes já aceitos ou exigirem migration
  fora de escopo. **Dependência nomeada:** uma coluna/sinal persistido novo, escrito uma única vez
  por `public.ingest_inbound_message` na criação da conversa, registrando se já existia espelho
  legado (`whatsapp_cloud_conversations`) para aquele contato+conta no momento da criação. Sem esse
  sinal, a metade positiva não pode ser implementada sem inventar heurística por ausência/recência/
  telefone — proibido pela decisão original.
- **Reconciliação de cupons em produção — deliberadamente fora do DDL.** A migration
  `20260917030000_unique_coupon_codes.sql` recusa criar o índice único se já houver duplicata
  `(organization_id, upper(coupon_code))` no banco vivo, e não escolhe sobrevivente nem reescreve
  `incentive_ledger` em silêncio — é decisão de produto, não de engenharia, e continua pendente do
  dono. Nenhuma verificação contra um banco de produção real foi feita por esta task (sem acesso, e
  fora de escopo).
- **Item 92 — precisa de uma janela real de ao menos oito dias.** Não investigado nesta task; exige
  dados observados em produção por um período que não existe em ambiente descartável.
- **Item 67 — ausência de escritor no runtime continua real.** `c53ec181` fechou só a apresentação
  como atividade viva num endpoint de debug; os quatro contadores de `ai_agents` seguem sem
  escritor em `runtime/`.
- **M1 (Onda 2) — histórico multi-WABA compartilhado vs. separado por conta.** Decisão de produto
  ainda genuína, não resolvida por esta fila.
- **Minors adiados, registrados no ledger (`progress.md`), nenhum corrigido nesta task:**
  - Task 1: `oauth-manual/callback/route.ts` mistura `Authorization:`/`authorization:` em fetches
    adjacentes (cabeçalho é case-insensitive; só inconsistência de estilo).
  - Task 2: `coalesce(new.sent_by_bot, false)` sobre coluna NOT NULL; ausência de `grant execute`
    explícito no trigger (desnecessário, trigger não precisa de EXECUTE).
  - Task 4: o retry no teste de conflito de cupom só afirma `retry.success is False` sem checar a
    string de erro; janela sem CHECK entre `drop`/`add constraint` de `alerts_type_check` dentro da
    própria migration (atômico, sem exposição externa real).
  - Task 6: o padrão decide-cedo/age-tarde em `responder.py:420-436` tem dois sítios que precisam
    andar juntos; nenhum teste fixa essa sincronia além do caso de guard calando.
  - Task 7: `src/app/api/ai/agents/route.ts:49-53` ainda faz `.select('*')` em `ai_agents` e devolve
    as quatro colunas congeladas no payload; nenhum consumidor de frontend as lê — over-fetch, não
    superfície nova.

A regressão de fixture do W3-GD-07 que aparecia nesta lista na primeira versão deste documento foi
corrigida e re-verificada verde nos dois lanes (ver "Fix round 1" acima); não é mais item aberto.

## Constraints globais respeitadas

Nenhuma alteração em `pnpm-lock.yaml`, `package.json`, `next.config.js`, `.eslintrc.json` ou
`supabase/schema-drift-allowlist.json`, na rodada original nem no fix round. Nenhum push, merge ou
deploy. Um commit documental por rodada (o segundo é este mesmo commit, emendado), sem subagentes e
sem revisão de código dispatchada por esta task (conforme a diretriz desta task) — a revisão
independente do fix round de Task 6 foi feita pelo controlador, fora desta task.
