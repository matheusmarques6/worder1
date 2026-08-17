# STATUS — Agentes por Evento

> Estado vivo da execução. Atualizado NO MESMO commit do trabalho que registra.
> Sessão nova: leia este arquivo, rode o teste apontado em "Próxima ação" e continue.

## Header

- **Branch de trabalho:** `claude/debug-console-error-0tshhm`
- **Base:** `origin/claude/debug-console-error-FWrLE` @ `3db0b9e` (contém webhooks v1 por cherry-pick — verificado)
- **Fork de origem:** `agents-worder-main` @ `main@288be7f` (06/08/2026, milestone E2/S9a)
- **Banco:** Supabase "Worder CRM" `rqpmoavktzvxfcfsdkcc` (Postgres 17)
- **Doc-fonte:** `core/agentes-por-evento.md` (v1.0 + Adendo §A)
- **Última sessão:** 12/08/2026

## Etapas

| # | Etapa | Commits planejados | Estado |
|---|---|---|---|
| 0 | Base git + doc + fork verbatim | 1–2 | **verde-local** (push feito) |
| 1 | Fase 0 (baseline, rename org_id, roles/pgmq, CI) | 3–6 | **verde-local** (push feito) |
| 2 | Identidade (conversations/messages/identities, ingest, branch webhook) | 7–9 | **verde-local** (migrations aplicadas; vitest 904 ✓; db/rls prova no CI) |
| 3 | Missões + compiler + resolver | 10–14 | **verde-local** (unit 615 ✓; db adapta no CI — ver pendência abaixo) |
| 4 | Runner (secret-box, cascata, sender, obs/, preview) | 15–19 | pendente |
| 5 | Momentos + offer engine + create_coupon | 20–23 | pendente |
| 6 | Nó action_ai_mission + emit_ai_mission_job (fatia vertical) | 24–26 | pendente |
| 7 | IA Hub UI (/ai, /moments, punch list) | 27–30 | pendente |

Estados: `pendente | em curso | verde-local | verde-CI | aplicado-em-prod`.

## Commits realizados

| # | SHA | Mensagem |
|---|---|---|
| 1 | 848e8ca2 | docs(core): doc-fonte agentes por evento v1.0 + adendo de execução + STATUS |
| 2 | 33f3737d | chore(runtime): fork do motor agents-worder em runtime/ (main@288be7f, inalterado) |
| 3 | 1901a892 | chore(db): arquiva migrations legadas + baseline prereqs conformado ao banco vivo |
| 4 | 52a6c0ee | refactor(runtime): tenant_id vira organization_id em todo o fork |
| 5 | 33da405c | feat(db): roles do runtime, schema internal, pgmq + 8 filas |
| 6 | 44cdfb46 | ci: workflows runtime/app com path filters + vercel ignoreCommand |
| 7 | 13c16789 | feat(db): identidade canônica + outbox com RLS; suíte db adaptada ao schema Worder |
| 8 | 7a3c9335 | feat(db): funções do motor adaptadas + ingest_inbound_message (F2) |
| 9 | 91c6e3f4 | feat(whatsapp): branch por rollout no webhook + guarda no worker QStash |
| 10 | 6faa1377 | feat(db): ai_missions — catálogo por evento com índice one-active |
| 11 | bb8414f0 | feat(db): trilha interna llm/tool/judge + factories/testes e2 adaptados |
| 12 | f01a7511 | feat(runtime): mission_resolver — a cascata resolvida antes do prompt |
| 13 | a413cdc9 | feat(runtime): prompt_compiler — blocos tipados com linha de IA estrutural |
| 14 | c58f75f9 | feat(runtime): responder religado — arbitragem + merge + frame compilado |
| 15 | 9a68f7cb | test(runtime): suíte db/pipeline adaptada ao schema canônico; CI db vira bloqueante |
| 16 | 97721fa8 | feat(runtime): secret_box — port byte-compatível do codec do app |
| 17 | a0e27a5f | feat(runtime): cascata de provedores D4 — BYO-only com degrau de plataforma atrás de flag |
| 18 | a35ab6ef | feat(runtime): sender preflight em SQL + channel_template_policies + espelho no inbox; suíte db+pipeline 276 verde |
| 19 | d4fbc23a | feat(runtime): obs/ (JSON+OTel opcional+cinto de PII) + server.py (healthz/preview) + DEPLOY.md — fecha Etapa 4 |
| 20 | 67521963 | feat(db): commercial_moments + incentive_grants/ledger — a concessão auditável |
| 21 | c6e3f423 | feat(runtime): momentos no turno — fatos somam, postura é uma, missão gateia |
| 22 | 9d6eb769 | feat(runtime): offer engine + create_coupon — o nó pede, o engine decide, a tool executa |
| 23 | 9d7529c0 | feat(db+runtime): preflight de momento no sender — vida re-checada, template do momento, alerta na supressão. Fecha Etapa 5 |
| 24 | d4e41156 | feat(db): emit_ai_mission_job — a porta do nó, escrita+fila numa transação |
| 25 | 44d7f927 | feat(runtime): toucher — o toque de missão gerado, julgado e coroado |
| 26 | 72d9e250 | feat(flows): executor action_ai_mission — o nó pede com UMA chamada. Fecha Etapa 6 |
| 27 | 537f42e5 | feat(ui): IA Hub em /ai com a aba Missões — a casa nova dos agentes |
| 28 | 48f3d5df | feat(ui): /moments — a campanha sazonal como estado, com kill switch e preview |
| 29 | 95393866 | feat(flows): nó 'Toque de IA (Missão)' na palette; IA Responder sai (D8) |
| 30 | (este) | feat(db+docs): seeds v0 por org + runbook do cutover. Fecha Etapa 7 — plano de 30 commits completo |

