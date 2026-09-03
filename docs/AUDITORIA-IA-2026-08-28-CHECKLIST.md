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

  **Corrigido depois, pelo review de branch inteira (`31200c28`).** A justificativa
  acima estava ERRADA e era minha: `whatsapp_cloud_messages` é a tabela legada. O
  histórico que o runtime lê é `public.messages`, populada só pelo
  `ingest_inbound_message` — então pular o ingest apagava a mensagem do transcrito do
  modelo. PDF seguido de "conseguiu abrir?" chegava sem o PDF. Agora tipo não
  suportado é INGERIDO e tem o agendamento cancelado (o padrão do `botOff`): entra no
  histórico, não agenda turno. O teste que fixava o buraco como contrato foi reescrito.
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

  **Corrigido depois, pelo review de branch inteira (`564d024b`).** A correlação não
  disparava no caminho quente: `correlate_outbox_status` só tocava linha em
  `sending`/`unknown`, mas `mark_outbox_sent` marca `sent` assim que a Meta responde
  200 — muito antes do webhook de status chegar. Os 5 testes semeavam `sending`, então
  passavam honestamente e não provavam produção. A `20260828000006` faz `failed`
  correlacionar também em linha `sent`; `sent → sent` não anda, `failed` e
  `manual_review` são terminais e nada os ressuscita.

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

- [x] **15. Corrigir o comentário de `runtime-rollout.ts`** `[confirmado]` · commits `6e4dbfad` + `16a5f11b`
  `src/lib/ai/runtime-rollout.ts:11-12,45,52` — o docstring afirma "erro de leitura = legacy"; o código
  devolve `hit?.mode ?? 'legacy'`, ou seja o cache stale. O comportamento é melhor (evita flapping), o
  texto é que está errado — e o mesmo texto está repetido no webhook e num `it.todo`.

- [x] **16. Dar conteúdo a `repository/driver.py` ou apagar o contrato** `[confirmado]` · commits `6255fc18` + `2f55f367`
  `runtime/src/agents_runtime/repository/driver.py` tem 10 linhas de docstring e zero código; o contrato
  do import-linter que proíbe importá-lo não proíbe nada. `include_external_packages = false`
  (`pyproject.toml:105`) faz o linter não enxergar `import psycopg`, que é como 11 módulos fora de
  `repository/` alcançam o banco. Trava vazia é pior que trava ausente.

  **Entregue.** `driver.py` foi apagado — não tinha chamador, e módulo escrito para
  satisfazer contrato é o mesmo defeito com outro nome. A fronteira passou a valer com
  `include_external_packages` e `allow_indirect_imports = "true"`: o que continua
  proibido é `import psycopg` DIRETO em módulo coberto; a cadeia
  `domain → repository → psycopg` nunca foi a violação. Os 10 imports que acenderam
  viraram exceções nomeadas, uma linha cada, marcadas como dívida — não foram
  refatorados.

  O review não acreditou no verde: plantou `import psycopg` num módulo coberto e viu
  `2 kept, 1 broken`. E achou o que faltava — `source_modules` não listava `evals/`,
  `obs/`, `crypto/` nem os arquivos de topo, então a trava tinha cômodos sem cobrir.
  O `2f55f367` fecha isso: os 19 pacotes/módulos de topo entram, com `app`
  (raiz de composição) e `repository` (o próprio alvo) exemptos e justificados.
  Plantar `import psycopg` em `obs/telemetry.py`, antes cego, agora quebra.

- [x] **17. `SET ROLE` no detector de SQL fora de `repository/`** `[relatado]` · commit `b927016d`
  `runtime/tests/unit/test_no_sql_outside_repository.py:25-29` — o regex só casa statements que começam
  com `SELECT|INSERT|UPDATE|…|SET LOCAL`, não `SET ROLE`. É exatamente o comando do item 1, e passa verde
  em `responder.py:263`, `toucher.py:123`, `app.py:53`, `server.py:93,132`.

  **Entregue.** O detector enxerga `SET ROLE`. Os 4 call sites legítimos viraram
  dívida NOMEADA com contagem exata por arquivo, e qualquer SQL fora do dicionário
  continua reprovando — o regex não foi afrouxado até o verde voltar. Prova no estilo
  da casa: `SET ROLE` plantado, detector acusando (`esperava 0 ... achou 1`).
  `pytest -m unit` 922 ✓ (as 2 falhas são o item 54) · `lint-imports` 3/3 · ruff limpo.

---

## Fase 3 — Segurança restante

- [x] **18. SSRF no crawler da base de conhecimento** `[relatado]` · commits `84daa998` + `9cc62ece`
  `src/app/api/ai/agents/[id]/sources/route.ts:137` grava a URL crua; `src/lib/ai/crawler.ts:128` faz
  `new URL()` e busca com `redirect: 'follow'`, sem checar esquema, host, IP privado ou link-local.
  O conteúdo vira chunk persistido e legível pelo agente.

  **Entregue.** Portão próprio (`src/lib/ai/ssrf-guard.ts`) aplicado no ponto em que a
  rede é tocada — raiz, `sitemap.xml`, sitemap filho e link interno passam pelo mesmo
  `assertSafeUrl`. Recusa esquema fora de http(s), credencial embutida na URL e
  destino que RESOLVE para endereço não roteável. Redirect deixou de ser `follow`:
  cada salto é revalidado antes de ser seguido, com teto de 5 e o corpo do 3xx
  cancelado. Sem allowlist de domínio — o produto é "o lojista aponta para o site
  dele"; a defesa é sobre para onde o nome resolve.

  O review (lido como atacante) achou o que faltava: NAT64 `64:ff9b::/96`, 6to4
  `2002::/16` e a forma IPv4-compatible (`::127.0.0.1`, que a URL normaliza para
  `::7f00:1` e o `BlockList` não pega) atravessavam. Fechados, mais CGNAT
  `100.64/10`, `0.0.0.0/8`, `240/4` e companhia. 43 testes no guard, cada buraco
  provado em vermelho antes.

  **Aberto e declarado:** DNS rebinding. O guard resolve o nome e o `fetch` resolve de
  novo — quem controla um domínio com TTL 0 alterna as respostas. NÃO é corrida de
  milissegundos: é determinístico e barato. Fechar exige fixar o IP validado no
  connect, o que pede dependência nova (`undici` não é módulo `node:`). O portão
  fecha literal de IP, esquema, credencial, redirect e DNS honesto — sobe a barra de
  "qualquer um digita uma URL" para "atacante com domínio próprio".

- [x] **19. SSRF nas custom tools** `[relatado]` · commits `db3524b1` `b3281db3` `3b180d65` + `a5ab7738` `be4a90fc` `f5863136` `e72ca07e`
  Único filtro é o CHECK `endpoint like 'https://%'` (`20260814000003:25`). A rota
  `src/app/api/ai/custom-tools/[id]/test/route.ts:42-57` devolve o corpo na resposta;
  `runtime/src/agents_runtime/tools/custom_http.py:135-141` chama em produção sem allowlist.

- [x] **20. Token Meta por conta no runtime** `[confirmado]` · commits `4710326c` + `2df1d71e`
  `runtime/src/agents_runtime/channels/cloud_api.py:110-126` usa um `AGENTS_META_ACCESS_TOKEN` global.
  O TS carrega por conta, cifrado (`src/lib/whatsapp/account-loader.ts:25-33`).
  Ação: função SECURITY DEFINER análoga a `internal.active_shopify_store`.

- [x] **21. Fail-open em `/api/whatsapp/agents/me`** `[relatado]` · commits `e36ecd06` + `6f6387a5`
  `:17-26` devolve `isAdmin:true, permissions:null` quando a auth falha, em vez de 401.
  Todo o gating de permissão do inbox se apoia nisso.

  **Entregue.** Sem sessão, 401 — e o comentário que justificava o fail-open ("assumir
  que é admin para não bloquear a interface") saiu junto. O e-mail do usuário saiu dos
  logs. O implementador achou o MESMO fail-open no único consumidor, o hook
  `useAgentPermissions`, que reabria acesso total em qualquer 401: consertar só a rota
  teria devolvido o buraco pela porta do lado.

  **O review achou a sobra que importa:** o defeito sobrevivia na janela de
  carregamento. O hook começava com `isAgent: false` e todo helper faz
  `if (!isAgent) return true` — agente real com acesso total até o fetch resolver.
  Não era explorável só porque o consumidor mostra spinner e segura o fetch, ou seja,
  a segurança morava no CHAMADOR. Agora o hook nega sozinho enquanto a identidade é
  desconhecida, sem trocar o spinner por tela de permissão negada, e o caminho do
  admin segue idêntico. Os quatro booleanos de conveniência tinham o mesmo `?? true`
  e foram junto. O estado de falha virou função pura testada — antes era verificado
  à mão, agora o build quebra se alguém inverter.

- [x] **22. Ordem do delete em `/api/ai/knowledge`** `[relatado]` · commit `4f0110c1`
  `:147-156` apaga chunks e documentos por `knowledge_base_id` sem filtro de org; só `:159-163` escopa.

- [x] **23. Fallback sem escopo em `/api/ai/respond`** `[relatado]` · commit `5c7a6774`
  `:293-297` lê `ai_agent_configs` só por `agent_id`. Rota órfã — resolver junto com o item 55.

- [x] **24. Filtro de org nas views de atividade** `[confirmado]` · commit `84fc4c62`
  Nenhuma view tem `security_invoker` (`grep` em todas as migrations: zero), então a RLS das tabelas-base
  não é avaliada e o `.eq()` na rota **é** a fronteira. `src/lib/ai/activity.ts:68-71` e `:73-76` filtram
  só por `conversation_id`. Hoje protegido por um guard anterior; o filtro é de graça.

- [x] **25. `isInternalAuthorized` fail-open** `[relatado]` · commit `704ec32e`
  `src/app/api/ai/process/document/route.ts:21-25` devolve `NODE_ENV !== 'production'` quando nem
  `INTERNAL_API_SECRET` nem `CRON_SECRET` estão setados. Rota service_role que confia no body.

  **Entregue.** Sem segredo configurado, nega — em qualquer ambiente, inclusive com
  `NODE_ENV` indefinido ou `test`. `NODE_ENV` não é credencial. A função virou UMA
  implementação em `src/lib/internal-auth.ts`, consumida pelas duas rotas que tinham
  cópias idênticas (`ai/process/document` e `whatsapp/back-in-stock`, três call sites);
  duas cópias de uma decisão de segurança divergem no primeiro conserto que só uma
  recebe. Comparação por `verifyBearerToken`, que checa comprimento antes do
  `timingSafeEqual` e não lança — 401 continua sendo 401, não 500.

  **Decisão registrada:** o motivo da recusa fica no log do servidor, não na resposta.
  Explicar ao chamador não autenticado que "o segredo não está configurado" ajuda quem
  está sondando. Custo: quem roda `next dev` sem a env vê 401 e precisa olhar o
  terminal — a mensagem lá nomeia as duas variáveis e aponta o `.env.example`.

  **Achado maior que o item, registrado abaixo:** o mesmo fail-open está espalhado por
  ~40 rotas de cron e workers, cada uma com sua cópia inline.

- [x] **26. `verifyShopifyWebhook` retorna `true` sem secret** `[relatado]` · commits `834d43d2` `edaebe0e` `db44a40b` `1074c998`
  `src/app/api/integrations/shopify/webhook/route.ts:21`. As chamadoras fecham em produção, mas a função
  é um pé de cabra esperando um segundo chamador que esqueça o guarda.

- [x] **27. Chave do Gemini na query string** `[relatado]` · commit `1d23c5ce`
  `src/lib/whatsapp/ai-providers.ts:245,654`. É o contrato do Google, mas a chave do lojista fica em URL
  e vaza em qualquer log de fetch, proxy ou stack trace.

- [x] **28. Allowlist no log JSON do runtime** `[relatado]` · commits `04de8d90` + `6e708d4c`
  `runtime/src/agents_runtime/obs/logging.py:30-32` copia todo o `extra` do LogRecord sem allowlist.
  As 3 camadas de defesa do Logfire são reais e verificadas; o log de stdout é convenção, não código.

  **Entregue.** O log JSON passa a filtrar `extra` por `ALLOWED_EXTRA_KEYS`, que é
  `SAFE_ATTRIBUTES` **importado** da telemetria mais 8 campos de saúde de processo que
  o vocabulário de span nunca carregou. Uma fonte de verdade, não uma segunda lista —
  esta auditoria já consertou esse padrão quatro vezes. Chave barrada deixa rastro em
  `_omitted_keys`, com nome e nunca valor: log que apaga calado esconde tanto quanto
  log que vaza. Todos os 8 call sites reais de `extra=` continuam passando.

  **Buraco declarado e agora fixado por teste:** campo proibido aninhado sob uma chave
  PERMITIDA passa sem filtro (o formatter não desce no valor). Não foi consertado —
  sanitização recursiva teria de andar também pelo `queues`, e essa troca não foi
  feita. O review pegou que o teste que dizia cobrir isso testava o caso fácil; agora
  há um teste com o nome honesto que afirma o comportamento atual e **quebra** no dia
  em que alguém implementar a recursão.

---

## Fase 4 — Fechar a paridade que ninguém declarou

- [x] **29. Registrar as ausências não declaradas no `FORK.md`** `[confirmado]` · commits `306f1c06` + `686c8dea`
  A matriz tem 21 features ausentes; só typing indicator e send-guard estão declarados.
  **Fazer antes do próximo `insert into ai_runtime_rollout`** — cada ausência vira divergência consciente
  ou dívida com prazo.

  **Entregue — e não são 19.** A matriz do dossiê nunca esteve no repositório, então a lista
  foi reconstruída do código, com arquivo:linha nos dois lados por linha. Deu **32 ausências**:
  4 divergências conscientes e 28 dívidas, 13 com item dono e 15 sem. O `runtime/FORK.md`
  ganhou a seção, junto das 7 divergências que já estavam declaradas, e fecha com a checagem
  por org — o que abrir em `ai_agents` antes de rodar o `insert`. Uma entrada existente foi
  corrigida (dizia roadmap para bolhas e ritmo, que já tinham sido entregues) e 7 candidatas
  foram descartadas com motivo escrito.

  **O que o review mudou.** As 28 linhas da primeira entrega resistiram inteiras à conferência
  independente — o revisor abriu 28 de 28 e não derrubou nenhuma. O defeito estava no que a
  varredura não achou: **4 ausências faltando**, uma delas a pior da lista, mais um dono errado
  (o item 42 conserta a contabilidade de custo do lado TS e não faz o runtime aplicar teto) e
  uma ausência que descrevia um mecanismo que não acontece. As 4 novas foram conferidas de novo
  no re-review, abrindo os dois lados, e nenhuma caiu.

  **Lição de método, aplicada aos itens 30-38:** item de paridade orça DUAS varreduras
  independentes desde o início. Uma pessoa só, por mais cuidadosa que seja com o que escreveu,
  não enxerga o que não procurou.

- [x] **30. Guards de comportamento: portar ou remover da UI** `[confirmado]` · commits
  `f2979270` `c52373fa` `15f71f60` `8179fba7` `183b5c4f` `281f249a` `d8bb4ce4` `2f391fc1`
  `2c86b9ea` + `f4a64f29` `a4b6b10f` `78808a6e` `7bac1df5` + `753db228` `894716b1`
  Handoff por keyword, `blocked_topics`, `max_messages_per_conversation`, `activate_on: manual`,
  cooldown pós-transferência, horário de atendimento. Todos configuráveis na mesma linha de `ai_agents`
  que o runtime lê, todos ignorados por ele. Configuração que não faz nada é pior que ausência.

  **Mais dois, achados ao escrever o brief:** `stop_on_human_reply` (default TRUE no TS, guard
  permanente por conversa — `cloud-runner.ts:550-560`) e o cooldown "acabou de responder"
  (`:515-535`). São oito, não seis. `repository/agent.py:118` carrega o `settings` inteiro e usa
  exatamente uma chave dele (`tools.enabled`); grep por `behavior`, `blocked_topics`, `handoff`,
  `activate_on` e `business_hours` em `runtime/src/` dá zero.

  **Entregue — e os oito são de fato oito.** Um módulo puro novo
  (`runtime/src/agents_runtime/agent_core/guards.py`, espelho de `src/lib/ai/guards.ts`:
  zero I/O, relógio recebido), fiado no `responder.py` na ORDEM do TS, com o silêncio
  sempre explicável — cada guard que cala emite o passo `skipped` com o motivo em pt-BR,
  no mesmo canal que o inbox já lê. Os dois que TRANSFEREM (handoff por keyword e
  `blocked_topics`) desligam a IA no espelho legado, que é o freio que o webhook já
  respeita para org migrada — a transferência vale para os turnos seguintes, não só para
  este — e abrem `public.alerts` com `type = 'handoff'`, tipo que existia no CHECK desde
  agosto e não tinha escritor nenhum.

  **A questão de tabela, decidida com prova.** O estado que estes guards leem não existe
  na canônica: `public.conversations` não tem `ai_transferred_at`, `ai_agent_id` nem
  `ai_enabled`, e `public.messages` não tem escritor de outbound humano (a ausência 29 do
  `FORK.md`). Ler `stop_on_human_reply` de lá produziria um guard que NUNCA dispara — pior
  que não ter o guard, porque parece entregue. Então lê do espelho legado do inbox, por
  duas funções `SECURITY DEFINER` em `internal` escopadas por org
  (`legacy_conversation_guard_state`, `mark_ai_handoff`), no mesmo desenho de
  `internal.emit_ai_run_step`. As legadas estão com RLS DESLIGADA: um `grant select` daria
  ao worker o inbox de TODA org.

  **O que os reviews mudaram.** As afirmações da entrega resistiram inteiras — 8 de 8
  guards conferidos abrindo os dois lados, nenhuma falsa, SQL escopada e correta. O defeito
  estava, de novo, no que a varredura não achou: **o runtime tem DOIS produtores de fala e
  a entrega cobriu um**. O toque proativo de missão não consultava guard nenhum — conversa
  transferida, em takeover humano, no teto ou fora do horário continuava recebendo toque, e
  o rascunho do toque não passava pela lista de tópicos proibidos, que é textualmente o
  efeito que o item existe para eliminar. As duas varreduras independentes acharam este
  mesmo achado, o que fecha a dúvida sobre ele. Mais dois obrigatórios: `mark_ai_handoff`
  devolvia `false` e ninguém lia (transferência virava no-op enquanto o passo e o alerta
  afirmavam que pegou), e **a fiação não tinha um único teste** — apagar os quatro blocos
  do `responder.py` deixava as duas suítes verdes.

  Fechados em dois rounds: o toque passa pelos mesmos guards (todos menos o handoff por
  keyword, que não se aplica sem inbound) e deixa o mesmo chip; `ai_enabled` entrou no
  estado lido e vale nos dois produtores — é o guard básico de `cloud-runner.ts:390-392`,
  que o webhook freava só no ingest; a transferência lê o booleano e escala para `critical`
  quando a marca não pega, com dedup por `alerts.dedup_key` (coluna que a tabela já tinha e
  ninguém escrevia) que distingue espelhado de não-espelhado, para a escalação não morrer
  atrás de um `warning` aberto. E a fiação ganhou teste de banco por classe de desfecho —
  cala, transfere, passa —, todos provados por sabotagem, pelo implementador e de novo
  pelo revisor.

  **Lição de método, confirmada:** o aprendizado do item 29 (duas varreduras independentes
  num item de paridade) pagou pela primeira vez aqui — e a segunda varredura precisa
  perguntar "quem MAIS fala pela loja?", não só "este caminho está certo?".

- [x] **31. STT e visão, ou degradação honesta** `[confirmado]` · commits
  `4bf1c888` `b74368b1` `19986213` + `eba0ae3a` `0988c16b` `a9776d4f` + `24b54578` + `6f6a13a9`
  `src/lib/ai/media/*` (330 linhas) sem contraparte. Enquanto não portar: responder
  "ainda não consigo ouvir áudios" é melhor que responder no vazio.

  **Verificado no item 29, e é pior que "sem contraparte":** `webhook-processor.ts:514-520`
  cancela o turno para `botOff` e para tipo `unsupported`, mas **áudio e imagem não são
  `unsupported`** — a régua de `:298-308` os inclui de propósito, porque no caminho legado eles
  têm transcrição e visão. Para org migrada eles são ingeridos, o turno é agendado, e o runtime
  responde a uma mensagem sem texto. Não é silêncio: é resposta no vazio, que é o pior dos dois.
  O conserto mínimo enquanto o porte não vem é uma linha na condição de cancelamento.

  **Entregue: a degradação honesta, não o porte.** Ruling do controlador — portar STT e visão
  é capacidade nova com decisão de produto (custo por áudio, provedor, armazenamento), e o
  próprio achado diz que a régua enquanto isso é responder com honestidade. O implementador
  confirmou o tamanho do porte e concordou: segunda cascata BYO (whisper→groq, diferente da de
  chat), porta de provedor nova (`LlmPort` não transcreve), segundo consumidor da API do
  WhatsApp (que o contrato de import-linter proíbe fora de `channels`) e mudança no `Message`,
  hoje `content: str`.

  **A precedência decidida.** Legenda presente é fala do cliente: entra como texto e o turno
  segue normal — o que fecha junto o achado "`caption` viaja no payload e ninguém lê", que era
  a mesma leitura. Mídia sem legenda ganha uma linha honesta na voz da loja, **sem chamar o
  LLM**: gerar a partir de nada é o defeito que o item existe para fechar, e o revisor provou o
  zero-token instrumentando também o `embed` do dublê (o `assert` do implementador só cobria
  `chat`) — sem chat, sem juiz, sem embedding, logo zero linha em `llm_calls`. E o transcrito
  passou a dizer que houve mídia, com o tipo, em vez de linha em branco no meio da conversa.

  **Um módulo puro novo** (`agent_core/media.py`) traduz os quatro dialetos que
  `public.messages.content` guarda de verdade — texto plano, envelope Meta do backfill, o
  `p_content` do ingest com `media_id`, e o `content` cru do espelho —, todos conferidos no
  review contra os escritores reais. Os marcadores batem caractere a caractere com
  `cloud-runner.ts:762-770`, e `settings.media_fallback.message`, knob sem leitor nenhum em
  Python até aqui, vence quando configurado.

  **O que o review mudou, em três rounds.** (1) O transcrito trocou mentir por omissão por
  **mentir por afirmação**: a forma `{"image": …}` também é o que a rota de mídia grava em
  OUTBOUND, e o backfill a copia com `author_type='human'` — a foto que a LOJA mandou saía como
  "[Cliente enviou uma imagem]". O TS não tem o buraco porque guarda o marcador atrás de
  `role === 'user'`; a entrega copiou as strings e deixou a guarda. (2) A dúvida sobre
  `media_fallback.mode: 'handoff'` partia de premissa falsa: `cloud-runner.ts:657-660` manda
  **todo** áudio ao fallback com `no_stt_provider` quando a org não tem STT, então a
  incapacidade é estrutural dos dois lados e honrar o modo é paridade, não capacidade nova —
  vale aqui o princípio do item 30, configuração que não faz nada é pior que ausência. Portado
  com a régua estrita do TS, depois de confirmar nos dois lugares que o default é `ask_text`.
  (3) O marcador da mídia da loja chegava ao modelo como mensagem `assistant` cujo conteúdo
  inteiro é uma rubrica entre colchetes — superfície de imitação, e esta casa já pagou por esse
  exato modo de falha em 17/08 ("entregar o JSON cru ao prompt ensinou o modelo a IMITÁ-LO").
  Decisão: o marcador **fica** (no TS o descarte é barato porque a imagem entra inline por
  visão; aqui o runtime nunca enxerga nada, e ele é o único vestígio de que existe uma foto),
  mas sai do array de chat e vive só no bloco CONVERSA.

  **Prova por sabotação, dos dois lados.** Cortar de menos e cortar demais falham no MESMO
  teste; a metade `author != "contact"` da guarda ganhou asserção própria porque nada no banco
  produz mensagem de contato começando com o marcador da loja — quem produz é o cliente
  digitando o literal, e era ele quem perderia a fala numa refatoração. 1096 unit · 429 db ·
  ruff · lint-imports 3/3. Nenhuma migration: o dado está no banco desde o item 06.

- [x] **32. Send-guard por tier Meta no sender Python** `[confirmado]` · commits
  `ee69f682` `2c14d6d8` `cb1624d0` `ea3bc6da` + `d5d99033` `128a4069` `eb235cae` `20aa8a50`
  `4d049256` `993a4f4f` + `d30c8322` `383fc30f`
  O TS tem `rate-limiter.ts` (779 l.) + `circuit-breaker.ts` (395 l.) via `checkBeforeSend`.
  O caminho novo tem mais risco de bloqueio da conta que o antigo.

  **Entregue: breaker e cooldown de throttle por `phone_number_id`, com a régua em SQL.**
  `internal.whatsapp_send_guard` mais `send_guard_check` / `send_guard_report`
  (migrations `20260901000004`..`20260901000008`), no molde do `sender_preflight`: a função
  decide, o sender executa o veredito. Números do TS onde os dois existem — 5 falhas seguidas
  → 30 s, 3 sucessos para fechar o half-open, escada de 10/20/50 sinais de excesso no dia UTC
  → 1/5/10 min. Chamado uma vez por chamada ao Graph, não por linha de outbox, e o envio
  segurado aparece no painel em vez de sumir.

  **Fora por ruling M, e não por falta de tempo:** pair-rate, throughput e cota diária. O
  estado é rachado por desenho — o TS conta em Upstash Redis, este conta em Postgres, e cinco
  caminhos TS enviam pelo MESMO número de uma org migrada sem que o rollout desligue nenhum
  deles. Falhas seguidas e sinais de excesso partidos degradam o TEMPO DE REAÇÃO; teto partido
  seria contador que mente, e contador que mente é pior que contador nenhum.

  **Registrados, não implementados:** a re-armagem do throttle por qualquer falha (esquisitice
  do TS replicada por ruling T — mudá-la é nos dois motores ao mesmo tempo), o
  `consecutive_failures` que cresce em OPEN aqui e fica congelado no TS, a ausência de teto de
  retentativa para transitórios em `20260812000004:393-403`, o `attempt_count` inflado pelos
  holds, e as campanhas do TS que não checam o rollout.

- [x] **33. Retry e rate limit no conector Shopify** `[relatado]` · commits `1744994b` + `c7a790a0`
  `runtime/src/agents_runtime/connectors/shopify.py:100-115` — 429 no meio do `create_coupon` deixa a
  price rule criada e o discount code não; no retry a price rule volta `422 taken` e a função retorna o
  código **sem nunca criar o cupom**. Cliente recebe código inexistente.

  **A função é `create_discount`, e a linha decisiva não era a citada.** O `return code` do 422
  "taken" na PRICE RULE saía sem nunca tocar `discount_codes.json`. Agora o 422 taken deixa de ser
  sucesso por fé: a rule existente é reencontrada e o discount code é confirmado nesta chamada — e
  se a rule não for reencontrada, isso é erro, não sucesso. O 422 taken do discount code continua
  sendo sucesso legítimo, porque ali a rule foi confirmada no mesmo caminho.

  **A busca falha FECHADA em todo ramo.** O REST `2024-01` não filtra price rule por título, então a
  busca é janela de ±60 s em `ends_at` (o `validity_until` do grant, estável entre tentativas) mais
  igualdade exata de título — e GET não-200, rule ausente ou página truncada levantam `ShopifyError`.
  Em nenhum ramo devolve o código sem o cupom existir. Teto de 250 por página declarado no código.

  **Retry de 429 com teto de 6 s POR INVOCAÇÃO**, três requisições, honrando `Retry-After` com
  default de 2 s. O `asyncio.sleep` que o despacho tinha liberado é proibido pela fitness AST
  `test_no_direct_clock.py`: o retry usa o `Clock` injetado, e por isso os testes MEDEM a espera em
  vez de esperá-la. Divergências declaradas no código: o TS faz 4 requisições
  (`api-client.ts:112,130`) e não replicamos o throttle proativo do `X-Shopify-Shop-Api-Call-Limit`.

  **Dois testes que passavam pelo motivo errado, achados pelo review e pelo próprio implementador:**
  o do teto nunca cruzava a fronteira entre chamadas (era ali que o orçamento vazava, 18 s onde a
  régua manda 6), e o do `Retry-After` acima do teto passava por acidente contra um corpo sem retry
  nenhum — "desistir imediatamente" é o que um corpo sem retry faz. Registrados e não implementados:
  corpo malformado no GET escapa como `JSONDecodeError`, `Retry-After` em HTTP-date cai no default,
  price rules órfãs nunca são limpas, e o recurso `PriceRule`/`DiscountCode` do REST está deprecado
  na Shopify — migrar para GraphQL é maior que o item 35 e devia virar fila.

- [x] **34. Templates com componentes e variáveis** `[relatado]` · commits `9af5ca4d` `5c775704`
  `d330182d` `ecc3eff0`
  `runtime/src/agents_runtime/channels/cloud_api.py:88-94` monta só `{name, language}`.
  Template com parâmetro sai vazio ou é rejeitado pela Meta.

  **O buraco não era só do canal.** O sender descarta o payload ao rebaixar para template
  (`sender.py:220-229`, e está certo: o que sai é o template aprovado, não o texto livre), o veredito
  do preflight devolve só `verdict`/`template_name`/`template_language`
  (`20260813000007:88`), e nem `channel_template_policies` nem `commercial_moments.template_readiness`
  têm campo de variável. A `public.whatsapp_templates` existe com `components`/`variables_count` desde
  agosto e `grep whatsapp_templates runtime/src` voltava **vazio**.

  **Entregue: o canal aprende a forma, e recusa fechado o que não pode preencher.**
  `internal.whatsapp_template_shape` (`20260901000009`) devolve as quatro colunas cruas da tabela
  legada — `SECURITY DEFINER` escopada por org, no molde do item 20, porque a tabela está com
  `relrowsecurity=false` e `pg_policy` vazio e um `grant select` daria ao worker os templates de toda
  org. `channels/template_components.py` é espelho de `template-components.ts:39-151`, conferido
  função a função no review, inclusive o formato duplo (JSONB da Meta e colunas achatadas). Template
  com parâmetro e sem valor levanta `TemplateParametersMissing` **antes do wire**, com o template, o
  esperado e o recebido na mensagem; classifica como PERMANENT (`failures.py:103`), então não retenta
  para sempre, e abre linha em `public.alerts` com dedup por template.

  **Linha ausente significa "não sei" e envia como hoje** — recusar por falta de sincronização
  calaria org que hoje funciona. Divergência declarada nos dois arquivos: `components` é omitido
  quando vazio, onde o TS manda `components: []`, para o envio sem parâmetro sair byte a byte como
  saía.

  **Devolvido ao usuário, não implementado (era o ruling D):** de onde viriam os VALORES das
  variáveis. Exige mexer em três contratos SQL — `channel_template_policies`
  (`20260813000003:24-27`), `commercial_moments.template_readiness` (`20260813000005:42`) e o retorno
  do `sender_preflight` (`20260813000007:88`) — e o achado que muda a pergunta é que **o TS também
  não tem fonte automática** para o fallback de 24h: lá os valores vêm do operador no inbox ou das
  variáveis resolvidas da campanha. Escolher uma fonte é decisão de produto, não paridade. Nota do
  review para essa decisão: `header_media_url` já existe na linha da tabela, então o caso de header
  de mídia tem fonte no banco — a porta não a devolve por paridade com o TS.

- [x] **35. Alinhar versões de API** `[relatado]` · commit `c5f91898` · relatório `task-35-report.md`
  Meta: TS `v22.0` (`src/lib/whatsapp/api-version.ts:6`) × Python `v19.0` (`cloud_api.py:29`, `render.yaml`).
  Shopify: TS `2026-04` × Python `2024-01` (`connectors/shopify.py:22`).

  **Subiu, e a conferência foi o trabalho — não o `sed`.** Meta em `v22.0`
  (`cloud_api.py:53`, `render.yaml`, `.env.piloto.example`, `DEPLOY.md`) e Shopify em `2026-04`
  (`connectors/shopify.py:26`). Trocar duas constantes é uma linha cada; o que custa é responder se
  o que este runtime manda continua válido do outro lado. Conferidos no changelog da Graph API, um
  a um, só os pontos que este canal toca: corpo de texto, corpo de template com `components` (o que
  o item 34 acabou de construir), `biz_opaque_callback_data` e os códigos de erro que
  `queueing/failures.py` classifica em PERMANENT/TRANSIENT — nada mudou entre v19.0 e v22.0. Do
  lado da Shopify, `price_rules.json` e `discount_codes.json` estão marcados legados desde
  outubro/2024, mas seguem respondendo em `2026-04` com exatamente os filtros que
  `_find_price_rule_id` usa (`ends_at_min`/`ends_at_max`/`limit`) — a busca fechada do item 33
  continua fechada.

  **O que continua sobrescrevível:** `AGENTS_META_API_VERSION`, porque a Meta aposenta versão por
  cronograma e o piloto não pode depender de deploy para acompanhar. `runtime/.env.piloto` é
  arquivo local de credenciais, não template do repo, e segue em `v19.0`. Isto não é mais pendência
  morna: a v19.0 foi aposentada pela Meta em 21/mai/2026 (verificado em 02/set/2026, ver
  `task-35-evidence.md`) — o piloto local está apontando para uma versão que a Meta já pode recusar.
  Quem roda o piloto precisa atualizar `runtime/.env.piloto` à mão, e o quanto antes.

  **Não mudou, de propósito:** o cupom continua em REST. A Shopify recomenda migrar
  `PriceRule`/`DiscountCode` para o Admin GraphQL — o item 33 já tinha registrado a depreciação —
  mas isso é desenho próprio, é o caminho do dinheiro, e é maior que trocar o número da versão.
  Proposto como item 64 desta fila.

  **Achado do item, registrado e não implementado:** o próprio lado TS não fala uma versão só.
  Além do `v22.0` de `api-version.ts:6` (WhatsApp), há `v19.0` fixo em `src/lib/meta-api.ts:13`
  (Ads), `src/lib/instagram/api.ts:6` e nas quatro rotas de `api/instagram` e
  `api/integrations/meta`, e `2024-01` fixo em `src/app/api/shopify/pixel/route.ts:14`. São
  superfícies diferentes (Marketing API, Instagram, pixel), então nenhuma é paridade do runtime e
  nada disso entrou neste item — mas quem for aposentar uma versão da Meta vai mexer em seis
  arquivos do TS, não em um.

  **Suíte:** `tests/unit` 1152 verdes, 2 falhas pré-existentes de locale (`test_humanize`,
  `test_secret_box_vectors`, item 54 — as duas passam com `PYTHONUTF8=1`) — 1154 no total.
  `tests/pipeline` e `tests/db` não rodaram — pedem Postgres em Docker, e o Docker Desktop desta
  máquina está desligado; nenhuma delas afirma versão de API.

- [x] **36. Providers ausentes no Python** `[relatado]` · commit `ff1469d4` · relatório
  `task-36-report.md`
  Python tem OpenRouter, OpenAI-compat e Anthropic; o TS tem esses mais Gemini, DeepSeek e Groq.
  Org migrada com agente em `gemini` cai em `NoOrgLlmKey` e o turno morre.
  Ação: portar, ou bloquear a escolha na UI para org em `runtime`.

  **A premissa estava errada, e não era `NoOrgLlmKey`.** `agent_core/providers.py:79-91`
  (`client_for`) já mandava todo provider desconhecido para `OpenAICompatibleLlm`; o problema era
  o default de `direct_providers.py:93` (antes do item 36: linha 53) — `base_url or
  OPENAI_BASE_URL` incondicional. Org com provider `groq`/`deepseek`/`gemini` e sem `base_url`
  própria enviava a chave **certa** para a **OpenAI**, que devolvia 401 classificado PERMANENTE
  (`queueing/failures.py:95-98`) — sem alerta de chave ausente. `NoOrgLlmKey` só dispara quando não
  há chave nenhuma (`providers.py:117`) ou quando falta `ENCRYPTION_KEY` para decifrar (`:55`);
  nenhum dos dois é o caso de uma org com a chave da Groq cadastrada.

  **Groq e DeepSeek ganharam URL, não adapter.** Os dois já falam o dialeto OpenAI que
  `OpenAICompatibleLlm` implementa — é o próprio TS que prova, chamando `/chat/completions` nos
  dois (`ai-providers.ts:284,318`). `DEFAULT_BASE_URLS` em `direct_providers.py` é o mapa
  provider → host (porta já autorizada pela fitness `test_no_provider_network.py`), e `client_for`
  (`providers.py:87-91`) passa a montar `choice.base_url or DEFAULT_BASE_URLS.get(provider)` — a
  `base_url` gravada na linha do banco continua vencendo; org com proxy próprio não é atropelada.

  **Gemini foi verificado antes de escolher, e passou nas três provas — duas por chamada real, uma
  por documentação.** POST real contra
  `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` com chave inválida
  (sem gastar credencial de lojista, precedente do item 27): o endpoint EXISTE (400
  `INVALID_ARGUMENT`, não 404); ACEITA `Authorization: Bearer` — a mensagem muda de "Missing or
  invalid Authorization header." (sem header) para "Please pass a valid API key" (header presente,
  chave inválida). A terceira prova — ACEITA `tools` no formato OpenAI — não dá para tirar de uma
  chamada com chave inválida: a mesma resposta de erro com ou sem `tools` no corpo não descarta a
  hipótese mais provável, que é o endpoint rejeitar por auth antes de olhar o corpo. Essa prova vem
  da documentação oficial: `https://ai.google.dev/gemini-api/docs/openai`, seção "Function calling",
  mostra um `curl` contra este MESMO endpoint com corpo `tools` no formato OpenAI padrão
  (`type: "function"`, `function: {name, description, parameters}`) e `tool_choice`. As três provas
  do ruling C se confirmaram, então Gemini entrou no MESMO mapa/branch de Groq e DeepSeek — sem
  adapter nativo, sem arquivo novo, sem mexer na trava de fitness. **Divergência deliberada do
  TS** (que chama o `:generateContent` nativo, `ai-providers.ts:246`), declarada em comentário em
  `direct_providers.py`, com a evidência bruta em `task-36-report.md`. `google` é alias de `gemini`,
  como o TS trata as duas no mesmo `case` (`ai-providers.ts:426-427`).

  **Registrado, não implementado:** bloquear a escolha de provider na UI para org em `runtime` (a
  alternativa que o item oferecia) é decisão de produto, fica registrada. `ai_agents.provider` e
  `organization_api_keys.provider` seguem texto livre — sem `CHECK`/enum: apertar o domínio agora
  quebraria org que já gravou uma string fora da lista, e migração de banco não é este item.

  **Suíte:** `tests/unit` 1160 verdes (`PYTHONUTF8=1`, item 54 fora da conta). Testes novos em
  `test_provider_cascade.py::TestDefaultBaseUrls` — cada provider prova a classe certa E a URL
  montada certa, sem rede real (só inspeciona o `base_url` do client). `tests/pipeline` e
  `tests/db` não rodaram — pedem Postgres em Docker.

