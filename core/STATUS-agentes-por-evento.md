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
| 0 | Base git + doc + fork verbatim | 1–2 | **em curso** |
| 1 | Fase 0 (baseline, rename org_id, roles/pgmq, CI) | 3–6 | pendente |
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
| — | — | — |

## Migrations aplicadas (via MCP `apply_migration`)

| Arquivo | Aplicada em | Verificação |
|---|---|---|
| — | — | — |

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

**Commit 2**: copiar o motor verbatim para `runtime/` + `runtime/FORK.md`. Sem teste (cópia inalterada); a suíte `unit` do motor deve coletar (`uv sync` + `pytest --collect-only -m unit`) antes do commit.