Notas da Etapa 5: (a) o create_coupon existe como tool completa (registrada
NÃO — o loop de tool escolhida pelo modelo chega com a Etapa 6/E3; hoje os
chamadores são o caminho do nó e a suíte via run_tool); (b) Nuvemshop fica
como segundo provedor do connector (mesma porta; NotImplemented explícito
não existe — a tool responde "sem loja conectada" quando não há
shopify_stores); (c) grant_lines/ledger_lines do StateBlock seguem vazios no
responder — entram quando o loop de tools der ao agente o grant no turno.

Nota do commit 18 (a primeira execução COMPLETA da suíte db/pipeline): ela
revelou e este commit corrige três bugs reais de migration — (1)
`ingest_inbound_message` quebrava com "contact_id is ambiguous" (colunas do
RETURNS TABLE são variáveis OUT; fix `#variable_conflict use_column`); (2)
`ai_agent_sources` sem grant p/ worker (o search junta a fonte p/ proveniência);
(3) grants de `contacts`/`whatsapp_opt_status` p/ worker/sender sem RLS = leitura
cross-org (migration 0004 liga RLS e escopa). `repository/contacts.py` foi de
fato reescrito contra o shape canônico (full_name/custom_fields.language/
whatsapp_opt_status; era motor puro). Vocabulário `whatsapp_cloud`→`whatsapp` e
role `ingestion_role`→wrapper `public.correlate_channel_status` (service_role)
ajustados nos testes.

## Migrations aplicadas (via MCP `apply_migration`)

