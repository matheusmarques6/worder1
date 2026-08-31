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

- [x] **1. Assert de `current_user` no startup do runtime** `[confirmado]` · commit `83bc6da9`
  `repository/scope.py` ganhou `assert_rls_enforced`, chamada em `app._connect` — o seam por onde nascem
  TODAS as conexões de pool (pulse, workers, sender). Sem a env o processo era o dono do DSN e toda query
  sem `where organization_id` — a maioria, por desenho — virava cross-org silenciosa.
  **A checagem mudou de forma durante a execução:** eu ia olhar `rolsuper`, mas o stack local mostrou que
  no Supabase o `postgres` NÃO é superuser (`rolsuper = f`) e mesmo assim ignora toda policy
  (`rolbypassrls = t`). A guarda baseada em superuser passaria batido no caso real. `rolbypassrls` é a
  pergunta decisiva.
  Brinde: `tests/db/conftest.py` afirmava que as propriedades dos roles eram *"asserted separately in the
  leak suite"* — não existia assert de `rolsuper`/`rolbypassrls` em lugar nenhum. Agora existe.
  `DEPLOY.md` corrigido: a env deixou de ser degradável e virou recusa na partida.
  TDD, 4 testes assistidos falhar antes de cada implementação. CI run `33205469109` verde.

- [x] **2. Autenticação em `/api/agents/status`** `[confirmado]` · commit `4a32aee8`
  Os dois identificadores passam a vir de `requireOrgFromAuth`. O que o cliente manda é **ignorado, não
  rejeitado**: um 400 viraria oráculo de "esse par org/usuário existe", e os chamadores atuais seguem
  enviando sem quebrar.
  TDD, 5 testes assistidos falhar — o mais eloquente foi `expected 'org-de-outra-loja' to be
  'org-da-sessao'`, a rota gravando com service_role na org que o corpo pedisse.
  tsc ✓ · vitest ✓ · next build ✓ · CI run `33207440153` verde.
  **Mudança observável:** chamada sem sessão agora recebe 401 onde antes recebia 200. Os únicos
  chamadores no repo são hooks do próprio front (mandam cookie); integração externa, se existir, precisa
  passar a mandar `Authorization: Bearer`.

- [x] **3. Autenticação em `/api/queue/agents`** `[confirmado]` · commit `662cf6eb`
  A org passa a vir de `requireOrgFromAuth`. O que vazava, concretamente: `agent_status` com join em
  `profiles` — nome, e-mail e avatar de cada atendente de qualquer loja, mais o consolidado de
  capacidade da operação. Um UUID de organização era tudo que precisava.
  **A distinção que este item forçou, agora escrita no cabeçalho do arquivo:** `status` é filtro de
  consulta legítimo e continua vindo do cliente; `organization_id` é fronteira de tenancy e nunca
  deveria ter estado ali. O defeito não era aceitar parâmetro, era não distinguir os dois — há um teste
  dedicado a isso, porque a correção óbvia-mas-errada seria varrer todos os parâmetros e quebrar o filtro.
  TDD, 4 testes assistidos falhar. tsc ✓ · vitest ✓ · next build ✓ · CI run `33211636702` verde.

- [x] **4. Escopo de org no histórico enviado ao LLM** `[confirmado na execução]` · commit `6e02dc15`
  **A confirmação mudou a correção.** `whatsapp_messages` NÃO tem coluna `organization_id` — só
  `conversation_id`, com FK para `whatsapp_conversations`, que é onde a tenancy mora. O `.eq()` que o
  item pedia teria falhado contra coluna inexistente. Virou checagem de posse da conversa antes de
  qualquer leitura, com os dois handlers passando pelo mesmo `loadOwnHistory` — uma guarda, não duas.
  Duas decisões de desenho: conversa alheia é tratada como inexistente (vazio, sem 403 — um erro
  distinto viraria oráculo de "esse UUID existe e não é seu"); e o `whatsapp_messages` sequer é
  consultado, porque ler o segredo alheio para descartar depois passa no teste de vazamento mas deixa o
  dado trafegando.
  Decisão do usuário: **escopar, não apagar** — as duas ações não têm chamador no repo e leem hierarquia
  declarada morta, mas seguem vivas como endpoint. Candidato ao item 61.
  TDD, 5 testes (os 2 que importam assistidos falhar). CI run `33218454219` verde.