- [x] **37. Trilha e relatórios para org migrada** `[relatado]` · commit `3e2a4462`
  (parte Python) · relatório `task-37-report.md`
  Relatórios, propostas, kappa, painel de custo, analytics e `update_agent_stats` leem `agent_traces` /
  `ai_usage_logs`, que o runtime não escreve. Para org migrada tudo vira zero permanente.

  **Fechado: `ai_usage_logs` ganhou visibilidade real — não um teto.** *Correção de registro (ruling
  A do item 41, que investigou esta frase e a achou errada): a versão anterior deste parágrafo dizia
  "e com ela o teto de gasto [voltou a existir]". Não voltou. `checkAiBudget`
  (`src/lib/ai/budget.ts:123-191`) é quem de fato BLOQUEIA (`throwOnExceeded`), e só é chamado de
  `engine.ts`, `evals.ts`, `proposals.ts` e `test-runner.ts` — quatro caminhos TypeScript. O runtime
  Python (`responder.py`/`toucher.py`, o turno de WhatsApp) nunca importa nem chama `budget.ts`; é
  outro processo, outra linguagem. O que este item fechou foi a razão pela qual `budget.ts`, SE algum
  dia rodasse sobre uma org migrada, deixaria de somar sempre zero — `budget.ts:101-112` somava
  `ai_usage_logs`, que ficava vazia (ausência 24), e falhava **ABERTO** por isso. Isso é visibilidade
  do gasto, não um limite aplicado ao turno do runtime: nada no caminho que responde ao cliente ficou
  mais barato nem mais lento por causa desta mudança. O teto de custo por turno do runtime é o
  **item 41**, um mecanismo Python novo e separado — não uma ativação do `budget.ts` existente.*
  Dito isso, a ponte em si: entre abrir uma segunda escrita em Python e fechar a lacuna na trilha que
  o runtime já grava (`internal.llm_calls`), a ponte coube inteira: `agent_id` virou coluna nova (preenchida
  pelo escritor já existente em `responder.py`/`toucher.py`, do mesmo jeito que `organization_id` e
  `conversation_id` já chegam por parâmetro, nunca pelo `CallRecord`); `success` não virou coluna —
  `internal.llm_calls` só recebe chamada CONCLUÍDA (`metering.py`), então todo espelho É sucesso, por
  definição, sem inventar dado. Um trigger (`supabase/migrations/20260902000001_ai_usage_logs_bridge.sql`)
  espelha cada linha nova de `internal.llm_calls` para `public.ai_usage_logs`, com um mapa
  `purpose`→`feature` explícito (`runtime_agent_reply`, `runtime_judge_pre`, ...; vocabulário próprio,
  não o do TS) que falha alto — não inventa `feature` — se um `purpose` novo não estiver mapeado.
  Travado sem banco por `runtime/tests/unit/test_ai_usage_logs_bridge.py`, que lê os dois `.sql` e
  quebra se o CHECK de `purpose` e o `CASE` do trigger divergirem.

  **Bloqueado, e reportado em vez de forçado: `agent_traces`.** O ruling do controlador foi explícito
  — se cumprir a regra de `metering.py` ("conteúdo nunca entra num `CallRecord`") exigisse mais que um
  repositório novo e sua migração, parar e reportar. Exige. `agent_traces.input/output/tool_calls`
  pede o texto e as tool calls do turno VENCEDOR, mas `guarded_reply` (`judges/pre_send.py:304-371`,
  `REGENERATION_LIMIT=2`) escolhe o rascunho de **melhor nota entre até 3 tentativas**, não
  necessariamente a última — hoje nenhuma camada devolve, junto com o rascunho escolhido, QUAIS tool
  calls e QUAL geração produziram aquele rascunho especificamente. Fechar isso direito pede
  encadear estado por `generate`/`traced_generate`/`guarded_reply` (qual tentativa venceu, as tool
  calls dela) — redesenho de fluxo, não wiring de uma escrita nova. Consumidores que dependem de
  `agent_traces` (propostas de melhoria, dataset de kappa/eval) continuam zerados para org migrada.
  Proposto como item novo na fila, com o próprio achado desta investigação como ponto de partida.
  Virou o **item 65**.

  **Fora desta parte, por escopo:** `update_agent_stats` (não lê nenhuma das duas tabelas — só nunca é
  chamada para org migrada; nenhum ruling do item cobriu isso, não implementado — ver **item 67**).
  A RLS de
  `ai_usage_logs` (`FOR ALL USING (true)`, sem isolamento real por org) fica como está — ruling E:
  consertá-la é postura de segurança que atinge o lado TS também, não é este item.

  **Mais um, vindo do item 30 — não implementado nesta tarefa (é a parte Python):** no estado
  observado durante esta tarefa, `conversation-ai-status.ts` desligava o badge explicativo para org em
  modo `runtime` com o argumento de que "o runtime Python nunca lê essa coluna". Agora lê, e os guards
  decidem — então o badge podia dizer "Bot ativo" numa conversa em que o agente está calado por
  `stop_on_human_reply`, teto, horário, cooldown ou ativação manual. Nas duas TRANSFERÊNCIAS o badge
  ficava honesto (a checagem de `ai_enabled` roda antes do early-return de `runtime`); a mentira
  sobrava nos outros cinco. É `src/`, e esta tarefa (a parte Python do item 37) não tocou em `src/` —
  fica registrado aqui como achado, não como trabalho desta parte. (Nota: `git log -- src/lib/ai/
  conversation-ai-status.ts` mostra commits posteriores a este relatório mexendo neste arquivo; não
  verifiquei o estado atual dele nem é desta parte confirmar se o achado segue de pé.)

  **Suíte:** `tests/unit` 1170 verdes (`PYTHONUTF8=1`). `tests/pipeline` e `tests/db` não rodaram —
  pedem Postgres em Docker, indisponível nesta máquina; o teste novo do espelho
  (`tests/db/test_llm_calls_persistence.py::TestTheUsageLogsMirror`) fica sem prova executável aqui.

  **Parte de UI, fechada em despacho separado** · relatório
  `.superpowers/sdd/AUDITORIA-IA-2026-08-28-CHECKLIST/task-37-ui-report.md`.
  `conversation-ai-status.ts:166-168` (o early-return) foi removido — org `runtime` cai na MESMA
  cadeia de guards que a org `legacy` já usava (`activate_on: manual`, cooldown de transferência,
  `max_messages_per_conversation`, `stop_on_human_reply`), sem RPC nova: a rota já lê
  `whatsapp_cloud_conversations`/`whatsapp_cloud_messages` direto, os mesmos dados que
  `internal.legacy_conversation_guard_state` expõe ao runtime Python (a ponte SQL do item 30 resolve
  do id CANÔNICO pro espelho por telefone; esta rota já vive no espaço de id do espelho e não precisa
  desse salto). Cobre quatro dos cinco motivos com o código que já existia. O quinto, horário, não
  tinha guard nenhum nesta cadeia — nem para `legacy` — porque quem checa de verdade é
  `engine.ts:checkSchedule`, chamado só dentro do envio real, nunca do badge; a lógica foi extraída
  para `guards.ts:isWithinSchedule` (reuso, zero duplicação) e passou a entrar na cadeia SÓ para
  `runtime` (novo motivo `outside_schedule`) — `legacy` continua exatamente como estava, provado por
  teste (`org em legacy: horário fora da janela NÃO bloqueia o badge`). `npx vitest run`: 1282
  passando, 4 falhas pré-existentes e alheias (`reports-utils.test.ts`, timezone; `file-extractor
  .integration.test.ts`, fixture de PDF), nenhuma nos arquivos tocados aqui.

  **Fix round 1 da parte de UI** · relatório (seção "Fix round 1") no mesmo `task-37-ui-report.md`.
  Achado 1 (Important, corrigido): `ChatPanel.tsx` afirmava "Bot Ativo" quando `aiStatus` vinha `null`
  (fetch em voo, falhou, ou sem espelho cloud pra calcular) — o mesmo defeito que este item existe pra
  eliminar, só que na tela em vez da rota. Extraída a decisão de variante/rótulo pra
  `src/lib/ai/bot-badge.ts` (puro, testável sem jsdom/RTL — nenhum dos dois está no projeto), com um
  quarto estado `unknown` que nunca afirma atividade; o caminho `!conversation.is_bot_active` não foi
  tocado. Achado 2 (Minor, corrigido): o fallback `?? '08:00'/'18:00'` em `isWithinSchedule` pra
  `hours` parcial não existia no `engine.ts` original — removido; `hours` parcial volta a bloquear em
  silêncio (comparação com `undefined`), igual ao motor que já rodava em produção. Achado 3 (registro,
  não corrigido — é item de fila novo, não desta tarefa): a regra de cada guard de comportamento agora
  tem TRÊS cópias independentes (`cloud-runner.ts`, `conversation-ai-status.ts`, `guards.py`) pros
  quatro motivos comportamentais, e DUAS (`engine.ts` via `guards.ts:isWithinSchedule`,
  `guards.py:is_within_schedule`) pra horário — todas mantidas por convenção de comentário ("paridade
  de semântica, não de código"), sem teste cruzado que trave divergência entre TS e Python. Risco:
  qualquer uma pode divergir das demais em silêncio, e nada no CI pegaria. Virou o **item 66**.

- [x] **38. Typing indicator e o tique azul que vem junto** `[relatado]` · relatório
  `task-38-report.md`
  Divergência já declarada. Depende do outbox carregar o wamid do último inbound.

  **O item entrega duas coisas, não uma (ruling A).** O texto original só nomeava o "digitando";
  a recon achou o efeito maior: a Meta só aceita `typing_indicator` de carona num `status: read`
  sobre o wamid do inbound — MESMO POST, `cloud-api.ts:515-525` do lado TS — e esse disparo
  (`cloud-sender.ts:257-283`) é o ÚNICO gatilho AUTOMÁTICO de mark-as-read do produto inteiro (os
  outros dois, `conversations/route.ts:313-334` e `message-service.ts:479`, só rodam quando um
  operador abre a conversa). Sem o typing, org migrada nunca marcava a mensagem do cliente como
  lida no fluxo automático — os dois tiques azuis nunca apareciam sozinhos. Fechar o typing fecha
  os dois.

  **Ruling B: rota (1), e a verificação veio antes do código.** `internal.claim_outbox_batch` e o
  tipo `internal.claimed_send` só têm UM consumidor: `repository/engine.py::claim_outbox_batch`,
  chamado só de `queueing/sender.py::sender_pass`; os três testes de banco que citam a função
  (`test_outbox_claim.py`, `test_otel_carrier.py`, `test_send_guard_wiring.py`) leem por índice só
  até a coluna 8 (`kind`) ou por nome de campo, nunca contam colunas. Uma coluna nova no fim não
  quebra nada. `internal.claimed_send` ganhou `last_inbound_wamid` (mesmo padrão `alter type ...
  add attribute` que a 9.1b/`otel` já usou); `claim_outbox_batch` devolve o `provider_message_id`
  do último inbound da conversa via subselect em `public.messages`; `ClaimedSend`
  (`runtime/src/agents_runtime/repository/outbox.py`) e `repository/engine.py` ganharam o campo
  espelho.

  **Ruling C — best-effort, molde do item 37.** `queueing/sender.py::_mark_read_and_typing`
  (chamado de `send_humanized`, antes de CADA bolha — ruling E) segue o mesmo padrão de
  `note_step`/`_recorder` de `agent_core/responder.py`: `try/except Exception:
  logger.debug(..., exc_info=True)`, nunca propaga. `CloudApiChannel.mark_read_and_typing`
  (`runtime/src/agents_runtime/channels/cloud_api.py`) faz o POST e levanta em erro como `send()`
  levanta — quem decide engolir é o chamador, não o adapter.

  **Ruling D — sem wamid, silêncio.** Linha de funil sem conversa, conversa sem inbound: o
  subselect devolve `null`, `_mark_read_and_typing` retorna sem chamar o canal. Nenhum typing
  "falso" — a linha proibida em `channels/humanize.py` continua de pé.

  **Ruling G — o mudo continua mudo.** Guard calando o agente = nenhuma bolha = nenhum read/typing,
  igual ao TS. Não implementado (nem cogitado): marcar como lida quando o agente não vai responder
  seria divergência nova, fora de escopo deste item.

  **`FORK.md` atualizado (ruling H)**: a entrada 2 de "Divergências conscientes do v1" e a lista de
  ausências antes de "O que a loja PERDE" já não citam o item 38 como pendente.

  **Sem prova executável:** a migração
  `supabase/migrations/20260902000002_claim_outbox_last_inbound_wamid.sql` não rodou — sem
  Postgres nesta máquina. `tests/pipeline` e `tests/db` não executaram pelo mesmo motivo —
  inclusive `tests/db/test_outbox_claim.py::TestLastInboundWamid`, que cobre por escrito o
  subselect novo mas nunca RODOU contra um Postgres de verdade.

  **Suíte (fechamento original):** `tests/unit` 1182 verdes (`PYTHONUTF8=1`; baseline real 1174 +
  7 testes declarados + 1 caso automático de `test_no_max_seq.py` que a própria migração gera).
  `lint-imports`: 3 contratos mantidos, 0 quebrados.

  **Fix round 1** (achados da review) · relatório, seção "Fix round 1" em `task-38-report.md`.
  Corrigida a frase acima que insinuava um teste de `tests/db` já escrito quando não havia nenhum
  (Important) — `TestLastInboundWamid` foi escrito em `test_outbox_claim.py` cobrindo o subselect
  (último `seq`, múltiplos inbounds, mensagem outbound não conta, sem inbound e sem conversa
  devolvem `null`), ainda sem prova executada. Duas divergências do TS que não estavam declaradas
  em comentário (Minor 1 e 2) foram alinhadas ao TS, não mantidas: `send_humanized` só dispara
  read/typing para bolha de TEXTO (nunca para template — `sendHumanizedReply` do TS é exclusivo de
  resposta de IA) e só quando `humanize_delays` está ligado (o mesmo knob que desliga o ritmo do TS
  desliga o typing junto, `cloud-sender.ts:257`). A baseline de testes corrigida para 1174 (a
  verificação independente da review, num worktree isolado no commit-base, achou que o 1175 do
  relatório original vinha do ambiente da máquina do implementador, não de uma diferença real —
  Minor 3). **Suíte após o fix:** `tests/unit` 1184 verdes (`PYTHONUTF8=1`; os dois testes novos de
  `TestReadAndTyping` somados aos 1182 de antes). `lint-imports`: 3 contratos mantidos, 0
  quebrados.

---

## Fase 5 — Custo e qualidade do motor

- [x] **39. Parar de mandar o transcript duas vezes** `[confirmado]` · commit `7ec48247` ·
  relatório `task-39-report.md`
  `runtime/.../responder.py:437` monta `ConversationBlock` com `transcript` + `pending` no prompt de
  sistema; `:481` faz `_as_chat(transcript)` e `:543` espalha como turnos de chat. E
  `repository/agent.py:251` não exclui a janela pendente. Resultado: ~2× tokens de entrada por chamada,
  em até 12 gerações por turno — e é o padrão que induz o modelo a repetir.

  **A duplicação era tripla, não dupla.** O bloco `# CONVERSA` do `system`
  (`agent_core/prompt_compiler.py::_conversation_block`) despejava `transcript` inteiro E `pending`
  de novo (rótulo "— responder agora a:"), e `_as_chat(transcript)`
  (`agent_core/responder.py::build_responder.respond`) espalhava o MESMO `transcript` como turnos de
  chat — como `repository/agent.py::load_recent_transcript` não excluía a janela pendente, o turno
  atual aparecia em até três lugares na mesma chamada.

  **Ruling C — consumidores de `load_recent_transcript`, verificados antes do código.** Dois
  chamadores em produção: `build_responder.respond` (com janela pendente própria, único ponto onde
  `transcript`/`pending` podiam se sobrepor) e `agent_core/toucher.py::build_toucher.touch` (sem
  janela pendente — nunca teve a duplicação A). Filtrar na fonte não quebrou nenhum: o parâmetro
  novo `exclude_inbound_after_seq` é opcional, `None` por padrão, e só `respond` o passa.

  **O que mudou.** `load_recent_transcript` ganhou `exclude_inbound_after_seq` (condição na query,
  não dedup em Python). `ConversationBlock` perdeu o campo `pending` (sem uso depois do corte).
  `_conversation_block` ganhou `mode`: em `"turn"` não despeja mais o histórico como texto — só a
  rubrica de mídia da loja sobrevive (item 31, exclusiva do bloco); em `"preview"`
  (`server.py::_preview`, que não monta array de chat) manteve o dump completo, porque ali não há
  nada para duplicar. `responder.py` passa a montar `_as_chat(transcript + pending)`, seguro porque
  a query já garante os dois conjuntos disjuntos.

  **Ruling D — a medida, e a correção da promessa.** Turno sintético de 20 mensagens (17 de
  histórico + 3 pendentes, o caso comum em que a conversa cabe no `TRANSCRIPT_LIMIT`), medido em
  DOIS cenários (fix round 1 — ver abaixo): **sem `# CONHECIMENTO`, 2660 → 1678 caracteres, razão
  1,59× (redução de 36,9%); com `# CONHECIMENTO`** (o bloco que `responder.py` anexa fora do
  compilador em turnos com RAG, 5 chunks sintéticos = `knowledge_limit` padrão), **3592 → 2610
  caracteres, razão 1,38× (redução de 27,3%)** — nenhum dos dois é ~2× como o achado original
  estimava. **A economia absoluta é a mesma nos dois cenários: 982 caracteres a menos por chamada**
  (o tamanho do dump que deixou de ser escrito duas vezes) — o que muda entre os cenários é só o
  denominador, quanto do resto do `system` (AGENT/MISSÃO/ESTADO/CANAL, e agora CONHECIMENTO) já
  pesava sem nunca ter duplicado.

  **Fix round 2 (achado da re-review): os chunks sintéticos são menores que os reais.** Os 5 chunks
  do cenário com RAG somam 901 caracteres, média de 180 por chunk — bem abaixo do `chunk_size` real,
  que chega a 2000 caracteres por chunk (`text-processor.ts`, default de 500 tokens). Portanto **a
  razão real com RAG em produção é MENOR que 1,38×** — outro fator, mesmo mecanismo do achado
  anterior (texto fixo maior dilui a razão) — enquanto **a economia absoluta de 982 caracteres por
  chamada não muda**, porque ela não depende do tamanho do resto do prompt. **A razão varia com a
  composição do prompt; a economia absoluta, não** — um `system` de produção com persona maior,
  mais fatos de ESTADO e chunks de conhecimento do tamanho real tende a uma razão ainda mais perto
  de 1,0× do que de 1,38×–1,59×. **Corrigindo a promessa deste item: o ganho medido vai de 1,38× a
  1,59× neste cenário sintético (e é otimista mesmo nesse teto, por causa dos chunks pequenos), não
  ~2×**, com 982 caracteres de economia absoluta por chamada. Continua valendo por chamada,
  multiplicado pelas até 12 gerações por turno (ruling E, intocado).

  **Teste que trava a duplicação.** `tests/unit/test_prompt_compiler_blocks.py::TestTheConversationBlockDoesNotDuplicateTheChatArray`
  (3 casos, sem banco): texto comum do transcript não chega ao bloco em modo `"turn"`; a rubrica de
  mídia da loja sobrevive; o modo `"preview"` continua mostrando o dump completo.

  **`FORK.md` atualizado**: novo parágrafo "Item 39, fechado" na seção "Trilha, custo e
  visibilidade".

  **Sem prova executável:** `tests/db` e `tests/pipeline` pedem Postgres em Docker, ausente nesta
  máquina — inclusive `test_agent_loaders.py` (a query nova), `test_responder_guards.py` (o teste
  que fixa a separação narração/fala da rubrica de mídia) e `test_server.py::TestPreview` (o teste
  que fixa o dump completo no preview). Os três continuam corretos por leitura; nenhum rodou.

  **Suíte:** `tests/unit` 1187 verdes (`PYTHONUTF8=1`; 1184 da baseline + 3 testes novos).
  `lint-imports`: 3 contratos mantidos, 0 quebrados.

  **Fix round 1** (achados da review) · relatório, seção "Fix round 1" em `task-39-report.md`.
  **Important:** a medida original (1,59×) não incluía o bloco `# CONHECIMENTO`, que
  `responder.py::build_responder.respond` anexa ao `system` fora do compilador em turnos com RAG —
  texto fixo que dilui a razão sem mudar a economia absoluta. Corrigido medindo os dois cenários
  (sem/com conhecimento) acima, com a economia absoluta (982 caracteres) e a frase de que a razão
  varia com a composição do prompt. **Minor 1:** o script de medida só existia no scratchpad de
  sessão — versionado em `runtime/scripts/measure_transcript_duplication.py`. **Minor 2:**
  `_conversation_block` reimplementava `is_store_media_line` inline sobre a tupla `(author, text)`
  — corrigido reconstruindo `PendingMessage(author=author, text=text)` e chamando o predicado
  canônico de `agent_core/media.py`, uma fonte só. **Suíte após o fix:** `tests/unit` 1187 verdes
  (mesma contagem — os dois Minor são refactors sem mudança de comportamento). `lint-imports`: 3
  contratos mantidos, 0 quebrados.

- [x] **40. Fechar ou reusar os clientes httpx de LLM** `[confirmado]` · commits `23d6a76d`
  `9e0a1864` `8b6c6891` `179c1630` · relatório `task-40-report.md`
  `agent_core/providers.py::client_for` constrói o adapter por turno; os três criam `httpx.AsyncClient`
  no `__init__` (`openrouter.py::OpenRouterLlm`, `direct_providers.py::OpenAICompatibleLlm` e
  `::AnthropicLlm`) e nenhum tinha `aclose()`. O único `aclose` do runtime era o do canal Meta.

  **A gravidade do achado original estava errada (ruling A) — corrigida antes do código.** Recon
  independente (`task-40-recon.md`) seguiu o resultado de `client_for` até o consumo real: não é um
  cliente por CHAMADA de LLM, é um cliente por TURNO. `resolve_agent_llm` é chamado **uma vez** dentro
  de `build_responder.respond`, o resultado vira `chat = _metered(...)` e é ESSE `chat` — reusando o
  MESMO `httpx.AsyncClient` — que `generate`/`traced_generate` chamam dentro do laço de tool-rounds e
  de todas as tentativas do `guarded_reply` (até ~12 chamadas de agente por turno, mais o juiz — que
  usa um cliente TOTALMENTE diferente, por processo, criado uma vez em `agent_responder()`; esse não é
  tocado por este item, ruling D). O vazamento existe — o cliente do turno nunca fechava, e sem
  finalizador nos adapters ficava vivo até o GC recolher o objeto, não determinístico num loop asyncio
  de longa duração — mas era um vazamento por TURNO, não por chamada; a leitura literal do achado
  superestimava em ~12×.

  **Fechar, não reusar (ruling B) — e o porquê fica escrito, não só decidido.** Reusar exigiria um pool
  keyed por `(organização, provider, base_url efetiva, hash da api_key)` — a credencial vai no header
  fixo do client aqui, ao contrário do `CloudApiChannel` (token por-request); e o que muda por turno é
  a chave de autorização (sempre), às vezes a `base_url` (proxy próprio da org) e a classe do adapter
  (por provider) — só o `timeout` é constante. Isso é máquina nova: registro de processo guardando
  cabeçalho de autorização de várias organizações em memória, com política de expiração, para
  economizar **um** handshake por turno — quando as até 12 chamadas do turno já compartilham a mesma
  conexão. Não vale hoje. Registrado como possibilidade futura no `FORK.md`, condicionada à condição
  que a justificaria: uma medida mostrando que o custo de handshake TLS por turno pesa frente ao custo
  das ~12 chamadas que já reusam a conexão. Nenhuma medida assim existe — não é item novo aberto por
  conta própria.

  **O que subiu (ruling C — o mínimo que fecha).** `aclose()` nos três adapters, delegando para o
  `httpx.AsyncClient` interno. O fechamento em si mora em
  `agent_core/providers.py::scoped_agent_llm` — o único mecanismo que fecha o cliente resolvido por
  `resolve_agent_llm`, guardado por `owns`: só fecha o cliente que a cascata BYO construiu, nunca o
  `llm` de plataforma do Judge 1. Nenhum gerenciador de ciclo de vida entre turnos, nenhum registro
  global, nenhum pool — só um `finally` (por trás de um `@asynccontextmanager`) que cobre o corpo
  inteiro do turno, todo `return` intermediário incluído.

  **Achado vizinho (ruling F) — o `aclose()` do canal Meta que só o teste chama.** Registrado, não
  consertado junto: `channels/cloud_api.py::CloudApiChannel.aclose` existe, mas o único chamador em
  `runtime/src` é a própria definição; em produção a instância vive por processo inteiro e nunca é
  fechada num shutdown gracioso — quem chama é só `tests/db/test_cloud_api_channel_real_wiring.py`,
  como limpeza de teste. Não é o mesmo defeito (ali o cliente É de vida longa por desenho; falta só o
  `atexit`/shutdown que nunca existiu).

  **O TS não é referência aqui (ruling H) — divergência estrutural, não paridade que falta.**
  `ai-providers.ts` fala com todo provider pelo `fetch` global do runtime Node/undici, uma vez por
  request — não existe objeto cliente para fechar ou reusar; o pool keep-alive é gerenciado
  implicitamente pelo Node. O Python precisa deste `aclose()` porque escolheu a API
  `httpx.AsyncClient`, não porque o TS faz algo equivalente que faltava portar. Declarado em
  comentário no `OpenRouterLlm.aclose` (`openrouter.py`), e aqui e no `FORK.md`.

  **Teste que trava a regressão (ruling E) — reescrito no fix round 1, ver abaixo.**

  **Fix round 1** (achados da review) · commits `9e0a1864` (docs) `8b6c6891` (código) · relatório,
  seção "Fix round 1" em `task-40-report.md`.

  **Important 1 — o teste do ruling E provava a forma, não o comportamento.** A primeira versão só
  afirmava, por AST, que `respond()` tinha um `finally` com `aclose` guardado por um `if`. A review
  reproduziu a validação original e foi além: extraiu a MESMA guarda e o MESMO fechamento para uma
  função auxiliar — comportamento idêntico — e as asserções quebraram do mesmo jeito, provando que o
  teste protegia o formato sintático, não o fechamento em si; um refactor legítimo o deixaria vermelho
  sem nada ter quebrado. Corrigido extraindo o fechamento para
  `agent_core/providers.py::scoped_agent_llm` e reescrevendo a prova como comportamental
  (`tests/unit/test_agent_llm_closes_after_the_turn.py::TestScopedAgentLlmClosesTheClientItOwns`),
  contra um `LlmPort` falso que registra a ordem dos eventos: fecha depois de TODAS as chamadas do
  turno; fecha quando o turno levanta exceção; fecha quando o turno é CANCELADO
  (`asyncio.CancelledError` — caminho que a review pediu); nunca fecha o cliente de plataforma do
  Judge 1. Critério duplo validado ao vivo: removendo o `aclose()` do `finally`, as três primeiras
  asserções quebram; trocando o `@asynccontextmanager` por uma classe `__aenter__`/`__aexit__`
  equivalente (mesmo comportamento, mecanismo diferente), as nove continuam verdes. O AST original
  virou `TestTheTurnWiresIntoTheScope`, cinto e suspensório — checa só que `respond()`/`touch()`
  chamam `scoped_agent_llm`, sem opinar sobre como o fechamento acontece por dentro.

  **Important 2 — a nota anterior sobre o item 44 estava errada.** O texto original deste item dizia
  que a dívida de `touch()` não fechar era "a mesma classe de duplicação que o item 44 já rastreia".
  O item 44 lista três divergências entre `responder.py` e `toucher.py` (envelope JSON, conhecimento,
  tool-loop) e NÃO menciona cliente HTTP não fechado — a afirmação de cobertura era falsa, o tipo de
  defeito que esta auditoria persegue. A releitura do ruling C: `respond()` e `touch()` são dois
  pontos INDEPENDENTES onde o adapter de LLM nasce e morre — fechar nos dois não é espalhar remendo,
  é o mesmo conserto aplicado nos dois lugares onde o defeito existe. **`touch()`
  (`agent_core/toucher.py::build_toucher.touch`) ganhou a mesma guarda `owns_agent_llm` e o mesmo
  `async with scoped_agent_llm(...)` que `respond()` já tinha.** Não sobra dívida sem dono: os dois
  caminhos onde um `httpx.AsyncClient` de LLM nasce por turno fecham.

  **Suíte após o fix round 1:** `tests/unit` 1197 verdes (`PYTHONUTF8=1`; era 1193). O arquivo de
  teste do item 40 foi reescrito: saíram os 2 testes por AST que checavam a forma do `finally`;
  entraram 4 comportamentais (`TestScopedAgentLlmClosesTheClientItOwns`) e 2 de wiring por AST, um
  por ponto de fechamento (`respond()` e `touch()`) — 9 testes no arquivo (era 5), líquido +4 na
  suíte. `lint-imports`: 3 contratos mantidos, 0 quebrados.

  **Suíte antes do fix round 1:** `tests/unit` 1193 verdes (`PYTHONUTF8=1`; 1188 da baseline local +
  5 testes novos — 1188, não os 1187 do brief: a contagem já havia avançado por commits do item 39
  fora da amostragem do brief). `lint-imports`: 3 contratos mantidos, 0 quebrados.

- [x] **41. Teto de custo por turno** `[relatado]` · relatório `task-41-report.md`
  `MAX_TOOL_ROUNDS=3` é por tentativa e o juiz dá 3 tentativas → pior caso 12 gerações + 3 juízes por
  mensagem, cada uma com timeout de 60s, com a lease renovada pelo keepalive.

  **A conta confere e é maior que a do achado (ruling A da recon).** 3 tentativas × (3 rodadas de
  tool + 1 chamada final forçada sem tools) = 12 gerações, mais 3 juízes, mais até 1 embedding (uma
  vez por turno, não multiplicado) = **até 16 chamadas de LLM por mensagem de cliente**, no pior caso
  de desenho.

  **Onde o teto mora (ruling B): `MeteredLlm`, e só lá.** `agent_core/metering.py::MeteredLlm` é o
  único código por onde passa TODA chamada de LLM de um turno — `agent_reply`, `judge_pre`,
  `embedding`. Ganhou um `TurnBudget` opcional (`reserve(purpose)`, chamado ANTES do request de
  rede): uma instância nova por turno, compartilhada por referência entre as três finalidades na
  composição (`agent_core/responder.py::build_responder.respond`). A chamada recusada nunca sai para
  a rede — nunca custa, nunca vira linha em `internal.llm_calls`.

  **Ao estourar (ruling C): a escalada para, o rascunho vai.** `TurnBudgetExceeded`, capturada em
  `judges/pre_send.py::guarded_reply`, interrompe o loop de tentativas SEM contar a tentativa em
  curso (ela não produziu julgamento). Se uma tentativa anterior já tinha um rascunho reprovado só em
  critério `standard` (o `best` que o mecanismo de regeneração já guarda), ele sai — mesmo caminho de
  código de quando as regenerações se esgotam sozinhas. Só sem NENHUM rascunho é que o turno falha:
  `blocked_by="budget_exceeded"`, alerta `critical_violation` com título que nomeia a causa real (não
  "Judge 1 reprovou" — isso mentiria).

  **O default (ruling D): 8, e a conta é o turno normal, não o pior caso.**
  `DEFAULT_TURN_LLM_CALL_LIMIT = 8` (`agent_core/metering.py`), override por
  `AGENTS_TURN_LLM_CALL_LIMIT`. Um turno que passa de primeira gasta 2 chamadas (1 geração sem tool +
  1 julgamento); com uma rodada de tool (o caso comum de `create_coupon`, ver
  `tests/db/test_responder_tool_loop.py`), 3; com embedding, até 4. 8 dá folga para uma regeneração
  INTEIRA do Judge 1 sem disparar, e ainda para em metade do pior caso de desenho (16) — apertado o
  bastante para nunca custar as 16 chamadas por acidente, folgado o bastante para não cortar turno
  legítimo (o risco que o ruling D pede para evitar: um teto raso vira resposta pior, não erro visível).
  **Ressalva (fix round 1 — Minor #1 da review):** os números 2-4 acima vêm da FORMA do código (contando
  chamadas por caminho), não de dado empírico de `internal.llm_calls` — não havia Postgres acessível
  nesta tarefa para medir o gasto real de um turno normal. Revalidar contra dado real quando houver
  acesso ao banco piloto; se a média medida divergir muito de 2-4, o default de 8 deve ser revisto.

  **Ruling E, respeitado.** `MAX_TOOL_ROUNDS` e `REGENERATION_LIMIT` não mudaram.

  **Ruling F, registrado e não implementado.** O teto de TEMPO do turno (sem `wait_for` agregado em
  `queueing/worker.py`, `_keepalive` renovando lease e visibilidade sem limite de renovações) virou
  item novo — **item 68**.

  **Divergência do TS, declarada em `metering.py`.** O TS bloqueia por orçamento em dólar
  (`checkAiBudget`) em vários pontos de entrada; o runtime tem um teto de CHAMADAS por turno, num
  ponto único — YAGNI: sem framework de orçamento, sem política por organização.

  **Testes (ruling G).** `test_pre_send_judge.py::TestTheTurnBudget` — o teto corta a escalada e
  entrega o melhor rascunho quando estoura no meio de uma tentativa, e um turno normal fica bem
  abaixo do default e nunca dispara (mais um terceiro caso: sem rascunho nenhum, falha alto com o
  `blocked_by` certo). `test_llm_metering.py::TestTheTurnBudget` — a chamada além do teto é recusada
  sem deixar linha, o teto é compartilhado entre finalidades, e um turno normal com as três
  finalidades reais fica sob o default.

  **Fix round 1 (review — `task-41-report.md`, seção "Fix round 1").** Dois Important.
  `agent_core/toucher.py::build_toucher.touch` chamava `_metered(...)` **sem** `budget=` nos dois
  call sites (`agent_reply`, `judge_pre`) — o toque (segundo tipo de turno do runtime) ficava
  INTEIRAMENTE fora do teto do item 41. Corrigido: `touch()` ganhou o mesmo `TurnBudget` por turno,
  compartilhado entre as duas finalidades, e o mesmo título de alerta corrigido quando o motivo é o
  teto (não o Judge 1). Trava de regressão nova e genérica —
  `test_llm_metering.py::TestEveryMeteredCallSiteIsBudgeted` — varre `agent_core/*.py` por QUALQUER
  `_metered(...)`/`partial(_metered, ...)` sem `budget=`, não só o caso já visto (é a segunda vez
  seguida que `touch()` é o gêmeo esquecido de `respond()` — a primeira foi o `aclose()` do item 40;
  ver a nota nova no item 44 abaixo). Faltava também a trava do cenário mais arriscado: o teto
  estourando DENTRO de `judge()` (não de `generate()`) na mesma tentativa em que `generate()` já
  tinha produzido um rascunho, com um `best` julgado de tentativa anterior disponível — o
  comportamento (rascunho não julgado nunca vira `outcome.draft`) estava certo por leitura de
  código, sem nada que o travasse; teste novo
  `test_pre_send_judge.py::TestTheTurnBudget::test_the_cap_inside_the_judge_never_promotes_the_unjudged_draft`
  prova (verificado ao vivo: uma regressão simulada que promovesse o rascunho não julgado quebra a
  asserção). Dois Minor: a docstring de `TurnBudget.reserve` (`metering.py`) passou a declarar que uma
  chamada que FALHA já consumiu o slot, sem rollback; e a ressalva sobre o default (acima, no
  parágrafo do ruling D) — estava só em `FORK.md`/relatório, agora está aqui também.

  **Suíte após o fix round 1:** `tests/unit` 1205 verdes (`PYTHONUTF8=1`; era 1203, +2). `lint-imports`:
  3 contratos mantidos, 0 quebrados. `tests/db`/`tests/pipeline` pedem Postgres, indisponível nesta
  máquina.

- [x] **42. Custo vindo do provedor, não de tabela hardcoded** `[confirmado]` · relatório `task-42-report.md`
  `src/lib/ai/cost-tracker.ts:61-62` devolvia `0` para modelo fora do dicionário; as 15 chaves eram todas
  sem namespace e a org piloto usa `google/gemini-3.5-flash`. Somado ao fail-open triplo de `budget.ts`,
  **não existia controle de gasto**. O Python já resolvia certo em `agent_core/metering.py` — este item
  portou a DECISÃO (desconhecido nunca é zero), não o mecanismo (o Python não tem tabela de preço
  nenhuma; o TS continua precisando de uma — ver o parágrafo C abaixo).

  **A inversão do item, confirmada.** Ao contrário de quase todos os outros da fila, o alvo aqui é
  `src/`, não `runtime/` — o Python já estava certo (`Usage.cost_usd: float | None`, `None` nunca vira
  `0`). `runtime/` não mudou nesta tarefa.

  **Ruling C, e a correção de impressão que o próprio item pede.** O título do item ("não de tabela
  hardcoded") engana: a tabela **não morreu** e não devia. OpenAI e Anthropic não devolvem custo na
  resposta da API — é por isso que o Python grava `cost_usd=None` de propósito pra esses dois
  (`direct_providers.py`); sem tabela, não haveria NENHUM jeito de estimar o custo desses provedores.
  O que mudou nas 15+ entradas de `PRICING` foi: (1) namespace `<provider>/<model>` batendo com o id
  real — direto (`openai/gpt-4o-mini`, bare do lado do provider) ou já namespaced (formato OpenRouter,
  ex. `google/gemini-flash-1.5`, que inverte a ordem do sufixo de versão — `estimateCostUsd` tenta as
  duas grafias); (2) ausência na tabela agora significa **desconhecido**, nunca **zero**.
  `google/gemini-3.5-flash` (o modelo do piloto) continua fora da tabela depois do conserto — não
  existe entrada 3.5 nem no catálogo do OpenRouter — e isso é o comportamento CORRETO agora: vira
  `null`, loga aviso, nunca `$0`.

  **Ruling B, as três camadas.** (1) *Função:* `estimateCostUsd` devolve `number | null` (era sempre
  `number`); `trackAiUsage` grava `cost_usd: null` (era `0` forçado) e loga
  `[trackAiUsage] custo desconhecido...` (ruling D). (2) *Tipo:* `TrackAiUsageInput.costUsdOverride` e
  o retorno de `estimateCostUsd` aceitam `null`; `BudgetCheckResult` ganhou `hasUnknownCost: boolean`
  — `spentUsd` continua `number`, mas agora é EXPLICITAMENTE "soma do conhecido", nunca um `0`
  inventado pra chamada sem preço. (3) *Schema* (migration
  `supabase/migrations/20260902000003_ai_usage_logs_cost_usd_unknown.sql`, não aplicada — sem Postgres
  nesta máquina, ver ruling G abaixo): `ai_usage_logs.cost_usd` perde o `DEFAULT 0`; a RPC
  `ai_monthly_cost_usd` passa de `NUMERIC` solto para `TABLE(spent_usd, has_unknown_cost)` — `SUM`
  já ignora `NULL` em SQL padrão (soma só o conhecido, honestamente), mas o valor sozinho não dizia se
  era completo ou parcial (um mês só de chamadas desconhecidas somava igual a um mês sem nenhum gasto
  — os dois davam `0`). `has_unknown_cost` fecha essa ambiguidade.

  **Achado extra, fora da recon original — o espelho do item 37 tinha o MESMO achatamento.**
  `internal.mirror_llm_call_to_usage_logs` (`20260902000001_ai_usage_logs_bridge.sql`, a ponte que o
  item 37 escreveu de `internal.llm_calls` para `ai_usage_logs`) gravava `coalesce(new.cost_usd, 0)` —
  o `None` deliberado do Python (`llm.py`, "Absent stays absent") virava `0` bem na hora de cruzar pro
  lado TS, pro exato caminho que a org migrada usa. Corrigido na mesma migration (`CREATE OR REPLACE`,
  não editei o arquivo original do item 37 — a migration antiga fica intacta, inclusive pro CHECK que
  `runtime/tests/unit/test_ai_usage_logs_bridge.py` trava). Não mexi no mapa `purpose`→`feature`.

  **Ruling D, visibilidade.** `trackAiUsage` loga (`console.warn`) toda vez que grava uma chamada de
  modelo desconhecido, com `{provider, model}`. `checkAiBudget` loga quando o mês tem alguma chamada
  assim (`hasUnknownCost`), avisando que `spentUsd` retornado é parcial. `/api/ai/usage` (o painel)
  ganhou `totals.unknownCostCalls` e `budget.hasUnknownCost` na resposta — o silêncio que fez o defeito
  durar até agora (a org piloto gastando de verdade, o painel mostrando `$0`) não existe mais em
  nenhum dos três lugares onde um humano ou um log poderia ver o número.

  **Ruling E, respeitado — e estendido em item novo.** O fail-open triplo de `budget.ts` (os três
  `catch` que devolvem `allowed: true` em erro de DB) **não mudou**. Mas o próprio conserto deste item
  abre uma pergunta prima daquela: com `hasUnknownCost` agora visível, o que `checkAiBudget` deve FAZER
  com isso (manter best-effort / bloquear / teto separado) é a mesma classe de decisão de produto — não
  implementado, registrado como **item 69**.

  **Ruling F, o teste que quebrou — e por que quebrou mais do que um.** A recon previu que só o teste
  "RPC retorna zero (sem histórico)" de `budget.test.ts` quebraria (assume `spentUsd` sempre `number`).
  Na prática, a mudança de FORMATO da RPC (de `NUMERIC` solto pra `TABLE(spent_usd, has_unknown_cost)`,
  necessária pra fechar a ambiguidade do ruling B) muda o shape que todo mock de `.rpc()` do arquivo
  devolve — **6 dos 11 testes originais** quebraram (não só o previsto), porque todos mockavam
  `{ data: <numero>, error: null }` e o código agora lê `data[0].spent_usd`. Ajustados via um helper
  novo (`rpcRow(spentUsd, hasUnknownCost?)`) que monta o shape certo; nenhuma asserção de comportamento
  mudou nesses 6 — só o mock. Um teste NOVO cobre o caso que o item existe pra resolver:
  `hasUnknownCost: true` com `spentUsd` parcial não muda o `allowed` (ruling E — decisão de bloqueio
  não é deste item). `cost-tracker.ts` não tinha nenhum teste antes (recon, seção 7); ganhou
  `cost-tracker.test.ts` (8 casos, incluindo o `google/gemini-3.5-flash` do achado por nome).

  **Ruling G, sem Postgres.** A migration `20260902000003_ai_usage_logs_cost_usd_unknown.sql` está
  escrita no padrão das vizinhas (mesma postura de segurança — `service_role` só, `SECURITY DEFINER`,
  `search_path=public` — da RPC original), mas **não foi aplicada nem exercitada contra um banco real**
  — sem Postgres nesta máquina. Sem prova executável: o `DROP FUNCTION` + `CREATE` (troca de tipo de
  retorno), o `bool_or(cost_usd is null)` da nova RPC, o `ALTER COLUMN ... DROP DEFAULT`, e o
  `CREATE OR REPLACE` do trigger do item 37. Tudo revisado por leitura, nada rodado.

  **Suíte:** `npx vitest run` — antes: 1299 testes, 1292 verdes, 4 falhas pré-existentes e alheias
  (timezone em `reports-utils` ×3, fixture de PDF em `file-extractor.integration` ×1 — não mexidas).
  Depois: 1308 testes (+9: 1 novo em `budget.test.ts`, 8 novos em `cost-tracker.test.ts`), 1301 verdes,
  as MESMAS 4 falhas pré-existentes, nenhuma nova. `npx tsc --noEmit` limpo.

  **Fix round 1 (review — `task-42-report.md`, seção "Fix round 1"). 0 Critical, 0 Important, 4
  Minor.** Todos endereçados. **Minor 1 (o que mais preocupava, com precedente caro): a migration
  assumia `ai_usage_logs` já existente.** A tabela nasce fora de `supabase/migrations/` — mesma
  classe do item 0a (`CREATE INDEX` fora do bloco guardado em `20260621_phase0_foundations.sql`
  derrubava `supabase start` num banco limpo). Risco herdado do item 37 (que fez a mesma suposição
  no trigger), mas herdado não é justificativa: a migration inteira agora vive dentro de
  `DO $guard$ ... $guard$`, guardada por `to_regclass('public.ai_usage_logs')`, no molde exato do
  item 0a — sem a tabela, `RAISE NOTICE` e sai sem tocar em nada. **Minor 2, declarado, sem
  backfill:** linhas de `cost_usd = 0` gravadas antes desta migration são ambíguas (podiam ser gasto
  real zero OU modelo sem preço, o comportamento antigo) — sem volume conhecido, backfill seria
  inventar trabalho; declarado via `COMMENT ON COLUMN ai_usage_logs.cost_usd` na migration e aqui:
  **uma soma histórica que cruza 2026-09-02 é um piso, não um total.** **Minor 3: item 69 reescrito**
  com as duas fontes de "não sei o gasto" (o fail-open triplo original + o `hasUnknownCost` novo
  deste item), o efeito de cada saída nas duas, e uma recomendação (manter fail-open, tratar como
  monitoramento — não é decisão, é ponto de partida pro dono do produto). **Minor 4:** teste novo
  cobrindo `costUsdOverride: null` explícito contra um modelo QUE ESTÁ em `PRICING` — prova que o
  override vence mesmo quando a tabela teria um preço, não só quando não teria.

  **Suíte após o fix round 1:** 1309 testes (+1), 1302 verdes, as mesmas 4 falhas pré-existentes.
  `npx tsc --noEmit` limpo.

- [x] **43. Apagar o fallback de full scan do RAG** `[confirmado]` · commits `7a808467` (promove a RPC),
  `93be34de` (apaga o fallback)
  `src/lib/ai/rag.ts:56-73` (antes) — o `try/catch` nunca disparava porque `.rpc()` devolve `{error}` em
  vez de lançar; o fallback era alcançado por queda através do `if (!error && data)`, sem `return` nem
  `throw`. `searchDirect` (`:84-155`) fazia `select …embedding` sem `.limit()` e calculava cosseno em
  JS — truncava em silêncio no default de 1000 linhas do PostgREST (`supabase/config.toml:17`):
  resultado **errado**, não só lento, e nenhum dos quatro chamadores (`engine.ts`,
  `ai-chatbot-service.ts`, `search_knowledge.ts`, `api/ai/test/route.ts`) distinguia resultado da RPC de
  resultado do fallback truncado.
  **Impedimento que mudou a ordem do trabalho:** `search_agent_knowledge` nunca esteve em
  `supabase/migrations/` — só em quatro arquivos de `sql/`, fora do que o CI aplica (o item 49 já
  registrava isso). Apagar o fallback primeiro trocaria "resultado errado em silêncio" por "busca
  quebrada em CI, branch nova e restore" — pior, não melhor. Por isso o item virou duas partes, em
  commits separados: **(1) promover a RPC** — nenhuma das quatro definições de `sql/` foi copiada como
  está: todas filtravam só por `agent_id`, ignorando que `ai_agent_chunks.organization_id` é `not null`,
  e uma (`sql/ai-agents-functions.sql`) dava `GRANT` para `authenticated` numa função sem
  `SECURITY DEFINER`, com a RLS da tabela ligada só fora do stream versionado — mesmo padrão de buraco
  de tenancy que os itens 03, 04, 22 e 24 já fecharam. A RPC promovida
  (`supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql`) filtra por
  `organization_id` além de `agent_id`, com `SECURITY DEFINER` + `search_path` fixo e `GRANT` só para
  `service_role`; `RAGService` passa a receber `organizationId` no construtor. Achado de segurança das
  quatro definições antigas registrado à parte no **item 70**; item 49 encolhido (uma das quatro RPCs
  pendentes saiu da lista). **(2) apagar o fallback** — `searchDirect` e `cosineSimilarity` saíram
  inteiros; `{error}` da RPC agora vira exceção direta, no molde de `tools/knowledge.py` (o gêmeo Python
  nunca teve fallback). Efeito em cada chamador: `engine.ts` e `ai-chatbot-service.ts` já tinham
  `try/catch` best-effort ao redor da chamada — agora esse `catch` dispara em todo erro real da RPC (e
  não só quando o fallback também falhava), resposta sai sem contexto, visível em log
  (`console.warn`/`logger.warn`), como já era o desenho para RAG não-fatal. `search_knowledge.ts` volta
  `{ ok: false, error }` explícito pra IA em vez de `{ ok: true, chunks: [...] }` com dados errados — a
  IA deixa de tratar um resultado truncado como base de conhecimento legítima. `api/ai/test/route.ts` já
  tinha `try/catch` (`:299-336`) e passa a devolver `success: false` + `error.message` em vez de um
  `results_count` silenciosamente incompleto. **O que o lojista vê:** nos três caminhos de produção, sem
  mudança visível de UX no caso feliz (RAG continua não-fatal, decisão do incidente de 12/06 preservada)
  — a mudança é que um erro real de busca agora produz *ausência* de contexto de forma honesta, em vez
  de contexto *errado* apresentado como correto.
  **Ruling G — sem Postgres nesta máquina: a migration não foi aplicada nem testada, só lida por
  inspeção** (mesmo impedimento do item 42). `npx vitest run` antes: 1309 testes, 1302 verdes, 4 falhas
  pré-existentes e alheias (timezone em `reports-utils`, fixture de PDF em
  `file-extractor.integration`). Depois (dos dois commits): mesmos 1309 testes, 1302 verdes, as MESMAS 4
  falhas, nenhuma nova — nenhum teste cobria `searchDirect` nem dependia do fallback. `npx tsc --noEmit`
  limpo antes e depois. Detalhe completo em `task-43-report.md`.

  **Fix round 1 (review — `task-43-review.md`). 0 Critical, 1 Important, 0 Minor.** Endereçado, e o
  Important está **FECHADO por este fix — não virou item novo na fila**. O Important:
  `src/app/api/ai/test/route.ts` (`handleTestRAG`) tira `organizationId` do **corpo** da requisição,
  não de sessão. O defeito é pré-existente ao item 43, mas entrou nesta round porque o item 43
  **mudou a consequência dele**: antes esse valor client-supplied só escolhia qual chave da OpenAI
  debitar, agora ele é o `p_organization_id` que decide o filtro de tenancy da RPC
  `search_agent_knowledge`. O guard da rota (`src/lib/debug-guard.ts`) abria sozinho quando
  `NODE_ENV !== 'production'` — logo, em `next dev` qualquer chamador não-autenticado que soubesse um
  par `agentId`/`organizationId` lia chunks de conhecimento de qualquer organização por essa rota.
  **Correção: `assertDebugAllowed` virou fail-closed sem exceção de ambiente** — exige
  `DEBUG_ENDPOINT_SECRET` em QUALQUER ambiente, dev incluído, mesma lição do item 25
  (`src/lib/internal-auth.ts`): **ambiente não é credencial**. As 12 rotas que usam o guard
  (`/api/ai/test`, `/api/ai/test/webhook`, `/api/ai/test/cloud-webhook`, `/api/debug/automation`,
  `/api/debug/realtime-test`, e as 7 de `/api/analytics/shopify/{debug,diagnostico*,teste-threshold}`)
  passam a responder 404 em dev sem o secret. **Deliberadamente NÃO feito:** pôr
  `requireOrgFromAuth`/sessão em `/api/ai/test` — é rota de diagnóstico server-to-server, e duas
  fronteiras de posse divergentes na mesma rota é pior que uma clara; a decisão está escrita no
  comentário acima de `handleTestRAG`, junto do aviso de não acrescentar uma segunda checagem.
  `DEBUG_ENDPOINT_SECRET` documentado no `.env.example`. Teste novo `src/lib/debug-guard.test.ts` (6
  casos, no molde de `internal-auth.test.ts` do item 25): nega sem secret em dev e em produção, nega
  chave errada, libera por `?debug_key=`, por `x-debug-key` e por `Authorization: Bearer` — é a trava
  que quebra se alguém "consertar" o guard de volta para o fallback por `NODE_ENV` (verificado por
  mutação: reintroduzir a linha derruba 2 dos 6 casos).
  **Consequência para quem roda o repo localmente (achado, não trabalho novo):** `scripts/test-ai-system.sh`
  e `scripts/test-commands.sh` batem em `/api/ai/test` e `/api/ai/test/webhook` por `curl` sem
  nenhuma chave, e os `curl` de `docs/TESTES-END-TO-END.md` também — todos passam a receber 404 até
  quem roda exportar `DEBUG_ENDPOINT_SECRET` e mandar `?debug_key=`. Nenhum caller de **código**
  (componente, hook, worker, teste) chama essas 12 rotas: grep confirma que o único teste que as
  cita, `src/lib/ai/__tests__/deletion-set.test.ts:269`, só procura a URL como texto para mapear
  callers — não faz requisição. Nada em produção depende delas.

  **Suíte após o fix round 1:** 1315 testes (+6), 1308 verdes, as mesmas 4 falhas pré-existentes e
  alheias, 3 skipped. `npx tsc --noEmit` limpo antes e depois.

  **Fix round 2 (re-review — `task-43-fix-re-review.md`). 0 Critical, 2 Important, 3 Minor.** O
  Important 1 e os três Minor entraram; o Important 2 virou o **item 71** da fila, não trabalho.
  **Important 1: as duas recusas do guard eram distinguíveis** — sem segredo o corpo do 404 dizia
  `"Debug endpoints disabled. Set DEBUG_ENDPOINT_SECRET env var to enable…"`, com chave errada dizia
  `{"error":"Not found"}`. Um chamador sem credencial separava "rota de debug existe e está com o
  segredo desconfigurado" de "existe e minha chave está errada", e o 404 deixava de ser o disfarce
  que se propunha a ser. Isso contradizia **a decisão já registrada do item 25** (`:426-429`: *o
  motivo da recusa fica no log do servidor, não na resposta*) — o mesmo item que o round 1 dizia
  seguir: seguia a metade "ambiente não é credencial" e desfazia a outra metade. Agora as duas
  recusas devolvem o **mesmo 404 genérico byte a byte**, e a dica de qual env falta vai para
  `console.error`, no molde exato de `internal-auth.ts:23-29` — quem roda `next dev` sem a env lê o
  motivo no terminal. **Minor 1: comparação em tempo constante** — `provided !== secret` saía no
  primeiro byte diferente; passa a usar `verifyBearerToken` (`src/lib/webhook-security.ts:120`), o
  mesmo helper que `internal-auth.ts:33` usa desde o item 25, que checa comprimento antes do
  `crypto.timingSafeEqual` e não lança. Nenhum comparador novo foi escrito; a extração dos três
  canais (`?debug_key=`, `x-debug-key`, `Authorization: Bearer`) continua onde estava — mas o helper
  tira um SEGUNDO prefixo `Bearer ` literal do que recebe, e o efeito está declarado no código
  (round 3). **Minor 2: buracos do teste fechados** — `src/lib/debug-guard.test.ts` vai de 6 para 9
  casos: segredo setado-e-vazio, `?debug_key=` vazio, chave errada pelo canal `Bearer` (o único cujo
  negativo não era testado), um positivo com `NODE_ENV='production'` (a independência de ambiente só
  estava provada no sentido "nega") e o caso novo que prende os **dois corpos de 404 como idênticos**
  — é ele que impede o Important 1 de voltar. Verificado por mutação: reintroduzir o bypass por
  `NODE_ENV` derruba 4 dos 9; devolver a dica de configuração ao corpo do 404 derruba 1 dos 9.
  **Minor 3: a contradição no item 62** — aquele item listava `DEBUG_ENDPOINT_SECRET` entre as envs
  "lidas em código e ausentes do `.env.example`", afirmação que o round 1 tornou falsa ao documentar
  a env; a linha foi corrigida lá.

  **Suíte após o fix round 2:** 1318 testes (+3 sobre o round 1), 1311 verdes, as mesmas 4 falhas
  pré-existentes e alheias, 3 skipped. `npx tsc --noEmit` limpo antes e depois.

  **Fix round 3 (re-review do round 2 — `task-43-fix-re-review-2.md`). 0 Critical, 0 Important, 3
  Minor — o item fecha aqui.** A revisora confirmou que as duas recusas são a MESMA expressão (a
  closure `deny()`, chamada nos dois pontos), não duas cópias que hoje coincidem; que o
  `console.error` não vaza para a resposta (as 12 rotas são runtime Node, nenhuma declara
  `runtime='edge'`); e que `verifyBearerToken` trata vazio/`null` e comprimentos diferentes antes do
  `timingSafeEqual`, sem lançar. Os três Minor: **(1) o alias do reúso vale nos três canais, não em
  um** — como o helper tira um segundo prefixo `Bearer ` literal, `?debug_key=Bearer <s>`,
  `x-debug-key: Bearer <s>` e `Authorization: Bearer Bearer <s>` também valem como o segredo (e
  `bearer <s>` minúsculo NÃO vale, porque o helper é case-sensitive); não afrouxa nada — quem manda
  isso já tem o segredo — e agora está escrito no comentário de `debug-guard.ts`, que descrevia só
  um canal. **(2) o `console.error` não estava preso por teste**: o spy do `beforeEach` silenciava e
  nenhum caso afirmava a chamada, então apagar o log deixava a suíte verde e a recusa virava um 404
  mudo — tirar o motivo da resposta só é aceitável porque ele aparece no terminal de quem roda `next
  dev`, e agora há um caso que quebra se essa metade sumir. **(3) registrado, não consertado: as
  duas recusas são idênticas em conteúdo e distinguíveis em TEMPO** — o caminho sem segredo retorna
  antes do `new URL`, da leitura dos headers e do `timingSafeEqual`. Vaza estado de configuração, não
  o segredo, e fechar exigiria trabalho inútil deliberado (dormir ou comparar à toa); fica declarado
  em vez de escondido.

  **Suíte após o fix round 3:** 1319 testes (+1), 1312 verdes, as mesmas 4 falhas pré-existentes e
  alheias, 3 skipped. `npx tsc --noEmit` limpo.

- [x] **44. Fatorar `_prepare_turn` entre responder e toucher** `[relatado]` · commits `a77f35ed`
  (envelope), `f5b3bb06` (transferência), `b21d587e` (flags de entrega), `2f180bab` (anúncio de tool)
  · relatório `task-44-report.md`
  **O nome do item era proposta, não símbolo, e as três linhas citadas estavam obsoletas.**
  `_prepare_turn` não existe em lugar nenhum do runtime (`grep` limpo em `src/`, `tests/`,
  `scripts/`). **Toda citação de linha deste item está ancorada na BASE `e2d1f38a`**, e a âncora
  está escrita em vez de subentendida de propósito: "hoje", num documento que sobrevive a commits,
  é exatamente o defeito que esta correção existe para matar — os quatro commits do próprio item já
  deslocaram parte destas linhas (`toucher.py:435` virou `:451`, `:410` virou `:426`,
  `responder.py:795` virou `:763`). As três do texto original, reancoradas: `toucher.py:43`
  (importa privados do responder) era `:54-60` em `e2d1f38a`; `:334` (envelope) era `:435`; `:309`
  (`knowledge=()`) era `:410` — os itens 40 e 41 inseriram linhas acima delas.

  **A duplicação, medida em vez de afirmada:** 160 linhas de código idênticas entre os corpos de
  `respond()` e `touch()`, **55,4 % do corpo de `touch`**, das quais 128 em blocos contíguos de ≥3
  linhas. Os quatro maiores: abertura de conexão + transação de leitura (16), `run_id`+`note_step`+
  guards (19), `compile_prompt` (26 em quatro pedaços), laço de judgements (13).

  **As divergências são de dois tipos, e o item misturava os dois.** As de DESENHO são corretas e
  não devem ser fatoradas: janela pendente (`load_pending_messages`), arbitragem missão dona ×
  discovery, cupom materializado ANTES da geração, `version is None` que alerta em vez de levantar,
  e `exclude_inbound_after_seq` (item 39). As de ESQUECIMENTO são a cópia que ficou pra trás — os
  quatro bugs abaixo, todos consertados aqui.

  **(a) Envelope JSON não desembrulhado no toque — consertado no PORTÃO, não no toucher.**
  `judges/pre_send.py::guarded_reply` já era o ponto único por onde os dois produtores de fala
  passam (`responder.py:795`, `toucher.py:437`): não recebe `conn`, é orquestrador puro, e tem 15+
  testes unitários que rodam sem Postgres. O desembrulho mudou de dentro do `generate` do responder
  para lá, e `unwrap_model_reply` desceu para `agent_core/llm.py`, ao lado de `strip_code_fence` —
  é fato sobre o que ATRAVESSA a porta do modelo, não sobre quem está falando, e ficar no responder
  foi exatamente o que deixou o toque de fora. Cobre também qualquer terceiro produtor futuro.
  **Gravidade maior do que o item registrava:** o `p_content` do `conclude_turn` vai para a outbox
  **e** para `messages.content`, então o envelope não desembrulhado saía literal no WhatsApp *e*
  ficava gravado como fala do agente, voltando pelo `load_recent_transcript` no turno seguinte — o
  modelo aprendia o formato errado com a própria saída. É o mecanismo de 17/08 por inteiro.
  **O que a mudança de casa custou, registrado em vez de consertado:** o aviso "resposta do modelo
  veio embrulhada em envelope JSON" passou a sair pelo logger `agents_runtime.judges.pre_send`, e
  não mais por `agents_runtime.agent_core.responder`. Mensagem e atributo (`reply_unwrapped`, no
  `SAFE_ATTRIBUTES`) são idênticos, mas quem tiver filtro ou alerta ancorado no NOME do logger perde
  o evento. Não renomeamos: o logger novo é o certo para onde o código foi morar, e inventar um nome
  estável agora seria abstração para um problema que ninguém relatou.

  **(b) `transfer_to_human` com retorno descartado (`toucher.py:480`) — divergência que o item não
  listava.** O responder guarda o booleano em `marked` e o usa no chip; o toque jogava fora. O dano
  é de observabilidade, não de segurança: a escalada de severidade e o sufixo do título acontecem
  DENTRO de `transfer_to_human`, então o alerta sempre saiu certo — o que se perdia era o chip do
  inbox dizendo que a IA **não** foi desligada.

  **(c) `delivery_flags` ausente no toque — divergência que o item não listava.** Todo retorno do
  responder carrega `humanize`; `TouchDraft.content` ia sem. `queueing/sender.py` lê essa chave do
  payload e, ausente, cai no default LIGADO nas duas metades. O lojista desligava bolhas e ritmo em
  Adaptação → Entrega, valia nas respostas, era ignorado nos toques. `tests/db/test_toucher.py:76`
  asserta `draft.content` por igualdade exata e foi atualizado no mesmo commit — **sem execução**
  (ver Prova).

  **(d) O prompt do toque anunciava ferramenta que ninguém passa.** `prompt_compiler.py:183-187`
  despeja `mission.tools` (a interseção missão∩agente calculada por `merge_mission`) no prompt como
  "Ferramentas desta situação", e o toque chama o modelo **sem `tools=`** — por desenho, porque o
  dinheiro do toque vira cupom antes da geração e entra como FATO. O modelo ou ignorava, ou prometia
  duas vezes o mesmo benefício. Zerado só na chamada de `compile_prompt`, porque no toque essa lista
  tem um único leitor — o próprio anúncio: o cupom é dirigido por `job.concession_request` e
  `CreateCoupon` não lê `mission.tools`.

  **`knowledge=()` NÃO é gap — o item descrevia errado, e devolve como item novo (72).** `_knowledge`
  monta a query exclusivamente das mensagens do contato na janela pendente
  (`responder.py:1059-1061`) e devolve `()` se ela vier vazia. Um toque não tem janela pendente:
  copiar a chamada seria no-op puro — e nem custo de embedding tem, porque a guarda dispara antes do
  `run_tool`. O que existe é uma pergunta de PRODUTO (qual query um toque deveria fazer ao RAG), não
  uma linha esquecida. Consequência de segunda ordem, real: `judges/pre_send.py:293-295` só
  acrescenta o bloco "Base de conhecimento disponível ao agente" `if context.knowledge`, então o
  Judge 1 do toque julga sem ele.

  **Nota (não virou item): `window_open`.** `responder.py:614-616` assume `True` e só calcula se
  `state.last_inbound_at is not None`; `toucher.py:354-357` calcula, e com `None` dá `False`. **Aqui
  o toucher está mais certo** — a janela de 24h da Meta está fechada se nunca houve inbound, e
  `prompt_compiler.py:234-236` (o ternário; a frase em si está em `:236`) renderiza "só template
  aprovado sai daqui" a partir disso. O default permissivo do responder é logicamente errado e
  **inalcançável em produção**: `last_inbound_at` só
  é escrito pelo RPC de ingestão (`20260817000004:86-103`) e `respond()` só roda a partir de
  inbound. Latente, não vazamento. Uma fatoração ingênua que unifique nos termos do responder
  **regride o toque** — quem mexer aqui depois precisa saber disso.

  **O que NÃO foi feito, e o motivo honesto: a fatoração do preparo de ENTRADA.** Não é o custo das
  travas de forma — elas são baratas e auto-documentadas como "ajuste o teste":
  `test_agent_llm_closes_after_the_turn.py:180` diz literalmente isso e foi desenhado para ser
  reapontado, e apagar a linha do `_KNOWN_SET_ROLE_DEBT` em `test_no_sql_outside_repository.py`
  **reduz** a dívida dos itens 16/17 de dois arquivos para um. As duas somam ~15-25 linhas. O motivo
  que sobrevive é outro: **toda a cobertura de `respond()`/`touch()` mora em `tests/db`**, que nesta
  máquina não roda, e refatorar ~350-450 linhas do caminho quente dos dois produtores de fala sem
  conseguir exercitá-los troca um defeito conhecido por risco desconhecido. Os riscos concretos, se
  alguém retomar: a ordem guards → cascata BYO (`responder.py:434-436` é explícito), o `async with
  scoped_agent_llm` que não pode escapar do escopo (item 40) nem errar o `owns` — errar fecha o
  cliente de PLATAFORMA do Judge 1, que é por processo —, o `TurnBudget` único por turno (item 41,
  e `test_llm_metering.py` NÃO pega um budget por finalidade), o `TouchDraft` com `moment_ids` que o
  `worker.py:265-283` consome, e os payloads de "sem rascunho" deliberadamente diferentes nos dois.
  Restrição não declarada em lugar nenhum: `test_llm_metering.py:250` varre `agent_core_dir.glob("*.py")`
  — **`glob`, não `rglob`** —, então um helper compartilhado num subpacote sai da trava do `budget=`
  em silêncio. Arquivo novo tem de nascer direto em `agent_core/`.
  Duas sobras que a fatoração encontra pela frente, registradas aqui porque são precondição dela e
  não achado solto: **(i)** `_metered` declara `job: InboundJob` (`responder.py:974`) e o toucher lhe
  passa um `MissionTouchJob` (`toucher.py:397-400` e `:402-405`) — funciona por tipagem
  estrutural, porque só `organization_id`/`conversation_id` são lidos, mas a assinatura mente, e é
  o `Protocol` que essa fatoração teria de decidir ANTES de mover qualquer coisa (improvisar um
  agora seria abstração nova para meio caminho); **(ii)** `toucher.py:141` importa
  `default_rubrics_directory` dentro da fábrica, embora o topo já importe do mesmo módulo e não haja
  ciclo (`responder.py` não importa `toucher`) — lixo de cópia, uma linha, zero efeito.

  **O que continua vivo, dito em voz alta em vez de comemorado:** o desembrulho passou a ser único,
  mas os outros três consertos continuam POR PRODUTOR — e não são todos a mesma coisa. **Dois são
  cópia literal nos dois lados:** a leitura do booleano da transferência, que mora no chip de cada
  chamador, e `delivery_flags`, que mora no RETURN de cada função (e os dois retornos, `dict` vs
  `TouchDraft`, PRECISAM continuar diferentes: o `conclude_turn` do toque depende de
  `moment_ids`/`mission_version_id`). **Um existe só no toque:** o `replace(resolved, tools=())`,
  porque o responder passa a missão inteira ao compilador e deve continuar passando — o que ele
  divide com os outros dois não é a cópia, é morar no call site e depender de o próximo produtor de
  fala lembrar. A metade de ENTRADA da classe (as ~95-110 linhas idênticas da abertura ao
  `compiled`) segue viva e
  **sem item próprio** — está registrada aqui, com o número medido, de propósito: abrir item para
  ela renumeraria uma fila que é estável por desenho.

  **Prova.** `pytest -m unit`: 1205 ✓ / 2 ✗ antes, **1208 ✓ / 2 ✗ depois** (as duas falhas são o
  item 54, cp1252 no Windows, alheias). `ruff check .` e `lint-imports` sem mudança (o ruff já tinha
  10 erros pré-existentes na BASE, ver item 74). **Sem prova executável:** `tests/db/test_toucher.py`
  (incluindo a linha 76 atualizada aqui), `tests/db/test_responder_guards.py` e `tests/pipeline/` não
  rodaram — exigem Postgres, a suíte é não-skipável de propósito (`tests/db/conftest.py:1-9`) e
  **pendura** em vez de falhar sem banco. Os efeitos de (b), (c) e (d) foram deduzidos do caminho de
  código, não observados no banco.

  **Padrão observado duas vezes — `touch()` é o gêmeo que fica pra trás (nota do item 41, fix round
  1).** Item 40: `agent_core/toucher.py::build_toucher.touch` não fechava o cliente httpx do LLM do
  agente — só `agent_core/responder.py::build_responder.respond` tinha `scoped_agent_llm` na primeira
  versão (corrigido no próprio item 40, fix round 1). Item 41: `toucher.py::build_toucher.touch`
  chamava `_metered(...)` sem `budget=` — o teto de custo do turno não cobria o toque (corrigido no
  fix round 1 deste item). As duas vezes foram achadas pela REVIEW, não pelo implementador — o padrão
  é maior que os dois casos: quem edita `respond()` esquece de perguntar "e o `touch()`?".
  Varredura desta tarefa (item 41, fix round 1) sobre o que os itens 35-41 mudaram em `respond()`
  e se `touch()` acompanhou: guards de comportamento (item 30) — os dois chamam
  `evaluate_inbound_guards`/`schedule_silence`/`resolve_blocked_topic` (`responder.py::respond`,
  `toucher.py::touch`); `agent_id` em `_metered` (item 37) — os dois passam `version.agent_id`
  (`responder.py:666`, `toucher.py:398,403`); `scoped_agent_llm` (item 40) — os dois, desde o fix
  round 1 daquele item; `TurnBudget` (item 41) — os dois, desde este fix round 1. `exclude_inbound_after_seq`
  (item 39, `agent_repo.load_recent_transcript`) é DELIBERADA, não gap: só `responder.py::respond`
  tem uma janela de mensagens pendente para excluir do transcript — `toucher.py::touch` não nasce de
  inbound, não tem essa janela, e o próprio item 39 já registrou isso (`runtime/FORK.md`, seção do
  item 39).
  **Correção desta execução: aquela varredura declarou `exclude_inbound_after_seq` a ÚNICA
  divergência restante, e isso era falso.** Ela cobriu só o que os itens 35-41 tinham MUDADO em
  `respond()`; as divergências mais antigas que nenhum item recente tocou ficaram fora do escopo da
  pergunta — e eram quatro, todas consertadas aqui: envelope, `transfer_to_human`, `delivery_flags`
  e o anúncio de tools. A terceira vez do padrão aconteceu, e a varredura não a viu porque olhava o
  diff recente em vez dos dois corpos lado a lado. Recomendação para itens futuros: todo item que editar
  `responder.py::respond` fecha só depois de perguntar "isto vale para `toucher.py::touch` também?" —
  é essa pergunta, feita cedo, que evita a terceira vez.

- [x] **45. Paridade preview ↔ turno** `[confirmado]` · commits `6782036a` (extração de
  `agent_block`), `ef1de779` (restrições do momento), `b2457a66` (a ausência do conhecimento,
  declarada na tela) · relatório `task-45-report.md`
  **Toda citação de linha deste item está ancorada na BASE `8f2f3faa`** — a lição do item 44:
  reancorar sem declarar volta a mentir no commit seguinte. As linhas do texto original já tinham
  derivado 18: `server.py:154-156` era verdade quando o item foi escrito, mas em `8f2f3faa` `:154` é
  `load_active_version` e os dois literais moravam em **`:172`** (`presentation_mode="nome_funcao"`)
  e **`:174`** (`adaptation=()`), empurrados para baixo pelo refactor que criou `_connection`.

  **Não era escolha de desenho, era fóssil datado, e dá para provar pela hora.** `d4fbc23a`
  (2026-08-11 14:16Z) criou `server.py` com os dois literais, quando as colunas ainda não existiam;
  `4a009997` (20:41Z do mesmo dia) ensinou o turno a ler `presentation_mode` e `client_adaptation` e
  tocou `responder.py`, `toucher.py`, `repository/agent.py` e um teste db — **sem passar por
  `server.py`**. Os comentários `# 10.4:` que sobreviveram nos dois arquivos do turno marcam os
  sites atualizados; o terceiro não tinha comentário nenhum, porque foi esquecido, não decidido.
  A suíte inteira passava porque `tests/db/test_server.py` nunca constrói um agente com apresentação
  diferente do default — o literal era invisível por construção.

  **O dano era maior do que o item registrava.** Com o corpo que a UI de fato manda
  (`RadialView.tsx:59` posta `{}`), dois dos cinco blocos são fantasma (ESTADO e CONVERSA), o bloco
  CANAL sai com `window_open` sempre `True`, e o bloco AGENTE mentia em dois campos — enquanto
  **quatro lugares** prometem por escrito "a MESMA `compile_prompt()` do turno" (`server.py:10-14`,
  `route.ts:7-9`, `RadialView.tsx:47-49`, `core/agentes-por-evento.md:402`). O que o lojista via:
  escolhia "discreta" ou "transparente" na aba Identidade da radial, clicava no núcleo e lia a linha
  do modo que **não** escolheu (`prompt_compiler.py:34-38`); ligava qualquer um dos cinco toggles de
  adaptação (`:40-50`) e o preview não mudava, o que faz o toggle parecer quebrado.

  **O conserto encolheu a superfície em vez de deslocá-la (commit 1).** Havia três construções da
  mesma dataclass de sete campos obrigatórios — 21 oportunidades de divergência calada. Viraram uma:
  `prompt_compiler.agent_block(version, settings)`, com os tipos do repositório importados sob
  `TYPE_CHECKING` para não atar em runtime um módulo que se anuncia puro. Errar uma chamada de
  aridade 2 é `TypeError` na hora; errar uma das três cópias era um prompt errado que passava na
  suíte. Duas armadilhas da extração, as duas evitadas: `language` **não** era local morto nos dois
  sites do turno — é reusado no `JudgeContext` (`responder.py:640`, `toucher.py:427`) —, e uma
  extração mecânica deixaria a fórmula duplicada viva 75 linhas abaixo; os call sites passaram a ler
  `agent.language`. E `agent_block` já era nome local em `responder.py:566`, renomeado para `agent`.
  Como a função pura **não** impede um quarto site de nascer à mão — foi exatamente assim que o bug
  nasceu —, veio junto uma fitness por AST no molde de
  `test_listener_connects_in_one_guarded_place.py:24-50`: `AgentBlock` é construído num módulo só em
  `src/`. Ela não olha keywords, ordem nem linha, só conta produtores, então não é o teste de forma
  que o item 40 condenou.

  **As restrições do momento (commit 2), e a armadilha silenciosa que quase entregou nada.** O alvo
  não é o que o nome sugere: a restrição do momento **não** vai para `ChannelBlock.constraints` —
  ela soma ao `forbidden` da missão (`commerce/moments.py:78-86`) e sai como as linhas `Não fazer:`
  do bloco MISSÃO (`prompt_compiler.py:188`). O turno faz dois passos depois do `merge_mission`
  (`responder.py:518-519`, `toucher.py:272-273`); o preview fazia o merge e parava. Nenhum dado novo
  foi exigido: `load_active_moments(conn)` não pede organização (a RLS resolve), não pede agente,
  não pede conversa e nem relógio — o `now()` é do banco (`repository/moments.py:30`).
  **A armadilha era o POSICIONAMENTO, não o `None`.** A conexão do listener é `autocommit=True`
  (`server.py:103`) e `scope_to_organization` grava com `set_config(..., true)`
  (`repository/scope.py:97-99`), que é `SET LOCAL`: um load escrito uma linha abaixo do
  `async with conn.transaction()` correria com `current_app_organization_id()` = NULL
  (`20260812000002:48-60`), a policy de `commercial_moments` (`20260813000005:162`) não casaria com
  nada, e a query voltaria **zero linhas — sem erro, sem log, resposta 200, suíte verde**. O item
  pareceria entregue e o preview diria "nenhum momento ativo" para sempre. Como nenhum teste de
  comportamento pega isso, a garantia virou estrutural: uma terceira asserção por AST no fitness que
  já guarda a porta do listener, afirmando que toda leitura do `_preview` mora dentro da transação
  que escopa — conferida por mutação (mover o load uma linha para fora quebra o teste).
  **A primeira versão dessa asserção enxergava metade do arquivo que guarda, e a review pegou.** O
  detector filtrava `isinstance(node.func, ast.Attribute)`, então só via chamada qualificada
  (`moments_repo.load_active_moments`); a MESMA fuga escrita com import de nome nu
  (`from …repository.moments import load_active_moments`) passava verde. Não era estilo hipotético:
  `server.py:40` já importa `resolve_moments`/`apply_moment_restrictions` por nome nu. O `_calls()`
  do próprio arquivo já tratava os dois casos desde o item 1-ter-b — o conserto foi extrair
  `_called_name()` e usá-lo nos dois lugares, o que **encurtou** o `_calls` de nove linhas para uma.
  Refeita nas duas formas: mutante por atributo e mutante por nome nu, os dois agora devolvem
  `strays == ['load_active_moments']`; com o detector antigo, o de nome nu devolvia `[]`.
  Sem momento no ar, **silêncio e nunca erro**: `resolve_moments` devolve `EMPTY_VIEW` para lista
  vazia (`commerce/moments.py:58-59`) e `apply_moment_restrictions` devolve a missão intacta
  (`:81-82`); sem missão ativa, nem isso — o bloco MISSÃO já é fantasma declarado, que é o que
  `mode="preview"` existe para tolerar (`prompt_compiler.py:298-301`), e `test_server.py:154-166`
  já afirma 200 nesse caso.

  **O que passa a VARIAR NO TEMPO, dito antes que vire chamado de suporte.** As linhas `Não fazer:`
  do momento aparecem e somem com a janela, porque `load_active_moments` filtra
  `now() between starts_at and ends_at`. O mesmo lojista, com a mesma configuração, abre o preview
  às 10h e vê três linhas a mais; abre às 23h01, depois de o momento expirar, e elas sumiram. Isso é
  o momento expirando, **não** o preview apagando as regras dele. Idem, menor, no bloco AGENTE: a
  linha de apresentação troca de texto e até cinco linhas de adaptação aparecem — é o conserto
  funcionando, mas é conteúdo novo na tela.

  **`mode` é a costura, não a divergência — e continua fora de qualquer unificação.**
  `prompt_compiler.py:244-278` faz duas coisas opostas conforme o modo: em `preview` despeja o
  transcript inteiro no bloco CONVERSA (`:252-256`), em `turn` despeja só as rubricas de mídia da
  loja (`:257-278`). Empurrar `"preview"` para o turno **desfaz o item 39** (o transcript volta a ir
  duas vezes, ~2× tokens de entrada em até 12 chamadas por turno); empurrar `"turn"` para o preview
  apaga da tela o transcript que o lojista digitou.

  **`window_open` ficou de fora, e o preview está do lado errado acompanhado.** Três valores, três
  razões: o preview fixa `True` (`server.py:181`, e a UI nunca manda o campo); o responder começa em
  `True` e só estreita se `state.last_inbound_at is not None` (`:577-579`); o toucher usa
  `is not None and ...` (`:356-358`), logo `False` para quem nunca escreveu. O item 44 já julgou
  que **quem está certo é o toucher** (linhas 1509-1517 deste checklist) — a janela de 24 h da Meta
  está fechada se nunca houve inbound. O default permissivo do responder é logicamente errado mas
  inalcançável em produção (`respond()` só roda a partir de inbound); **no preview ele não é
  inalcançável, é o único caminho**. Não dá para consertar barato — sem conversa não há
  `last_inbound_at` —, e fatorar o cálculo adotando a fórmula do responder **regride o toque**. As
  saídas são decisão de produto (expor o knob na UI, que a rota já repassa em `route.ts:41`, ou
  rotular o bloco CANAL como hipotético), não conserto: fica registrado aqui, sem item próprio.

  **O bloco de conhecimento ficou de fora do runtime, mas a mentira do rótulo fechou hoje
  (commit 3).** Os três impedimentos se sustentam: `serve()` não recebe `LlmPort` nenhum
  (`server.py:202-210`, `__main__.py:91-96`), o `conversation_id` do preview é a string literal
  `"preview"` (`:185`) que nem UUID é, e `run_tool` grava em `tool_calls` fora de qualquer
  condicional (`tools/base.py:98-110`) — some-se a query inventada, já que `_knowledge` a monta das
  mensagens do contato na janela pendente (`responder.py:1027-1029`), que no preview não existe.
  Dar RAG ao preview é decisão de produto **e** ampliação da superfície de um listener que por
  desenho só fala com Postgres: virou o **item 75**. O que dava para fazer sem dado novo era o que o
  próprio compilador já faz com o que falta — declarar a ausência: uma linha estática na folha do
  preview, no tom dos fantasmas. Sem ela, o botão "O que {nome} sabe" (`RadialView.tsx:132`,
  `:143-145`) e a área "Conhecimento" da radial (`:24`) mentiam por silêncio exatamente sobre a base.

  **O conserto é invisível até o item 62.** Sem `AGENTS_RUNTIME_URL` e `AGENTS_PREVIEW_TOKEN`,
  `ai/preview-prompt/route.ts:18-27` devolve 503 e a folha cai nos fantasmas fixos de
  `RadialView.tsx:157-164`. As duas continuam ausentes do `.env.example` (o item 62 já é dono
  disso). Num ambiente sem elas, este item é **latente**, não ativo — o preview mente menos porque
  não fala.

  **Devolvido sem virar trabalho aqui:** `ChannelBlock.constraints` é campo morto — três produtores
  em `src/`, todos `()` (`responder.py:596`, `toucher.py:400`, `server.py:182`), um consumidor
  (`prompt_compiler.py:238`) e nem os testes constroem outra coisa; **candidato a deleção, não a
  paridade**, e o dono de sobras é o item 60. O bloco ESTADO fantasma do preview virou o
  **item 76** (três dos seus campos são de organização, não de conversa, e `core/agentes-por-evento.md:304`
  promete o bloco como feature). O campo `ghost` que `_serialize` devolve por bloco
  (`server.py:132`) e que a UI descarta — `PreviewBlock` (`RadialView.tsx:39`) nem o declara — virou
  o **item 77**. E duas constantes com um valor só, `DEFAULT_EVENT` (`server.py:55`) e
  `DISCOVERY_EVENT` (`mission_resolver.py:25`), ficam como cheiro registrado: o preview mostrar a
  missão de descoberta é o certo para uma conversa que não existe.

  **Fecha a lacuna "paridade preview↔turno" do item 63** — quem fechasse um fechava o outro.

  **Prova.** `pytest -m unit`: **1208 ✓ / 2 ✗ antes, 1214 ✓ / 2 ✗ depois** (as duas falhas são o
  item 54, cp1252 no Windows, alheias). O "antes" foi **remedido em worktree sobre `8f2f3faa`** no
  fix round 1, porque a review notou que a conta não fechava: o diff traz +5 testes escritos à mão
  (4 em `test_agent_block_has_one_producer.py`, 1 em `test_listener_…`), e 1208 + 5 = 1213. O sexto
  é gerado: `test_no_provider_network.py` parametriza sobre os arquivos de `tests/`, então **todo
  arquivo de teste novo cria um caso a mais lá** (`…[unit/test_agent_block_has_one_producer.py]`,
  confirmado por `diff` dos `--collect-only` das duas árvores). Os dois números estavam certos; o que
  faltava era a reconciliação. `ruff check .` com **10 erros antes e 10 depois** (os pré-existentes
  do item 74, não consertados aqui de propósito) e `lint-imports` 3 contratos KEPT / 0 broken em
  ambos — mas **isso não é prova de que o `TYPE_CHECKING` do `prompt_compiler` segurou nada**: o
  contrato "only the repository layer reaches the database" proíbe `psycopg` **direto**, tem
  `allow_indirect_imports = "true"` (`pyproject.toml:157`) e já isenta `agents_runtime.server ->
  psycopg` por nome (`:170`), então nem um import de `repository.agent` em tempo de execução dentro
  do compilador o quebraria. O que de fato segura o par são duas coisas conferidas à mão: as
  anotações da assinatura são **strings**, logo nada é avaliado em import time nem em call time; e
  **não há ciclo** — `repository/agent.py` importa `agent_core.guards/media/prompt/think_gate` e
  nunca `prompt_compiler`. O `TYPE_CHECKING` aqui é escolha de pureza, não quebra-ciclo, e é isso
  que a docstring do código diz. `tsc --noEmit` limpo depois da linha de TSX.
  **Sem prova executável:** `tests/db/test_server.py` e
  `tests/db/test_responder_agent_identity.py` **não foram executados** — `-m db` e `-m pipeline`
  penduram sem Postgres em vez de falhar. Ou seja, ninguém provou contra banco que o endpoint devolve
  a apresentação escolhida nem que a linha `Não fazer:` do momento chega ao bloco MISSÃO pelo HTTP; o
  que está provado aqui é a função pura, o posicionamento do load e a contagem de produtores. O
  preview também **não foi visto na tela** (runtime não subiu, envs do item 62 não setadas).

- [x] **46. `expire_incentive_grants` varre a tabela inteira a cada segundo — faltava índice no
  predicado do sweep** `[confirmado]` · commits `5d332706` · relatório `task-46-report.md`
  **Toda citação de linha deste item está ancorada na BASE `d4cfecf4`** — a lição do item 44. Duas
  citações do texto original estavam tortas por uma linha e vão corrigidas aqui: a função é
  `20260813000011:88-110` (`:88` é o `create function`, `:110` é o `$$;`; `:111` é linha em branco e
  `:112-113` são o `revoke`/`grant`), e a coluna `status` é `20260813000005:83-84`.

  **O título antigo ("sem `organization_id`") descrevia um sintoma como se fosse a doença, e a
  correção que ele sugeria seria regressão.** A função é cross-org **por desenho**, irmã exata de
  `internal.sweep_outbox_unknown` (`20260812000004:431`) e do coalescer do item 09 — que o próprio
  checklist descreve como "SECURITY DEFINER cross-org". Três provas: quem a chama é uma conexão só,
  do processo sender, na qual `app.organization_id` **nunca** é setado (`app.py:231`); `sender_role`
  **não tem grant nenhum sobre a tabela** — `20260813000005:149-150` concede `incentive_grants` a
  `worker_role` e `authenticated`, e o único acesso do sender é o `grant execute` da RPC
  (`20260813000011:113`), ou seja ele fisicamente não conseguiria escopar por org nem que quisesse;
  e o `security definer` (`20260813000011:91`) existe justamente porque `sender_role` é
  `nobypassrls` (`20260812000002:26`). Escopar exigiria o sender listar as orgs vivas e disparar N
  chamadas por segundo, desmontando a atomicidade do CTE que grava grant e ledger na mesma
  statement. **A correção é o índice**, e o padrão da casa já dizia isso: sweep cross-org ganha
  índice sobre o predicado do sweep, sem organização — `message_outbox_claim_idx (status,
  next_attempt_at)` (`20260812000003:107`), `conversations_pending_idx (pending_response_at)`
  (`:63`). `incentive_grants` foi a tabela que ficou de fora do padrão.

  **O fato, esse se confirma inteiro.** O predicado do sweep é `status = 'issued' and validity_until
  <= now()` (`20260813000011:97-98`); `organization_id` só aparece no `returning` (`:99`) e no
  insert do ledger (`:104`). O único índice composto da tabela é `incentive_grants_reuse_idx
  (organization_id, contact_id, status, validity_until)` (`20260813000005:103-104`) — e a coluna
  **líder** é a que o predicado não menciona. PG 17 (`supabase/config.toml:22`) não tem skip scan de
  b-tree, que entrou no 18, então esse índice não pode servir de range aqui. A frequência também se
  confirma: `sender_poll = 1s` (`config.py:74`), o sweep é o terceiro passo do housekeeping
  (`queueing/sender.py:216-218`) que roda **antes** de reivindicar o lote, e o laço é
  `sender_pass` + `sleep` (`app.py:236-239`), não timer de período fixo — teto de **86.400
  varreduras/dia**, atingido justamente no caso **ocioso**, quando não há nada a fazer. A ironia:
  quanto mais parado o sistema, mais vezes o scan inútil roda.

  **Duas correções de gravidade no texto antigo, nas duas direções.** "Com lock" era **exagero**: o
  `UPDATE` toma `ROW EXCLUSIVE`, que não conflita com `SELECT` nem com outro DML, e no caso ocioso
  nenhuma tupla casa, logo nenhuma linha é travada. O que dói é CPU e churn de buffer, não
  contenção — e exagero em achado de performance é o que faz o próximo leitor desconfiar do resto.
  Já **"para sempre" é pior do que o texto sugeria**: não há purga, retenção nem arquivamento de
  `incentive_grants` em migration alguma (linhas só saem por cascade de `organizations`/`contacts`,
  isto é, no purge LGPD), então `consumed`, `expired` e `revoked` ficam na tabela para sempre e são
  relidos 86.400×/dia para sempre. O custo é **O(histórico total de grants emitidos)**, não
  O(grants vencendo agora). Hoje é **latente** — a tabela é presumivelmente minúscula, porque só o
  offer_engine escreve nela e há reuso antes de emissão (`incentives.py:122-152`) mais
  `idempotency_key` UNIQUE (`20260813000005:88-90`) — e vira ativo quando o volume subir.

  **O conserto: um índice parcial, com a cláusula escrita literalmente igual à do predicado.**
  `20260903000001_incentive_grants_expiry_sweep_idx.sql` — `on public.incentive_grants
  (validity_until) where status = 'issued'`. `status` é `text` com CHECK (`20260813000005:83-84`),
  não enum: sem cast, sem opclass exótica, e sem a armadilha do `upper()` que o item 50 tem. Com a
  cláusula idêntica a uma das duas do `where` da função, a prova de implicação do planner cai no
  caso trivial e sobra `validity_until` como range puro. Parcial **de propósito**: `'issued'` é o
  estado transitório (toda linha acaba em `consumed`/`expired`/`revoked`, `20260813000005:83-84`) e
  sai do índice na primeira transição, então o índice fica do tamanho dos grants **vivos** — é
  exatamente isso que quebra o crescimento monotônico que é a causa real. As alternativas e por que
  perdem: `(status, validity_until)` cheio cresce com o histórico inteiro e recria a causa;
  `(status, validity_until) where status='issued'` é estritamente pior que a parcial, porque a
  coluna líder é constante dentro do índice — bytes e comparação de graça.

  **A justificativa do HOT, que é a parte que ninguém consegue refazer depois sem banco.** A objeção
  correta ao índice parcial seria "ele mata o HOT update". Não mata: **o HOT já estava morto desde
  13/08**. `status` **já** é coluna-chave de `incentive_grants_reuse_idx` (`20260813000005:104`), e
  HOT exige que a nova versão da tupla não toque coluna alguma usada por índice — logo toda
  transição de estado desta tabela (`issued`→`expired` em `20260813000011:96`, `issued`→`consumed`
  em `:73-76`) **já é não-HOT hoje**, com ou sem o índice novo. O que o índice parcial acrescenta é
  **uma** manutenção de entrada por *ciclo de vida* do grant — entra no insert (`status` nasce
  `'issued'` por default, `20260813000005:83`) e sai na primeira transição —, não uma por UPDATE. A
  troca é essa manutenção contra O(histórico) por passada, 86.400 passadas/dia: não é conta
  apertada, é ordem de grandeza.
  **E o argumento é mais forte do que isso, em três pontos que o review achou e que ficam escritos
  aqui porque ninguém consegue refazê-los depois sem banco.** (1) Não é só `status`:
  `validity_until`, a coluna-**chave** do índice novo, **também já é chave** do `reuse_idx` (quarta
  posição, `20260813000005:104`). As duas colunas que o índice novo torna hot-blocking já eram
  hot-blocking desde 13/08 — ele acrescenta **zero** atributos ao conjunto que bloqueia HOT. (2)
  **Nenhum caminho do repositório grava `'issued'` por UPDATE**: os dois únicos writes de `status`
  são `'expired'` (`20260813000011:96`) e `'consumed'` (`:75`), e `'issued'` só chega à linha pelo
  `default` da coluna (`20260813000005:83`). Logo **entrar no índice parcial é sempre INSERT**, e
  INSERT não tem HOT a perder — HOT é propriedade de `heap_update`. A frase "entra no insert e sai
  na primeira transição" é literal, não aproximação. (3) Há um **terceiro** caminho de UPDATE nesta
  tabela, e ele confirma a tese em vez de ameaçá-la: `record_coupon_code`
  (`repository/incentives.py:198-209`) grava `coupon_code` numa linha que está **dentro** do índice
  parcial, e `coupon_code` não é chave nem predicado de índice algum — esse UPDATE é HOT-elegível
  **antes e depois** deste commit. É a única escrita frequente da tabela que ainda podia ser HOT, e
  ela continua podendo.

  **Sem `to_regclass` e sem `CONCURRENTLY`, e o argumento é por negação.** `CONCURRENTLY` não cabe:
  migration do Supabase roda em transação (`20260828000002:28-33`), e **nenhum** dos ~35
  `create index` do stream o usa — é a regra da casa, não uma exceção. O guard `to_regclass` dos
  itens 0a/42/43 existe para tabela do app **legado**, que nasce fora do baseline que o CI aplica, e
  o motivo está escrito em `20260828000002:35-37`; `incentive_grants` nasce no próprio stream
  versionado (`20260813000005:66`) e `grep` acha exatamente dois arquivos `.sql` que a mencionam, os
  dois em `supabase/migrations/` — nada em `sql/`, nada em `_archive/`. Aqui o guard seria cargo
  cult e, pior, transformaria em no-op silencioso a falha de uma migration irmã. Vale registrar a
  fraqueza do argumento: **não existe neste repositório precedente positivo** de índice acrescentado
  por migration posterior a tabela nascida no stream — todos os casos de "índice em migration
  posterior" são tabelas legadas. O que sustenta a decisão é a ausência do motivo do guard, não um
  caso igual.

  **O custo de deploy, que é a única coisa que alguém sente:** `CREATE INDEX` não-concurrent toma
  `SHARE`, que **conflita** com o `ROW EXCLUSIVE` do sweep de 1s e com o consumo de cupom
  (`20260813000011:73-76`). Aplicar a migration com o runtime de pé faz a criação entrar na fila de
  lock e segurar as escritas que chegarem atrás dela. Sub-segundo no tamanho de hoje, e não é motivo
  para `CONCURRENTLY`.

  **A alternativa mais barata, registrada e NÃO tomada.** O sweep não tem requisito de latência:
  `find_reusable_grant` (`incentives.py:141`) e `valid_grants_for_contact` (`:167`) já filtram
  `validity_until > now()` **em SQL**, então grant vencido nunca vaza para a boca do agente
  independentemente do `status` gravado; e `grep` por `'expired'` em `runtime/src` acha **um único
  hit, numa docstring** (`engine.py:258`) — nada no runtime lê esse estado, e o app Next não toca a
  tabela. O único consumidor real é a linha do ledger no bloco ESTADO do prompt
  (`incentives.py:212-227`, chamado em `responder.py:337`). Rodar o sweep a cada 60 passadas em vez
  de a cada uma cortaria o scan **60×, com zero DDL**. **Não foi feito, e não deve ser feito de
  carona**: com o índice, a frequência deixa de importar para o scan, e o throttle é mudança de
  comportamento visível (atrasa a linha do ledger em até 60s) que quebraria
  `test_the_sender_housekeeping_expires_without_a_human`
  (`tests/db/test_grant_lifecycle.py:148-170`), o qual assere o efeito **na primeira** `sender_pass`
  — um teste que ninguém pode rodar nesta máquina para confirmar o conserto.

  **Sem prova executável — nenhum `EXPLAIN` foi rodado, nem antes nem depois.** Não há Postgres
  nesta máquina. Que hoje é seq scan é **inferência** (predicado sem a coluna líder do único índice
  composto, `20260813000005:104`, mais a ausência de skip scan de b-tree no PG 17,
  `supabase/config.toml:22`); que o índice novo **será** usado é inferência da regra de implicação
  de predicado parcial — sólida porque a cláusula é idêntica, mas leitura, não medição. Sob backlog
  grande (quase todo grant vivo já vencido) o planner pode preferir seq scan, o que estaria certo,
  porque aí há trabalho real; não se sabe em qual seletividade ele vira. **Nenhum teste mudou**: a
  cobertura é `tests/db/test_grant_lifecycle.py:148-182`, marcada `db` e fora do `-m unit`
  (`pyproject.toml:51`), e índice não muda resultado, só plano — `-m db` e `-m pipeline` penduram
  >10 min sem Postgres e não foram executados. `ruff` e `lint-imports` **não se aplicam** a um
  commit de `.sql` mais markdown; não foram rodados por ritual. **O tamanho real da tabela em
  produção continua desconhecido** — zero seeds, zero medições no repo. Um
  `select status, count(*) from public.incentive_grants group by status` num banco vivo converte
  todo o parágrafo do custo de inferência em fato.

- [x] **47. `mark_outbox_sent` descarta o retorno — e o gêmeo `mark_outbox_failed` o descarta três
  vezes, uma delas sobre perda silenciosa de mensagem** `[confirmado]` · commits `aab27c90` +
  `5f18a2b8` · **Fix round 1** (redação e o span do hold) · commits `5eadc8f5` + `753b3865` ·
  **Fix round 2** (o chip que o lojista lê) · relatório `task-47-report.md`, que é **gitignored**
  (`.superpowers/sdd/.gitignore` é `*`) — por isso o que precisa sobreviver está AQUI
  **Toda citação de linha deste item está ancorada na BASE `93af12eb`.** A âncora original
  (`queueing/sender.py:224`) foi escrita contra `52e43477` e hoje aponta para linha em branco; o
  alvo real é **`sender.py:403`** (o call site) e **`engine.py:369-376`** (o wrapper que lê o
  booleano e o devolve). O alvo estava certo, só a numeração tinha drift de ~180 linhas.

  **Este item mudou de veredito duas vezes, e as duas viradas importam mais que o conserto.** O
  texto original dizia que `false` significa "a mensagem saiu no WhatsApp e o banco não registrou".
  A recon desmentiu: seriam sempre casos benignos (o webhook do item 10 gravando `'sent'` primeiro,
  ou a sweep gravando `'unknown'`), logo qualquer `error` seria alarme falso. A revisão de plano
  enumerou os **seis** caminhos entre o claim e o carimbo e desmontou a recon em dois pontos — um
  caminho que ela não enumerou e outro que ela **viu e julgou errado** (`task-47-recon.md:216-222`
  trata a escalada `unknown → manual_review` como "falso positivo operacional, não perda") —
  `correlate_outbox_status(p_status='failed')`, que é um terceiro escritor alcançável
  (`20260828000006:82-87` aceita `failed` vindo de `'sending'`), e a sequência
  `sweep → review_stale_unknown → 'manual_review'` (`20260812000004:485-489`), que **ressuscita a
  frase original do item**. Ou seja: `false` não é sempre perda **nem** sempre benigno, e trocar um
  alarme falso por um silêncio falso seria o mesmo erro com o sinal invertido.

  **O booleano não distingue os caminhos, e é isso que decide a redação do conserto.** Tudo o que
  ele sabe é que a linha já não estava `'sending'` com o nosso token (`20260812000004:372-374`).
  Qualquer comentário ou mensagem de log afirmando "é a corrida benigna do item 10" seria **falso**
  em três dos quatro caminhos alcançáveis. O log escrito nomeia as possibilidades sem eleger
  nenhuma, em `info`, pela simetria com `webhook-processor.ts:770-788` — que resolveu o mesmo
  dilema do outro lado da casa. A simetria é de FORMA, não de classificação: lá `false` nunca é
  perda; aqui o ramo `'manual_review'` é, e por isso ele virou o **item 79** em vez de virar um
  `error` disparado em todo envio.

  **O achado mais grave não está no `mark_outbox_sent`: está no gêmeo, em `sender.py:292`.** O
  `where` das duas funções é idêntico (`20260812000004:401-403` e `:410-412`, contra `:372-374` —
  o brief citava `:397-399`/`:407-409`, que são os `set`, não os `where`), o significado é oposto. No
  carimbo de sucesso, `false` quer dizer *outro escritor já registrou a verdade*; em
  `mark_outbox_failed`, quer dizer *o estado que eu ia gravar sumiu e o que sobra não conduz a lugar
  nenhum*. No hold do send-guard (`transient=True`), isso é **perda silenciosa de mensagem**: o
  `next_attempt_at` não é gravado, a linha não volta a `'pending'`, o claim só reivindica
  `'pending'` (`20260902000002`), e — diferente de todos os outros — **nenhum webhook desta
  tentativa a resgata, porque nós seguramos o envio e a mensagem nunca chegou à Meta**. Não existe
  status para correlacionar sobre um POST que não saiu. (A precisão importa: `attempt_count` pode
  ser > 0, então um status muito atrasado de uma tentativa ANTERIOR é teoricamente concebível — mas
  entre as duas tentativas a linha passou por `'pending'`, onde a correlação não casa, o que torna
  isso praticamente inalcançável e não muda o nível.) E o argumento fecha com um fato de schema, não
  com uma dedução sobre percurso: **dos treze `update internal.message_outbox` das migrations, o
  único que escreve `'pending'` é o ramo transitório desta mesma função** — o que acabou de falhar.
  **O que o lojista via, e o que passa a ver:** uma resposta que ele acha enfileirada, que nunca
  sai, sem erro no chat e sem retentativa; a linha termina em `manual_review` como "outcome
  unknown", que é a legenda errada para "nós a seguramos e depois a esquecemos". A parte "sem erro
  no painel" era **pior do que sem erro** e só o fix round 2 achou: ver o chip, abaixo. Por isso os quatro call sites **não** levaram o mesmo `if`: `:292` e o ramo
  transitório de `:358` são `error`; a supressão do preflight (`:237`) e o ramo permanente de `:358`
  são `warning`, porque neles nenhuma entrega está em jogo e o que se perde é só o MOTIVO — o
  operador lê outra coisa no lugar de "opt-out" ou "fora da janela de 24h". **Um caso do `:358` que
  o `error` cobre operacionalmente mas que merece nome:** 1ª bolha entregue, 2ª levanta, o
  classificador chama `mark_outbox_failed` — e nesse meio-tempo o webhook de status da 1ª (mesma
  `idempotency_key`) já gravou `'sent'`. `false`. Uma entrega **parcial** fica registrada como
  sucesso completo, o retry some, e o operador nunca fica sabendo que 3 de 4 bolhas não saíram. É
  ambíguo de propósito — evita a duplicata que o retry causaria — e agora ao menos acende um log.

  **A honestidade da redação foi o que a review de fix round 1 mais cobrou, e com razão.** Três
  comentários afirmavam mais do que o booleano sabe: dois deles diziam que, com `false`, "a linha
  continua `'sending'` e a sweep a carimba" — quando `'sending'` com o nosso token é justamente o
  estado que o `where` acabou de negar, e a sweep exige `status='sending'` para agir. E o `info` do
  `:403` era justificado pela FREQUÊNCIA do caminho benigno, que este mesmo item declara
  desconhecida; passou a ser justificado pelo dano de cada caminho. É o ruling A aplicado a
  comentário, não só a mensagem de log.

  **O `annotate` mentiroso era o conserto mais barato do item — e eram DOIS, não um.**
  `sender.py:404` disparava `annotate(outcome="sent")` **incondicionalmente**, na linha seguinte ao
  carimbo, sem guarda: o span afirmava sucesso mesmo quando o banco recusava. O segundo só apareceu
  no fix round 1, e é pior: `sender.py:327` dispara `annotate(outcome=f"held:{hold.reason}")`
  logo depois do `mark_outbox_failed` cujo `false` é a perda silenciosa acima. `held:` não descreve
  o que o sender fez — **promete o que a linha VAI fazer**, "pausado, volta quando a janela passar".
  Com o registro recusado ela não volta, e o span estava dizendo "atraso" sobre a linha que morre.
  O `suppressed:{verdict}` do preflight (`:255`) e o `failed` seco do classificador (`:368`) ficaram
  como estão pelo motivo oposto: descrevem a decisão do SENDER, e continuam verdadeiros tenha o
  banco registrado ou não.
  **E havia uma terceira, que é a que de fato custa — só o fix round 2 a achou.** Doze linhas acima
  do `annotate` do hold, `emit_ai_run_step(step="started", detail="… retomando em {held_for}s")`
  (`sender.py:365-375`) disparava **sem guarda**, com o `requeued` já no escopo. As duas primeiras
  são mentiras **latentes**: `annotate` é no-op sem SDK OTel (`obs/telemetry.py:142-148`) e o
  Logfire está desligado no piloto. Esta é **ativa**: grava em `whatsapp_ai_run_steps` e o inbox a
  lê por Realtime (`AgentActivity.tsx`). O lojista via, na tela, *"Envio pausado: muitas falhas
  seguidas nesta conta do WhatsApp — retomando em 30s"* sobre a linha que morreu — e como `started`
  é NÃO-terminal, o painel some sozinho depois de 2 min (`STALE_AFTER_MS`), devolvendo o silêncio.
  Agora o passo é `failed` quando o reagendamento não foi registrado: terminal, vermelho, **fica na
  tela**, e o texto diz que a resposta não sai sozinha. É o mesmo vocabulário que a falha permanente
  do canal já usa — nenhum valor novo de `step`. **Nota obrigatória:** o atributo `outcome="sent"` hoje
  **superconta**, então o conserto vai DERRUBAR a contagem de `outcome = "sent"` em qualquer painel
  externo. A queda é a verdade aparecendo, não regressão. Nenhum consumidor do atributo existe no
  repositório (conferido em `runtime/` e `src/`), mas painel externo não está no repositório.

  **A lease de 60s: a aritmética confirma, a consequência que o item insinuava não existe.**
  `send_lease = 60s` (`config.py:79-81`), sem renovação — não há `renew_outbox_lease` no schema, só
  `internal.renew_lease` da CONVERSA (`20260812000004:149-166`), usada pelo `_keepalive` do worker.
  Lote de 50 (`sender.py:208`), até 4 bolhas por linha com até 8s de pacing (`channels/humanize.py:24,35`) e
  ~12 round-trips por linha: **a lease vence entre a 7ª e a 8ª linha, e o lote inteiro leva ~8
  minutos — oito vezes a lease.** Mas `mark_outbox_sent` **não confere `locked_until`**
  (`20260812000004:372-374`, confirmado nas cinco versões) e o claim só pega `'pending'`, então:
  **"lease vencida cria duplicata" é falso.** Nada devolve a linha a `'pending'` —
  `review_stale_unknown` vai para `manual_review` e `reprocess_dead_letters` (`:494`) opera em pgmq,
  não na outbox. Quem "consertar" acrescentando `and locked_until > now()` ao `where` **não** evita
  duplicata nenhuma: cria uma **enxurrada de `manual_review`** sobre mensagens entregues. E a lease
  vencida **não é decorativa**: com dois processos vivos (a janela de rollout do Render) há dano
  real hoje, e ele é **perda**, não duplicata — a sweep do processo novo tira de `'sending'` as
  linhas que o velho ainda entrega, e a partir daí os carimbos e os retries do velho são recusados
  em silêncio.

  **A opção de resgate de 2 linhas foi avaliada com o código na frente e ficou de fora.**
  `internal.correlate_outbox_status` já tem `grant execute to sender_role`
  (`20260828000006:93`) e casa `'unknown'`, então chamá-la no ramo do `false` custaria um wrapper em
  `engine.py` e nenhuma migration. Não entrou por três motivos, na ordem do peso: **(1) ela não
  alcança o caminho de perda real — mas só na CAUDA do lote.** Na linha do tempo do item 79 —
  `unknown` no minuto ~1, `manual_review` no ~6, `mark_outbox_sent` no ~8 — a linha JÁ está em
  `manual_review` quando o `false` chega, e `manual_review` não casa em nenhum ramo do `where`
  (`:82-87`). Vale registrar o estreitamento: `review_stale_unknown` mede `request_started_at`, que
  é do minuto 0, então as linhas alcançadas entre o minuto ~1 e o ~5 levam `false` ainda em
  `'unknown'`, e para ELAS a chamada funcionaria. Quem cobre essas é o motivo (2). **(2) O caminho 3
  já é resgatado, e mais de uma vez:** `sent`, `delivered` e `read` da Meta mapeiam todos para `'sent'`
  (`webhook-processor.ts:53-58`), então o webhook conserta a linha `unknown` em segundos, muito
  antes dos 5 minutos de `unknown_review_after` (`config.py:88`). O resgate do sender seria
  redundante com o do item 10 no único caso em que ele funcionaria. **(3) Custo de desenho maior que
  o de código:** `mark_outbox_sent` e `mark_outbox_failed` são escopadas por TOKEN de propriedade;
  `correlate_outbox_status` é escopada por `idempotency_key` e é deliberadamente cega ao token,
  porque o webhook não tem token nenhum. Um sender que, ao ser recusado pela porta com dono, tenta a
  porta sem dono anula na prática a própria conferência de lease — e faria isso exatamente na janela
  de dois processos vivos que produz o `false`. Não achei um cenário concreto em que isso escreva
  errado hoje (nada reivindica uma linha que não esteja `'pending'`), então o argumento é de
  invariante, não de bug. **Renovação de lease (~60 linhas + migration) continua rejeitada** pelo
  motivo que a recon já dava: não muda **nada** em `mark_outbox_sent`, cujo `where` não menciona
  `locked_until`.

  **O que ficou sem prova executável.** Não há Postgres nesta máquina: `-m db` e `-m pipeline`
  penduram >10 min e **não foram executados** — em particular
  `tests/db/test_outbox_claim.py:299-320` (que é o teste do `false` do lado SQL) e
  `tests/db/test_correlate_outbox_status.py:167-188`. Todo o raciocínio sobre qual `where` casa é
  leitura de DDL mais a regra do `found` do PL/pgSQL.
  **O que o teste novo (`tests/unit/test_sender_records_the_outcome.py`) prende, exato:** seis casos
  em três pares, sobre dois sites — carimbo recusado ⇒ o span não recebe `"sent"`; hold sem
  reagendamento ⇒ o span não diz só `held:`; e hold sem reagendamento ⇒ o chip do inbox é `failed`
  terminal, não `started` prometendo retomada. Cada par tem o caminho feliz junto, para a asserção
  não passar por vacuidade. **E há uma evidência executável do achado-título, que até o fix round 1
  não existia:** o ramo `error` do `:292` — a perda silenciosa — **roda de verdade** numa passada do
  `sender_pass`, e não só na leitura de DDL. Reproduz com
  `uv run --directory runtime pytest tests/unit/test_sender_records_the_outcome.py -k refused_requeue
  --log-cli-level=ERROR`, que imprime `ERROR agents_runtime.queueing.sender … envio segurado não
  voltou para a fila; a mensagem morre aqui`. **O que isso NÃO prova, e a distinção é o item
  inteiro:** que `mark_outbox_failed` devolve `false` em produção. O `false` do teste vem de
  `monkeypatch`. A premissa (*o `false` acontece*) segue sendo leitura; a consequência (*se
  acontecer, este código roda, loga e muda o chip*) agora é execução. Os logs do `:237` e do `:358`
  continuam sem teste que os observe.
  A frequência relativa dos quatro caminhos continua desconhecida: contar
  `whatsapp.webhook.correlate_channel_status_no_match` (`webhook-processor.ts:785`) e rodar
  `select status, count(*) from internal.message_outbox group by status` num banco vivo converteria
  este item inteiro de inferência em fato.

- [ ] **48. Pool de conexões de verdade** `[relatado]`
  `responder.py:263` e `toucher.py:122` abrem conexão por invocação; `server.py:90,130` por requisição
  (`/healthz` abre e fecha a cada probe). Handshake TCP+TLS+auth por turno de LLM.

- [ ] **49. RPCs fora do stream versionado** `[confirmado]`
  `get_active_agent_for_conversation`, `check_agent_cooldown`,
  `count_agent_messages_in_conversation` não estão em `supabase/migrations/`. Há definições em `sql/`,
  fora do que o CI aplica — inclusive **três variantes de `get_active_agent_for_conversation` com shapes
  diferentes**. Mais `update_agent_stats`, `increment_agent_conversations` e `ai_monthly_cost_usd` só em
  `migrations-archive/`.
  **`search_agent_knowledge` saiu daqui — promovida pelo item 43**
  (`20260902000004_search_agent_knowledge_org_scoped.sql`), escopada por `organization_id` além de
  `agent_id`. As quatro definições antigas em `sql/` (nenhuma escopada por organização, uma delas com
  `GRANT` para `authenticated` sem `SECURITY DEFINER` nem RLS que sustente isso) ficaram registradas
  como achado de segurança separado no item 70.

- [ ] **50. Índices faltantes nos predicados quentes** `[relatado]`
  `whatsapp_cloud_conversations (organization_id, wa_id)` (até 3× por envio), `whatsapp_opt_status`
  (nenhum índice em migration alguma), `incentive_grants.coupon_code`, e `lower(email)` em
  `shopify_orders` (o índice criado é sobre `email` puro, `20260815000001:54`).
  **O índice de `coupon_code` tem de ser FUNCIONAL em `upper(coupon_code)`, composto com
  `organization_id` na liderança** — nota do item 46. O predicado real é
  `where g.organization_id = p_organization_id and upper(g.coupon_code) = upper(trim(p_coupon_code))`
  (`20260813000011:49-50`, em `public.consume_incentive_grant`): um índice sobre `coupon_code` puro
  **não serve**, e seria exatamente o mesmo erro que este item já aponta duas linhas acima em
  `lower(email)` vs `shopify_orders.email`. O `trim` do lado direito não afeta a forma do índice, só
  o valor buscado. O índice do sweep de expiração (`incentive_grants_expiry_sweep_idx`) é do item
  46 e já está aplicado — os dois são sobre a mesma tabela, com predicados e funções diferentes, e
  não conflitam.

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
  morre), `WHATSAPP_AI_DEBOUNCE_SECONDS`, `OPENAI_API_KEY`, `SLACK_WEBHOOK_URL`.
  ~~`DEBUG_ENDPOINT_SECRET`~~ saiu desta lista: o fix round 1 do item 43 acrescentou a env ao
  `.env.example:47-54`, com a nota de que ela passou a ser exigida em qualquer ambiente. As demais
  continuam ausentes.
  Ausentes dos `runtime/.env.*.example`: `AGENTS_LOGFIRE_TOKEN`, `AGENTS_PLATFORM_LLM_ENABLED`,
  `AGENTS_HUMANIZE_DELAYS`, `AGENTS_RUBRICS_DIR` e os knobs de fila.

- [ ] **63. Lacunas de teste** `[relatado]`
  Sem cobertura: `toucher._node_delta` com `success_criteria`/`enabled_tools`/`forbidden` (onde mora um
  bug de tipo latente — `toucher.py:92` passa tupla onde `mission_resolver.py:63` declara `str | None`);
  ~~paridade preview↔turno~~ (fechada pelo item 45: `test_agent_block_has_one_producer.py` afirma o
  produtor único do bloco AGENTE e o mapeamento das colunas, e
  `test_listener_connects_in_one_guarded_place.py` afirma que a leitura do preview mora dentro da
  transação escopada — as duas em `-m unit`, sem Postgres); contagem de duplicação do transcript;
  ciclo de vida dos clientes httpx; teto de chamadas por turno; 429/5xx/timeout dos provedores;
  `server._read_request` malformado.

- [ ] **64. Migrar cupom da Shopify de REST para GraphQL** `[proposto]` · *(descoberto no item 35)*
  `connectors/shopify.py` cria e busca cupom por três chamadas REST: `POST /price_rules.json`
  (`:219`), `GET /price_rules.json` (`:172`) e `POST /price_rules/{rule_id}/discount_codes.json`
  (`:250`). O item 33 já tinha registrado que `PriceRule`/`DiscountCode` são recursos legados da
  Admin REST desde outubro/2024; o item 35 confirmou de novo, direto na documentação da versão
  exata que o runtime usa hoje (`2026-04`): `PriceRule` e `DiscountCode` continuam documentados e
  respondendo, com aviso de legado — *"The REST Admin API is a legacy API as of October 1,
  2024"* (`shopify.dev/docs/api/admin-rest/2026-04/resources/pricerule` e `.../discountcode`,
  verificado em 02/set/2026) —, mas sem data de remoção anunciada para os endpoints REST em si. Não
  é urgência de prazo: é dívida técnica com aviso de legado, sem deadline visível ainda.
  Efeito na loja: nenhum hoje — os dois endpoints seguem funcionando em `2026-04` com os mesmos
  filtros que `_find_price_rule_id` usa (`ends_at_min`/`ends_at_max`/`limit`). O risco é a Shopify
  desligar a REST Admin API por inteiro (ou só estes dois recursos) sem o runtime ter migrado a
  tempo, e o cupom do funil de recuperação parar de sair. Trabalho com desenho próprio — mapear
  `priceRuleCreate`/`discountCodeBasicCreate` (Admin GraphQL) contra o shape que
  `_find_price_rule_id` e a criação do cupom esperam hoje — e é o caminho do dinheiro do produto,
  por isso não entrou no item 35. Evidência completa em `task-35-evidence.md`.