| Arquivo | Aplicada em | Verificação |
|---|---|---|
| `20260812000001_agents_baseline_prereqs.sql` | 12/08/2026 via MCP (registrada como `20260811045406 agents_baseline_prereqs`) | `list_migrations` OK; no-op no vivo (tudo IF NOT EXISTS); índices `idx_agent_versions_*` criados (tabela tinha 0 linhas) |
| `20260812000002_runtime_roles_and_internal.sql` | 12/08/2026 via MCP (`runtime_roles_and_internal`) | verificado: 8 filas em `pgmq.meta`, roles worker/sender criados, schema `internal` sem USAGE p/ anon, pgmq 1.5.1 instalado |
| `20260812000003_identity_conversations.sql` | 12/08/2026 via MCP (`identity_conversations`) | conversations/messages/channel_identities/alerts/ai_runtime_rollout/internal.message_outbox criadas com RLS+policies; suíte db/rls reescrita cobre no CI |
| `20260813000001_ai_missions.sql` | 12/08/2026 via MCP (`ai_missions`) | one-active parcial verificado por teste db; FK owner_mission_version_id adicionada |
| `20260813000002_internal_llm_trail.sql` | 12/08/2026 via MCP (`internal_llm_trail`) | scenarios/eval_runs/judge_scores/tool_calls/llm_calls com RLS; grants de ai_agent_chunks/ai_agents p/ worker |
| `20260812000004_engine_functions.sql` | 12/08/2026 via MCP (`engine_functions`); **emenda 11/08/2026 via `execute_sql`**: `ingest_inbound_message` recriada com `#variable_conflict use_column` (a versão original quebrava em runtime com "contact_id is ambiguous") | 14 funções: seq atômico, coalescer SECURITY DEFINER, claim/renew/release (invoker+RLS), conclude_turn (CAS estendido + branch NULL do juiz), claim_outbox_batch (resolve conta Cloud), marks/sweep/correlate/review/reprocess, heartbeats, public.ingest_inbound_message (EXECUTE só service_role) |
| `20260813000003_sender_preflight.sql` | 11/08/2026 via MCP (`sender_preflight`) | channel_template_policies (RLS+policies), claimed_send ganha `kind`, claim_outbox_batch recriada, internal.sender_preflight (opt-out→janela 24h→template), public.correlate_channel_status (wrapper p/ webhook de status, EXECUTE só service_role), internal.mirror_outbound_to_inbox |
| `20260813000004_contacts_rls_for_runtime.sql` | 11/08/2026 via MCP (`contacts_rls_for_runtime`) | RLS LIGADA em `contacts` e `whatsapp_opt_status` (fatia consciente da remediação: policies legadas já existiam; service_role tem BYPASSRLS; worker/sender escopados por current_app_organization_id). Emenda via `execute_sql` no mesmo dia: `grant select on ai_agent_sources to worker_role` (delta da 0002) |
| `20260813000005_commercial_moments_and_incentives.sql` | 11/08/2026 via MCP (`commercial_moments_and_incentives`) | momentos + grants + ledger com RLS total; ledger append-only por trigger; idempotency_key UNIQUE é a arma anti-corrida |
| `20260813000006_store_credentials_port.sql` | 11/08/2026 via MCP (`store_credentials_port`) | internal.active_shopify_store (SECURITY DEFINER, org da sessão) — worker NÃO tem SELECT em shopify_stores |
| `20260813000007_moment_template_preflight.sql` | 11/08/2026 via MCP (`moment_template_preflight`) | claimed_send ganha moment_ids; sender_preflight re-checa vida + template_readiness (moment_gone/moment_not_ready); template do momento líder vence o default da org |
| `20260813000008_emit_ai_mission_job.sql` | 11/08/2026 via MCP (`emit_ai_mission_job`) | a RPC do nó (EXECUTE só service_role; rollout/contato/missão validados; conversa+job numa transação) + conclude_turn com kind/moment_ids na outbox |
| `20260813000009_activate_ai_mission.sql` | 11/08/2026 via MCP (`activate_ai_mission`) | arquiva-e-ativa num comando; índice one-active é o juiz da corrida |
| `20260813000010_mission_seeds_v0.sql` | 11/08/2026 via MCP (`mission_seeds_v0`) | seed_default_missions(org) — 6 drafts worder_default por org, idempotente (provado 6→0); ativar é ato explícito |
| `20260813000011_grant_lifecycle.sql` | 11/08/2026 via MCP (`grant_lifecycle`) | fim de vida do grant (9.2): `consume_incentive_grant` (service_role; dedup por (grant, pedido) via UNIQUE parcial — reentrega = 'already') + `internal.expire_incentive_grants()` (sender_role; roda no housekeeping do sender) + `incentive_ledger.order_ref` |
| `20260813000012_otel_carrier.sql` | 11/08/2026 via MCP (`otel_carrier`) | 9.1b: `message_outbox.otel` + `conclude_turn` 10-arg (p_otel default null; assinatura de 9 caiu) + `coalesce_due_conversations` 3-arg (p_otel) + `claimed_send.otel`/`claim_outbox_batch` devolvendo o carrier ao sender |
| `20260813000013_activity_compat_views.sql` | 11/08/2026 via MCP (`activity_compat_views`) | 9.4: views `ai_runtime_activity`/`_calls`/`_tools` (definer, dono postgres) sobre internal.* + conversations + missão; SELECT só para service_role — anon/authenticated revogados explicitamente (os defaults do Supabase dariam) |
| `20260814000001_agent_presentation_adaptation.sql` | 11/08/2026 via MCP (`agent_presentation_adaptation`) | 10.4 (metade schema): `ai_agents.presentation_mode` (CHECK 3 modos, default nome_funcao) + `ai_agents.client_adaptation` jsonb (flags de ESTILO — dinheiro nunca entra) |
| `20260814000002_active_commercial_moments_view.sql` | 11/08/2026 via MCP (`active_commercial_moments_view`) | 10.8: view `active_commercial_moments` (ativo COMPUTADO: approved + janela + kill intacto); SELECT só service_role, Data API revogada |
| `20260814000003_ai_agent_custom_tools.sql` | 11/08/2026 via MCP (`ai_agent_custom_tools`) | 10.7: tabela das tools custom com a regra dupla NO SCHEMA — método só GET/POST, endpoint https, nome nunca sombreia nativa (create_coupon incluso), `enabled` exige `last_test_status='ok'` (testar antes de ligar é CHECK); RLS + worker_scoped |

## Adiados / decisões em aberto

| Item | Estado | Notas |
|---|---|---|
| PENDENTE-1 (default de chave LLM) | resolvido: BYO-only | degrau plataforma atrás de `AGENTS_PLATFORM_LLM_ENABLED` (off) |
| PENDENTE-2 (copy final dos seeds) | aberto | seeds v0 draft `origin='worder_default'`; aprovar com Bruno |
| PENDENTE-3 (números de caps/arbitragem) | aberto | constantes em `pending_defaults.py` |
| Emissão de `whatsapp.received` no EventBus | adiado | missão descoberta é engajada pelo coalescer |
| Humanização do sender (typing, ≤4 bolhas) + send-guard tiers | roadmap | divergência v1 registrada (Adendo §A.4.2) |
| Canais instagram/email como adapters | roadmap | `channel_identities.channel` já os prevê |
| Sync/sunset de `whatsapp_conversations` (morta) e `instagram_conversations` | roadmap | sem sync no v1 |
| Remoção do executor `action_whatsapp_ai` | pós-cutover | fora da palette na Etapa 6; executor vive p/ fluxos antigos |
| Consolidação dos 10 call sites graph.facebook.com + fusão libs Instagram | roadmap | regra "código novo só via api-version.ts" em vigor (Adendo §A.3) |
| Dump completo do schema como baseline | roadmap | exige `supabase db dump` com acesso direto |
| **Remediação RLS das 292 tabelas existentes** | **aguardando aprovação do usuário** | advisor crítico; ligar sem policies quebra app/realtime |
| Deploy do runtime (Railway/Render) | pendente (DEPLOY.md escrito no commit 19) | envs documentadas; deploy real necessário antes do cutover da Etapa 7 |