- [x] **5. Unificar o modelo de embedding** `[confirmado]` · commit `e1d3a1a8`
  Feito conforme o plano combinado, com **três desvios forçados por evidência**:
  (a) virou UM commit, não quatro passos — a constraint e os escritores são unidade atômica: no instante
  em que o CHECK existe, escritor que não carimbe quebra;
  (b) o `not null` combinado virou um **par** `check ((embedding is null) = (embedding_model is null))` —
  um upload já chunkado e ainda não embedado seria obrigado a mentir um espaço que não tem;
  (c) o teste do filtro nasceu depois da implementação (furo meu), e por isso foi provado **removendo o
  filtro**: sem ele o chunk de espaço alheio volta com vetor idêntico ao da query.
  A suposição sobre a OpenRouter mora nomeada em `agent_core/llm.py::SEARCHABLE_SPACES`.
  `hub-runtime-parity.test.ts`, que prescrevia esta ordem, virou asserção de convergência.
  Gates: ruff ✓ · import-linter 3/3 ✓ · 914 unit ✓ · 394 db/pipeline ✓ · tsc ✓ · vitest 1091 ✓ ·
  next build ✓ · CI `33229985114` (app) e `33229985117` (runtime), sete jobs verdes.


- [x] **6. Mídia no payload do ingest** `[confirmado]` · commit `cc2a8dcb`
  `src/lib/whatsapp/webhook-processor.ts:451` manda só `{type, text}`. O runtime nunca vê o áudio/imagem
  que já foi baixado para `whatsapp_cloud_messages`.

- [x] **7. Filtro de tipos não suportados no ramo runtime** `[confirmado]` · commit `cc2a8dcb`
  Mesmo arquivo — o ramo legado barra `document/sticker/location/video` via `aiRoute !== 'unsupported'`;
  o ramo runtime tem só o guarda `isSelf`. Um sticker agenda resposta a nada.

  **Entregues juntos** (mesmo arquivo, mesmo bloco): `p_content` passa a carregar
  `media_id`/`mime_type`/`caption` quando a mensagem tem mídia — texto mantém a forma
  exata de antes, provada com `toEqual` e não `toMatchObject`. O `routeInboundForAi`
  que o ramo legado já usava passou a ser calculado UMA vez e reusado pelos dois
  ramos: tipo não suportado agora pula o `ingest_inbound_message`, o cancelamento e o
  chip de progresso juntos, igual ao legado. O histórico não depende disso — a
  gravação em `whatsapp_cloud_messages` acontece antes e para todos os tipos.
  Transcrição e visão seguem fora: são o item 31.
  TDD, 6 testes novos vermelhos antes. `webhook-rollout-fork.test.ts` 21/21 ·
  suíte de `src/lib/whatsapp/` 286/288 (2 skips anteriores) · `tsc --noEmit` limpo.

- [x] **8. Índice vetorial e índice de org em `ai_agent_chunks`** `[confirmado]` · commit `55972096`
  `grep -rniE "hnsw|ivfflat|vector_cosine" supabase/` → zero. `repository/knowledge.py:116-128` faz
  `order by embedding <=> …` por turno numa tabela sem índice vetorial e sem índice em `organization_id`.
  O docstring afirma casar com um HNSW que não existe no repo.

  **Entregue:** migration `20260828000002_ai_agent_chunks_indexes.sql` — HNSW com
  `vector_cosine_ops` (a classe do `<=>` que a query usa; `vector_l2_ops` seria um
  índice que o planner nunca escolheria) mais btree em `organization_id`, tudo dentro
  do bloco guardado por `to_regclass`. Sem `CONCURRENTLY`: migration roda em transação
  e a base media 0 chunks em produção. O docstring de `search_knowledge` passa a nomear
  a migration em vez de prometer um índice inexistente; a query em si não mudou.
  Teste `runtime/tests/db/test_ai_agent_chunks_indexes.py` afirma o `indexdef`
  (tipo + opclass, não só o nome) e roda `explain` sobre a query COPIADA verbatim do
  `knowledge.py`. `pytest -m db` 370 ✓ em Postgres real.

  **Adiado com decisão:** um índice composto `(organization_id, embedding_model)`
  serviria melhor o filtro desta query. Fica fora porque a base está vazia — escolher
  forma de índice sem dado é chute, e o composto custa escrita. Revisitar quando a
  primeira loja alimentar a base.

