# Checklist da auditoria do motor de IA — 28/08/2026

> Base: `claude/debug-console-error-FWrLE` @ `a7749f32` (sincronizada com origin, 42 commits de fast-forward).
> Ordem é de prioridade absoluta: 1 → 63. Fases agrupam, não reordenam.
> `[confirmado]` = reaberto no arquivo e verificado. `[relatado]` = citação de arquivo:linha da varredura,
> **confirmar antes de executar** — a confirmação é o primeiro passo do item.
>
> Relatório completo: https://claude.ai/code/artifact/5d2890ce-3da6-4020-8e44-8331fb3ddcd6?via=auto_preview

---

## Fase 0 — CI verde (CONCLUÍDA em 28/08)

Não estava na fila original: apareceu ao verificar a pipeline antes de começar. O
workflow `runtime` falhou em **15 de 15** execuções — nunca esteve verde, e os números
de suíte registrados no STATUS sempre vieram de execução local. Sem isto, "acompanhar o
CI" não distingue uma quebra nova do vermelho herdado.

Branch `claude/auditoria-ia`, run `33203217236`: **lint ✓ · boundaries ✓ · tests-unit ✓ · tests-db ✓**

- [x] **0a. `CREATE INDEX` fora do bloco guardado** — `20260621_phase0_foundations.sql:52` · commit `153d6f2c`
  O passo 3 ficava fora do `DO $phase0$` que `to_regclass` guarda. Num banco limpo
  `whatsapp_campaign_recipients` não existe (vem de `campaigns-schema.sql`, que não é
  migration) e o `supabase start` morria com 42P01 — `IF NOT EXISTS` fala sobre o índice,
  nunca sobre a tabela.

- [x] **0a-bis. A guarda que a irmã tinha e esta esqueceu** — `20260817000006_segment_memberships_snapshot.sql` · commit `3672dfc7`
  Só apareceu depois de consertar o 0a: FK para `public.customer_segments`, tabela do app
  legado criada em lugar nenhum do repositório. A migration irmã `...005`, do mesmo dia,
  tem a guarda e explica o porquê em comentário.

- [x] **0b. `ClaimedSend` vai morar no repositório** — `repository/outbox.py` (novo) · commit `52e43477`
  O contrato *"nada chama a API do WhatsApp exceto os senders"* reprovava por
  `agent_core.responder → repository.engine → channels.port`. O conserto do S9 (mover
  `scope_to_organization`) tratou o sintoma e a seta invertida continuou de pé.
  `ClaimedSend` é linha de `claim_outbox_batch` — dado do banco. Sem reexport: os 9 call
  sites apontam para o lar real. import-linter 3/3, era 2/3.

**Prova local, primeira vez a partir de banco limpo:** `supabase start` aplicou as 42
migrations e `pytest -m "db or pipeline"` fechou **382 ✓ / 1 skip** (o skip é do Windows).

---

## Fase 1 — Parar o sangramento

Pré-requisito de qualquer novo `insert into ai_runtime_rollout`. Itens 1–6 valem na loja piloto agora.

- [ ] **1. Assert de `current_user` no startup do runtime** `[confirmado]`
  `runtime/src/agents_runtime/app.py:47-56` — `SET ROLE` está atrás de `if set_role:` numa env var opcional,
  mas `worker_role`/`sender_role` são NOLOGIN (`20260812000002:23,26`), então logar como eles é impossível
  e o `SET ROLE` é obrigatório. Sem ele o processo roda como dono do DSN (`postgres`, BYPASSRLS) e toda
  query sem `where organization_id` — que é a maioria, por desenho — vira cross-org silenciosa.
  Ação: ler `current_user`/`is_superuser` no boot e matar o processo se não for o role esperado.
  Corrigir junto o comentário mentiroso de `app.py:50-52`.

- [ ] **2. Autenticação em `/api/agents/status`** `[confirmado]`
  `src/app/api/agents/status/route.ts` — zero chamadas de auth, `supabaseAdmin`, `organization_id` e
  `user_id` da query (GET) e do body (PUT). O PUT escreve e dispara `assign_next_conversation`.
  Ação: `requireOrgFromAuth` e ignorar o `organization_id` do cliente.