## Plano vigente: Adendo §B do doc-fonte (Etapas 8–10)

**Correção de registro (B.5-2/B.5-3, 11 ago):** a declaração anterior deste
STATUS ("plano de 30 commits completo") media contra o plano interno de
commits, não contra o doc-fonte — a Etapa 7 entregue foi "UI mínima
funcional", uma re-escopagem sem registro prévio. O Adendo §B ratifica o que
vale (D9–D14), define as Etapas 8–10 como plano vigente e torna as regras de
relatório vinculantes. A Etapa 7 como o doc-fonte a descreve é agora a
**Etapa 10**.

**DIVERGÊNCIA v1 (registro B.5-4):** `obs/` sem Logfire — o entregue (JSON +
OTel opcional + cinto de PII) é fundação; fechamento no passo 9.1 (D13).
*Fechada em 9.1a:* `configure_logfire()` por token + instrument
httpx/psycopg/system_metrics, conteúdo GenAI fora (cinto + scrubbing).
**DIVERGÊNCIA v1:** sender em bloco único vs. bolhas do legado — fechamento
no passo 8.3 (D10, bloqueante do piloto). **DIVERGÊNCIA v1:** typing
indicator não portado — o outbox não carrega o inbound wamid que a Meta
exige para typing (o próprio legado pula sem ele); fica para quando o
outbox carregar o last inbound id (nota em 8.3). **DIVERGÊNCIA v1 (9.1):**
`instrument_openai`/`instrument_anthropic` do 9.1 NÃO são chamadas — os
adapters daqui são httpx puro (não há SDK para instrumentar; os spans de
provedor saem do `instrument_httpx`) e a captura de prompt/completion
dessas instrumentações é o que D13 proíbe. Fecha se/quando os adapters
migrarem para SDK, com captura de conteúdo desligada explicitamente.

### Etapa 11 — Missões no nó (plano do usuário, 12/08)

Decisões do usuário (chat, 12/08): (1) nó aponta FAMÍLIA + ajustes locais
(mantém one-active); (2) desconto POR NÓ **até o teto da missão** (o teto
continua auditável num lugar; nó acima do teto = negado + alerta); (3) missão
ganha `display_name` livre; (4) dados FIXOS no prompt = dados do cliente +
histórico de compras; variáveis do fluxo = configuráveis no nó (via
delta.context, encanamento existente); (5) missão do nó segue dona da
conversa, respondendo dúvidas gerais no caminho (topic_change_policy é o
botão); (6) criar missão DENTRO do builder, integrada por construção.

| Entrega | Estado | Escopo |
|---|---|---|
| E1 nome livre | **feito** (migration 20260814000004 vivo+local; campo no form; header da família mostra o nome da ativa) | |
| E2 painel do nó completo | **feito** (AiMissionActionConfig: variáveis chave/valor `config.contextVars` → executor dobra em delta.context [{{tags}} interpoladas pela engine antes do executor]; dropdown mostra o display_name da ativa + linha "Este nó usa …"; família sem ativa vira ação inline — ativar o rascunho mais novo OU criar nome+objetivo e ativar via POST /api/ai/missions → PATCH {status:active}; teto/kind/value já existiam. Testes: +3 no action-ai-mission.test [fold, merge com context legado, linhas em branco]; tsc/vitest 985/build verdes) | |
| E3 dados fixos no prompt | **feito** (repo `orders.py`: load_purchase_history — elo contact_id OU e-mail exato, NUNCA telefone [cauda colide]; decisão 81b no tipo: None=org sem loja→prompt calado, zero=linha explícita "nenhuma compra", N=resumo+3 últimos pedidos com itens/status PT. contact_facts ricos: nome + cliente desde + etiquetas da loja [contact_fact_pairs]. Responder E toucher carregam na read-tx; get_customer_context ganhou `purchases` [promessa RF-010 cumprida]. Migration 20260815000001 vivo+local: shopify_orders conformada + grant COLUNA a coluna [worker não lê endereço/telefone — privacidade por construção] + grant (id, organization_id) em shopify_stores. Testes: 6 db [81b, elo preciso, refund subtrai, cross-org não vaza, worker não lê shipping_address] + 6 unit [history_lines, StateBlock.purchase_lines]) | |
| E4 polimento | pendente | validação no builder (desconto > teto marca o nó) + teto na aba Limites |

### Etapas 8–10 — estado