- [ ] **65. `agent_traces` para org migrada** `[proposto]` · *(descoberto no item 37)*
  O runtime não escreve a trilha do lojista, e o item 37 tentou e parou aqui por motivo verificado.
  `guarded_reply` (`runtime/src/agents_runtime/judges/pre_send.py:304-371`) escolhe o rascunho de
  melhor **nota** entre até três tentativas (`REGENERATION_LIMIT=2`), não necessariamente a última
  (`:348-349`); `GuardedOutcome` (`pre_send.py:151-160`) carrega `draft`/`judgement`/`judgements`/
  `last_draft`, mas não `tool_calls` nem a identidade da tentativa vencedora. As funções `generate` e
  `run_turn_tool`, ambas locais dentro de `build_responder` em `responder.py`, também não acumulam
  essa informação por tentativa para quem chama depois — `generate` só devolve o texto final, e as
  tool calls de cada rodada ficam presas ao escopo de `run_turn_tool`. Efeito na loja: propostas de
  melhoria e o dataset de kappa/eval continuam vazios para org migrada, porque essas leituras
  dependem de `agent_traces`. O que decide o item: atribuir texto e `tool_calls` à tentativa
  vencedora é redesenho do fluxo de geração (`guarded_reply`/`GuardedOutcome`/`generate`), não
  repositório novo mais migração — por isso não coube no item 37. Ponto de partida:
  `.superpowers/sdd/AUDITORIA-IA-2026-08-28-CHECKLIST/task-37-report.md` (seção "agent_traces —
  BLOCKED").
  *(Nota de correção: a citação original apontava `agent_core/pre_send.py`; o arquivo real é
  `judges/pre_send.py` — corrigido acima.)*

- [ ] **66. Paridade da regra de guard entre TS e Python** `[relatado]` · *(descoberto no item 37)*
  A mesma regra de guard existe em **três** cópias para os quatro motivos comportamentais
  (`stop_on_human_reply`, teto de mensagens, cooldown de transferência, ativação manual):
  `src/lib/ai/cloud-runner.ts` (decisão real, org legacy), o badge em
  `src/lib/ai/conversation-ai-status.ts` (predição, as duas orgs) e
  `runtime/src/agents_runtime/agent_core/guards.py::evaluate_inbound_guards` (decisão real, org
  runtime). Para horário há **duas** cópias: `src/lib/ai/guards.ts::isWithinSchedule` ×
  `guards.py::is_within_schedule`. As cópias `cloud-runner.ts`×`conversation-ai-status.ts` existem
  desde o item 12; o que o item 37 mudou é que o badge passou a rodar lado a lado com a decisão real
  do Python para org `runtime` — antes o badge tinha early-return incondicional para essa org, e não
  havia como as duas discordarem. Não existe teste de paridade cruzada TS↔Python; o único contrato é
  um comentário (`guards.py:14-21`, "paridade de semântica, não de código"). Efeito na loja: as
  cópias divergem com o tempo — alguém muda um limiar de um lado e esquece o outro — e o badge volta
  a mentir por outro caminho, sem ninguém perceber. Esta auditoria já corrigiu cinco vezes o defeito
  de "duas cópias da mesma regra que divergem"; vale um teste de paridade (fixture compartilhada)
  antes que aconteça de novo aqui.

- [ ] **67. Contadores de agente sem escritor no runtime** `[relatado]` · *(descoberto no item 37)*
  `update_agent_stats(p_agent_id, p_tokens, p_response_time)` e
  `increment_agent_conversations(p_agent_id)` são funções SQL definidas só em
  `supabase/migrations-archive/20260613_agent_stats_rpcs.sql` — fora do que o CI aplica, mesmo achado
  do item 49 — e atualizam `ai_agents.total_messages`, `.total_tokens_used`, `.avg_response_time_ms`
  e `.total_conversations`. Hoje só têm um chamador cada, e é sempre o motor TS:
  `update_agent_stats` só em `src/lib/ai/engine.ts:443`; `increment_agent_conversations` só em
  `src/lib/ai/cloud-sender.ts:371`. Nenhum arquivo em `runtime/` chama qualquer um dos dois. O
  carimbo de `ai_agent_id` tem o mesmo buraco: em `whatsapp_cloud_messages` só é gravado pelo motor
  TS (`cloud-sender.ts:333,362`); em `whatsapp_cloud_conversations`, só pela rota manual
  `[id]/bot` (toggle humano). A função que o runtime usa para espelhar cada envio,
  `internal.mirror_outbound_to_inbox` (`supabase/migrations/20260813000003_sender_preflight.sql:228-271`),
  insere em `whatsapp_cloud_messages` sem a coluna `ai_agent_id` e no `update` de
  `whatsapp_cloud_conversations` só toca `last_message_at`/`last_message_preview`/
  `last_message_direction`/`updated_at` — nunca `ai_agent_id`. Efeito na loja: para org migrada, o
  card do agente (`src/components/whatsapp/analytics/ai/AIAgentCard.tsx`) mostra tokens, latência
  média e contagem de conversas/mensagens congelados no valor de antes da migração — a mesma classe
  "zero permanente" do item 37, só que no dashboard de estatísticas em vez de propostas/kappa; e
  `src/lib/ai/proposals.ts` filtra por `ai_agent_id` em `whatsapp_cloud_messages` (`:132,160,166`),
  então sem o carimbo essas consultas também ficam sem linha para atribuir ao agente certo em org
  migrada.

- [ ] **68. Teto de TEMPO do turno** `[relatado]` · *(descoberto no item 41)*
  A recon do item 41 mostrou que só existe teto POR CHAMADA (`DEFAULT_TIMEOUT_SECONDS = 60.0`, os
  dois em `agent_core/openrouter.py:43` e `agent_core/direct_providers.py:81`) — nenhum teto agregado
  cobre o turno inteiro. `respond(job)` é chamado dentro de `_turn`
  (`queueing/worker.py:136`) com um `await` direto, sem `asyncio.wait_for` nem qualquer outro
  envelope de prazo (o único `wait_for` do runtime é em `server.py:216`, para o parse HTTP de
  entrada — sem relação com o turno de resposta). E a lease que impede outro worker de assumir a
  mesma conversa nunca expira sozinha enquanto o turno roda: `_keepalive`
  (`queueing/worker.py:40-69`) renova a lease de 2 minutos (`config.conversation_lease`) e a
  visibilidade do pgmq de 60s (`config.visibility_timeout`) a cada 45s
  (`config.heartbeat_every`), em loop `while True`, **sem limite de renovações** — o resultado de
  `renew_lease` é explicitamente ignorado (`worker.py:59-61`, comentário: "se a lease foi perdida, o
  CAS na conclusão é a autoridade que recusa"). Efeito: um turno preso (rede lenta, provedor
  pendurado, laço no tool-loop) pode segurar o worker e a conversa por até 16 chamadas × 60s = até
  16 minutos de timeouts encadeados, sem nenhum mecanismo interrompendo antes disso — e o keepalive
  garante que nenhum outro worker pode assumir enquanto isso acontece. O item 41 (teto de chamadas)
  não cobre isto: um turno pode ficar dentro do teto de CHAMADAS e ainda assim demorar minutos numa
  única chamada lenta. Não implementado no item 41 por ruling F explícito do controlador — é achado
  vizinho, não o mesmo item.

- [ ] **69. Decidir o que fazer quando `checkAiBudget` não sabe o gasto real** `[relatado]` · *(descoberto no item 42)*
  `checkAiBudget` (`src/lib/ai/budget.ts`) tem HOJE duas fontes independentes de "não sei o gasto
  real da org", e as duas resolvem pro mesmo `allowed: true` sem exceção — decisão de produto que
  nenhum dos itens 37/41/42 tomou, só documentou. Fix round 1 do item 42 pediu a recomendação que
  faltava (ruling E cobrado explicitamente) — vai abaixo, com o preço de cada saída.

  **Fonte 1 — os três `catch` que já existiam (o "fail-open triplo" citado desde o item 37).**
  `budget.ts:149-153` (erro lendo `ai_budgets`), `:166-174` (erro somando `ai_usage_logs`, RPC ou
  fallback) e `:185-190` (catch-all) devolvem `{allowed: true, ...}` sempre que a consulta ao banco
  falha — não é ausência de dado, é ERRO de conexão/consulta.
  *Efeito de cada saída, hoje vs. a alternativa:*
  - **Manter fail-open (atual):** a org segue sendo atendida no WhatsApp normalmente enquanto o banco
    tossir; o preço é gasto sem teto durante a janela do erro — limitado, na prática, pelo volume de
    mensagens que chegam nesse intervalo, e com o `console.warn` de cada ramo como único sinal.
  - **Virar fail-closed (lançar/bloquear nesses três `catch`):** qualquer soluço de `ai_budgets` ou
    `ai_usage_logs` — não só um orçamento realmente estourado — cala o agente pra TODOS os clientes
    da org até o banco voltar. `checkAiBudget` roda perto do início de `processMessage`
    (`engine.ts:92`) e nos 4 outros chamadores (`evals.ts`, `proposals.ts`, `test-runner.ts` ×2,
    `process/document/route.ts`); um blip transitório de rede vira silêncio total no canal que o
    cliente final enxerga, não um erro interno.

  **Fonte 2 — nova, do item 42: `hasUnknownCost`.** Diferente da Fonte 1, aqui a consulta ao banco
  FUNCIONA — o que falta é preço pro modelo (`google/gemini-3.5-flash`, o caso real do piloto).
  `spentUsd` soma só o conhecido (nunca inventa `0` — esse era o próprio achado do item 42) e
  `hasUnknownCost: true` sinaliza que a soma é parcial, mas `allowed` não reage a isso.
  *Efeito de cada saída:*
  - **Manter como está (atual):** best-effort — nunca bloqueia por custo que não sabe calcular; risco
    de gasto real sem teto enquanto o modelo não tiver preço cadastrado. Agora VISÍVEL
    (`console.warn` a cada `checkAiBudget`, `hasUnknownCost` no retorno e em `/api/ai/usage`), o que
    muda o risco de "silencioso" pra "monitorável", mas não pra "limitado".
  - **Tratar `hasUnknownCost` como orçamento estourado (fail-closed):** simples de implementar, mas
    calaria o agente assim que a org usasse QUALQUER modelo novo — antes de um operador notar e
    cadastrar o preço. Pune o caso comum (modelo novo, preço ainda não cadastrado) do mesmo jeito que
    o caso raro (uso deliberado de modelo caro sem controle).
  - **Meio-termo (teto de N chamadas desconhecidas antes de bloquear):** amortece os dois riscos
    acima, mas é a política plugável que o item 42 evitou por YAGNI — não cabe sem um dono decidindo
    o N e o horizonte.

  **Recomendação (não é decisão — é o ponto de partida pro dono do produto avaliar):** manter
  fail-open nas duas fontes por enquanto, e tratar a MITIGAÇÃO como monitoramento, não como
  bloqueio — motivo: o produto é um canal de atendimento ao cliente final (WhatsApp), e nas duas
  fontes o modo de falha do fail-closed (cliente manda mensagem, ninguém responde, sem aviso nenhum
  pro lojista nem pro cliente) é mais caro pra confiança na loja do que uma janela limitada de gasto
  sem teto — sobretudo com o limite-default de $50/mês (`DEFAULT_MONTHLY_LIMIT_USD`) mantendo o
  pior caso pequeno em dólar absoluto. Essa conta muda se/quando: (a) o limite por org crescer muito
  além do default; (b) `console.warn` virar alerta de verdade (Slack/PagerDuty) que alguém realmente
  olha — aí fail-closed com alerta simultâneo fica mais defensável, porque o silêncio pro cliente
  vem acompanhado de um humano já a caminho. Ponto de partida técnico:
  `src/lib/ai/budget.ts::checkAiBudget` (os três `catch` e o bloco que loga `hasUnknownCost` sem agir
  sobre ele); `task-42-report.md`, seção "Fix round 1", tem o raciocínio completo.

- [ ] **70. `search_agent_knowledge` em `sql/` sem escopo de organização, uma com `GRANT` para
  `authenticated`** `[confirmado]` · *(descoberto no item 43)*
  As quatro definições de `search_agent_knowledge` fora do stream versionado
  (`sql/ai-agents-rpc-functions.sql:197`, `sql/ai-agents-functions.sql:9`,
  `sql/ai-agents-stored-procedures.sql:11`, `sql/ai-agents-complete-migration.sql:364`) filtram só por
  `c.agent_id = p_agent_id` — nenhuma usa `ai_agent_chunks.organization_id`, que é `not null`
  (`20260812000001_agents_baseline_prereqs.sql:731`). `sql/ai-agents-functions.sql:9-38` é a pior: SEM
  `SECURITY DEFINER`, com `GRANT EXECUTE ... TO authenticated, service_role` (`:233`). A RLS de
  `ai_agent_chunks` só é ligada em `supabase/migrations-archive/001_enable_rls.sql`, fora do stream —
  nesta base a tabela nasce sem RLS. Combinado: se essa variante foi a aplicada em produção (fora
  deste repositório, não verificável daqui), qualquer usuário autenticado que soubesse ou enumerasse um
  `agent_id` de OUTRA organização conseguiria ler seus chunks de conhecimento via a RPC. Mesmo padrão
  que os itens 03, 04, 22 e 24 já fecharam nesta auditoria.
  O item 43 promoveu uma versão escopada por organização
  (`supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql`) e, do lado do stream
  versionado, isso fecha o buraco — inclusive com `DROP FUNCTION IF EXISTS` da assinatura antiga sem
  escopo, pra não sobrar como overload paralelo se a migration algum dia rodar contra uma base que já
  tinha uma das quatro variantes de `sql/` aplicada manualmente. **Mas o que está hoje em `sql/`
  continua existindo nesses quatro arquivos, e pode já ter sido aplicado em produção fora do stream —
  não verificável nem corrigível a partir deste repositório** (sem Postgres nesta máquina, item 43 não
  aplicou nem testou a migration — ruling G). Se alguém aplicou manualmente a variante com `GRANT` para
  `authenticated`, o buraco pode seguir aberto na base viva até essa migration ser aplicada lá, ou até
  alguém confirmar e revogar manualmente. YAGNI: não criar script de reconciliação de produção sem um
  dono definindo se/quando as migrations promovidas nesta auditoria são aplicadas fora do CI.

- [ ] **71. `/api/debug` — a décima terceira rota de debug, com o mesmo fail-open que o item 43
  fechou nas outras doze, e leitura cross-tenant sem sessão** `[confirmado]` ·
  *(descoberto no item 43, fix round 2)*
  `src/app/api/debug/route.ts:12-16` tem uma cópia inline de `isAuthorized` com **exatamente** a linha
  que o fix round 1 do item 43 apagou do guard compartilhado: `if (!IS_PRODUCTION) return true`. Ela
  não usa `assertDebugAllowed` (usa `DEBUG_ROUTE_SECRET`, outra env, sem relação com
  `DEBUG_ENDPOINT_SECRET`), então **não foi alcançada pelo fix**: o registro do item 43 diz que "as 12
  rotas passam a responder 404 em dev", e isso é verdade — mas não quer dizer que a superfície de
  debug esteja fechada, porque esta décima terceira, chamada literalmente `/api/debug`, continua
  aberta em `next dev`.
  O agravante é a carga. A rota está em `publicApiRoutes` (`src/middleware.ts:20`), ou seja, o
  middleware não pede sessão nenhuma; ela nunca chama `getAuthClient()`; e lê **sem filtro de
  organização**: `shopify_stores.select('*')` (`:53`), contas do Klaviyo (`:158-170`), `organizations`
  (`:186`), `whatsapp_conversations.select('*')` (`:192`), `whatsapp_accounts` (`:240`). O JSON de
  resposta (`:252-274`) devolve domínios e nomes de todas as lojas de todas as organizações, os
  `id`/`organization_id` das contas Klaviyo, os itens crus de `whatsapp_accounts`, amostras de pedidos
  e um `tokenPreview` (10 primeiros caracteres do `access_token` da Shopify) por loja. Em `next dev`
  isso é leitura cross-tenant sem autenticação nenhuma — mesma classe do Important que o item 43
  fechou, com carga pior. Pior ainda em conjunto com `src/middleware.ts:214`, que deixa passar
  qualquer requisição com o cookie literal `sb-access-token=dev-access-token`. Em produção continua
  fechada (sem `DEBUG_ROUTE_SECRET`, recusa).
  `src/app/api/shopify/debug/route.ts:8-12` tem a **mesma cópia inline** do fail-open, mas é
  inofensiva: logo abaixo ela exige `getAuthClient()` e filtra por `auth.user.organization_id`. Fica
  registrada aqui porque é a segunda metade da duplicação — o conserto óbvio e mínimo é trocar as
  duas `isAuthorized` inline por `assertDebugAllowed`, que some com a duplicação e com o fail-open de
  uma vez.
  **NÃO corrigido no item 43 (nem no fix round 1, nem no round 2), de propósito:** é rota que o item
  43 nunca tocou, o brief das duas rounds escopou o guard compartilhado e os comentários das rotas
  que o usam, e achado fora de escopo vira registro, não trabalho. Mexer em `/api/debug` muda uma
  rota de produto que ninguém desta fila revisou — a decisão é do dono. **Também não apagar a rota:**
  remover órfã é o item 61, não este. Conclusão por leitura de código, não por runtime: a rota não
  foi chamada de verdade para ver o JSON cross-tenant sair; a base é a ausência de
  `.eq('organization_id', …)` nas queries e a presença de `/api/debug` em `publicApiRoutes`.

- [ ] **72. Decidir com que query um toque proativo consulta a base de conhecimento**
  `[relatado]` · *(descoberto no item 44)*
  Uma resposta reativa consulta o RAG (`responder.py:591-599` → `_knowledge` → `SearchKnowledge`) e
  entrega os trechos ao prompt **e** ao `JudgeContext`. Um toque não consulta nada
  (`toucher.py:410`: `knowledge=()`), e **isso não é linha esquecida**: `_knowledge` monta a query
  exclusivamente das mensagens do contato na janela pendente (`responder.py:1059-1061`) e um toque
  proativo não tem janela pendente — copiar a chamada devolveria `()` de qualquer jeito, sem sequer
  gastar uma embedding (a guarda dispara antes do `run_tool`). **Não existe query para copiar; existe
  uma query para DECIDIR**, e isso é produto, não refatoração — por isso o item 44 não a tomou.
  Efeito para o lojista: um toque de carrinho abandonado que fale de frete, prazo ou troca o faz sem
  a base de conhecimento que ele escreveu, enquanto uma resposta reativa sobre o mesmo assunto a
  consulta — o toque pode contradizer a própria loja. Segunda ordem: sem `knowledge`, o Judge 1 do
  toque também julga sem o bloco "Base de conhecimento disponível ao agente"
  (`judges/pre_send.py:293-295`), ou seja, não tem como aferir aderência à base.
  Duas opções, nenhuma recomendada como decisão tomada — quem decide é o dono do produto:
  **(a) o objetivo da missão** (`resolved.objective`, mais o `delta` do nó) — é o que o toque de fato
  vai falar, e nasce do catálogo, não do cliente; risco de ser genérico demais e trazer chunk
  irrelevante. **(b) a cauda do transcript** (as últimas N mensagens que `load_recent_transcript` já
  carrega) — é o contexto real daquele contato, mas num contato que nunca escreveu (o caso central do
  toque: quem só navegou) ela é vazia e a opção degrada para o comportamento de hoje. Um híbrido
  (objetivo, com a cauda quando existir) é possível e custa a mesma decisão. Ponto de partida
  técnico: `responder.py:1039-1075` (a assinatura exige `pending`, teria de mudar) e
  `toucher.py:408-413`.

- [ ] **73. O toque não tem tool-loop: as tools custom do lojista não existem quando o agente toca**
  `[relatado]` · *(descoberto no item 44)*
  `responder.py:684-778` monta a grade de tools (`create_coupon` da interseção missão∩agente, mais as
  custom do 10.7) e roda `MAX_TOOL_ROUNDS` rodadas com corte forçado sem tools na última.
  `toucher.py` faz **uma** `chat.chat(...)` sem `tools=` nenhum, não importa `custom_tools_repo` e não
  tem `run_turn_tool`. Metade disso é desenho e deve ficar: o dinheiro do toque não passa pelo modelo
  — o `concession_request` do nó vira cupom ANTES da geração e entra no prompt como fato, e
  `create_coupon` como tool no toque seria uma segunda porta para o mesmo dinheiro. A outra metade é
  capacidade que falta: as tools custom do 10.7 (read-only por construção — rastreio, consulta de
  estoque) ficam inteiramente fora do toque, **sem que nada declare isso**.
  Efeito para o lojista: uma tool que ele ligou funciona quando o cliente pergunta e não existe
  quando o agente toca. **Atenção ao que este item NÃO é:** o prompt nunca anunciou tool custom em
  caminho nenhum — elas entram direto no `tool_specs` do responder (`responder.py:695-703`), sem
  passar pela interseção de missão. O anúncio enganoso que existia era só o de `mission.tools`, e o
  item 44 o apagou do toque (`2f180bab`); este item é sobre PASSAR as tools, não sobre anunciá-las.
  Wirar o loop no toque é capacidade nova e tem custo real: ~45 linhas copiadas, ou ~25 se o
  `generate` das duas funções virar fábrica compartilhada — e a prova mora em `tests/db`, que só roda
  no CI. Não quantificado: com que frequência uma missão de toque tem tools ligadas na prática (não
  foram inspecionados dados nem seeds).

- [ ] **74. `ruff check .` está VERMELHO na branch, e é o passo de lint do CI** `[confirmado]` ·
  *(descoberto no item 44)*
  Medido nesta máquina em `e2d1f38a`, antes de qualquer mudança do item 44: `uv run --directory
  runtime ruff check .` (exatamente o comando de `.github/workflows/runtime.yml:51`) devolve
  **10 erros**, todos pré-existentes e alheios ao item 44 — a contagem é idêntica antes e depois dos
  quatro commits. São dois arquivos: **`runtime/scripts/measure_transcript_duplication.py`** com 9
  (um `I001` de import fora de ordem, um `E501`, e 7 `T201` — `print` é banido no `select`, e
  `per-file-ignores` cobre `tests/**`, não `scripts/**`), entrado em `01087626` (item 39, "script de
  medida versionado"); e **`runtime/tests/unit/test_humanize.py:286`**, um `E501` de 103 colunas,
  entrado em `40546597` (item 38, fix round 1). Ou seja: o gate de lint do runtime está quebrado
  desde os itens 38/39 desta própria auditoria — é **regressão** do verde que a Fase 0 conquistou,
  não contradição dela: a Fase 0 é um instantâneo datado (run `33203217236`, 28/08) e naquele dia
  nenhum dos dois arquivos existia; os dois commits culpados são de 02/09. **Não
  consertado aqui** porque é trabalho de outro item e o escopo do 44 é o par responder/toucher — mas
  é conserto de minutos (`ruff check --fix` resolve o `I001`; o `print` do script pede `T201` no
  `per-file-ignores` para `scripts/**`, que é a decisão a tomar: um script de medida existe para
  imprimir).
  **Não verificado:** o estado real das execuções do workflow no GitHub — a conclusão vem de rodar o
  comando localmente com a versão travada no `uv.lock` (ruff 0.16.1), não de olhar um run vermelho.
  Nota lateral de ambiente, não do repositório: o `.ruff_cache` desta máquina estava corrompido
  (`wrong package cache for file`) e fazia o ruff entrar em `panic` em todo arquivo de `src/`;
  `rm -rf runtime/.ruff_cache` resolve, e nada disso aparece em CI, que roda com cache limpo.

- [ ] **75. Decidir se o preview do hub mostra a base de conhecimento — e a que preço**
  `[relatado]` · *(descoberto no item 45)*
  Irmão do item 72, com um agravante. O bloco `# CONHECIMENTO` não é um `RenderedBlock`: o responder
  pega `compiled.text` e cola uma string por fora (`responder.py:616-622`, o único produtor no
  runtime), então ele não tem `kind`, não tem `source_ids`, não entra em `CompiledPrompt.blocks` e
  **não pode aparecer no `_serialize` do preview nem por acidente** (`server.py:124-137` itera
  `compiled.blocks`). O item 45 fechou a mentira do rótulo declarando a ausência na tela
  (`b2457a66`), o que é honesto mas não é o conteúdo.
  Mostrar os trechos de verdade exige quatro coisas que o `_preview` não tem, todas reconferidas:
  um **embedder** — `_knowledge` (`responder.py:1007-1043`) chama `SearchKnowledge` com um
  `MeteredLlm`, e `serve()` recebe só `dsn`, `host`, `port`, `preview_token`, `set_role`,
  `health_max_age_s` (`server.py:202-210`; `__main__.py:91-96` também não passa nenhum), ou seja
  **abrir um cliente de LLM dentro de um listener HTTP que hoje, por desenho, só fala com Postgres**
  (`_connection` é a única porta); uma **query**, que `_knowledge` monta das mensagens do contato na
  janela pendente (`:1027-1029`) e o preview não tem janela nenhuma — inventar qual é a pergunta é
  produto, exatamente como no item 72; um **`conversation_id` real**, porque `run_tool` grava em
  `tool_calls` fora de qualquer condicional (`tools/base.py:98-110`) e o preview usa a string
  literal `"preview"` (`server.py:185`), que nem UUID é; e a **chave BYO da org**, com o metering
  que vem junto — clique de curiosidade passaria a custar dinheiro do lojista.
  **A saída recomendada por escrito já existe e não é outra concatenação:**
  `core/STATUS-agentes-por-evento.md:479-480` diz "se o preview precisar exibir, expor via parâmetro
  opcional do `compile_prompt`" — o mesmo caminho que `core/agentes-por-evento.md:468` registra na
  linha 10.5 do plano. Acrescentar um `RenderedBlock` fantasma direto no `_serialize` é mais barato
  (~4 linhas) mas cria um segundo lugar que sabe a forma do frame, que é o pecado que o
  `prompt_compiler` existe para impedir. Quem decidir isto decide junto com o 72: são a mesma
  pergunta ("com que query um caminho sem cliente falando consulta o RAG?") em dois consumidores.

- [ ] **76. Decidir se o bloco ESTADO do preview morre como fantasma ou vira feature**
  `[relatado]` · *(descoberto no item 45)*
  `server.py:178` passa `state=None` e o compilador escreve um fantasma
  (`prompt_compiler.py:199-205`). Mas o `StateBlock` tem oito campos de duas naturezas diferentes, e
  o preview alcança três deles hoje: `moment_ids`, `moment_facts` e `moment_public_claim` são de
  **organização**, não de conversa — saem do mesmo `moment_view` que o item 45 já passou a calcular
  dentro da transação escopada do `_preview` (`ef1de779`), custo zero de dado novo, ~9 linhas. Os
  outros cinco (`grant_id`, `grant_lines`, `ledger_lines`, `contact_facts`, `purchase_lines`) são de
  **conversa** e são inalcançáveis: não há contato.
  A decisão é de produto porque as duas saídas contradizem alguma coisa escrita. Mostrar só os três
  campos de organização faz o bloco ESTADO deixar de ser fantasma e passar a ser **meia verdade** num
  frame cuja honestidade vem de declarar a ausência inteira. Deixar como está esconde do lojista a
  frase pública do momento que está no ar agora, que é literalmente o que
  `core/agentes-por-evento.md:56` prometeu ("preview: o que a IA responderia hoje") e o que
  `:304` promete pelo nome: "ESTADO — momento ativo e promessas" — hoje a UI escreve essa frase como
  fantasma fixo do fallback (`RadialView.tsx:161`). É a fronteira geral deste preview em um caso
  concreto: dado da organização é alcançável, dado da conversa não.

- [ ] **77. O `ghost` viaja do runtime até a UI e a UI o joga fora** `[confirmado]` ·
  *(descoberto no item 45)*
  `_serialize` devolve `ghost` por bloco (`server.py:132`) porque a honestidade do frame depende
  disso; o `RadialView` renderiza `kind` + `text` e mais nada (`RadialView.tsx:151-156`), e o tipo
  `PreviewBlock` (`:39`) **nem declara o campo**. Efeito: um bloco fantasma sai na tela com a mesma
  tipografia de um bloco real, e a única pista é a palavra "fantasma" no meio do texto corrido.
  **E é pior do que "a UI descarta o campo", achado do fix round 1 do item 45: a classe `.ghost` não
  existe em CSS nenhum do repositório.** `grep` por `ghost` em `src/app/globals.css`,
  `src/styles/agents-theme.css` e no resto do CSS só acha `.btn-ghost` (`agents-theme.css:75-76`,
  `globals.css:163`), que é botão. Ou seja, o `className="ghost"` dos fantasmas de fallback
  (`RadialView.tsx:158-164`) e o da linha nova do conhecimento (`:172-174`) **não pintam nada**: a
  distinção visual entre fantasma e bloco real não foi perdida no `_serialize`, ela nunca existiu.
  Consequência para quem pegar este item: não há "classe pronta para aplicar" — escrever a regra CSS
  vem primeiro, e **como o fantasma aparece é decisão do dono da tela**, não conserto mecânico.
  Depois do item 45 isso pesa mais, não menos: dois dos cinco blocos são fantasma no uso real
  (ESTADO e CONVERSA), e os três restantes passaram a ser verdadeiros de verdade — misturar os dois
  registros na mesma tipografia é o que faz o lojista ler um esboço como se fosse o prompt.
  Segundo achado da mesma função, cosmético: `:153-154` imprime `# {block.kind}` em inglês
  (`AGENT`, `MISSION`) **depois de apagar** o cabeçalho em português que o compilador escreveu
  (`# AGENTE`, `# MISSÃO` — `prompt_compiler.py:143`, `:171`). Uma linha de mapa ou parar de apagar
  o cabeçalho resolve. Ambos são diff de TSX, sem runtime.

- [ ] **78. Todo o housekeeping do banco vive dentro da task do canal — sem `AGENTS_CHANNEL`, os
  três passos morrem juntos** `[relatado]` · *(descoberto no item 46)*
  `app.py:230` — `if channel is not None:` é o que cria a task `sender`, e é dentro dela que roda o
  bloco de housekeeping inteiro (`queueing/sender.py:216-218`): `sweep_outbox_unknown`,
  `review_stale_unknown` e `expire_incentive_grants`. Num deploy sem canal, **nenhum dos três roda**
  — não é só a expiração de grants, que foi como o achado apareceu. O cheiro fica mais nítido assim:
  expiração de grant é housekeeping de banco e não tem nada a ver com existir um adapter de canal;
  está acoplada a ele só por morar na mesma task, e o comentário que justifica o acoplamento
  (`app.py:227-229`) fala do **envio** ("a sender with nowhere to send would either spin or lie"),
  não do housekeeping.
  **Força do achado — latente em produção, real por contrato na bancada.** O blueprint de produção
  **fixa** o canal: `render.yaml:34-35` põe `AGENTS_CHANNEL:
  agents_runtime.channels.cloud_api:from_env` como valor literal no repositório, ao lado de
  `DEPLOY_ENV: production` (`:44-45`) — não é `sync: false` e não depende de alguém lembrar. E o
  modo **sem** canal não é caminho de teste: é a **bancada**, um modo de deploy real com
  `.env.example` próprio e seção no DEPLOY.md, onde a ausência é **contrato escrito**
  (`runtime/.env.bancada.example:4` — "CONTRATO: este modo NÃO tem AGENTS_CHANNEL";
  `runtime/DEPLOY.md:59` — "nunca adicionar `AGENTS_CHANNEL` ao `.env.bancada`"). A ausência é
  estado válido por desenho, em contraste deliberado com `AGENTS_RESPONDER`, que `raise` se faltar
  (`__main__.py:37-38` escreve o contraste; `:48-53` é o `raise`; `_channel_from_env` em `:60-61`).
  Por isso nasce `[relatado]` e não `[confirmado]`: **não há deploy de produção nesse estado**, e
  dizer o contrário seria mentira.
  **O que se perde de fato, para calibrar a gravidade:** nenhum grant vencido vaza para o cliente em
  modo algum — `find_reusable_grant` (`repository/incentives.py:141`) e `valid_grants_for_contact`
  (`:167`) filtram `validity_until > now()` em SQL. O prejuízo é a **história**: numa bancada
  rodando sobre espelho de dados reais, grants vencidos ficam presos em `'issued'` para sempre, o
  ledger fica sem as entradas `'expired'`, e as linhas `sending` de um sender morto nunca viram
  `unknown` nem sobem para revisão humana. O estado do espelho diverge do que o mesmo banco teria em
  produção — justamente no modo cujo propósito é observar o comportamento real com segurança.
  **Não decidido aqui:** se a saída é mover os três passos para uma task própria que não dependa de
  canal, se é aceitar o acoplamento e documentá-lo no `.env.bancada.example`, ou se a bancada
  simplesmente não deve se importar. É decisão de quem é dono do runtime, não conserto mecânico.

- [ ] **79. Uma linha entregue pode ficar presa em `manual_review` para sempre — `manual_review` é
  terminal de propósito e a correlação não o alcança** `[confirmado]` · *(descoberto no item 47)*
  Linhas na numeração da base `93af12eb`.
  **A janela de duas instâncias vivas é default CONFIGURADO, não suposição de plataforma.**
  `render.yaml:16-25` declara `type: web` + `healthCheckPath: /healthz` + `autoDeploy: true`, que é
  exatamente o rolling deploy zero-downtime do Render: a instância nova sobe e passa no health check
  **antes** de a velha drenar. Some-se o crash-loop, que acontece nesta casa. (O comportamento do
  Render em si continua fora do repositório; o que está no repositório é a configuração que o pede.)
  **A linha do tempo, nessa janela:** o processo VELHO
  claima um lote de 50 no minuto 0 e começa a entregar; a lease de 60s vence entre a 7ª e a 8ª linha
  (`config.py:79-81`, `sender.py:208`, `channels/humanize.py:24,35`); o processo NOVO roda a sweep-at-boot
  (`sender.py:216`) e por volta do **minuto 1** carimba `status='unknown'` nas linhas que o velho
  ainda está entregando (`20260812000004:438-443`); no **minuto ~6** a sua
  `review_stale_unknown` (`sender.py:217`) escala essas linhas para `'manual_review'`, porque
  `request_started_at` já passou de `unknown_review_after` = 5 min
  (`20260812000004:485-489`, `config.py:88`); no **minuto ~8** o processo velho finalmente chega ao
  `mark_outbox_sent` com o wamid na mão e leva `false`.
  **E aí não há volta.** O `where` de `internal.correlate_outbox_status` é
  `status in ('sending','unknown','sent')` para `failed` e `status in ('sending','unknown')` para
  `sent` (`20260828000006:82-87`). **`manual_review` não casa em nenhum dos dois** — e isso é
  desenho, não descuido: o item 10 fez `manual_review` terminal de propósito, com o comentário
  escrito na própria migration (`20260828000006:34-36`, "precisa de revisão humana, não de um
  webhook tardio"). O webhook de status da Meta chega e não move nada. A linha fica em
  `manual_review` **para sempre**, sobre uma mensagem que **foi entregue** — e o único processo que
  tinha a prova da entrega foi recusado em silêncio.
  **O que se vê de cada lado.** O cliente recebeu a mensagem e não percebe nada. O operador ganha um
  alarme de revisão manual sobre um envio que deu certo, com `last_error = 'send lease expired
  mid-request; outcome unknown'`, e não tem como saber que deu certo sem ir olhar o WhatsApp. O
  volume é proporcional ao tamanho do lote atrasado, não a uma linha: um lote de 50 respostas longas
  numa janela de deploy pode produzir dezenas de revisões manuais falsas de uma vez.
  **Por que não foi consertado no item 47.** Destravar `manual_review` exige mudar a semântica de um
  estado que outro item tornou terminal deliberadamente — é decisão de desenho (quem pode reabrir,
  com que evidência, sem reabrir os casos que precisam mesmo de humano), não conserto de rodapé. As
  saídas plausíveis, nenhuma escolhida aqui: (a) o sender chamar `correlate_outbox_status` no ramo
  do `false` — **não resolve este caso**, porque nesta linha do tempo a escalada já aconteceu, e
  fecharia só o caminho `unknown` que o webhook já fecha; (b) acrescentar `manual_review` ao `where`
  do lado `'sent'` da correlação, o que reabre um estado terminal para todo webhook tardio; (c) uma
  função nova, restrita, que só o sender possa chamar quando tem wamid e recebeu `false` —
  "eu entreguei isto, tire da revisão"; (d) impedir a causa, fazendo `review_stale_unknown` ignorar
  linhas cujo `locked_by` ainda aponta para um sender vivo. O sinal de vida existe **pela metade**:
  `internal.runtime_heartbeats` (`20260812000004:536-546`, wrapper em `engine.py:453-461`) é
  chaveada por `process_name`, e o blueprint fixa esse nome num literal
  (`render.yaml`, `AGENTS_PROCESS_NAME: agents-runtime-render`) — as duas instâncias do rollout
  colidem na MESMA linha. E o grant fecha o argumento: `20260812000004:545` concede
  `select, insert, update` sobre a tabela **só a `worker_role`**, enquanto o sender roda com
  `sender_role` (`render.yaml`, `AGENTS_SENDER_SET_ROLE: sender_role`) — mesmo resolvida a colisão
  de `process_name`, o lado que consulta não teria permissão de ler. Ela é ponto de partida, não
  resposta: falta amarrar o batimento ao `locked_by` da linha, que é o que a saída (d) precisaria.
  **O que não foi verificado:** nada foi executado contra Postgres (`-m db` e `-m pipeline` penduram
  >10 min sem banco). A linha do tempo é aritmética sobre as constantes citadas, e a janela de duas
  instâncias vivas está lida no `render.yaml` (acima), mas o comportamento do Render em si não é
  verificável daqui. Crash-loop produz a mesma janela e **acontece** nesta casa. A frequência real é desconhecida: `select status, count(*) from
  internal.message_outbox group by status` num banco vivo mede isto direto.

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

- [x] **Um SEGUNDO `safeFetch`, com a defesa que o Node nunca chamava** ·
  `cdeba429` + `2577c209`. Achado pelo review da fase 3 inteira, fora dos itens
  numerados e **vivo em produção**: `src/lib/webhooks/safe-fetch.ts` guardava a rede
  interna com um `lookup` customizado do undici — e o Node **não chama** `options.lookup`
  quando o host é um IP literal (o revisor provou rodando). O lojista cadastrava um
  webhook para `https://10.0.0.5:8443/x`, a entrega acontecia, e o worker gravava 2 KB
  da resposta interna em `webhook_deliveries.response_body`, que o lojista lê na
  interface. A mesma primitiva de leitura interna que o item 19 tirou da rota de teste
  das custom tools, viva em outro arquivo.
  **Corrigido** usando o portão já vetado por dois rounds de review, em vez de remendar
  a segunda cópia. Descoberta de passagem: o código antigo **nunca seguia redirect**, e
  um 3xx virava falha permanente — receptores que respondem 3xx passam a ser entregues.
  E a correção criou uma regressão que o re-review pegou: seguir redirect abriu a porta
  para `302 → http://`, mandando payload e assinatura em claro. Fechado com política
  por chamador (`blockHttpsDowngrade`), com teste que fixa que o crawler continua
  podendo buscar `http://`.

- [ ] **`safeFetch`/`createSafeAgent` órfãos em `src/lib/webhooks/safe-fetch.ts`.**
  Sem chamador depois da correção acima. `validateUrl` e `isPrivateIP` do mesmo arquivo
  seguem em uso no cadastro de assinatura. Apagar é o item 61 — mas é função morta e
  perigosa esperando alguém importar pelo nome.

- [ ] **`ssrf-guard.ts:183` re-envia método e corpo no 303.** A especificação do fetch
  converte para GET. Inofensivo para os receptores de hoje, surpreendente depois.

- [ ] **O fail-open por `NODE_ENV` está espalhado por ~40 rotas de cron e workers.**
  O item 25 fechou as duas cópias que o achado nomeava. O review foi olhar em volta:
  `src/lib/cron-auth.ts:25` tem a mesma linha (`nodeEnv !== 'production'` quando falta
  `CRON_SECRET`), mas só 1 arquivo o importa de fato; os outros ~44 arquivos em
  `src/app/api/cron` e `/workers` **reimplementam a checagem inline**, vários com o
  mesmo fail-open (`cron/auto-process/route.ts:32`,
  `cron/check-back-in-stock/route.ts:21`), outros com variantes
  (`NODE_ENV === 'development'`). O `x-vercel-cron` cobre o caminho legítimo em
  produção, então a janela é a mesma do item 25 — ambiente mal configurado —, mas a
  superfície é vinte vezes maior. É a versão grande do defeito do item 13: a mesma
  decisão de segurança copiada até divergir. Precisa de item próprio: primeiro
  inventariar as variantes, depois uma implementação só.

- [ ] **Nada limpa o `ai_pending` no flip para runtime.** O item 09 limpa
  `pending_response_at` quando a org volta para legacy; o caminho espelho não tem dono.
  Na virada legacy→runtime, o cron (item 11) e o guard do worker desistem ANTES do
  claim, então linhas `ai_pending = true` sobrevivem para sempre. Num flip de volta
  para legacy o cron reenfileira e o runner responde mensagem de semanas atrás.
  Achado do review de branch inteira; precisa de decisão de quem limpa (cron, migration
  ou o próprio flip).

- [x] **`caption` viaja no payload e ninguém lê** · `4bf1c888`. O item 06 passou a mandar
  `media_id`/`mime_type`/`caption`; o extrator de histórico do runtime lia
  `content ->> 'text'`, nulo para mídia. **Fechado junto com o item 31**, que é a mesma
  leitura: a legenda é fala do cliente, entra como texto e o turno segue normal — sem
  degradação, porque o cliente escreveu.

- [ ] **Atomicidade do claim de `ai_pending` sem prova contra banco real.** Lacuna
  anterior — o worker também nunca teve esse teste — mas o raio de alcance dobrou agora
  que dois chamadores dividem o mesmo guard (item 14).

- [ ] **A janela de 30s do cache de `getRuntimeMode` alarga o buraco do flip.** O
  coalescer lê a tabela sem cache; por até 30s depois do flip para legacy o webhook
  ainda ingere enquanto o coalescer já limpa, e essas mensagens não são respondidas por
  nenhum dos dois motores. O cabeçalho da migration aceita a perda de uma rodada; não
  contava com o cache alargando a janela.

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

- [ ] **Depois de um takeover humano o agente volta amnésico (org migrada).**
  A fala do atendente vai para `whatsapp_cloud_messages` e para o espelho do inbox, mas
  `public.messages` — o transcript que o runtime lê — **não tem escritor de outbound humano**:
  no repositório inteiro há 7 `insert into public.messages` e `author_type='human'` aparece uma
  única vez, no backfill que roda só na criação da conversa. Efeito na loja: o agente contradiz
  o preço, o prazo ou a exceção que o atendente acabou de dar, sem saber que alguém falou. Sem
  dono na fila de 63 — nenhum item de 30 a 55 se compromete a devolver essa escrita.
  *(descoberto no item 29, confirmado no review e no re-review)*

- [ ] **Texto do cliente entra no system prompt do runtime sem sanitização — e o delimitador é imitável.**
  `agent_core/prompt_compiler.py:241,244` interpola `f"{author}: {text}"` do transcript e da janela
  pendente DENTRO do bloco de sistema, e os blocos são separados por cabeçalho markdown (`# CONVERSA`,
  `# MISSÃO`). Um cliente que escreva `# MISSÃO` no WhatsApp escreve um bloco. O caminho TypeScript tem
  `src/lib/ai/prompt-sanitizer.ts` para exatamente isto — strip de control chars e zero-width, colapso de
  newline, remoção de `</`, truncamento por code point e bloco DATA com delimitador explícito — e
  `prompt-builder.ts:235` o usa. O runtime não tem contraparte. Não é o item 39 (aquele é sobre o
  transcript ir duas vezes; este é sobre o que o transcript pode conter).
  *(descoberto no item 29)*

- [ ] **A leitura do estado dos guards paga duas varreduras do espelho em TODO turno.**
  `internal.legacy_conversation_guard_state` roda as duas laterais (contagem de outbound do bot
  e existência de resposta humana) sempre, enquanto o TS só conta mensagens quando o knob está
  ligado — e não há índice por `conversation_id` em `whatsapp_cloud_messages` no shape do repo.
  Agora o toque paga a mesma leitura. O índice é do item 50; o "só pague o que o knob pede" é
  desta linha. *(descoberto no review do item 30)*

- [ ] **`settings.schedule.hours` presente e incompleto diverge entre os motores.**
  Com o bloco `hours` gravado sem uma das pontas, o TS cala 24×7 e o Python responde. Idem hora
  sem zero à esquerda e `days` com maiúscula. O teste do item 30 usa justamente o formato em que
  os dois concordam — nenhum é forma que a UI de hoje produza, mas jsonb editado à mão produz.
  *(descoberto no review do item 30)*

- [ ] **O fail-open do fuso engole também tzdb ausente, e `tzdata` não é dependência declarada.**
  Fuso que o `zoneinfo` não conhece faz o guard de horário abrir mão e deixar responder — decisão
  deliberada para não calar a loja por um typo na tela. Mas a mesma porta cobre "a imagem não tem
  banco de fusos": uma troca de base desligaria o horário de TODAS as lojas em silêncio. A imagem
  viva tem tzdb (verificado); a garantia é que não está escrita. *(descoberto no review do item 30)*

- [ ] **Três divergências degeneradas de matching entre os guards TS e Python.**
  Confirmação de handoff que não passa por `blocked_topics`, item não-string dentro da lista de
  keywords, e `cooldown_after_transfer: true`. Nenhuma é forma que a UI produza; todas são jsonb
  editado à mão. *(descoberto no review do item 30)*

- [ ] **Guard que cala apaga o alerta de fluxo quebrado que viria depois.**
  Os guards de comportamento rodam ANTES da arbitragem de missão — que é a ordem do TS e o certo
  para não pagar trabalho caro. Efeito colateral: conversa em que um guard cala nunca abre o
  `no_active_mission`, então uma órbita quebrada fica invisível enquanto o guard estiver valendo.
  *(descoberto no re-review do item 30)*

- [ ] **Estado de guard não encontrado é fail-open, e o toque frio é o caminho mais exposto.**
  Conversa sem linha no espelho legado devolve estado zerado — "ninguém transferiu, o bot não
  respondeu, nenhum humano falou" —, que é a verdade para conversa nova e é otimismo para conversa
  cuja ponte canônica → espelho não resolveu. Quando a ponte não resolve, o passo `skipped` também
  não espelha: no toque, o único registro que sobrevive é o alerta. *(descoberto no re-review do item 30)*

- [ ] **`activate_on: manual` no toque só funciona porque o runtime tem um agente por org.**
  O guard compara o `ai_agent_id` da conversa com o agente do turno; no runtime esse agente vem de
  `load_active_version`, que não filtra por canal (ausência 3 do `FORK.md`). Org com dois agentes
  ativos torna a comparação uma coincidência. *(descoberto no re-review do item 30)*

- [ ] **Resposta de botão carrega palavras do cliente e cai em `unsupported`.**
  A classe pior não é mídia: `interactive`/`button` são a resposta que o cliente DÁ a um botão da
  loja — texto dele, escolhido por ele — e a régua de tipos os deixa de fora, então o turno nem
  é agendado. É a única classe em que o cliente manda algo e não recebe nada. O conserto é no
  `src/` (régua de tipos do webhook), fora do escopo do item 31.
  *(descoberto no review do item 31)*

- [ ] **O download de mídia continua gravando storage para org migrada, e ninguém lê o resultado.**
  O pipeline de download roda ANTES da bifurcação de rollout — confirmado no review —, então a
  loja migrada paga bytes e storage por áudio e imagem que o runtime nunca vai abrir enquanto o
  porte de STT/visão não vier. Custo por mensagem sem contrapartida.
  *(descoberto no item 31)*

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