---

## Fase 2 — Tornar o cutover reversível de verdade

- [x] **9. Coalescer precisa filtrar por `ai_runtime_rollout`** `[confirmado]` · commits `bb9acd8d` + `e9995c1d`
  `grep -rn "ai_runtime_rollout" runtime/src/` retorna só um comentário — o runtime nunca lê o rollout.
  `internal.coalesce_due_conversations` é SECURITY DEFINER cross-org e não conhece o modo.
  Voltar uma org para `legacy` não para o Python: jobs em `q_inbound` seguem sendo consumidos e
  `pending_response_at` já gravado segue sendo coalescido enquanto o TS já retomou.

  **Entregue** em duas migrations. A `20260828000003` ensina o `due` a enxergar o
  modo: org sem linha no rollout é legacy e não vira job, e a linha pendente de org
  legacy tem `pending_response_at` limpo no mesmo passe — sem bump de geração, sem
  enfileirar — porque o agendamento é do runtime e quem responde agora é o TS, com o
  próprio debounce. A checagem mora no SQL, não no Python: a função é `security
  definer` e cross-org, chamada uma vez por passe para todas as lojas; filtro no
  cliente seria por-org e chegaria tarde.

  A `20260828000004` conserta o que o review pegou: as duas coisas disputavam o mesmo
  `p_limit`. Logo depois de um flip-back as linhas legacy são justamente as MAIS
  VELHAS, então um passe podia gastar o lote inteiro limpando legado enquanto conversa
  viva de org migrada esperava o próximo tique. Agora `p_limit` conta só o que vira
  job e a limpeza tem orçamento próprio. Custo aceito: uma chamada toca até 2×`p_limit`
  linhas.

  5 testes de banco, o quinto com 3 linhas legacy velhas contra 1 runtime nova e
  `limit=2` — falha contra o corpo anterior, passa com o novo.
  `pytest -m "db or pipeline"` 407 ✓ / 1 skip.

- [x] **10. Chamar `correlate_channel_status` no webhook de status** `[confirmado]` · commits `70503186` + `0b515ba8`
  Função criada e granted em `20260813000003:207-226`, declarada em `DEPLOY.md:135` e `FORK.md §2`,
  com **zero chamadores** em `src/`. O Python já manda a `idempotency_key` em `biz_opaque_callback_data`.
  Sem isso a outbox nunca sai de `sent` e falha de entrega da Meta não vira `last_error` nem alerta.

  **Entregue.** O webhook de status passa a chamar a RPC quando a entrada traz
  `biz_opaque_callback_data` — a chave que o Python já mandava e ninguém lia. Sem a
  chave nada muda: mensagem que não saiu pelo runtime não tem linha de outbox.
  `delivered` e `read` colapsam em `sent` porque a outbox não tem esses estados
  (`status in ('pending','sending','sent','failed','unknown','manual_review')`);
  `failed` mapeia 1:1 e é isento do guard anti-retrógrado, então falha sempre chega.

  O review pegou que a linha chegava a `failed` com o MOTIVO perdido — metade do que
  o item pede. A migration `20260828000005` acrescenta um `p_error` opcional no fim
  das duas assinaturas (interna e wrapper público), com grants recriados; os
  chamadores de 3 argumentos seguem funcionando. O erro só é gravado em falha.

  **Decisão registrada:** status de sucesso deixou de LIMPAR `last_error` (o corpo
  antigo zerava em `sent`). Um envio que falhou e depois teve sucesso mantém o motivo
  antigo ao lado de `sent`. Preferi manter o histórico a apagá-lo; se incomodar na
  operação, é uma linha de `case`. Alertas continuam fora — outro dono.

  vitest 42/42 · `tsc --noEmit` limpo · `pytest -m "db or pipeline"` 412 ✓ / 1 skip,
  rodado pelo controlador contra o stack correto (o implementador tinha caído no
  Postgres de outro projeto).