| Passo | Estado | Nota |
|---|---|---|
| 8.1 Deploy runtime | **Apply feito 12/08 — deploy NÃO conectou** | sonda (12/08 ~02:00Z): zero batidas em runtime_heartbeats e zero conexões novas em pg_stat_activity ~30min pós-Apply. Causa está no log do Render (build em andamento, env vazia, DSN errada ou senha) — checklist entregue ao usuário; egress daqui bloqueia onrender.com, a sonda é pelo banco |
| 8.2 Vercel envs | aguardando 8.1 | URL + AGENTS_PREVIEW_TOKEN |
| 8.3 Humanização do sender (D10) | **feito** (código+fixtures; falta o "visivelmente humano" na loja de teste, que depende de 8.1) | split portado com paridade PROVADA (10 vetores gerados pelo TS real); ritmo proporcional c/ teto por bolha e orçamento agregado; 1ª bolha falhou = retry, bolha do meio = o que saiu vale (ADR-8); espelho por bolha; wamid da linha = 1ª bolha |
| 8.4 Sonda healthz | aguardando 8.1 | |
| 8.5 Seeds rodada 2 | **[GATE-Bruno]** | CORREÇÃO (12/08): a nota anterior "drafts já no banco" estava ERRADA — ai_missions estava vazia no vivo (os seeds só tinham sido provados no stack local). Consertado: rota POST /api/ai/missions/seed + CTA na aba Missões quando a org tem zero missões (self-service p/ toda org nova); seeds rodados 12/08 para a org piloto 425db1ba (6 rascunhos). Ativar segue ato explícito por missão, gate do Bruno |
| 8.6 Rollout + smoke | aguardando 8.5 | runbook abaixo |
| 8.7 Rollback provado | aguardando 8.6 | registrar horário aqui |
| 9.2 Ciclo do grant | **feito** | consume RPC (dedup por pedido no UNIQUE) + expire no housekeeping do sender + wire no webhook orders/paid; migration 0011 no vivo |
| 9.3 Dinheiro no inbound | **feito** | 9.3a: StateBlock com cupom vigente + ledger. 9.3b: porta LLM com tools (ToolSpec/ToolCall; OpenRouter + OpenAI-compat + Anthropic nativo traduzem o MESMO contrato) + tool-loop no responder (teto de 3 rodadas; esgotou = chamada final sem tools); create_coupon oferecida só se missão∩agente permitir. DoD provado em teste db: concessão none + grant do momento → `reused` na trilha, resposta com o cupom existente, zero grant novo |
| 9.1 Logfire (D13) | **feito no código** — DoD "conversa navegável no Logfire" confere no smoke pós-deploy (depende de 8.1/8.2 + token) | 9.1a: `configure_logfire()` token-gated + instrument httpx/psycopg/system_metrics + scrubbing (conteúdo GenAI fora em 3 linhas de defesa). 9.1b: traceparent viaja — passe do coalescer carimba o payload pgmq (turno retoma como LINK), conclude grava o carrier do turno na outbox (migration 0012) e o sender retoma como PARENT (turno+envio = um trace); spans coalesce_pass/turn/mission_touch/send com outcome; responder/toucher anotam mission_version_id/moment_ids/grant_id/node_ref; cinto de PII provado em teste p/ o vocabulário novo |
| 9.4 Trilha única na UI | **feito** | Atividade ganha a seção "Conversas do runtime" (missão · custo · judge) lendo `/api/ai/activity` → views de compatibilidade (migration 0013); detalhe por conversa com guarda anti-IDOR (`runtimeConversationDetail` só devolve conversa da org); legados (agent_traces/ai_eval_*) congelados e ainda visíveis abaixo — DoD dos dois universos atendido |
| 10.1 Um agente por loja | **feito** | zip do design recebido 11/08. `AIAgentList` saiu da aba Agente; `/api/ai/agents/canonical` (GET estado, POST escolhe — demais arquivam is_active=false, restauráveis); org com N ativos cai na tela única de escolha |
| 10.2 Radial + clássica | **feito (núcleo)** | `src/components/ai-hub/` (AgentTab/RadialView/ClassicView/AreaFields) + model `agent-hub.ts` (área↔coluna REAL com round-trip testado; merge preserva o que a órbita não conhece); breakpoint lg decide radial/clássica sobre o MESMO HubState (sem toggle, §4.4-2); 9 áreas nas 9 posições; CSS do zip escopado em agents-theme.css; nó Conhecimento abre o KnowledgeBasePanel real no drawer (§4.4-8) |
| 10.6 Missão descoberta na radial | **feito** | área "Missão descoberta (default)" (ex-Papel, §4.4-3): viés vendedor/suporte/híbrido = OBJECTIVE da missão whatsapp.received (3 textos canônicos; um dado, N portas); salvar cria versão nova + ativa (append-only) — nada de papel global |
| 10.4 presentation/adaptation | **feito** | schema no vivo (migration 0014) + UI (3 modos, linha fixa exibida; 5 toggles §4.4-4/5) + runtime LÊ: load_active_version carrega as colunas, responder e toucher montam AgentBlock com presentation_mode e adaptation_flags (ponte emoji_if_client→emoji); provado em teste db que o modo escolhido muda o prompt e a linha fixa de IA fica em qualquer modo |
| 10.5 Preview "O que o agente sabe" | **feito** | o núcleo da radial abre a folha com os blocos REAIS de /api/ai/preview-prompt (mesma compile_prompt do turno, modo preview); runtime fora do ar = fantasmas MISSÃO/ESTADO/CANAL + aviso (§4.4-6); Juízes e Motor como cards FORA do box; o buildPrompt() do protótipo nunca virou produção |
| 10.3 Fusão de abas + Limites | **feito** | as 5 sub-abas do doc-fonte: Agente · Missões · Conhecimento · Limites · Atividade. Atividade funde Reports+Eval (sub-views; a seção do runtime do 9.4 vive dentro); API Keys absorvida pelo drawer Motor da radial (ApiKeysManager real); LimitsTab edita os MESMOS campos da área Limites via agent-hub (um dado, N portas) + consolidado de concessão por missão em leitura (describeConcession compartilhado) + interruptor de desligar o agente; links antigos ?tab=reports/eval/api-keys aterrissam no lugar certo |
| 10.8 Momento visível fora de Momentos | **feito** | view `active_commercial_moments` (migration 20260814000002, vivo+local) + rota `/api/ai/moments/active` (org da sessão) + `MomentBanner` de leitura em Campanhas e no editor de Fluxos ("momento X ativo até Y — a IA pode afirmar: …"); sem momento ativo, nada renderiza |
| 10.7 Custom tools v1 | **feito** | tabela (migration acima) + `tools/custom_http.py` (valida args tipados ANTES da rede; GET/POST só; falha vira resposta legível; corpo truncado; auth via codec da casa) + `repository/custom_tools.py` + responder oferece só LIGADA (e ligar exigiu teste ok) — provado em db que a custom entra sem abrir a porta do create_coupon; rotas CRUD + `/test` (chamada real server-side, cap 10s, grava last_test_status; falhou = desliga) + seção na área Ferramentas com "nunca concede" na cara da UI. Decisão registrada: custom tools (read-only) entram por serem do agente, sem passar pela interseção de missão que governa create_coupon — dinheiro continua com UM emissor |
| Juízes do lojista (pedido 13/08) | **feito** | drawer Juízes cria/pausa/exclui juízes próprios (settings.judges.custom, saneado no round-trip do agent-hub) e o runtime os roda DE VERDADE: `with_merchant_judges` monta a rubrica extra "lojista" dentro do Judge 1 pré-envio (responder E toucher). Amarras: severidade SEMPRE standard — reprova e regenera com o critério nomeado no feedback, e no limite a melhor versão sai; o veto de silêncio (critical) segue alavanca exclusiva da plataforma (D1); settings malformados degradam para "sem juízes", nunca crash. Testes: 7 unit runtime (rubrica, D1, prompt do juiz, lixo) + round-trip no agent-hub.test |
| Missão = especificação por evento (correção 13/08) | **feito** | O usuário corrigiu a essência: missão NÃO é persona (vendedor/suporte/híbrido) — é a especificação completa DO EVENTO. O seletor de viés da radial morreu (DISCOVERY_OBJECTIVES/biasFromObjective amputados); a área virou "Missão · WhatsApp direto" e abre o MESMO MissionEditorModal do nó (playbook completo: objetivo livre, critérios, proibições, concessão, turnos, tom), com salvar-rascunho/ativar próprios — fora do Salvar do agente. hub.discovery = {has_mission} só para o anel |
| Pacote de cortes (pedido 13/08) | **feito** | Decisões do usuário (3 perguntas, 3 recomendadas): (1) **Momentos fora da UI** — item do menu e página /moments apagados; runtime/APIs/banners ficam DORMENTES (zero momento ativo = prompt sem linhas de momento, banners não renderizam; revogar é recriar a página). 10.8 segue válido como leitura, sem porta de escrita. (2) **Missões 100% no nó** — aba IA→Missões morta; `MissionEditorModal` (formulário completo herdado da MissionsTab: nome, objetivo, critérios, turnos, política de assunto, concessão com teto/validade, promote_moment, tom, proibições, tools) vive no painel do nó IA: ativa → "Editar missão" cria nova versão rascunho; rascunho pendente aparece com Ativar/editar; família sem ativa mantém ativar/criar rápido + editar antes. Seeds continuam por família no próprio nó (CTA em massa morreu com a aba; rota /seed fica). (3) **Limites uma porta só** — aba morta; área Limites da radial é a única (mesmos campos via agent-hub) e o interruptor Agente ligado (is_active, PATCH imediato) virou `AgentPowerSwitch` no drawer. /ai fica com Agente · Conhecimento · Atividade; ?tab=missions/limits aterrissam em Agente. Bônus: núcleo da radial virou <button> real com anel de foco/tap zerado (o "quadrado azul" nativo). **Parado por decisão: tela-lista de agentes (ativos/rascunho/desempenho) antes da radial — conversar antes de fazer** |