- [ ] **3. Autenticação em `/api/queue/agents`** `[confirmado]`
  `src/app/api/queue/agents/route.ts:8,15-23` — mesmo padrão, vaza roster de atendentes de qualquer org.

- [ ] **4. Escopo de org no histórico enviado ao LLM** `[relatado]`
  `src/app/api/whatsapp/ai/route.ts:245-250` e `:298-303` — `.eq('conversation_id', …)` com service-role
  e sem `organization_id`. Manda transcript de outro tenant para o provedor.

- [ ] **5. Unificar o modelo de embedding** `[confirmado]`
  TS grava `text-embedding-ada-002` (`src/lib/ai/embeddings.ts:10`); Python busca
  `openai/text-embedding-3-small` (`runtime/src/agents_runtime/agent_core/llm.py:36`). Mesma tabela
  `ai_agent_chunks`, mesma `vector(1536)` — o `<=>` calcula sem erro e devolve vizinho errado.
  Ação: escolher um modelo, adicionar coluna `embedding_model`, reindexar a base do piloto.
  Já registrado como divergência conhecida em `src/lib/ai/__tests__/hub-runtime-parity.test.ts:104`.

- [ ] **6. Mídia no payload do ingest** `[confirmado]`
  `src/lib/whatsapp/webhook-processor.ts:451` manda só `{type, text}`. O runtime nunca vê o áudio/imagem
  que já foi baixado para `whatsapp_cloud_messages`.

- [ ] **7. Filtro de tipos não suportados no ramo runtime** `[confirmado]`
  Mesmo arquivo — o ramo legado barra `document/sticker/location/video` via `aiRoute !== 'unsupported'`;
  o ramo runtime tem só o guarda `isSelf`. Um sticker agenda resposta a nada.

- [ ] **8. Índice vetorial e índice de org em `ai_agent_chunks`** `[confirmado]`
  `grep -rniE "hnsw|ivfflat|vector_cosine" supabase/` → zero. `repository/knowledge.py:116-128` faz
  `order by embedding <=> …` por turno numa tabela sem índice vetorial e sem índice em `organization_id`.
  O docstring afirma casar com um HNSW que não existe no repo.

---

## Fase 2 — Tornar o cutover reversível de verdade

- [ ] **9. Coalescer precisa filtrar por `ai_runtime_rollout`** `[confirmado]`
  `grep -rn "ai_runtime_rollout" runtime/src/` retorna só um comentário — o runtime nunca lê o rollout.
  `internal.coalesce_due_conversations` é SECURITY DEFINER cross-org e não conhece o modo.
  Voltar uma org para `legacy` não para o Python: jobs em `q_inbound` seguem sendo consumidos e
  `pending_response_at` já gravado segue sendo coalescido enquanto o TS já retomou.

- [ ] **10. Chamar `correlate_channel_status` no webhook de status** `[confirmado]`
  Função criada e granted em `20260813000003:207-226`, declarada em `DEPLOY.md:135` e `FORK.md §2`,
  com **zero chamadores** em `src/`. O Python já manda a `idempotency_key` em `biz_opaque_callback_data`.
  Sem isso a outbox nunca sai de `sent` e falha de entrega da Meta não vira `last_error` nem alerta.

- [ ] **11. Cron `reprocess-whatsapp-pending` precisa conhecer o rollout** `[relatado]`
  `src/app/api/cron/reprocess-whatsapp-pending/route.ts:70-89` reenfileira `ai_pending` órfão; o worker
  retorna em `:87` antes do claim que zeraria a flag. Linhas sobreviventes do cutover são reenfileiradas
  no QStash a cada minuto, para sempre. Conferir também se a RPC
  `pending_whatsapp_ai_responses_for_reprocess` foi aplicada (só existe em `migrations-archive/`).

