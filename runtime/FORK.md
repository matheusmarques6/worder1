# FORK.md — origem e estado deste fork

Este diretório é um **fork do motor `agents-worder-main`** dentro do monorepo Worder
(decisão D2 do doc-fonte `core/agentes-por-evento.md`).

- **Origem:** repositório `agents-worder-main`, branch `main`, commit **`288be7f`**
  (2026-08-06 — milestone E2, passo S9a completo; S9b/S10/S11/S12 pendentes no upstream).
- **Regra de manutenção:** ao tocar coalescer, CAS ou outbox, conferir o upstream antes.
- **Disciplina herdada (vinculante):** test-first · migrations expand-contract e roll-forward
  only · relógio/aleatoriedade injetáveis (só `clock.py`/`randomness.py` tocam o mundo) ·
  SQL só na camada `repository/` (import-linter) · `print` proibido (ruff T20) ·
  docs PT-BR, código/identificadores EN. Referências: `docs/observabilidade-e-monitoramento.md`
  e `docs/testes-e-cicd.md` (copiados do `core/` do motor).
- **`core/requisitos-e-entidades.md`** (raiz do monorepo) também vem do motor: é o
  vocabulário RF-xxx contra o qual `evals/pack.py::validate_pack` e
  `tests/unit/test_pack_traceability.py` travam a rastreabilidade do pack de evals
  (o teste resolve `<repo-root>/core/requisitos-e-entidades.md`).

## Mapa de renomes (aplicado na Etapa 1)

| Upstream | Este fork | Motivo |
|---|---|---|
| `tenant_id` (SQL + Python) | `organization_id` | tenancy do Worder é organization_id em todo o banco |
| GUC `app.tenant_id` | `app.organization_id` | idem |
| `public.current_app_tenant_id()` | `public.current_app_organization_id()` | idem |
| `public.tenants` | `public.organizations` (existente do Worder) | não portada |

## Módulos/tabelas do upstream NÃO portados (e seus testes, aposentados)

| Item | Motivo |
|---|---|
| `public.tenants`, `public.profiles`, `public.memberships` | Worder já tem organizations/profiles/organization_members |
| `public.contacts` do motor | Worder já tem `contacts`; `repository/contacts.py` é reescrito contra ela |
| `public.connector_accounts`, `public.channels_accounts` | equivalem a `shopify_stores` / `whatsapp_business_accounts` |
| `internal.webhook_events` + `internal.ingest_webhook` + edge function `ingest-meta` | ingestão fica nos webhooks Next.js chamando RPCs `emit_*`/`ingest_inbound_message`; dedup por wamid |
| `hub/` (showcase Next 16) | o Worder tem o app |
| Testes: `test_ingest_webhook.py`, `test_apply_domain_event.py`, `test_scenario_abandonment.py` (fluxo de abandono via webhook_events — substituído pela fatia vertical de missão na Etapa 6) | aposentados; `test_identity_schema.py`/`test_rls_identity.py`/`test_internal_schema.py` reescritos contra o schema canônico na Etapa 2 |

## Divergências conscientes do v1 (detalhe no Adendo §A.4 do doc-fonte)

1. **Preview do prompt**: listener HTTP mínimo (`server.py`: `/healthz` + `POST /internal/preview-prompt`,
   token `AGENTS_PREVIEW_TOKEN`) — mesma `prompt_compiler.compile()` do turno, em modo preview.
2. **Sender v1**: 1 bolha, sem typing/reply-delay; preflights completos (opt-out, janela 24h com
   fallback de template via `channel_template_policies`, template do momento, idempotência).
   Humanização (≤4 bolhas, typing) e send-guard tiers = roadmap.
3. **Cascata de provedores (D4)**: upstream tem só OpenRouter com chave única de plataforma;
   este fork adiciona `agent_core/providers.py` (org direta openai-compatible/anthropic →
   org OpenRouter → plataforma atrás de `AGENTS_PLATFORM_LLM_ENABLED`, default off = BYO-only).
   O fitness `test_no_provider_network.py` é atualizado com os hostnames privilegiados
   escopados aos adapters.
4. **Observabilidade**: upstream `obs/` é stub — aqui é construída a partir da spec
   (`docs/observabilidade-e-monitoramento.md`), com no-op sem `AGENTS_LOGFIRE_TOKEN`.
5. **`docker-compose.yml`** local vive DENTRO de `runtime/` (só o serviço runtime; o `hub`
   do upstream foi descartado).
6. **RAG lê `ai_agent_chunks`** (a base que o lojista já alimenta pela SourcesTab), não uma
   `knowledge_chunks` própria. Como as tabelas legadas do Worder seguem com RLS desligada
   (remediação pendente), a query de knowledge escopa por `organization_id` EXPLÍCITO no SQL —
   desvio declarado da regra do motor "repositório sem WHERE de tenant; a RLS escopa". Volta ao
   padrão do motor quando a remediação de RLS das legadas for aprovada e aplicada.
7. **Trilha dupla**: `internal.{llm_calls,tool_calls,judge_scores,scenarios,eval_runs}` (plataforma,
   org-renamed) convive com `agent_traces` (lojista). `eval_runs.agent_version_id` aponta para
   `ai_agent_versions` (a tabela local; `agent_versions` do motor não é portada).