- [x] **11. Cron `reprocess-whatsapp-pending` precisa conhecer o rollout** `[relatado]` · commit `e957b389`
  `src/app/api/cron/reprocess-whatsapp-pending/route.ts:70-89` reenfileira `ai_pending` órfão; o worker
  retorna em `:87` antes do claim que zeraria a flag. Linhas sobreviventes do cutover são reenfileiradas
  no QStash a cada minuto, para sempre. Conferir também se a RPC
  `pending_whatsapp_ai_responses_for_reprocess` foi aplicada (só existe em `migrations-archive/`).

  **Entregue.** A fase 2 do cron decide POR LINHA, com `getRuntimeMode` da própria
  `runtime-rollout.ts` — o lote de 50 mistura orgs, então um modo por lote seria o
  mesmo bug com outro rosto. Org em runtime é pulada; erro de leitura cai para legacy
  e reenfileira, igual ao resto do sistema. A flag `ai_pending` da linha pulada NÃO é
  apagada: cron que zera estado alheio é destrutivo, e a org pode voltar.
  Linha pulada conta em `aiScanned` e não em `aiEnqueued`/`aiFailed` — pular não é
  falhar. Fases 1 e de quarentena intocadas. vitest 13/13 · `tsc` limpo.

  **Confirmado de passagem:** a RPC `pending_whatsapp_ai_responses_for_reprocess`
  segue só em `supabase/migrations-archive/20260619_whatsapp_ai_retry.sql`, fora do
  stream que o CI aplica. Não foi promovida aqui — é o item 49.

- [x] **12. Badge "vai responder?" alinhado à régua certa** `[relatado]` · commit `ae34087c`
  `src/lib/ai/conversation-ai-status.ts:106-171` avalia guards que o runtime não lê e não consulta o
  rollout. O próprio teste admite e deixa 5 `it.todo` em
  `src/lib/ai/__tests__/conversation-ai-status.test.ts:210-215`.

  **Entregue.** Para org em `runtime` o badge para de emprestar guard do cloud-runner:
  `responder.py` não lê `activate_on`, `cooldown_after_transfer`,
  `max_messages_per_conversation` nem `stop_on_human_reply` — nenhum deles decide nada
  para quem migrou, e pesá-los era a origem do "bot pausado" eterno. O que decide de
  verdade é `ai_enabled` na conversa e o agendamento em `pending_response_at`
  (`cancel_pending_ai_response` é o freio). Modo legacy fica idêntico: a mudança é um
  early return atrás de `runtimeMode === 'runtime'`. Os 5 `it.todo` viraram testes de
  verdade — dois deles empilham TODAS as condições de guard ao mesmo tempo e provam
  que nenhuma aparece. 19 testes no arquivo · `tsc` limpo.

  **Achado de produto, registrado e NÃO implementado** (fora do escopo do item):
  o badge e o runtime resolvem "agente ativo" por caminhos diferentes. O badge olha
  `ai_agents.is_active` via `get_active_agent_for_conversation`; o runtime exige uma
  versão em `ai_agent_versions.status = 'produção'` (`repository/agent.py:104-134`).
  Loja com agente ativo e nenhuma versão em produção vê "bot ativo" enquanto todo
  turno morre em `NoActiveVersion` e vai para a DLQ. É anterior a esta mudança e não
  é guard portável — não deve ser absorvido pelo item 30 sem alguém olhar.