- [ ] **12. Badge "vai responder?" alinhado à régua certa** `[relatado]`
  `src/lib/ai/conversation-ai-status.ts:106-171` avalia guards que o runtime não lê e não consulta o
  rollout. O próprio teste admite e deixa 5 `it.todo` em
  `src/lib/ai/__tests__/conversation-ai-status.test.ts:210-215`.

- [ ] **13. Banner de religar IA em massa** `[relatado]`
  `src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.ts:23-27` — whitelist de motivos que só
  o `cloud-runner` grava. Para org migrada o banner fica permanentemente em zero.

- [ ] **14. Fechar o double-send do fallback síncrono** `[relatado]`
  `src/lib/whatsapp/webhook-processor.ts:554` chama o runner direto quando QStash não está configurado,
  sem passar pelo guard anti-double-send do worker.

- [ ] **15. Corrigir o comentário de `runtime-rollout.ts`** `[confirmado]`
  `src/lib/ai/runtime-rollout.ts:11-12,45,52` — o docstring afirma "erro de leitura = legacy"; o código
  devolve `hit?.mode ?? 'legacy'`, ou seja o cache stale. O comportamento é melhor (evita flapping), o
  texto é que está errado — e o mesmo texto está repetido no webhook e num `it.todo`.

- [ ] **16. Dar conteúdo a `repository/driver.py` ou apagar o contrato** `[confirmado]`
  `runtime/src/agents_runtime/repository/driver.py` tem 10 linhas de docstring e zero código; o contrato
  do import-linter que proíbe importá-lo não proíbe nada. `include_external_packages = false`
  (`pyproject.toml:105`) faz o linter não enxergar `import psycopg`, que é como 11 módulos fora de
  `repository/` alcançam o banco. Trava vazia é pior que trava ausente.

- [ ] **17. `SET ROLE` no detector de SQL fora de `repository/`** `[relatado]`
  `runtime/tests/unit/test_no_sql_outside_repository.py:25-29` — o regex só casa statements que começam
  com `SELECT|INSERT|UPDATE|…|SET LOCAL`, não `SET ROLE`. É exatamente o comando do item 1, e passa verde
  em `responder.py:263`, `toucher.py:123`, `app.py:53`, `server.py:93,132`.

---

## Fase 3 — Segurança restante

- [ ] **18. SSRF no crawler da base de conhecimento** `[relatado]`
  `src/app/api/ai/agents/[id]/sources/route.ts:137` grava a URL crua; `src/lib/ai/crawler.ts:128` faz
  `new URL()` e busca com `redirect: 'follow'`, sem checar esquema, host, IP privado ou link-local.
  O conteúdo vira chunk persistido e legível pelo agente.

- [ ] **19. SSRF nas custom tools** `[relatado]`
  Único filtro é o CHECK `endpoint like 'https://%'` (`20260814000003:25`). A rota
  `src/app/api/ai/custom-tools/[id]/test/route.ts:42-57` devolve o corpo na resposta;
  `runtime/src/agents_runtime/tools/custom_http.py:135-141` chama em produção sem allowlist.

- [ ] **20. Token Meta por conta no runtime** `[confirmado]`
  `runtime/src/agents_runtime/channels/cloud_api.py:110-126` usa um `AGENTS_META_ACCESS_TOKEN` global.
  O TS carrega por conta, cifrado (`src/lib/whatsapp/account-loader.ts:25-33`).
  Ação: função SECURITY DEFINER análoga a `internal.active_shopify_store`.

- [ ] **21. Fail-open em `/api/whatsapp/agents/me`** `[relatado]`
  `:17-26` devolve `isAdmin:true, permissions:null` quando a auth falha, em vez de 401.
  Todo o gating de permissão do inbox se apoia nisso.

- [ ] **22. Ordem do delete em `/api/ai/knowledge`** `[relatado]`
  `:147-156` apaga chunks e documentos por `knowledge_base_id` sem filtro de org; só `:159-163` escopa.

- [ ] **23. Fallback sem escopo em `/api/ai/respond`** `[relatado]`
  `:293-297` lê `ai_agent_configs` só por `agent_id`. Rota órfã — resolver junto com o item 55.

