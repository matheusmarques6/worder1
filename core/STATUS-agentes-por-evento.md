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
| 0 | Base git + doc + fork verbatim | 1–2 | **verde-local** (unit 688 ✓, push feito) |
| 1 | Fase 0 (baseline, rename org_id, roles/pgmq, CI) | 3–6 | **em curso** |
| 2 | Identidade (conversations/messages/identities, ingest, branch webhook) | 7–9 | pendente |
| 3 | Missões + compiler + resolver | 10–14 | pendente |
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
| 6 | (este) | ci: workflows runtime/app com path filters + vercel ignoreCommand |

Nota de sequenciamento: a suíte `db`/`pipeline` do fork ainda referencia o schema
do motor (factories criam `tenants` etc.) — adaptação em bloco na Etapa 2. Até lá,
o job `db-pipeline` do CI roda como informativo (`continue-on-error`); vira
obrigatório no commit 9.

## Migrations aplicadas (via MCP `apply_migration`)

| Arquivo | Aplicada em | Verificação |
|---|---|---|
| `20260812000001_agents_baseline_prereqs.sql` | 12/08/2026 via MCP (registrada como `20260811045406 agents_baseline_prereqs`) | `list_migrations` OK; no-op no vivo (tudo IF NOT EXISTS); índices `idx_agent_versions_*` criados (tabela tinha 0 linhas) |
| `20260812000002_runtime_roles_and_internal.sql` | 12/08/2026 via MCP (`runtime_roles_and_internal`) | verificado: 8 filas em `pgmq.meta`, roles worker/sender criados, schema `internal` sem USAGE p/ anon, pgmq 1.5.1 instalado |

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
| Deploy do runtime (Railway/Render) | pendente | `runtime/DEPLOY.md`; necessário antes do cutover da Etapa 7 |

## Próxima ação

**Etapa 2, commit 7** — DDL `20260812000003_identity_conversations.sql` (conversations, messages, channel_identities, alerts, ai_runtime_rollout com RLS). Teste vermelho primeiro: adaptar `runtime/tests/db/factories.py` + `conftest.py` do schema do motor para o do Worder (organizations em vez de tenants) e escrever `tests/db/test_identity_schema.py` novo cobrindo as tabelas canônicas; a suíte `db` roda no CI (job informativo até o commit 9).