- [x] **13. Banner de religar IA em massa** `[relatado]` · commit `0fc5f634`
  `src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.ts:23-27` — whitelist de motivos que só
  o `cloud-runner` grava. Para org migrada o banner fica permanentemente em zero.

  **Achado de produto, registrado e NÃO implementado** (a premissa do item não se
  sustenta): `runtime/src/agents_runtime/` nunca grava `ai_enabled`/`ai_disabled_reason`
  — grep no pacote inteiro dá zero. Quando o runtime não consegue responder (sem
  missão ativa, sem chave LLM da org, sem versão de agente, Judge 1 reprova), ele abre
  uma linha em `public.alerts` e retorna silêncio (`responder.py:374-387,407-422,639-669`)
  — a conversa nunca é marcada como pausada na tabela que este banner lê. Não há motivo
  nenhum pra incluir na whitelist; incluir um valor que ninguém grava seria cosmético.
  Escopo redefinido para o defeito real e verificável no mesmo arquivo: consolidar a
  whitelist com `src/lib/ai/disabled-reasons.ts` (ver "Entregue" abaixo).

  **Entregue.** A rota tinha sua própria cópia hard-coded de `AUTO_DISABLED_REASONS`,
  em paralelo à lista canônica de `disabled-reasons.ts` (a mesma que o badge/label do
  inbox usa). As duas listas eram idênticas hoje — sem bug ao vivo — mas duas cópias do
  mesmo vocabulário é como este item foi achado em primeiro lugar: motivo novo escrito
  num lugar e esquecido no outro. A rota agora importa `AUTO_DISABLED_REASONS` do módulo
  canônico; `'manual'` continua fora porque o módulo já o exclui, sem reimplementar a
  exclusão. Mudança preventiva, não corretiva. 8 testes no arquivo (3 novos, provando
  com um motivo sintético que a rota reage a mudanças na lista canônica) · `tsc` limpo.

- [x] **14. Fechar o double-send do fallback síncrono** `[relatado]` · commits `91d51603` + `7908ff27`
  `src/lib/whatsapp/webhook-processor.ts:554` chama o runner direto quando QStash não está configurado,
  sem passar pelo guard anti-double-send do worker.

  **Entregue.** O claim atômico de `ai_pending` que morava dentro do worker QStash
  virou `claimAiPendingResponse`/`releaseAiPendingClaim` em `src/lib/ai/cloud-runner.ts`,
  e o caminho síncrono passa por ele. O UPDATE do worker ficou byte a byte igual —
  só mudou de casa. Ramo `runtime` intocado.

  O review pegou que o claim só era liberado quando o agente LANÇAVA: falha
  transitória devolvida sem exceção consumia o claim e a conversa ficava muda até o
  cliente escrever de novo. Agora `failure === 'transient'` libera e `permanent`
  consome — a mesma distinção que o worker faz, lendo o mesmo campo, com um único
  produtor. Toda saída transitória acontece com `sendResult.sent === false`, então
  liberar nunca reabre uma conversa que já recebeu mensagem.

  33 testes nos três arquivos; um deles encadeia duas entregas e prova que a segunda
  só passa porque a primeira liberou. `tsc` limpo.

  **Registrado, não fechado:** a atomicidade do UPDATE não é provada contra banco
  real — nem aqui nem no worker, que nunca teve esse teste. Lacuna anterior.

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

## REABERTO — item 1 reprovado em review (28/08)

A guarda entregue em `83bc6da9` recusa apenas roles privilegiadas (`rolsuper`/`rolbypassrls`).
Um role comum passa.

**Severidade real, verificada:** não é vazamento. As policies são `to worker_role` / `to sender_role`
(`20260812000003:265,270`, confirmado em `pg_policies`), então um role qualquer não casa com policy
nenhuma e a RLS nega tudo — fail-closed.

**Por que reprova mesmo assim:** o `DEPLOY.md` escrito no MESMO commit afirma *"O processo recusa subir
sem ela"* e a implementação não recusa. Sem `AGENTS_WORKER_SET_ROLE`, com um dono de DSN não
privilegiado, o processo sobe e quebra depois com permission denied — em vez de falhar alto na partida.
Documentei comportamento que não implementei.

- [x] **1-bis. A guarda exige identidade, não só ausência de privilégio** · commit `590c0135`
  Aditivo: a checagem de BYPASSRLS ficou (é ela que pega o caso real do Supabase, e pegaria alguém
  concedendo BYPASSRLS ao próprio `worker_role`). Entraram (a) `expected_role` ausente = env ausente =
  erro de partida; (b) `current_user` tem que ser o role esperado.
  A **ordem** das três importa e está travada em teste: para o dono do DSN, (b) e (c) seriam ambas
  verdadeiras, e "tem BYPASSRLS" é o diagnóstico útil — então vem antes.
  Cobertura verificada: `responder.py`, `toucher.py` e `server.py` abrem conexão fora do `_connect`, mas
  leem a MESMA env e rodam no mesmo processo (`__main__.py:82`) — sem ela o processo já morreu na
  partida. A guarda no seam cobre os três; não é lacuna pendente.
  TDD, 2 testes novos (vermelho semântico, não `TypeError`). ruff ✓ · import-linter 3/3 ✓ · 912 unit ✓ ·
  388 db/pipeline ✓.
  *Correção de registro:* o baseline unit que eu vinha citando como 911 é **912** — medido com stash no
  HEAD limpo. O reviewer apontou e conferi.