- [ ] **24. Filtro de org nas views de atividade** `[confirmado]`
  Nenhuma view tem `security_invoker` (`grep` em todas as migrations: zero), então a RLS das tabelas-base
  não é avaliada e o `.eq()` na rota **é** a fronteira. `src/lib/ai/activity.ts:68-71` e `:73-76` filtram
  só por `conversation_id`. Hoje protegido por um guard anterior; o filtro é de graça.

- [ ] **25. `isInternalAuthorized` fail-open** `[relatado]`
  `src/app/api/ai/process/document/route.ts:21-25` devolve `NODE_ENV !== 'production'` quando nem
  `INTERNAL_API_SECRET` nem `CRON_SECRET` estão setados. Rota service_role que confia no body.

- [ ] **26. `verifyShopifyWebhook` retorna `true` sem secret** `[relatado]`
  `src/app/api/integrations/shopify/webhook/route.ts:21`. As chamadoras fecham em produção, mas a função
  é um pé de cabra esperando um segundo chamador que esqueça o guarda.

- [ ] **27. Chave do Gemini na query string** `[relatado]`
  `src/lib/whatsapp/ai-providers.ts:245,654`. É o contrato do Google, mas a chave do lojista fica em URL
  e vaza em qualquer log de fetch, proxy ou stack trace.

- [ ] **28. Allowlist no log JSON do runtime** `[relatado]`
  `runtime/src/agents_runtime/obs/logging.py:30-32` copia todo o `extra` do LogRecord sem allowlist.
  As 3 camadas de defesa do Logfire são reais e verificadas; o log de stdout é convenção, não código.

---

## Fase 4 — Fechar a paridade que ninguém declarou

- [ ] **29. Registrar as 19 ausências não declaradas no `FORK.md`** `[confirmado]`
  A matriz tem 21 features ausentes; só typing indicator e send-guard estão declarados.
  **Fazer antes do próximo `insert into ai_runtime_rollout`** — cada ausência vira divergência consciente
  ou dívida com prazo.

- [ ] **30. Guards de comportamento: portar ou remover da UI** `[confirmado]`
  Handoff por keyword, `blocked_topics`, `max_messages_per_conversation`, `activate_on: manual`,
  cooldown pós-transferência, horário de atendimento. Todos configuráveis na mesma linha de `ai_agents`
  que o runtime lê, todos ignorados por ele. Configuração que não faz nada é pior que ausência.

- [ ] **31. STT e visão, ou degradação honesta** `[confirmado]`
  `src/lib/ai/media/*` (330 linhas) sem contraparte. Enquanto não portar: responder
  "ainda não consigo ouvir áudios" é melhor que responder no vazio.

- [ ] **32. Send-guard por tier Meta no sender Python** `[confirmado]`
  O TS tem `rate-limiter.ts` (779 l.) + `circuit-breaker.ts` (395 l.) via `checkBeforeSend`.
  O caminho novo tem mais risco de bloqueio da conta que o antigo.

- [ ] **33. Retry e rate limit no conector Shopify** `[relatado]`
  `runtime/src/agents_runtime/connectors/shopify.py:100-115` — 429 no meio do `create_coupon` deixa a
  price rule criada e o discount code não; no retry a price rule volta `422 taken` e a função retorna o
  código **sem nunca criar o cupom**. Cliente recebe código inexistente.

- [ ] **34. Templates com componentes e variáveis** `[relatado]`
  `runtime/src/agents_runtime/channels/cloud_api.py:88-94` monta só `{name, language}`.
  Template com parâmetro sai vazio ou é rejeitado pela Meta.

- [ ] **35. Alinhar versões de API** `[confirmado]`
  Meta: TS `v22.0` (`src/lib/whatsapp/api-version.ts:6`) × Python `v19.0` (`cloud_api.py:29`, `render.yaml`).
  Shopify: TS `2026-04` × Python `2024-01` (`connectors/shopify.py:22`).

