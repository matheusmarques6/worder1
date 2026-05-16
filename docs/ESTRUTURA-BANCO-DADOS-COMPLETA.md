# 📚 ESTRUTURA COMPLETA DO BANCO DE DADOS, VARIÁVEIS E ARMAZENAMENTO — WORDER

> **Versão deste documento:** baseada em `claude/debug-console-error-FWrLE` @ commit **4f280e46** (16/Mai/2026). É o estado **mais recente** do projeto — incorpora todas as migrations até `20260516_*`, os 23 cron jobs do `vercel.json`, novos domínios (CDP, attribution, LGPD, billing/Stripe, SMS, visitor identity, recommendations, AI knowledge) e as novas libs em `src/lib/` (attribution, billing, cdp, identity, sms, queue, app-url, debug-guard, logger, rate-limit).
>
> **Branch alvo desta documentação:** `claude/database-structure-docs-2AxhP` (force-push)
>
> ⚠️ Documento de referência. Não altera comportamento. Toda nova integração deve ler as seções relevantes **antes** de criar novas tabelas, colunas, variáveis ou rotas.

---

## ÍNDICE

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Variáveis de Ambiente — Inventário Completo (59 vars)](#2-variáveis-de-ambiente)
3. [Onde Cada Coisa Fica Armazenada](#3-onde-cada-coisa-fica-armazenada)
4. [Banco de Dados — ~120 Tabelas por Domínio](#4-banco-de-dados--120-tabelas-por-domínio)
5. [Mudanças Críticas Mais Recentes (20260513–20260516)](#5-mudanças-críticas-recentes)
6. [Funções SQL / RPCs / Triggers / RLS](#6-funções-sql-rpcs-triggers-rls)
7. [Storage Buckets](#7-storage-buckets)
8. [Cache (Redis / Upstash)](#8-cache-redis--upstash)
9. [Filas, Crons e Workers (23 crons + 11 workers + 3 camadas de fila)](#9-filas-crons-e-workers)
10. [Realtime](#10-realtime)
11. [Camada de Acesso a Dados (Clients Supabase)](#11-camada-de-acesso-a-dados)
12. [Multi-Tenant Isolation — Regras Inquebráveis](#12-multi-tenant-isolation)
13. [Webhooks (Inbound e Outbound)](#13-webhooks)
14. [Estrutura de `src/lib/` (25 diretórios + 20 arquivos)](#14-estrutura-de-srclib)
15. [Types ↔ Tabelas](#15-types--tabelas)
16. [Stores Zustand e Hooks](#16-stores-zustand-e-hooks)
17. [Rotas API (~456) — Mapa Hierárquico](#17-rotas-api--mapa-hierárquico)
18. [Checklist de Integração SEM Conflito](#18-checklist-de-integração-sem-conflito)
19. [Convenções e Pegadinhas Conhecidas](#19-convenções-e-pegadinhas)

---

## 1. Visão Geral da Arquitetura

### 1.1 Stack

| Camada | Tecnologia | Provedor |
|---|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind, Zustand | Vercel |
| Backend (BFF) | Next.js API Routes — **~456 rotas** em `src/app/api/**/route.ts` | Vercel |
| Banco de dados | PostgreSQL com RLS, `pgcrypto`, `uuid-ossp`, embeddings | Supabase |
| Auth | Supabase Auth (JWT + cookies httpOnly) | Supabase |
| Storage | Supabase Storage (`avatars`, `email-images`, `contact-files`) | Supabase |
| Realtime | Supabase Realtime (postgres_changes) | Supabase |
| Cache & rate-limit | Redis REST + sliding window | Upstash |
| Fila/scheduling | QStash + Vercel Cron (**23 crons**) + Durable Queue (Redis ZSET) | Upstash + Vercel |
| Email | Resend | Resend |
| Pagamento/Billing | Stripe (subscriptions + portal) | Stripe |
| Worker dedicado | Node (`worker/campaign-worker.ts`) — Dockerfile | Railway/Render |
| AI providers | OpenAI, Anthropic, Google, Groq, DeepSeek | Multi-cloud |
| CDN imagens email | Cloudflare CNAME → Supabase (opcional via `CDN_IMAGES_DOMAIN`) | Cloudflare |

### 1.2 Domínios funcionais

- **Auth / Organização / Lojas** — multi-tenant por `organization_id` + `store_id`
- **Inbox / WhatsApp** (Meta Cloud + Evolution self-hosted) + Instagram Direct
- **CRM** — contacts, deals, pipelines, pipeline_stages, deal_activities, tasks, comments
- **Campaigns** — broadcast WhatsApp, Email (Resend), SMS (novo)
- **Automations / Flow Builder** — grafo de nodes/edges, event bus, runs com **lock otimista** (lock_token + heartbeat), workers paralelos, A/B testing
- **AI Agents** — Knowledge sources/chunks com RAG, múltiplos providers, **ai_costs_attribution** por feature
- **Integrations** — Shopify (GraphQL/REST/Bulk), Klaviyo, Meta Ads, Google Ads, TikTok Ads
- **Webhooks** — inbound + outbound (com fila, lock, rotação de secret, PII consent)
- **CDP / Attribution** — eventos unificados (`contact_events`), **visitor identity graph** (fingerprint/email/phone hashing + soft-merge), multi-channel attribution (email/whatsapp/sms), **idempotent**
- **Forms / Popups** — builder com submissions, eventos time-series (impressions/dismissals)
- **LGPD** — consents, data requests, retention policies (cron diário)
- **Billing** — Stripe subscriptions, invoices, planos starter/pro/business
- **Recommendations** — collaborative filtering nightly
- **Analytics** — daily_metrics, deliverability_metrics, RFM, A/B winners
- **Notifications** — in-app via Realtime + email

### 1.3 Fluxo macro

```
[Browser] ──cookies sb-access-token── [Edge middleware] ──> [Route handler /api/**]
                                                                │
                                                                ▼
                                        [Postgres Supabase + Storage + Realtime]
                                                                │
                                                                ▼
            [EventBus → contact_events → cron/QStash → workers → integrações externas]
```

---

## 2. Variáveis de Ambiente

**Total: 59 variáveis**, agrupadas em 17 categorias. `NEXT_PUBLIC_*` = expostas ao browser; demais = server-only.

### 2.1 Supabase (obrigatórias, base de tudo)

| Variável | Tipo | Obrig. | Lida em |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ✅ | `src/lib/supabase-client.ts`, `supabase-admin.ts`, `middleware.ts`, todas as rotas |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ✅ | mesmos arquivos |
| `SUPABASE_SERVICE_ROLE_KEY` | server **CRÍTICA** | ✅ | `supabase-admin.ts`, workers, crons, webhooks |

### 2.2 App / Deploy

| Variável | Tipo | Notas |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | URL canônica HTTPS — usada em 100+ lugares. Helper: `src/lib/app-url.ts` |
| `VERCEL_URL` | auto | Fallback dinâmico |
| `VERCEL_REGION` | auto | Usada em `automation/run-lock.ts` para worker ID distribuído |
| `NODE_ENV` | auto | `development`/`production`/`test` |
| `CDN_IMAGES_DOMAIN` | server, opc | **NOVA** — Cloudflare CNAME (ex: `cdn.worder.com.br`) que reescreve URLs do Supabase Storage em emails para cache no edge |

### 2.3 Email / Resend

| Variável | Tipo | Obrig. |
|---|---|---|
| `RESEND_API_KEY` | server **CRÍTICA** | ✅ |
| `RESEND_FROM_EMAIL` | server | ✅ (ex: `noreply@worder.com.br`) |
| `RESEND_WEBHOOK_SECRET` | server | ✅ (validação bounce/click/open) |
| `LGPD_FROM_EMAIL` | server | opc — usado por `cron/lgpd-retention` |
| `UNSUBSCRIBE_SECRET` | server **CRÍTICA** | ✅ — gera/valida tokens em `src/lib/email/unsubscribe-token.ts` |

### 2.4 WhatsApp / Evolution

| Variável | Tipo | Obrig. |
|---|---|---|
| `EVOLUTION_API_URL` / `NEXT_PUBLIC_EVOLUTION_API_URL` | server / public | ✅ |
| `EVOLUTION_API_KEY` / `NEXT_PUBLIC_EVOLUTION_API_KEY` | server / **PUBLIC risco** | ✅ / ⚠️ |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server | ✅ |
| `WHATSAPP_VERIFY_TOKEN` | server | legacy fallback |
| `NEXT_PUBLIC_WEBHOOK_VERIFY_TOKEN` | public | opc |

### 2.5 Meta / Facebook / Instagram

| Variável | Tipo | Obrig. |
|---|---|---|
| `META_APP_ID` | server | ✅ |
| `META_APP_SECRET` | server **CRÍTICA** | ✅ |
| `META_WEBHOOK_VERIFY_TOKEN` | server | ✅ |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | server | ✅ |

### 2.6 Shopify

| Variável | Tipo | Obrig. |
|---|---|---|
| `SHOPIFY_CLIENT_ID` | server | ✅ |
| `SHOPIFY_CLIENT_SECRET` | server **CRÍTICA** | ✅ |
| `SHOPIFY_WEBHOOK_SECRET` | server **CRÍTICA** | ✅ — HMAC SHA256 |
| `SHOPIFY_API_SECRET` | server | legacy |

### 2.7 Google Ads / TikTok

| Variável | Tipo |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` | server **CRÍTICAS** |
| `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_CLIENT_KEY` | server **CRÍTICAS** |

### 2.8 Redis / QStash

| Variável | Tipo |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server **CRÍTICAS** |
| `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | server |

### 2.9 AI Providers

| Variável | Tipo |
|---|---|
| `OPENAI_API_KEY` | server **CRÍTICA** |
| `ANTHROPIC_API_KEY` | server, opc |
| `GOOGLE_AI` | server, opc (não em uso ativo) |

### 2.10 Stripe / Billing (NOVO)

| Variável | Tipo |
|---|---|
| `STRIPE_SECRET_KEY` | server **CRÍTICA** |
| `STRIPE_WEBHOOK_SECRET` | server **CRÍTICA** |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | server |

### 2.11 Criptografia / Segurança

| Variável | Tipo | Notas |
|---|---|---|
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | server **CRÍTICA** | base64 32 bytes (AES-256-GCM). `src/lib/webhooks/secret-store.ts` |
| `ENCRYPTION_KEY` | server | uso genérico |
| `OAUTH_STATE_SECRET` | server **CRÍTICA** | CSRF state em OAuth — `src/lib/oauth-security.ts` |
| `NEXTAUTH_SECRET` | server | fallback de sessões |

### 2.12 Cron / Internal

| Variável | Tipo |
|---|---|
| `CRON_SECRET` | server **CRÍTICA** — bearer auth para todos os crons/workers |
| `INTERNAL_API_KEY` | server, opc |

### 2.13 Dev / Debug

| Variável | Tipo |
|---|---|
| `DEBUG_ROUTE_SECRET` / `DEBUG_ENDPOINT_SECRET` | server — gate em prod para `/api/debug/*` (via `src/lib/debug-guard.ts`) |
| `DEV_AUTH_BYPASS` | server, **NUNCA prod** |

### 2.14 Logger / Comportamento

| Variável | Tipo | Default |
|---|---|---|
| `LOG_LEVEL` | server | `info` — `src/lib/logger.ts` |
| `LOG_FORMAT` | server | `text` ou `json` |
| `BROWSE_ABANDONED_MAX_HOURS` | server | `72` — `cron/browse-abandoned` |
| `BROWSE_ABANDONED_MIN_MIN` | server | `5` |

---

## 3. Onde Cada Coisa Fica Armazenada

| Tipo de dado | Onde mora | Como acessar | Tempo de vida |
|---|---|---|---|
| Dados estruturados (tabelas) | Postgres Supabase | `supabase-client` / `getAuthClient()` / `supabase-admin` | persistente |
| Sessões | Cookies httpOnly (`sb-access-token`, `sb-refresh-token`) | `supabase.auth.getSession()` | até logout |
| Profile / org / role | `profiles` + JWT claims | `getAuthClient()` retorna `user.organization_id` | persistente |
| Arquivos (mídia, anexos) | Supabase Storage | `supabase.storage.from('bucket')` | persistente |
| Embeddings RAG | `ai_knowledge_chunks` (pgvector) | RPC `search_agent_knowledge` | persistente |
| Cache (RAG, intent, etc.) | Redis Upstash, prefixos `emb:` `rag:` `intent:` `sent:` `agent:` | `src/lib/redis.ts` | TTL configurável |
| Rate-limit | Redis ZSET prefixo `rl:*` | `src/lib/rate-limit.ts` | janela móvel |
| Tarefas assíncronas / delays | QStash + Durable Queue (Redis ZSET `wq:*:scheduled`) | `src/lib/queue.ts` + `src/lib/queue/durable-queue.ts` | até 7 dias |
| Cron schedules | Vercel Cron (23 entries em `vercel.json`) | HTTP POST → `/api/cron/**` ou `/api/workers/**` | conforme schedule |
| Credenciais OAuth/API | `credentials.credentials` JSONB (criptografado com `ENCRYPTION_KEY`) | helper em `src/lib/automation/credential-encryption.ts` | persistente |
| Webhook secrets outbound | `webhook_subscriptions.secret_encrypted` bytea (AES-256-GCM com `WEBHOOK_SECRET_ENCRYPTION_KEY`) | `src/lib/webhooks/secret-store.ts` | com rotação |
| OAuth states (replay) | `oauth_states` (TTL 10min) | `src/lib/oauth-security.ts` | 10 min |
| Logs de eventos | `contact_events` (com `idempotency_key` UNIQUE) | EventBus / direct insert | persistente (LGPD prune) |
| Logs de webhooks outbound | `webhook_deliveries` | workers | retidos com sweeper + prune |
| Notificações in-app | `notifications` + canal Realtime `notifications:${organization_id}` | hook `useNotifications()` | até `dismissed` |
| Audit log | `audit_logs` (action/resource/changes JSONB before/after) | inseridos por handlers | persistente |
| LGPD requests | `lgpd_data_requests`, `lgpd_consents`, `lgpd_retention_policies` | cron `lgpd-retention` aplica policies | persistente até processado |
| Stripe state | `billing_subscriptions`, `billing_invoices` | webhooks Stripe + sync | persistente |
| Visitor identity graph | `visitor_identities` + `visitor_id_aliases` (hash de fingerprint, email, phone, IP subnet) | `src/lib/identity/resolver.ts` | persistente |
| Recomendações | `product_recommendations` (CF, materializada) | cron `compute-recommendations` (noturno) | recomputado diário |
| Segment snapshots | `segment_memberships_snapshot` (UUID[] de contatos) | cron `recompute-segments` / `detect-segment-changes` | atualizado a cada 15min |
| Send-time optimization | `smart_send_windows` (best_hour_utc, confidence_score) | cron `update-send-times` | recomputado diariamente |
| Estado UI (sidebar, theme) | localStorage `worder-ui` + Zustand persist | `src/stores/uiStore.ts` | até user limpar |
| Estado Inbox (filtros) | localStorage `inbox-storage` | `src/stores/inboxStore.ts` | persistido |
| Lojas selecionadas | localStorage `worder-stores` | `src/stores/storeStore.ts` | persistido |
| Demais stores Zustand | memória do tab | — | até reload |

### 3.1 Onde as variáveis de ambiente moram

| Ambiente | Local | Notas |
|---|---|---|
| Dev local | `.env.local` (gitignored) | Valores de dev/teste |
| Preview Vercel | Vercel → Env Variables → Preview | Pode herdar de Production |
| Produção Vercel | Vercel → Env Variables → Production | Criptografadas at-rest |
| Worker container | Env vars da plataforma (Railway/Render/Docker) | Mínimo: Supabase + Upstash |

`.env.example` atual lista apenas `WEBHOOK_SECRET_ENCRYPTION_KEY` e `CDN_IMAGES_DOMAIN`. **Use a Seção 2 deste doc como inventário canônico** — o `.env.example` está incompleto.

---

## 4. Banco de Dados — ~120 Tabelas por Domínio

> **Schema:** todas em `public`. **PK:** `id UUID` (`gen_random_uuid()`). **RLS:** ativada em ~110 tabelas. **Padrão:** `created_at`, `updated_at timestamptz` com trigger.

### 4.1 Auth / Org / Stores

| Tabela | Colunas-chave |
|---|---|
| `organizations` | `id, name, slug, owner_id, plan, status, created_at` |
| `organization_members` | `id, organization_id, user_id, role, joined_at` |
| `profiles` | `id, user_id, organization_id, full_name, avatar_url, role` |
| `shopify_stores` | `id, organization_id, store_url, access_token, scope, installed_at, shop_id, currency, embed_installed_at` |
| `shopify_customers` | `id, store_id, shopify_customer_id, email, phone, first_name, last_name, **verified_email**, **default_address JSONB**, **currency**` (3 cols novas em 20260516) |
| `shopify_products` / `shopify_products_cache` | catálogo + cache local |

### 4.2 Contacts / CRM Core

| Tabela | Colunas-chave |
|---|---|
| `contacts` | `id, organization_id, store_id, email, phone, whatsapp, shopify_customer_id, full_name, source, tags TEXT[], custom_fields JSONB, is_subscribed_email/sms/whatsapp, total_orders, total_spent, average_order_value, lifetime_value, first_order_at, last_order_at, days_since_last_order, lifecycle_stage`. **UNIQUE(`organization_id`, `email`)** em 20260516 (corrigida de partial para full). Trigger `contacts_fill_store_id_trigger` defaulta `store_id` para a loja mais recente da org. |
| `pipelines` | `id, organization_id, name, description, color, is_default, position` |
| `pipeline_stages` | `id, pipeline_id, name, color, position, probability, rotting_days, is_won, is_lost, deal_count` |
| `deals` | `id, organization_id, pipeline_id, stage_id, contact_id, assigned_to, title, value, currency, probability, expected_close_date, commit_level, forecast_category, status` (open/won/lost), `won_at, lost_at, lost_reason, tags TEXT[], custom_fields JSONB, position` |
| `deal_activities` | `id, organization_id, deal_id, contact_id, user_id, activity_type` (note/call/email/meeting/task/stage_change/value_change/custom), `title, description, metadata JSONB, is_pinned, due_at, completed_at` |

### 4.3 Inbox / WhatsApp

| Tabela | Colunas-chave |
|---|---|
| `whatsapp_conversations` | `id, organization_id, contact_id, phone_number, instance_id, last_message_at, unread_count, status, metadata JSONB` — **realtime habilitado** |
| `whatsapp_messages` | `id, organization_id, conversation_id, sender, message_type, body, media_url, status, sent_at, read_at` — **realtime** |
| `whatsapp_instances` | `id, organization_id, phone_number, instance_type` (official/evolution), `api_url, credentials JSONB (encrypted), status, last_health_check_at` |
| `whatsapp_agents` | humanos + IA |
| `whatsapp_quality_history` | tracking de quality rating |
| `ai_message_logs` | `tokens_used, cost_usd, success, error` |
| `whatsapp_product_interests` | back-in-stock: UNIQUE(`org_id`, `contact_id`, `product_id`, COALESCE(`variant_id`, '')) |
| `whatsapp_payment_links` | `amount, currency (BRL), payment_url, status` (pending/paid/expired/cancelled), `external_id, expires_at, paid_at` |
| `whatsapp_campaigns` | `name, status, audience_count, sent_count, delivered_count, replied_count, **revenue, conversions**` (20260513) |
| `whatsapp_sends` (NOVA 20260513) | **tabela de attribution outbound**: `id, organization_id, contact_id, phone_number, campaign_id, automation_id, automation_run_id, flow_id, node_id, message_body, status, sent_at, delivered_at, read_at, replied_at, **conversion_value, converted_at, order_id**, external_message_id`. Idempotência: UNIQUE partial `(org_id, order_id)`. |

### 4.4 Email

| Tabela | Colunas-chave |
|---|---|
| `email_campaigns` | + **A/B testing**: `ab_test_enabled, ab_test_percent, ab_variant_b JSONB, ab_winner_metric, ab_duration_hours, ab_winner` (a/b), `ab_resolved_at`. + `revenue, conversions, scheduled_at` |
| `email_sends` | + `mpp_opened_at` (Apple Mail Privacy Protection — 20260513). + attribution: `conversion_value, converted_at, order_id`. + `ab_variant` (a/b). + `bounce_type, bounce_reason` |
| `email_domains` | `dkim_record, spf_record, cname_record, is_verified, **is_system** (shared worder.email — 20260513), last_verified_at, store_id` (por loja em 20260513) |
| `email_clicks` | tracking de clicks |
| `email_queue` | tabela-fila para envios assíncronos |
| `email_templates` | + `design_json JSONB, html, thumbnail_url` |
| `saved_blocks` + `saved_block_versions` | reuso + versionamento de blocos |
| `browse_abandoned_emails`, `browse_abandoned_cart_events` | recovery de browse abandonado |
| `deliverability_metrics` | `date, sent_count, delivered_count, bounce_count, complaint_count, reputation_score` |
| `smart_send_windows` | `contact_id, best_hour_utc, confidence_score, last_computed_at` — popula `cron/update-send-times` |

### 4.5 SMS (NOVO domínio em 20260513)

| Tabela | Colunas-chave |
|---|---|
| `sms_campaigns` | broadcast, status, contadores, **revenue, conversions** |
| `sms_sends` | `id, organization_id, contact_id, phone_number, campaign_id, automation_id, automation_run_id, flow_id, node_id, message_body, status` (pending/sent/delivered/clicked/failed/undelivered), `sent_at, delivered_at, clicked_at, failed_at, conversion_value, converted_at, order_id, external_message_id`. Idempotência: UNIQUE partial `(org_id, order_id)`. |

### 4.6 Shopify Orders / Checkouts

| Tabela | Colunas-chave |
|---|---|
| `shopify_orders` | `id, organization_id, store_id, contact_id, shopify_order_id, **order_number TEXT** (era INTEGER — 20260516), email, phone, total_price, subtotal, tax, shipping_cost, discount, currency, financial_status, fulfillment_status, **payment_gateway_names TEXT[]** (20260516), **total_refunded NUMERIC(12,2)** (20260516 — corrige dashboard que somava refunded como bruto), items JSONB, addresses JSONB, tags TEXT[], shopify timestamps`. UNIQUE(`store_id`, `order_number`). |
| `shopify_checkouts` | abandonment tracking |
| `shopify_sync_logs` | `resource_type, batch_id, status, processed_count, failed_count, started_at, completed_at` |
| `shopify_import_jobs` | bulk operations: `job_type, query_id, result_url, row_count, imported_count, resume_cursor` |
| `shopify_webhook_audit` | tracking de webhooks ativos |
| `shopify_automation_logs`, `shopify_transition_rules` | regras de pipeline movement |

### 4.7 Automations / Flow Builder

| Tabela | Colunas-chave |
|---|---|
| `automations` | `id, organization_id, store_id, name, trigger_type, flow_config JSONB, status` (draft/active/paused) |
| `automation_runs` | `id, organization_id, automation_id, contact_id, deal_id, trigger_event_id, status` (pending/running/completed/failed/waiting/cancelled), `current_node_id, current_node_started_at, waiting_until, result JSONB, metadata JSONB, **lock_token UUID, locked_at, locked_by, last_heartbeat_at, last_error**`. Lock otimista para evitar dupla execução. |
| `automation_run_steps` | execução individual de cada node |
| `automation_pending_steps` | steps escalonados (delay) — também com lock_token |
| `event_logs` | (legado, agora `contact_events` é primário) |
| `crm_automation_rules` | UNIQUE(`pipeline_id`, `source_type`, `trigger_event`) — `source_type` IN (shopify/whatsapp/hotmart/webhook/form), `action_type` IN (create_deal/move_deal/update_contact), `target_stage_id, auto_tags TEXT[]` |
| `flow_webhooks` | webhooks inbound que disparam automation |
| `automation_workers_lock` | tabela de locks distribuídos por worker_id |

### 4.8 Instagram

`instagram_accounts`, `instagram_conversations`, `instagram_messages`.

### 4.9 Webhooks (Outbound)

| Tabela | Colunas-chave |
|---|---|
| `webhook_subscriptions` | `id, organization_id, store_id, name, url, secret_encrypted bytea, secret_previous_encrypted, secret_previous_expires_at, events TEXT[], status, description, created_by`. CHECKs: `events_not_empty`, `events_in_catalog`, `status IN ...`, `secret_rotation_consistent`. |
| `webhook_deliveries` | `id, organization_id, webhook_subscription_id, event_type, payload JSONB, http_status, response_body, attempt_count, next_retry_at, **lock_token** (claim/release), status` |
| `webhook_pii_consent` | gating de PII no payload: `include_contact_email/phone, include_order_items, include_shipping_address` |

### 4.10 Forms / Popups

| Tabela | Colunas-chave |
|---|---|
| `forms` | `id, organization_id, store_id, name, form_type` (popup/embedded/modal), `title, description, design JSONB, fields JSONB, status, views_count, submissions_count, **dismissals_count** (20260513)` |
| `form_fields` | tipagem por campo |
| `form_submissions` | `data JSONB, ip_address, user_agent` |
| `form_events` (20260513) | time-series: `event_type` (impression/dismissed/submitted/engaged), `properties JSONB, occurred_at` — **realtime habilitado** |
| `crm_forms`, `crm_form_fields`, `crm_form_submissions`, `crm_form_events`, `crm_form_event_logs` | versão CRM mais antiga (pixel events FB/Google) |

### 4.11 Lists / Segmentation

| Tabela | Colunas-chave |
|---|---|
| `lists` (20260415) | `id, organization_id, name, description, color (#F97316), member_count, created_by` |
| `list_contacts` | UNIQUE(`list_id`, `contact_id`) |
| `customer_segments` | `segment_type` (behavioral/demographic/engagement/custom), `conditions JSONB` (hierárquico and/or), `member_count, last_count_at` |
| `segment_memberships_snapshot` (20260415) | snapshot de `contact_ids UUID[]` para detect-segment-changes |
| `customer_rfm_scores` | `recency_days, frequency, monetary_value, rfm_score, segment` |

### 4.12 CDP & Attribution

| Tabela | Colunas-chave |
|---|---|
| `contact_events` | **mestre de eventos**: `id, organization_id, contact_id, store_id, event_type, event_source, properties JSONB, monetary_value, currency, session_id, anonymous_id, visitor_id, received_at, occurred_at, page_url, referrer_url, device_type, browser, os, ip_address, utm_*, product_*, order_id, order_total, shopify_customer_id, shopify_resource_id/type, **idempotency_key** UNIQUE partial (20260415)` |
| `customer_events` | **VIEW** sobre `contact_events` (backward compat) |
| `attribution_touchpoints` (20260416) | `touchpoint_type` (first/last/assist), `utm_*, gclid, fbclid, ttclid, order_id, revenue` |
| `multi_channel_attribution` (20260513) | `order_id, order_value, email_send_id, whatsapp_send_id, sms_send_id, attribution_model` (first_touch/last_touch/linear/etc.), `email_revenue, whatsapp_revenue, sms_revenue, attributed_at` |
| `visitor_identities` (20260506) | `worder_visitor_id` (estável), `contact_id, fingerprint_hash, user_agent_hash, ip_subnet, email_hash, phone_hash, shopify_customer_id, match_count, match_source, first_seen_at, last_seen_at, merged_into_id` (soft-merge) |
| `visitor_id_aliases` (20260506) | aliases históricos por source (pixel/embed/identify/cookie) |
| `product_recommendations` (20260506) | CF materializada: `source_product_id, recommended_product_id, recommendation_type` (frequently_bought_together/also_viewed/view_to_purchase/similar_text), `co_occurrence_count, score (0..1)`. Atualizada por `cron/compute-recommendations` (4h da manhã) |
| `revenue_attribution` | `channel` (email/whatsapp/sms/ads/organic), `revenue, attributed_at` |

### 4.13 Ads (Google / Meta / TikTok)

`google_ads_accounts` (8 tabelas) — campaigns, ad_groups, keywords, metrics (UNIQUE org+customer), search_terms, products, product_metrics.

`meta_ads_accounts` (5 tabelas) — campaigns, adsets, ads, metrics (objectives: AWARENESS/TRAFFIC/LEADS/SALES/etc.).

`tiktok_ads_accounts` (4 tabelas) — campaigns, adgroups, metrics (BUDGET_MODE_DAY/TOTAL).

### 4.14 Integrations & Credentials

`credentials` (encrypted JSONB), `installed_integrations`, `integrations_catalog` (lookup público), `klaviyo_accounts` (legado).

### 4.15 AI Agents & Knowledge

| Tabela | Colunas-chave |
|---|---|
| `ai_agents` | `name, model, role, personality JSONB, knowledge_base JSONB, system_prompt, status, response_style, max_tokens, temperature` |
| `ai_agent_sources` | (legado) |
| `ai_knowledge_sources` (20260416) | `source_type` (file/url/text/faq/shopify_products/shopify_policies), `content, file_url, file_size, mime_type, status` (pending/processing/ready/error), `chunks_count, processed_at` |
| `ai_knowledge_chunks` (20260416) | embeddings + metadata |
| `ai_agent_actions`, `ai_agent_integrations` | When/Do rules + integração externa |
| `ai_usage_logs` (20260416) | `provider, model, feature, agent_id, prompt_tokens, completion_tokens, total_tokens GENERATED, cost_usd, duration_ms, success, error, metadata JSONB` |
| `ai_agent_usage_logs` | similar (por agente) |
| `ai_costs_attribution` (20260416) | `feature, provider, total_cost_usd, token_count, request_count, last_computed_at` — atribuição de custos |

### 4.16 Billing / Stripe (NOVO em 20260415)

| Tabela | Colunas-chave |
|---|---|
| `billing_subscriptions` | UNIQUE(`organization_id`), UNIQUE(`stripe_customer_id`), UNIQUE(`stripe_subscription_id`), `stripe_price_id, plan` (free/starter/pro/business/enterprise), `status` (trialing/active/past_due/canceled/incomplete/unpaid), `trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, metadata JSONB` |
| `billing_invoices` | UNIQUE(`stripe_invoice_id`), `amount_cents, currency (brl), status, hosted_invoice_url, pdf_url, paid_at, due_at` |

### 4.17 LGPD / Compliance (NOVO em 20260415)

| Tabela | Colunas-chave |
|---|---|
| `lgpd_consents` | `consent_type` (marketing/analytics/tracking/profiling/data_sharing/cookies) |
| `lgpd_data_requests` | `request_type` (export/delete/rectification/portability/object/restrict), `status` (pending/processing/completed/rejected/cancelled) |
| `lgpd_retention_policies` | policies por resource (cron `lgpd-retention` aplica diariamente às 3h) |

### 4.18 Audit & Security

`audit_logs` (20260420) — `action, resource, resource_id, changes JSONB before/after, ip_address, user_agent`.
`oauth_states` — replay protection 10min.

### 4.19 Notifications & Help

`notifications`, `notification_preferences`, `help_categories`, `help_articles`, `faq_items`.

### 4.20 Finances & Profitability

`product_costs` (UNIQUE org+store+product+variant), `organization_tax_settings`, `custom_fees`, `exchange_rates` (UNIQUE from+to+date), `orders`, `abandoned_carts`.

### 4.21 Outras

`custom_variables`, `store_analyses`, `lead_distribution_logs`, `lead_distribution_rules`, `lead_scores`, `tasks`, `tickets`, `scheduled_messages`, `chat_templates`, `quick_replies`, `tags`, `coupons`, `media_files`, `sla_configs`, `sla_metrics`.

---

## 5. Mudanças Críticas Recentes (20260513 – 20260516)

Antes de adicionar qualquer coisa, **leia esta seção** — várias correções recentes mudaram o contrato de tabelas-chave.

### 5.1 `contacts_org_email_unique` — 20260516

- **Antes:** índice partial `WHERE email IS NOT NULL`.
- **Agora:** UNIQUE full em `(organization_id, email)` — Postgres NULLS DISTINCT permite múltiplos NULLs.
- **Por quê:** PostgREST `onConflict: 'organization_id,email'` não funcionava com index partial. Upserts falhavam silenciosamente, criando duplicatas.
- **Impacto na integração nova:** sempre fazer `upsert(..., { onConflict: 'organization_id,email' })`.

### 5.2 `shopify_orders.order_number` — INTEGER → TEXT

- **Por quê:** Shopify permite prefixos custom ("CB21190", "DR-501"). 1813+ orders em bulk drain crashavam.
- **Impacto:** se você inserir orders programaticamente, sempre tratar como string.

### 5.3 `shopify_orders.payment_gateway_names TEXT[]` (novo)

- O código GraphQL já escrevia esse campo; a coluna não existia até 20260516.

### 5.4 `shopify_orders.total_refunded NUMERIC(12,2)` (novo)

- Dashboard somava `total_price` mesmo para `financial_status='refunded'` — overstatement de receita.
- Backfill: ordens refunded receberam `total_refunded = total_price`.

### 5.5 `shopify_customers` — `currency`, `verified_email`, `default_address JSONB` (novos)

- Eram escritos pelo GraphQL sync; faltavam no schema → batch crash.

### 5.6 `contacts_fill_store_id_trigger`

- BEFORE INSERT: se `store_id IS NULL`, popula com a loja mais recente da org.
- Garante isolamento multi-tenant mesmo quando webhooks/forms esquecem de setar.

### 5.7 Attribution functions idempotentes — 20260513

- `attribute_email_conversion`, `attribute_whatsapp_conversion`, `attribute_sms_conversion`: short-circuit se já existe attribution para o `(org_id, order_id)`. **Safe to retry**.
- `revoke_*_conversion(org_id, order_id)`: undo (para refunds).

### 5.8 Visitor Identity Graph — 20260506

- Nova fonte de verdade para resolução de identidade. Substitui lógica espalhada.
- Match hierarchy: `worder_visitor_id > shopify_customer_id > email_hash > phone_hash > fingerprint_hash + user_agent_hash > ip_subnet`.
- Soft-merge via `merged_into_id` (não deleta linhas, apenas redireciona).

### 5.9 Product Recommendations — 20260506

- `cron/compute-recommendations` (4h) popula `product_recommendations` com 4 tipos (frequently_bought_together / also_viewed / view_to_purchase / similar_text).

### 5.10 A/B Email Testing

- `email_campaigns.ab_*` columns. `cron/resolve-ab-winners` (10min) escolhe winner por `ab_winner_metric` (open_rate/click_rate/conversion_rate) após `ab_duration_hours`.

### 5.11 Apple Mail Privacy Protection

- `email_sends.mpp_opened_at` separa opens "artificiais" do MPP dos opens reais.

---

## 6. Funções SQL / RPCs / Triggers / RLS

### 6.1 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

(Embeddings também usam funções nativas; pgvector é provisionado pelo Supabase.)

### 6.2 RPCs principais (chamadas via `supabase.rpc()`)

**Automation workers (com lock otimista):**
- `claim_automation_run(p_run_id, p_worker_id, p_new_token UUID, p_stale_lock_minutes DEFAULT 5)` — claim
- `heartbeat_automation_run(p_run_id, p_token)` — renova lock
- `release_automation_run(p_run_id, p_token, p_new_status, p_error?, p_result?)` — libera
- `reclaim_stale_automation_runs(p_minutes DEFAULT 10)` — cron, reclaim travados

**Counters atômicos:**
- `increment_campaign_opens`, `increment_campaign_clicks`, `increment_campaign_sent/delivered/bounces/failed/stats`
- `increment_contact_events`, `increment_contact_revenue`
- `increment_form_counter(form_id, column)` — whitelisted columns (views_count, submissions_count, dismissals_count)
- `increment_template_usage`, `increment_action_trigger`, `increment_flow_webhook_count`, `increment_automation_*`

**Attribution (idempotente — 20260513):**
- `attribute_email_conversion(contact_id, org_id, order_id, order_value, attribution_window_days DEFAULT 5)`
- `attribute_whatsapp_conversion(...)` (janela 2 dias)
- `attribute_sms_conversion(...)` (janela 2 dias)
- `revoke_email_conversion`, `revoke_whatsapp_conversion`, `revoke_sms_conversion`
- `backfill_attribution_for_org(org_id, lookback_days DEFAULT 30, ...)`

**Contact metrics:**
- `refresh_contact_order_metrics(p_store_id, p_organization_id)` — bulk refresh

**Segmentação:**
- `detect_segment_changes(org_id)` — compara snapshot vs current
- RPC genérica `count_events_by_type`, `count_segment`

**Webhook outbound:**
- `claim_webhook_delivery(...)`
- `dispatch_insert_deliveries(...)`

**AI / Search:**
- `search_agent_knowledge(agent_id, query)` — semantic search
- `get_active_agent_for_conversation(conversation_id)`
- `check_agent_cooldown`, `count_agent_messages_in_conversation`
- `update_agent_stats`, `check_human_replied`
- `disable_ai_for_conversation`, `enable_ai_for_conversation`

**Identity helpers:**
- `get_user_org_id()` (usado em RLS)
- `user_belongs_to_org(org_id)`
- `shopify_enforce_org_from_store(store_id)`

**WhatsApp:**
- `upsert_whatsapp_conversation(...)` — dedup via UNIQUE constraint
- `toggle_conversation_bot`, `mark_conversation_as_read`, `mark_messages_as_read`

### 6.3 Triggers vigentes

| Trigger | Tabela | Função | Quando |
|---|---|---|---|
| `contacts_fill_store_id_trigger` | `contacts` | `contacts_fill_store_id()` | BEFORE INSERT (20260516) |
| `trg_bump_saved_block_version` | `saved_blocks` | `bump_saved_block_version()` | BEFORE UPDATE |
| `trg_list_count` | `list_contacts` | `update_list_member_count()` | AFTER INSERT/DELETE (±1 member_count) |
| `trigger_update_automation_rules_updated_at` | `crm_automation_rules` | — | BEFORE UPDATE |
| `webhook_subscriptions_updated_at` | `webhook_subscriptions` | — | BEFORE UPDATE |
| `whatsapp_sends_touch_updated_at` | `whatsapp_sends` | `trg_touch_updated_at()` | BEFORE UPDATE (20260513) |
| `sms_sends_touch_updated_at` | `sms_sends` | idem | BEFORE UPDATE |
| `sms_campaigns_touch_updated_at` | `sms_campaigns` | idem | BEFORE UPDATE |
| Diversos `*_updated_at` | quase todas | `update_updated_at_column()` | BEFORE UPDATE |
| `trigger_process_comment_mentions` | `contact_comments` | dispara notificações | AFTER INSERT |
| `trigger_notify_task_assigned/completed` | `tasks` | notificações | AFTER INSERT/UPDATE |
| `trigger_update_conversation_on_message` | `whatsapp_messages` | atualiza conversa | AFTER INSERT |

### 6.4 RLS

**Padrão para tabelas de tenant:**

```sql
DROP POLICY IF EXISTS ... ON table;
CREATE POLICY "org_members_access" ON table
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Service role full access" ON table
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Algumas tabelas mais novas (whatsapp_sends, sms_sends, form_events) usam `current_setting('app.current_org_id', true)` para casos específicos. Tabelas públicas (help_*, faq_items, integrations_catalog) permitem leitura sem auth.

### 6.5 Constraints UNIQUE críticas para integração

| Tabela | Coluna(s) | Quando usar |
|---|---|---|
| `contacts` | `(organization_id, email)` | upserts de contato — `onConflict: 'organization_id,email'` |
| `shopify_orders` | `(store_id, order_number)` | upsert de ordens |
| `shopify_customers` | `(store_id, shopify_customer_id)` | sync |
| `whatsapp_sends` | partial `(org_id, order_id)` | idempotência de attribution |
| `sms_sends` | partial `(org_id, order_id)` | idempotência |
| `contact_events` | partial `idempotency_key` | dedup de eventos |
| `whatsapp_product_interests` | `(org_id, contact_id, product_id, COALESCE(variant_id, ''))` | back-in-stock |
| `visitor_identities` | `(org_id, worder_visitor_id)` | identity graph |
| `visitor_id_aliases` | `(org_id, alias_visitor_id)` | aliases |
| `product_recommendations` | `(org_id, source_product_id, recommended_product_id, recommendation_type)` | CF |
| `list_contacts` | `(list_id, contact_id)` | membership |
| `product_costs` | `(org_id, store_id, shopify_product_id, shopify_variant_id)` | custos |
| `exchange_rates` | `(from_currency, to_currency, date)` | câmbio |
| `crm_automation_rules` | `(pipeline_id, source_type, trigger_event)` | regras CRM |
| `google_ads_accounts` | `(org_id, customer_id)` | conta Google |
| `meta_ads_accounts` | `(org_id, account_id)` | conta Meta |
| `tiktok_ads_accounts` | `(org_id, advertiser_id)` | conta TikTok |
| `billing_subscriptions` | `organization_id` | uma sub por org |
| `billing_subscriptions` | `stripe_subscription_id` | global |

---

## 7. Storage Buckets

| Bucket | Uso | Acessado em |
|---|---|---|
| `avatars` | Foto de perfil de users e contatos | `/api/profile/avatar/route.ts` |
| `email-images` | Imagens de templates de email (com CDN opcional via `CDN_IMAGES_DOMAIN`) | `/api/images/upload/route.ts`, `src/lib/email/image-rewrite.ts` |
| `contact-files` | Anexos em contatos | `/api/contacts/[id]/attachments/route.ts` |
| `content-media` | Mídia genérica de conteúdo | `/api/content/media/route.ts` |

**Path padrão:** `{organization_id}/{resource_type}/{resource_id}/{filename}` (sempre prefixar com `organization_id`).

---

## 8. Cache (Redis / Upstash)

Arquivo: `src/lib/redis.ts` (lazy singleton).

### 8.1 Prefixos

| Prefixo | Conteúdo | TTL |
|---|---|---|
| `emb:` | embeddings para RAG | 7 dias |
| `intent:` | detecção de intent | 1 h |
| `sent:` | análise de sentimento | 1 h |
| `agent:` | config de agente IA | 5 min |
| `rag:` | resultados de busca semântica | 30 min |
| `rl:*` | rate-limiting sliding window | janela |
| `wa:circuit:` | circuit breaker WhatsApp | minutos |
| `wa:queue:` | controle de fila WhatsApp | minutos |
| `wa:tpl:` | cache de templates aprovados | até 24h |
| `wq:{queue}:scheduled` | ZSET de jobs agendados (durable queue) | — |
| `wq:{queue}:processing` | HASH de jobs em flight | — |
| `wq:{queue}:dead` | LIST de jobs mortos | — |

### 8.2 Rate-limit

`src/lib/rate-limit.ts` — `checkRateLimit(key, limit, windowMs, identifier)`. Fallback in-memory se Redis indisponível. Helper `getClientIp(req)`.

---

## 9. Filas, Crons e Workers

### 9.1 23 Vercel Cron Jobs (`vercel.json`)

| Schedule | Path | Função |
|---|---|---|
| `* * * * *` | `/api/workers/process-events` | processa `contact_events` pendentes |
| `* * * * *` | `/api/cron/process-runs` | até 3 `automation_runs` por tick (max 300s) |
| `* * * * *` | `/api/cron/check-delayed-runs` | relança `failed` após cooldown |
| `* * * * *` | `/api/cron/check-abandoned-carts` | emite eventos de carrinho abandonado |
| `1 0 * * *` | `/api/cron/check-dates` | aniversários/datas (RPC `emit_date_events`) |
| `* * * * *` | `/api/workers/automation-delay` | resume `waiting` cujo delay expirou |
| `*/10 * * * *` | `/api/workers/abandoned-cart` | worker de recuperação |
| `0 */23 * * *` | `/api/cron/shopify-token-refresh` | refresh OAuth |
| `*/15 * * * *` | `/api/cron/recompute-segments` | recomputa `customer_segments.member_count` |
| `* * * * *` | `/api/cron/email-queue-worker` | consome durable queue `email-send-batch` (até 20/tick) |
| `*/2 * * * *` | `/api/cron/reclaim-stale-runs` | reclama runs presos em `running` > 5min |
| `*/10 * * * *` | `/api/cron/check-back-in-stock` | notifica `whatsapp_product_interests` |
| `*/15 * * * *` | `/api/cron/detect-segment-changes` | compara snapshot vs current → eventos `segment_entered/left` |
| `0 1 * * *` | `/api/cron/check-inactivity` | marca inativos |
| `* * * * *` | `/api/cron/send-scheduled-campaigns` | dispara `email_campaigns.status='scheduled'` |
| `0 3 * * *` | `/api/cron/lgpd-retention` | aplica `lgpd_retention_policies` (anonimiza/deleta) |
| `*/10 * * * *` | `/api/cron/resolve-ab-winners` | escolhe A/B winner |
| `0 3 * * *` | `/api/cron/update-send-times` | popula `smart_send_windows` |
| `*/5 * * * *` | `/api/cron/webhook-deliveries-sweeper` | libera leases expirados |
| `0 3 * * *` | `/api/cron/webhook-deliveries-prune` | deleta deliveries > 30d |
| `*/15 * * * *` | `/api/cron/browse-abandoned` | detecta sessões com `BROWSE_ABANDONED_MIN_MIN`–`BROWSE_ABANDONED_MAX_HOURS` |
| `0 4 * * *` | `/api/cron/compute-recommendations` | popula `product_recommendations` |
| `*/2 * * * *` | `/api/cron/resume-stalled-bulk-drains` | retoma Shopify bulk imports |

**Autenticação dos crons:** header `x-vercel-cron: 1` (Vercel injeta) ou `Authorization: Bearer ${CRON_SECRET}` (manual).

### 9.2 11 Workers de API

| Path | Trigger | Função |
|---|---|---|
| `/api/workers/process-events` | cron + push | processa eventos pendentes |
| `/api/workers/automation-delay` | cron | resume delays |
| `/api/workers/abandoned-cart` | cron | recuperação |
| `/api/workers/automation` | QStash | executa automation completa |
| `/api/workers/automation-step` | QStash | um passo (com lock) |
| `/api/workers/campaign` | QStash | envia campanhas |
| `/api/workers/shopify-webhook` | Shopify | handler de webhook |
| `/api/workers/shopify-sync` | QStash | sync de dados |
| `/api/workers/shopify-bulk-drain` | cron + self-chain | drena JSONL de bulk |
| `/api/workers/webhook-delivery` | QStash | entrega outbound |
| `/api/workers/whatsapp-ai` | QStash | resposta IA WhatsApp |

### 9.3 Camadas de fila

1. **SQL-based** (status='pending' em `automation_runs`, `email_campaigns`, `webhook_deliveries`, `contact_events`, `shopify_import_jobs`)
2. **Durable Queue** (Upstash Redis ZSET) em `src/lib/queue/durable-queue.ts` — fila `email-send-batch`
3. **QStash** em `src/lib/queue.ts` — `enqueueQStash`, `verifyQStashSignature`, jobs: `automation_run`, `automation_step`, `send_email`, `send_whatsapp`, `webhook_call`

### 9.4 Worker dedicado (`worker/campaign-worker.ts`)

Standalone Node fora do Next. Env mínima: Supabase + Upstash. Healthcheck 30s, graceful shutdown 10s. Deploy típico Railway/Render.

---

## 10. Realtime

Canais ativos no frontend:

| Canal | Tabela | Filtro | Onde |
|---|---|---|---|
| `notifications:${orgId}` | `notifications` | `organization_id=eq.${orgId}` | `useNotifications` |
| `unread:${orgId}` | `notifications` | idem | `useNotifications` |
| `contacts:${orgId}` | `contacts` | — | `useCRMRealtime`, `useContacts` |
| `deals-realtime:${orgId}` | `deals` | — | `useDeals` |
| Dinâmico WhatsApp | `whatsapp_conversations`, `whatsapp_messages` | conversation_id / org_id | `useWhatsAppRealtime`, `useInboxRealtime` |
| Form events | `form_events` | — | dashboards de form |

Para adicionar nova tabela ao realtime:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE my_new_table;
```

---

## 11. Camada de Acesso a Dados

### 11.1 Os três clients

| Client | Arquivo | RLS | Variáveis |
|---|---|---|---|
| Browser (anon + sessão) | `src/lib/supabase-client.ts` | ✅ | `NEXT_PUBLIC_SUPABASE_*` |
| Server com RLS | `getAuthClient()` em `src/lib/api-utils.ts` | ✅ via cookie `sb-access-token` | mesmas |
| Admin (service-role) | `src/lib/supabase-admin.ts` | ❌ **bypass** | `SUPABASE_SERVICE_ROLE_KEY` |

`supabase-admin.ts` se protege contra import no browser (`typeof window`).

### 11.2 Padrão de auth

```ts
const auth = await getAuthClient()
if (!auth) return authError('Unauthorized')
const { user, supabase } = auth
const orgId = user.organization_id
```

Para webhooks externos (sem sessão), use `supabaseAdmin` e **resolva `organization_id`** a partir de `shop_domain`, `phone_number_id`, `account_id`, `ig_user_id`, `worder_visitor_id`, etc.

### 11.3 Helpers

`src/lib/api-utils.ts`: `successResponse`, `errorResponse`, `authError`, `validateParams`, `parseDateRange`, `validateStoreAccess`, `requireStoreAccess`.

`src/lib/auth-utils.ts`: `isAgent`, `isOwnerOrAdmin`, `getAgentId`, `getOrganizationId`, `canAccessWhatsAppNumber`, `canAccessConversation`.

`src/lib/events.ts`: `EventBus.emit(eventType, payload)` — insere em `contact_events` + dispara automações.

---

## 12. Multi-Tenant Isolation

### 12.1 Regras inquebráveis

1. **Toda tabela tenant tem `organization_id NOT NULL`.** Quase todas levam `store_id` também.
2. **Sempre filtrar por `organization_id` explicitamente**, mesmo com RLS. Com `supabaseAdmin` é obrigação absoluta.
3. **Validar recursos relacionados**: comparar `organization_id` do recurso filho com o do usuário (`validateOrganizationAccess`).
4. **Webhooks externos**: resolver `organization_id` via campo único confiável + persistir o `organization_id` no payload final.
5. **Cache Redis**: chaves prefixadas com `organization_id`. Nunca cache cross-tenant.
6. **Storage**: paths começam por `{organization_id}/...`.
7. **EventBus**: exige `organization_id` no payload.
8. **Realtime**: canais filtrados por `organization_id`/conversa.
9. **`contacts.store_id`** tem trigger que defaulta para loja mais recente — mas você ainda deve setar explicitamente quando souber o destino.

### 12.2 Padrão para webhook inbound

```ts
const v = await validateWebhook(request, { name: 'shopify', secret: process.env.SHOPIFY_WEBHOOK_SECRET!, signatureHeader: 'x-shopify-hmac-sha256' })
if (!v.valid) return webhookError(v.error!)

const admin = getSupabaseAdmin()
const { data: store } = await admin.from('shopify_stores').select('id, organization_id').eq('store_url', shop).single()
if (!store) return webhookError('Unknown store', 404)

await admin.from('shopify_webhook_audit').insert({
  event_id: headers.get('x-shopify-event-id'),
  store_id: store.id,
  organization_id: store.organization_id,
  topic, status: 'active'
}).onConflict('event_id').ignore()
```

---

## 13. Webhooks

### 13.1 Inbound

Endpoints (todos verificam HMAC ou signature):
- `/api/webhooks/shopify` (HMAC SHA256, `x-shopify-hmac-sha256`)
- `/api/webhooks/shopify/gdpr/customers-data-request|customers-redact|shop-redact`
- `/api/webhooks/resend` (Svix com `RESEND_WEBHOOK_SECRET`)
- `/api/webhooks/stripe` (`STRIPE_WEBHOOK_SECRET`)
- `/api/webhooks/klaviyo`
- `/api/whatsapp/cloud/webhook`, `/api/whatsapp/meta/webhook`, `/api/whatsapp/evolution/webhook`, `/api/whatsapp/webhook`
- `/api/instagram/webhook` (META_APP_SECRET + INSTAGRAM_WEBHOOK_VERIFY_TOKEN)
- `/api/webhooks/flow/[token]` (custom flow webhooks)
- `/api/webhooks/custom-event`, `/api/webhooks/custom/[id]`
- `/api/webhooks/[token]` (genérico)

Helpers em `src/lib/webhook-security.ts`: `validateWebhook`, `verifyHmacSignature`, `verifyBearerToken`, `checkRateLimit`, `validateTimestamp`, `parsePayload`, `logWebhookAttempt`.

### 13.2 Outbound

Fluxo (tabelas em 4.9):

1. Org cadastra inscrição → `webhook_subscriptions` (`secret_encrypted` AES-256-GCM com `WEBHOOK_SECRET_ENCRYPTION_KEY`).
2. Evento emitido → `dispatch_insert_deliveries` cria `webhook_deliveries` (`status='pending'`).
3. Cron `webhook-deliveries-sweeper` (5min) + QStash `enqueueWebhookDelivery` → worker.
4. Worker `/api/workers/webhook-delivery` chama `claim_webhook_delivery` (lock), envia POST assinado, atualiza status, retry com backoff.
5. Cron `webhook-deliveries-prune` (diário 3h) limpa antigas.

Rotação de secret via `secret_previous_encrypted` + `secret_previous_expires_at`. PII gating via `webhook_pii_consent`.

---

## 14. Estrutura de `src/lib/`

### 14.1 Diretórios (25)

| Dir | Função | Env |
|---|---|---|
| `ai/` | RAG, store-analyzer, engine, actions-engine | OPENAI, ANTHROPIC |
| `analytics/` | agregação de métricas | — |
| `api/` | helpers HTTP | — |
| `attribution/` ★ NOVO | orquestrador multi-canal email/whatsapp/sms (RPC `claim_conversion`) | — |
| `auth/` | sessão, permissões | NEXTAUTH_SECRET, OAUTH_STATE_SECRET |
| `automation/` | execution-engine, event-processor, run-lock, node-executors, trigger-dispatcher | CRON_SECRET, QSTASH |
| `billing/` ★ NOVO | Stripe (`stripe.ts`) | STRIPE_* |
| `cdp/` ★ NOVO | canonical-schema (`WorderCanonicalEvent`), normalize-to-canonical, enrich-shopify-event | — |
| `email/` | send-campaign, resend, image-rewrite, merge-tags, attribution, preflight, unsubscribe-token | RESEND_*, CDN_IMAGES_DOMAIN, UNSUBSCRIBE_SECRET |
| `identity/` ★ NOVO | resolver.ts — visitor identity graph (fingerprint/email/phone hashing) | — |
| `instagram/` | webhooks + posts | INSTAGRAM_*, META_* |
| `integrations/` | catálogo + handlers | — |
| `queue/` ★ NOVO | durable-queue.ts (Redis ZSET) | UPSTASH_REDIS_* |
| `reports/` | 7 sub-domínios (campaigns/contacts/email-performance/funnel/inventory/revenue/sms-campaigns) | — |
| `segments/` | resolver, builder; RPC `count_segment` | — |
| `services/` | 7 subdirs por integração (whatsapp/email/shopify/meta/instagram/klaviyo/tiktok) | múltiplas |
| `shopify/` | GraphQL + REST + bulk-sync | SHOPIFY_* |
| `sms/` ★ NOVO | attribution.ts (RPC `attribute_sms_conversion`) | — |
| `sql/` | helpers SQL | — |
| `tiktok/` | TikTok Ads | TIKTOK_* |
| `utils/` | confetti, countries | — |
| `webhooks/` | secret-store, handler | WEBHOOK_SECRET_ENCRYPTION_KEY |
| `whatsapp/` | attribution, webhook, message-service | WHATSAPP_*, EVOLUTION_* |

### 14.2 Arquivos diretos

| Arquivo | Função |
|---|---|
| `app-url.ts` ★ NOVO | canonical base URL (HTTPS guarantee) |
| `api-utils.ts` | helpers HTTP |
| `auth-utils.ts` | JWT decode |
| `confetti.ts` | animação browser |
| `countries.ts` | offline data |
| `debug-guard.ts` ★ NOVO | protege `/api/debug/*` em prod |
| `events.ts` | EventBus |
| `logger.ts` ★ NOVO | logger estruturado (LOG_LEVEL, LOG_FORMAT) |
| `meta-api.ts` | Meta Graph client |
| `oauth-security.ts` | CSRF state |
| `password-validation.ts` | força de senha |
| `queue.ts` | QStash client/verify |
| `rate-limit.ts` ★ NOVO | rate-limiter Redis + fallback memória |
| `redis.ts` | Redis client (REST) |
| `route-permissions.ts` | gate por rota |
| `security.ts` | hash, random |
| `supabase-admin.ts` | client service-role |
| `supabase-client.ts` | client anon + browser |
| `supabase.ts` | utilities |
| `webhook-security.ts` | HMAC + encryption |

---

## 15. Types ↔ Tabelas

Cada arquivo `.ts` em `src/types/` mapeia um domínio. Quando criar tabela nova, atualize/crie o tipo correspondente:

| Arquivo | Tabelas |
|---|---|
| `auth.ts` | `profiles`, `auth.users` |
| `crm-core.ts`, `crm.ts` | `contacts`, `deals`, `pipelines`, `pipeline_stages`, `deal_activities` |
| `whatsapp.ts` | `whatsapp_*` |
| `inbox.ts` | unificação `contacts` + `whatsapp_conversations` + `whatsapp_messages` + `contact_activities` + `contact_comments` |
| `automation.ts`, `flow-builder.ts` | `automations`, `automation_runs`, `automation_run_steps`, `credentials`, `flow_webhooks` |
| `shopify.ts` | `shopify_*` |
| `campaigns.ts` | `whatsapp_campaigns`, `whatsapp_templates`, `whatsapp_segments` |
| `ai-agents.ts` | `ai_agents`, `ai_knowledge_*`, `ai_agent_actions`, `ai_usage_logs` |
| `facebook.ts` | `meta_ads_*` |
| `notifications.ts` | `notifications`, `notification_preferences` |
| `klaviyo.ts` | `klaviyo_accounts` |
| `store-analysis.ts` | `store_analyses` |
| `dashboard.ts`, `api.ts`, `ui-types.ts` | agregações e wrappers genéricos |
| `whatsapp-analytics.ts`, `whatsapp-ai-analytics.ts` | métricas |

---

## 16. Stores Zustand e Hooks

### 16.1 Stores (11 em `src/stores/`)

| Store | Persist | Estado | Notas |
|---|---|---|---|
| `authStore` | ❌ | user, isLoading, error | logout limpa demais stores |
| `crmStore` | ❌ | pipelines, deals, contacts | escopo org |
| `inboxStore` | ✅ `inbox-storage` (selectedNumberId, statusFilter) | conversas, mensagens, filtros, realtime handlers | computed selectors |
| `uiStore` | ✅ `worder-ui` | sidebar, theme, currentPage, _hasHydrated | evita hydration mismatch |
| `automationStore` | ❌ | automations + selected | |
| `flowStore` | devtools | nodes, edges, undo/redo, test execution | @xyflow/react |
| `whatsappStore` ★ NOVO | ❌ | conversations, messages, isConnected | estado local do inbox WA |
| `whatsappConfigStore` | ❌ | instances, queues, quickReplies, aiAgents, templates, businessHours | config centralizada |
| `storeStore` | ✅ `worder-stores` | shopify stores + currentStore | troca de loja |
| `PATCH-ShopifyStore-interface.ts` | — | tipos patch | — |
| `index.ts` | — | barrel export | — |

### 16.2 Hooks (51 em `src/hooks/`)

Categorias principais:
- **Auth/Org/Profile:** `useAuth`, `useCurrentOrganization`, `useProfile`, `useCapability`, `useAgentPermissions`
- **CRM:** `useContacts`, `useDeals`, `usePipelines`, `useCRMAnalytics`, `useCRMRealtime`, `useDealTimeTracking`, `useLeadDistribution`, `useLeadScoring`, `useTasks`, `useTickets`, `useSLA`
- **Inbox/WhatsApp:** `useInboxConversations`, `useInboxMessages`, `useInboxContact`, `useInboxRealtime`, `useScheduledMessages`, `useChatTemplates`, `useWhatsApp`, `useWhatsAppConnection`, `useWhatsAppConnectionManager`, `useWhatsAppRealtime`, `useWhatsAppAnalytics`, `useWhatsAppAIAnalytics`, `useQueue`
- **Automation/AI:** `useAutomations`, `useFlowBuilder`, `useAgent`, `useAgents`, `useAgentStatus`, `useCredentials`
- **Ads:** `useAds`, `useFacebookAds`, `useTikTokAds`
- **Utilitários:** `useFetch`, `useHeartbeat`, `useHydratedStoreId`, `useStore`, `useStoreApi`, `useReports`, `useAnalytics`, `useNotifications`, `useNPS`

---

## 17. Rotas API — Mapa Hierárquico

Total: **~456 rotas**. Organização por domínio:

```
/api/auth                       login, logout, change-password
/api/profile, /api/users        perfil e usuários
/api/me/capabilities            feature flags do user

/api/contacts                   CRUD + bulk/import/export/merge/stats/count
/api/contacts/[id]/             timeline, attachments, identity, shopify-events
/api/contact-activities         atividades

/api/deals                      CRUD + activities + history + forecast
/api/pipelines/[id]/automations  regras CRM + transitions + analytics
/api/crm/{pipelines,analytics}  helpers gerais

/api/whatsapp/                  ~80 endpoints (cloud, evolution, inbox, campaigns, agents, ai, analytics, templates)
/api/instagram/                 contas, conversas, mensagens, webhook

/api/email/                     campaigns, templates, saved-blocks, domains, product-feeds, tracking
/api/email/track/{open,click,record}
/api/email/{unsubscribe,test,render,brand-kit,sync-defaults,inbox-preview}
/api/deliverability/domain-check

/api/sms                        (via campaigns + sends)
/api/campaigns                  agregador (referencia email/whatsapp/sms)

/api/segments                   CRUD + members + count + preview + seed
/api/lists                      CRUD + members

/api/automations                CRUD + execute + test + clone-to-store + history + stats + variables
/api/automations/rules          regras

/api/forms                      CRUD + fields + events + submissions + embed
/api/public/forms/[id]          público (submit, script, preview, event)

/api/ai/agents                  CRUD + sources + actions + integrations + test
/api/ai/{process,respond,analyze-store,models,usage,knowledge,test}

/api/integrations/{meta,google,tiktok,shopify}  OAuth + callback
/api/integrations/{health,connected,installed,categories,status}
/api/meta/{accounts,campaigns,adsets,ads,insights,sync}

/api/shopify/                   ~45 endpoints (connect, sync, pixel, transition-rules, stores, analytics)
/api/webhooks/shopify/{,gdpr/*,test,bulk-finish}
/api/webhooks/{stripe,resend,klaviyo,flow/[token],custom-event,custom/[id],process-queue,[token]}

/api/webhooks-admin             subscriptions + deliveries (CRUD + test + replay + consent)

/api/workers                    11 workers (automation*, campaign, abandoned-cart, shopify-*, webhook-delivery, whatsapp-ai, process-events)
/api/cron                       23 cron handlers (ver Seção 9.1)

/api/analytics                  email, email-dashboard, deliverability, sales, rfm, google-ads, metrics/[metric]
/api/reports                    relatórios customizados
/api/dashboard                  overview + metrics

/api/products                   CRUD + shopify + costs
/api/orders                     listar
/api/recommendations/products   recomendações
/api/recovery                   campanhas + [id]

/api/settings                   organization, account, billing, api-keys, tracking, store-email, taxes, audit-logs, users
/api/billing/{checkout,portal}  Stripe

/api/notifications              CRUD + read-all + preferences
/api/tasks, /api/tickets        suporte
/api/chat-templates, /api/credentials, /api/custom-fields, /api/help

/api/track                      identify, event, /
/api/tracking                   events, shopify-webhook
/api/storefront/{loader.js, tracker.js, embed-ping}
/api/pixel/worder-pixel.js
/api/identity/resolve           visitor identity graph

/api/lgpd                       consents, data-requests, data-requests/verify, data-requests/[id]/process
/api/lead-scoring, /api/lead-distribution
/api/sla, /api/nps, /api/playbooks
/api/queue                      items, agents, assign, settings
/api/stores, /api/images, /api/content/{coupons,media}
/api/diagnostics                automation-trace, run-trace, checkout-trace, test-event, reprocess-checkouts, tracking
/api/debug                      gate via DEBUG_*_SECRET (debug-guard.ts)
/api/dev                        sync-debug, shopify-discovery
/api/unsubscribe/[id]
/api/t/{c,o}                    trackers compactos
```

---

## 18. Checklist de Integração SEM Conflito

Sempre que adicionar nova feature, percorra este checklist:

### 18.1 Banco

- [ ] A entidade já existe? Procure tabelas semelhantes na Seção 4.
- [ ] Se existe, **estenda** via `ALTER TABLE ADD COLUMN` em vez de criar paralela.
- [ ] Se não existe, crie em `supabase/migrations/YYYYMMDD_descricao.sql`. Padrão:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
  - `store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE` (se aplicável)
  - `created_at`, `updated_at timestamptz`
  - Indices em `organization_id` e FKs
  - `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
  - Policies seguindo padrão da Seção 6.4
  - Trigger genérico `update_updated_at_column` no `updated_at`

### 18.2 Constraints UNIQUE

- [ ] Quando o domínio for "upsertable" (Shopify orders, contacts, ads accounts), criar UNIQUE composto. Ver Seção 6.5.
- [ ] Para eventos, usar `idempotency_key` UNIQUE partial.

### 18.3 RPCs

- [ ] Operações atômicas (incrementos, locks, attribution) viram função `SECURITY DEFINER`.
- [ ] Para attribution, seguir o padrão idempotente das funções 20260513.
- [ ] Para workers, seguir o padrão lock_token + heartbeat de `claim_automation_run`.

### 18.4 Realtime

- [ ] Se frontend precisa ouvir, `ALTER PUBLICATION supabase_realtime ADD TABLE`.
- [ ] Subscriber filtra por `organization_id` + entidade.

### 18.5 Storage

- [ ] Path sempre `{organization_id}/...`.
- [ ] Bucket existente quando possível (avatars / email-images / contact-files / content-media).

### 18.6 Variáveis de ambiente

- [ ] Adicionar em `.env.example` com placeholder.
- [ ] Documentar nesta página (Seção 2).
- [ ] Adicionar em Vercel (Production + Preview).
- [ ] Worker container se necessário.
- [ ] Secret? Nunca `NEXT_PUBLIC_`.

### 18.7 Credenciais externas

- [ ] OAuth tokens / API keys em `credentials.credentials JSONB` (criptografado).
- [ ] Webhook secrets outbound em `webhook_subscriptions.secret_encrypted`.
- [ ] OAuth flow via `oauth_states` (10min TTL).

### 18.8 Cache

- [ ] Chaves prefixadas com domínio + `organization_id`.
- [ ] TTL definido em `CACHE_TTL`.
- [ ] Invalidar em writes.

### 18.9 Fila

- [ ] Operações > 3s ou com retry → `enqueueQStash` ou durable-queue.
- [ ] Worker em `/api/workers/<nome>/route.ts` valida QStash signature ou `CRON_SECRET`.
- [ ] Cron schedule em `vercel.json`.

### 18.10 Rotas API

- [ ] `getAuthClient()` no início (se requer auth).
- [ ] Filtrar por `organization_id` mesmo com RLS.
- [ ] `validateStoreAccess` se for por loja.
- [ ] Respostas via `successResponse`/`errorResponse`.

### 18.11 Frontend

- [ ] Tipo em `src/types/<dominio>.ts`.
- [ ] Hook em `src/hooks/use<Coisa>.ts`.
- [ ] Store Zustand (se precisar estado compartilhado entre componentes).
- [ ] Componentes em `src/components/<dominio>/`.

### 18.12 Webhooks (se externos)

- [ ] HMAC obrigatório via `validateWebhook`.
- [ ] Idempotência via `event_id` UNIQUE (ex: `shopify_webhook_audit.shopify_webhook_id`).
- [ ] Resolver `organization_id` via identificador externo.
- [ ] Persistir evento bruto antes de processar (auditoria + retry).
- [ ] Processamento pesado vai pra fila.

### 18.13 Attribution

- [ ] Se está enviando mensagem (email/whatsapp/sms), gravar em `*_sends` com FK para o disparo.
- [ ] Quando ordem fechar, chamar `attribute_*_conversion(...)` (idempotente).
- [ ] Para refunds, chamar `revoke_*_conversion`.

### 18.14 Identidade

- [ ] Eventos do storefront passam por `/api/identity/resolve` → `visitor_identities`.
- [ ] Match hierarchy: visitor_id > shopify_customer > email_hash > phone_hash > fingerprint.

### 18.15 LGPD

- [ ] Novas tabelas com PII entram em `lgpd_retention_policies`.
- [ ] Endpoints de export/delete via `/api/lgpd/data-requests`.

### 18.16 Tests mínimos

- [ ] Inserir registro de uma org → não aparece para outra.
- [ ] RLS funciona com `getAuthClient` (testar com cliente anon + token de outra org).
- [ ] Cron/worker autentica com `CRON_SECRET` válido.
- [ ] Webhook rejeita assinatura inválida.

---

## 19. Convenções e Pegadinhas

### 19.1 Schema

- **SQLs legados** em `_archive/sql/` — não use como referência canônica.
- **`MIGRATIONS-MVP-RODAR.sql`** na raiz é um arquivo consolidado (revisar antes de aplicar manualmente).
- Migrations em `supabase/migrations/` são a fonte canônica.
- Todas as migrations usam `IF NOT EXISTS` → safe re-rodar.

### 19.2 Inconsistências históricas

- `instagram_conversations.assigned_to` referencia "users" em SQLs antigos — deve apontar para `profiles(id)`.
- `automation_runs.trigger_event_id` é FK lógica para `contact_events.id` (não sempre física).
- Tabela `event_logs` é legacy; `contact_events` é primária.
- `customer_events` é VIEW sobre `contact_events` (backward compat).

### 19.3 NEXT_PUBLIC_EVOLUTION_API_KEY

- Existe em `WhatsAppConnectUnified.tsx`. Em produção **não defina** essa variável — o componente cai para fluxo server-side.

### 19.4 `.env.example` incompleto

- Lista só `WEBHOOK_SECRET_ENCRYPTION_KEY` e `CDN_IMAGES_DOMAIN`. Use a Seção 2 como referência real.

### 19.5 Idempotência

- **Sempre** preferir `upsert` com UNIQUE constraints sobre `select-then-insert`.
- Para eventos, popular `idempotency_key`.
- Para attribution, as funções 20260513 já são idempotentes — não duplique a lógica.

### 19.6 Pontos de partida rápida

| Cenário | Comece por |
|---|---|
| Nova integração externa | Seções 12, 13, 18 |
| Nova feature de Inbox | Seções 4.3, 10, 16 |
| Nova automação/trigger | Seções 4.7, 6.2 (RPCs), 9, 11.3 (EventBus) |
| Nova métrica/analytics | Seção 4.12 (CDP), criar `*_metrics` particionada |
| Nova action de IA | Seções 4.15, 8 (cache `emb:`), 6 (RPC `search_agent_knowledge`) |
| Novo bucket Storage | Seção 7 |
| Nova plataforma de Ads | Seção 4.13 (seguir padrão Google/Meta/TikTok) |
| Novo provider de SMS/Email/WA | Seção 4.4/4.5/4.3 (já existe estrutura `*_sends` com attribution) |

---

**Fim do documento.** Atualize esta página sempre que:
- Adicionar tabela / coluna / constraint / index
- Criar variável de ambiente
- Adicionar RPC/trigger/policy
- Habilitar tabela no Realtime
- Adicionar prefixo de cache Redis
- Adicionar worker/cron novo
- Quebrar contrato de uma tabela existente (ex: tipo de coluna)