---

## REABERTO de novo — item 1, segunda rodada de review (29/08) · FECHADO em `8a0e5b97`

Duas falhas que a primeira correção não pegou. **A segunda é culpa de verificação minha:** eu afirmei
que `server.py` estava "coberto transitivamente" depois de checar que roda no mesmo processo. Não
checei a ORDEM nem se ele chamava a guarda. Não chama.

- [x] **1-ter-a. A expectativa de role não pode vir da mesma env que ela valida**
  `app.py:46` — `_connect` aplica `set role $env` e depois pergunta se `current_user == $env`. É
  tautológico: só falharia se o `SET ROLE` não pegasse, o que já erraria antes.
  `AGENTS_WORKER_SET_ROLE=sender_role` faz o pool de worker rodar como sender_role e a guarda aprova —
  e aí o processo morre de permission denied no meio do primeiro turno, que é exatamente o que o item 1
  existia para impedir.
  O teste `test_it_refuses_a_role_that_is_not_the_expected_one` passa porque EU passo valores
  diferentes na mão. Prova que a função compara; não prova que a comparação significa algo.
  **Correção:** cada pool declara seu role esperado como constante (`worker_role`/`sender_role`), e a
  env é validada CONTRA ela.

- [x] **1-ter-b. O listener HTTP sobe antes da guarda e nunca passa por ela**
  `__main__.py:82` — `await server.serve(...)` vem ANTES de `await run(...)`, então o HTTP atende
  requisições antes de qualquer `_connect`. E `server.py:90`/`:130` abrem conexão própria com
  `if set_role:` e nada mais — `grep assert_rls_enforced` no arquivo devolve zero. Mesmo num processo
  saudável essas conexões nunca são verificadas; sem a env, elas rodam como dono do DSN e o preview
  faz `scope_to_organization` sobre uma conexão com BYPASSRLS, onde escopo não significa nada.
  **Correção:** preflight de role antes de servir HTTP (morre na partida, não serve 503 para sempre)
  **e** a guarda dentro do ponto único onde `server.py` abre conexão, para que um próximo entrypoint
  não consiga escapar.

---

## Plano combinado para o item 5 (não perder — decidido antes do desvio)

Dimensionamento em produção (leitura apenas, 28/08): `ai_agent_chunks` **0 linhas**, `ai_agent_sources`
**0 linhas**, `ai_agents` 1 linha. **Nenhuma loja jamais alimentou a base.** Isso remove reindexação,
janela, custo e risco sobre dado real — e faz deste o melhor momento para trocar, antes do primeiro dado.

*Correção de registro:* a auditoria afirmava que o RAG do piloto "responde com trechos irrelevantes
agora". O defeito de código é real; esse efeito não existe, porque não há base.

Decisões do usuário: modelo **`text-embedding-3-small`** · **manter** o filtro por modelo na busca ·
**carimbar provedor** junto do modelo.

Conflito entre as duas últimas, e a resolução: se o carimbo do que se grava
(`openai:text-embedding-3-small`) diferir do que o Python consulta
(`openrouter:openai/text-embedding-3-small`), o filtro não casa com nada e a busca volta sempre vazia.
Portanto: `embedding_model` guarda a identidade do **espaço vetorial** qualificada por provedor, e o
Python filtra por uma lista dos espaços que **o embedador dele sabe consultar** — hoje
`('openai:text-embedding-3-small',)`, com a suposição de passagem pura da OpenRouter escrita ali, nomeada
e grepável. Se um dia não for passagem pura, o conserto é aquela linha + reindexar, e a coluna diz o que.