- [ ] **36. Providers ausentes no Python** `[confirmado]`
  Python tem OpenRouter, OpenAI-compat e Anthropic; o TS tem esses mais Gemini, DeepSeek e Groq.
  Org migrada com agente em `gemini` cai em `NoOrgLlmKey` e o turno morre.
  Ação: portar, ou bloquear a escolha na UI para org em `runtime`.

- [ ] **37. Trilha e relatórios para org migrada** `[confirmado]`
  Relatórios, propostas, kappa, painel de custo, analytics e `update_agent_stats` leem `agent_traces` /
  `ai_usage_logs`, que o runtime não escreve. Para org migrada tudo vira zero permanente.

- [ ] **38. Typing indicator** `[relatado]`
  Divergência já declarada. Depende do outbox carregar o wamid do último inbound.

---

## Fase 5 — Custo e qualidade do motor

- [ ] **39. Parar de mandar o transcript duas vezes** `[confirmado]`
  `runtime/.../responder.py:437` monta `ConversationBlock` com `transcript` + `pending` no prompt de
  sistema; `:481` faz `_as_chat(transcript)` e `:543` espalha como turnos de chat. E
  `repository/agent.py:251` não exclui a janela pendente. Resultado: ~2× tokens de entrada por chamada,
  em até 12 gerações por turno — e é o padrão que induz o modelo a repetir.

- [ ] **40. Fechar ou reusar os clientes httpx de LLM** `[confirmado]`
  `agent_core/providers.py:75-83` constrói o adapter por turno; os três criam `httpx.AsyncClient` no
  `__init__` (`openrouter.py:54`, `direct_providers.py:52`, `:102`) e nenhum tem `aclose()`.
  O único `aclose` do runtime é o do canal Meta.

- [ ] **41. Teto de custo por turno** `[relatado]`
  `MAX_TOOL_ROUNDS=3` é por tentativa e o juiz dá 3 tentativas → pior caso 12 gerações + 3 juízes por
  mensagem, cada uma com timeout de 60s, com a lease renovada pelo keepalive.

- [ ] **42. Custo vindo do provedor, não de tabela hardcoded** `[confirmado]`
  `src/lib/ai/cost-tracker.ts:61-62` devolve `0` para modelo fora do dicionário; as 15 chaves são todas
  sem namespace e a org piloto usa `google/gemini-3.5-flash`. Somado ao fail-open triplo de `budget.ts`,
  **não existe controle de gasto**. O Python já resolveu certo em `agent_core/metering.py` — portar a decisão.

- [ ] **43. Apagar o fallback de full scan do RAG** `[confirmado]`
  `src/lib/ai/rag.ts:56-73` — o `try/catch` nunca dispara porque `.rpc()` devolve `{error}` em vez de
  lançar; qualquer erro cai em `searchDirect` (`:84-155`), que faz `select …embedding` sem `.limit()` e
  calcula cosseno em JS. Trunca em silêncio no default de 1000 linhas do PostgREST: resultado **errado**.
  Deixar a RPC falhar alto.

- [ ] **44. Fatorar `_prepare_turn` entre responder e toucher** `[relatado]`
  `toucher.py:43` já importa privados do responder. As três divergências são consequência da cópia:
  não desembrulha envelope JSON (`:334` — o bug do `{"body":…}` de 17/08 segue aberto nesse caminho),
  não consulta conhecimento (`:309` passa `knowledge=()`), não tem tool-loop. Fatorar mata a classe.

- [ ] **45. Paridade preview ↔ turno** `[confirmado]`
  `runtime/.../server.py:154-156` fixa `presentation_mode="nome_funcao"` e `adaptation=()`; não aplica
  restrições do momento; o bloco de conhecimento é concatenado fora do compilador.
  Ação: usar os valores reais + teste de paridade (hoje não existe nenhum).

- [ ] **46. `expire_incentive_grants` sem `organization_id`** `[relatado]`
  `20260813000011:88-111` — UPDATE sem a coluna líder do único índice, rodando a cada 1s
  (`config.py:74`). Seq scan com lock, para sempre.