**DoD da Etapa 10 — declarado contra o doc-fonte:** as 5 sub-abas navegáveis
(10.3) · radial desktop + clássica mobile sobre o MESMO estado, breakpoint
decide (10.2) · a tela antiga (AIAgentList na aba Agente) não existe mais —
o print de 11/08 é irreproduzível (10.1) · punch list §4.4 1–8 verde: (1)
sub-abas roteadas ✓ (2) sem toggle comparar ✓ (3) Missão descoberta na 9ª
posição editando a missão whatsapp.received ✓ (4) linha fixa de IA nos 3
modos, default nome_funcao (provada em teste) ✓ (5) 5 toggles de adaptação;
benefício por perfil impossível por schema ✓ (6) preview real + fantasmas +
Juízes/Motor fora do box ✓ (7) MissionsTab é o playbook de 10 campos ✓ (8)
nós Conhecimento/Limites reusam os componentes das telas ✓. Confirmação
visual (screenshot) fica para o smoke do Bruno no ambiente.
| RLS fase B/C (D11) | lotes contínuos, **[GATE-Bruno]** por lote | fase A feita |

Estado da suíte após a Etapa 10 completa: **859 unit + 369 db/pipeline
(Python), 925 testes TS (+1 gerador de vetores, gated); tsc, ruff,
import-linter e next build limpos.** 20 migrations aplicadas no vivo.
Etapas 9 e 10 completas no código. O que resta do plano vigente é o
lado do usuário/Bruno: 8.1 Render Apply → 8.2 envs Vercel → 8.4 sonda →
8.5 seeds [GATE-Bruno] → 8.6 rollout+smoke → 8.7 rollback provado; RLS
fases B/C em lotes [GATE-Bruno]; 9.5 roadmap. A Etapa 9 fecha com
9.1/9.2/9.3/9.4 feitos no código; o que resta dela é observação
pós-deploy (9.1: conversa navegável no Logfire — depende de 8.1/8.2 +
token) e 9.5 (roadmap, não bloqueia).

