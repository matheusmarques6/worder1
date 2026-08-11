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
| 26 | (este) | feat(flows): executor action_ai_mission — o nó pede com UMA chamada. Fecha Etapa 6 |

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

## Próxima ação

**Etapa 7 — IA Hub UI + cutover (commits 27–30), doc-fonte PARTE IV:**
1. **Commit 27:** navegação (`/ai` depois de Fluxos, `/moments` depois de Campanhas;
   sai o child "Agentes IA" do WhatsApp) + página `/ai` com as 5 sub-abas (Agente,
   Conhecimento, Missões, Limites, Atividade) reaproveitando PersonaTab/SourcesTab/
   SettingsTab; aba Missões lê/edita `ai_missions` (catálogo por evento + concession).
2. **Commit 28:** página `/moments` (lista + editor: janela, public_claim, oferta,
   exclusões, temp_facts, forbidden, prioridade, template_readiness por canal,
   aprovar/kill switch) + preview do prompt chamando `POST /internal/preview-prompt`.
3. **Commit 29:** nó `action_ai_mission` na palette do builder (dropdown lendo o
   catálogo de missões; campos delta/concession≤teto/canal) e `action_whatsapp_ai`
   fora da palette (D8).
4. **Commit 30:** punch list do cutover — seeds v0 das missões default (PENDENTE-2:
   aprovar copy com Bruno), deploy do runtime (DEPLOY.md), inserir org piloto em
   `ai_runtime_rollout`, e o restante do Adendo §A.5.
Estado ao fechar a Etapa 6 (commit 26): **771 unit + 337 db/pipeline (Python) e 910
testes TS verdes; tsc e ruff/import-linter limpos.** Notas: (a) toucher usa
knowledge=() no Judge (RAG de toque fica para o loop de tools); (b) grant consumido
(uses++) chega com o webhook de pedido correlacionando coupon_code — pós-E7.

Notas vivas para a retomada:
- O responder anexa CONHECIMENTO ao frame fora dos blocos tipados (recuperação, não área) —
  se o preview precisar exibir, expor via parâmetro opcional do compile_prompt.
- `agent_core/prompt.py` (5 camadas do motor) ficou como legado testado e sem consumidor;
  remoção junto com a limpeza pós-cutover.
- `presentation_mode`/`client_adaptation` chegam em ai_agents na Etapa 7; o responder já lê
  persona/settings e usa 'nome_funcao' como default estrutural.