- [ ] **47. `mark_outbox_sent` descarta o retorno** `[relatado]`
  `queueing/sender.py:224` — `false` significa "a mensagem saiu no WhatsApp e o banco não registrou".
  Valor jogado fora, nada loga. Lease de 60s sem renovação num lote de até 50 envios com pacing.

- [ ] **48. Pool de conexões de verdade** `[relatado]`
  `responder.py:263` e `toucher.py:122` abrem conexão por invocação; `server.py:90,130` por requisição
  (`/healthz` abre e fecha a cada probe). Handshake TCP+TLS+auth por turno de LLM.

- [ ] **49. RPCs fora do stream versionado** `[confirmado]`
  `search_agent_knowledge`, `get_active_agent_for_conversation`, `check_agent_cooldown`,
  `count_agent_messages_in_conversation` não estão em `supabase/migrations/`. Há definições em `sql/`,
  fora do que o CI aplica — inclusive **três variantes de `get_active_agent_for_conversation` com shapes
  diferentes** e uma `search_agent_knowledge` SECURITY DEFINER isolada só por `agent_id`.
  Mais `update_agent_stats`, `increment_agent_conversations` e `ai_monthly_cost_usd` só em
  `migrations-archive/`.

- [ ] **50. Índices faltantes nos predicados quentes** `[relatado]`
  `whatsapp_cloud_conversations (organization_id, wa_id)` (até 3× por envio), `whatsapp_opt_status`
  (nenhum índice em migration alguma), `incentive_grants.coupon_code`, e `lower(email)` em
  `shopify_orders` (o índice criado é sobre `email` puro, `20260815000001:54`).

- [ ] **51. Corridas remanescentes** `[relatado]`
  (a) Toque reentregue pela DLQ duplica — `worker.py:226` usa o `msg_id` do pgmq na chave, e
  `reprocess_dead_letters` gera msg_id novo. (b) `coupon_code` tem 32 bits e não é único; colisão em
  ~65k grants debita do grant errado. (c) `cancel_pending_ai_response` perde para o coalescer numa janela
  de até 2s (dívida já registrada no comentário da migration). (d) DLQ sem dreno:
  `internal.reprocess_dead_letters` tem grant e zero chamadores.

- [ ] **52. Degrau 3 da cascata: decidir** `[confirmado]`
  `agent_core/providers.py:106-107` só usa `platform` se o parâmetro for passado, e nenhum dos dois
  chamadores passa. `AGENTS_PLATFORM_LLM_ENABLED` é inalcançável. Ou passar nos dois call sites, ou
  remover flag e parâmetro — manter os dois estados é a pior opção.

- [ ] **53. `never_say_ai` lido e ignorado** `[relatado]`
  Carregado em `repository/agent.py:175`, mas responder e toucher hardcodam `never_say_ai=True`
  (`responder.py:493`, `toucher.py:311`). Coluna de configuração sem efeito.

---

## Fase 6 — Limpeza

- [ ] **54. `encoding="utf-8"` nos dois fixtures de teste** `[confirmado]`
  `runtime/tests/unit/test_secret_box_vectors.py:22` e `runtime/tests/unit/test_humanize.py:31` usam
  `Path.read_text()` sem encoding — as duas únicas falhas da suíte no Windows (907 ✓ / 2 ✗), e são
  justamente as suítes que provam a paridade byte a byte com o TS. `runtime/src/` está limpo.

- [ ] **55. Apagar a cadeia `actions-engine`** — ~717 linhas `[confirmado]`
  `src/lib/ai/actions-engine.ts` + `intent-detector.ts` + `sentiment-analyzer.ts`, mais o bloco
  `engine.ts:96-134` e `:389-401`. `grep ai_agent_actions` fora de `src/lib/ai/` retorna zero e a
  migration da tabela está em `migrations-archive/`. Hoje ainda custa uma query que falha por mensagem
  (`engine.ts:344`, erro engolido).

- [ ] **56. Apagar `agent_core/prompt.py` + `test_prompt_layers.py`** — ~450 linhas `[confirmado]`
  Mover `AgentConfig`/`TenantPolicy` para `repository/agent.py`, o único importador.
  Ganho colateral: some a contradição de vocabulário entre `prompt.py:95` e `prompt_compiler.py:28`.