### Runbook do cutover (a fatia vertical na loja piloto)

1. **Deploy do runtime** (`runtime/DEPLOY.md`): container em Railway/Render/VPS
   com `SUPABASE_DB_URL` (session pooler), `AGENTS_RESPONDER`+`AGENTS_TOUCHER`
   reais, roles worker/sender, `AGENTS_OPENROUTER_API_KEY` (plataforma),
   `ENCRYPTION_KEY` idêntico ao do app, `AGENTS_CHANNEL` (cloud_api) +
   `AGENTS_META_ACCESS_TOKEN`, `AGENTS_HTTP_PORT`+`AGENTS_PREVIEW_TOKEN`.
2. **Vercel:** setar `AGENTS_RUNTIME_URL` + `AGENTS_PREVIEW_TOKEN` (o preview
   de /moments e /ai passa a funcionar).
3. **Sonda:** healthz do runtime no monitor externo (503 = heartbeat parado).
4. **Org piloto:** `select public.seed_default_missions('<org>')` →
   revisar copy (PENDENTE-2, com Bruno) → ativar `cart.abandoned` e
   `whatsapp.received` na UI (/ai → Missões) → conferir agente com versão em
   produção e chave BYO em organization_api_keys (senão: alerta
   no_org_llm_key e nada responde).
5. **Rollout:** `insert into ai_runtime_rollout (organization_id, mode)
   values ('<org>', 'runtime')` — a partir daqui o webhook desvia os inbounds
   da org para o runtime e o nó novo emite toques para ela.
6. **Smoke:** mandar mensagem real → conferir conversations/messages/outbox →
   resposta no WhatsApp → espelho no inbox. Toque: fluxo de teste com o nó
   novo → outbox funnel_touch → template/moment preflight.
7. **Reverter é barato:** `update ai_runtime_rollout set mode='legacy'` — o
   webhook volta ao caminho antigo na hora; nada mais precisa mudar.

### Cutover EXECUTADO na loja piloto (17/08/2026)

- **Fase 1 ✓** — runtime `piloto` no PC do usuário (Docker, `runtime-pc-piloto`):
  heartbeat vivo na nuvem desde 17/08 ~13:45 UTC. `ENCRYPTION_KEY` foi
  ROTACIONADA (a antiga era irrecuperável na Vercel — sensitive): chave nova na
  Vercel + `.env.piloto`, token WABA re-salvo (agora secret-box v2). Logfire
  ligado via `AGENTS_LOGFIRE_TOKEN` (write token do projeto /worder).
- **Fase 2 ✓** — missão `whatsapp.received` da org Dr. Groot ativada 14:02 UTC
  (seed draft → active, sem anterior para arquivar).
- **Fase 3 ✓** — org `425db1ba-…` em `ai_runtime_rollout` mode=`runtime`
  (14:03 UTC). Rollback = delete da linha.
- **Fase 4 em curso** — smoke com mensagem real. Suspeita aberta: chave
  OpenRouter da org falha em 1–2s no caminho legado (modelo
  `google/gemini-3.5-flash` existe no catálogo; hipótese = conta sem créditos);
  o runtime registra o erro exato em `internal.llm_calls` quando testar.