Passos: (1) migration `embedding_model text not null` — a tabela está vazia, dá para exigir desde já —
mais o índice HNSW, instantâneo em tabela vazia (é o item 8, commit separado);
(2) `embeddings.ts` vai para `text-embedding-3-small` e os dois escritores carimbam;
(3) busca do Python filtra pelos espaços que sabe ler;
(4) `hub-runtime-parity.test.ts` vira asserção de convergência (o próprio teste já prescreve isso).

---

## Descobertos durante a execução (não renumerados — a fila de 63 é estável)

Achados que apareceram ao trabalhar os itens e que não pertenciam a nenhum deles. Ficam aqui até
você decidir se entram na fila.

- [ ] **`useHeartbeat.ts` chama `/api/agents/status` por POST — rota não tem handler POST.**
  Três pontos (`:21`, `:49`, `:71`) mandam `{agent_id, status}`; a resposta é sempre 405 e o código
  descarta a falha em silêncio. O heartbeat de presença do atendente nunca funcionou.
  *(descoberto no item 2)*

- [ ] **`Header.tsx:418` faz GET esperando uma lista `agents` que a rota nunca devolveu.**
  A rota responde `{status}` de um agente só. Antes dava 400, agora responde 200 com a forma errada —
  o efeito visível é o mesmo (lista vazia), então não houve regressão, mas a tela de agentes do header
  nunca mostrou ninguém. *(descoberto no item 2)*

- [ ] **`formatDate` mostra o dia anterior para todo usuário em fuso negativo.**
  `src/lib/reports/utils.ts:43` faz `new Date('2024-01-15')` — string ISO só-data é parseada como
  meia-noite UTC — e a linha 45 formata no fuso local. Em UTC−3 vira 14/01. O teste
  (`src/tests/reports-utils.test.ts`) está CERTO e falha localmente; passa no CI só porque o runner é
  UTC. O fuso dos usuários do produto é o mesmo da máquina de dev. *(descoberto na Fase 0)*

- [ ] **`pnpm test` não roda sem `pnpm approve-builds` (esbuild, unrs-resolver).**
  O deps-check do pnpm aborta antes do script e a suíte Node não executa. Bloqueou o reviewer de 28/08,
  que fez só revisão estática dos itens 2–4. Contorno usado aqui: chamar `node_modules/.bin/vitest`
  direto. Aprovar os builds muda política local de execução — decisão do dono da máquina, não minha.
  *(descoberto no review do item 1)*

- [ ] **`supabase/.branches/` e `supabase/.temp/` não estão no `.gitignore`.**
  Aparecem no `git status` de quem rodar o stack local — e agora todo mundo deve rodar.
  *(descoberto na Fase 0)*

---

## Teto de prova: a família de tabelas fora do stream versionado

Padrão que já apareceu três vezes e limita o que dá para provar:
`whatsapp_messages`, `whatsapp_campaign_recipients` e `customer_segments` existem apenas em `.sql`
fora de `supabase/migrations/` (`complete-schema.sql`, `schema.sql`, `campaigns-schema.sql`). O
`tests-db` sobe um Postgres a partir das migrations — onde elas **não existem**.

Consequência prática: **nenhum item que toque essas tabelas pode ter prova de banco.** O teto é vitest
com mocks. Vale para o item 4 (feito) e para qualquer outro da mesma família. É a forma operacional do
item 49 — e a razão pela qual o item 49 importa mais do que parece.

---

## Não verificado (fazer antes de fechar itens que dependem disso)

- [ ] Estado real do banco vivo — todo o levantamento saiu do repositório. Índices criados por DDL fora
      de banda não aparecem aqui. Conferir antes dos itens 8 e 50.
- [ ] Suítes `db`, `rls` e `pipeline` não foram executadas (exigem Postgres). Só a `unit` rodou.
- [ ] Conteúdo real das envs na Vercel e no Render; se a linha da org piloto está em `ai_runtime_rollout`.
- [ ] RLS real de `whatsapp_cloud_conversations` no vivo (só há evidência da migration arquivada).
- [ ] `instrument_httpx` do Logfire quanto a headers `Authorization` nos spans.