- [ ] **57. Decidir sobre `evals/`** — ~400 linhas `[confirmado]`
  Ou wirar o harness (rota interna ou handler para `q_evals`), ou apagar `harness.py` + metade de
  `pack.py` + `repository/evals.py` + o pack JSON. Manter `load_rubrics`, que tem consumidor real.

- [ ] **58. Apagar `whatsapp-integration.ts` + rota do simulador** — 250 linhas `[confirmado]`
  Escrevem em `whatsapp_conversations`, declarada morta no STATUS.

- [ ] **59. Apagar `tools/registry.py` + `tools/customer.py`** — ~170 linhas `[confirmado]`
  O responder monta `turn_tools` à mão (`responder.py:499-518`) e nunca passa pelo registry; a grade
  prometida na docstring não vale em produção.

- [ ] **60. Apagar sobras menores** `[confirmado]`
  Cache de embeddings sem consumidor (`clearEmbeddingsCache` e irmãs, ~90 l.) + `rag.ts::buildContext`
  (duplicata de `formatRAGAsContext`) + `pending_defaults.py` + os 4 pacotes vazios
  (`dispatch/`, `inbox/`, `onboarding/`, `quota/`) + as filas `q_scheduled`/`q_evals` de `config.py:21,26`
  e `polling.py:69-79` até existir handler.

- [ ] **61. Rotas órfãs** `[relatado]`
  `whatsapp/conversations/[id]/ai` (duplicata insegura do toggle, apagar primeiro), `ai/respond`,
  `ai/knowledge`, `ai/models` + `hooks/useAgents.ts`, `ai/agents/[id]/integrations` (base),
  `components/whatsapp/analytics/ai/*`, forwarders `whatsapp/webhook` e `whatsapp/meta/webhook`,
  executor `action_whatsapp_ai` (`node-executors.ts:1857`).

- [ ] **62. Env drift** `[confirmado]`
  Lidas em código e ausentes do `.env.example`: `AGENTS_RUNTIME_URL` e `AGENTS_PREVIEW_TOKEN`
  (`src/app/api/ai/preview-prompt/route.ts:16-17` — sem elas o preview do hub devolve 503 e o botão
  morre), `WHATSAPP_AI_DEBOUNCE_SECONDS`, `OPENAI_API_KEY`, `SLACK_WEBHOOK_URL`, `DEBUG_ENDPOINT_SECRET`.
  Ausentes dos `runtime/.env.*.example`: `AGENTS_LOGFIRE_TOKEN`, `AGENTS_PLATFORM_LLM_ENABLED`,
  `AGENTS_HUMANIZE_DELAYS`, `AGENTS_RUBRICS_DIR` e os knobs de fila.

- [ ] **63. Lacunas de teste** `[relatado]`
  Sem cobertura: `toucher._node_delta` com `success_criteria`/`enabled_tools`/`forbidden` (onde mora um
  bug de tipo latente — `toucher.py:92` passa tupla onde `mission_resolver.py:63` declara `str | None`);
  paridade preview↔turno; contagem de duplicação do transcript; ciclo de vida dos clientes httpx; teto de
  chamadas por turno; 429/5xx/timeout dos provedores; `server._read_request` malformado.

---

## Não verificado (fazer antes de fechar itens que dependem disso)

- [ ] Estado real do banco vivo — todo o levantamento saiu do repositório. Índices criados por DDL fora
      de banda não aparecem aqui. Conferir antes dos itens 8 e 50.
- [ ] Suítes `db`, `rls` e `pipeline` não foram executadas (exigem Postgres). Só a `unit` rodou.
- [ ] Conteúdo real das envs na Vercel e no Render; se a linha da org piloto está em `ai_runtime_rollout`.
- [ ] RLS real de `whatsapp_cloud_conversations` no vivo (só há evidência da migration arquivada).
- [ ] `instrument_httpx` do Logfire quanto a headers `Authorization` nos spans.