- **UI 17/08** — aba WhatsApp ganhou o child **"Agente IA"**
  (`/whatsapp/agente`): `AgentPowerSwitch` + `DiscoveryMissionArea` exportados
  de `ai-hub/AreaFields` (um dado, N portas — mesma missão da órbita).

### Crons legados consertados 17/08 (migration `20260817000001_legacy_cron_columns`)

- `whatsapp_campaign_recipients.sending_at` criada — o claim anti-double-send
  (Fase 0/0D) falhava FECHADO sem ela: campanha pulava todo destinatário em
  silêncio, e o sweep de quarentena errava a cada minuto no cron.
- `abandoned_carts` ganhou `status`/`abandoned_at`/`notified_at`/
  `notification_count`/`last_notification_at` — o cron check-abandoned-carts
  consultava colunas inexistentes (tabelas estavam vazias; expand puro).
- **Dívida que ficou:** `/api/cron/detect-segment-changes` estoura os 60s da
  Vercel (504 recorrente) — precisa de paginação/limite, cirurgia própria.
  E `email_campaigns.ab_test_enabled` inexistente (logs 17/08) — mesma classe,
  conferir o cron de e-mail antes de criar coluna.

### Juiz destravado 17/08 (o "gerada mas não enviada" do piloto)

Dois bugs do fork no Judge 1, achados ao vivo na primeira conversa real:
- `JUDGE_MODEL` era `claude-haiku-4-5` — HTTP 400 "not a valid model ID" no
  OpenRouter (turno 18:30). Agora `anthropic/claude-haiku-4.5` (o mesmo ID do
  teste de contrato), com teste travando o formato.
- Haiku devolvia o JSON embrulhado (cerca de código/preâmbulo) e o parser era
  `json.loads` seco → 3× "judge unusable", nota 0, e o turno concluiu MUDO —
  fail-closed correto, motivo errado (turno 19:03). `_judge_payload()` agora
  desembrulha (cerca + primeiro objeto), lixo de verdade segue ilegível;
  prompt do juiz endurecido ("sem cercas, sem texto fora do JSON").
Teste-primeiro (3 vermelhos → verdes); 885 unit + 375 db/rls/pipeline ✓.

### Chips de progresso no chat pelo runtime (pedido 17/08)

O inbox mostra o andamento do agente (whatsapp_ai_run_steps via Realtime) —
o legado escrevia os passos, o runtime não: chat mudo enquanto trabalhava.
- Migration `20260817000002`: `internal.emit_ai_run_step` (SECURITY DEFINER,
  receita do espelho) — resolve a conversa CLOUD pela canônica (worker, via
  channel_identities) ou pelo telefone (sender); sem palco = false silencioso.
  CREATE TABLE IF NOT EXISTS da run_steps para o CI. Grants worker+sender.
- Responder emite: started ("‹agente› assumiu"), generating/refinando,
  judging ("verificando antes de enviar"), skipped (sem missão · sem chave ·
  retida pela verificação). Sender: sending/sent/failed(permanente).
  Webhook (branch runtime): queued "Agente vai responder" — mesmo helper do
  legado. Tudo adereço: try/except, chip perdido nunca custa turno.
- A migration dos crons legados (…000001) ganhou guarda to_regclass: no
  Postgres limpo do CI aquelas tabelas nem existem — no-op lá, vivo igual.
- Testes: db 3 novos (canônica→cloud · telefone±'+' · toque frio = false);
  888 unit + 378 db/rls/pipeline + 986 vitest + tsc verdes.

### Pendências conhecidas (fora do plano de 30)

- PENDENTE-2: copy final dos seeds com Bruno (drafts já no banco por org via função).
- PENDENTE-3: números de caps/arbitragem em `pending_defaults.py`.
- Loop de tool escolhida pelo modelo (E3): create_coupon já existe e é chamado
  pelo toucher; o responder conversacional ganha o loop depois.
- Consumo de grant (uses++/consumed) via webhook de pedido correlacionando coupon_code.
- Remediação RLS das ~290 tabelas legadas restantes (contacts/opt_status já feitas).
- Humanização do sender (≤4 bolhas, typing) + send-guard tiers (roadmap declarado).
- Sub-abas Limites (consolidado org) e radial do Agente (D6) — a UI atual reusa
  as abas herdadas; o redesign radial é iteração de produto, não de motor.

Notas vivas para a retomada:
- O responder anexa CONHECIMENTO ao frame fora dos blocos tipados (recuperação, não área) —
  se o preview precisar exibir, expor via parâmetro opcional do compile_prompt.
- `agent_core/prompt.py` (5 camadas do motor) ficou como legado testado e sem consumidor;
  remoção junto com a limpeza pós-cutover.
- `presentation_mode`/`client_adaptation` chegam em ai_agents na Etapa 7; o responder já lê
  persona/settings e usa 'nome_funcao' como default estrutural.
