# Worder Cloud API — Guia de Deploy Manual

## Ordem de Execução

1. Rodar 9 blocos SQL no Supabase SQL Editor (em ordem)
2. Configurar ENV vars no Vercel (Preview + Production)
3. Deploy no Vercel
4. Configurar Meta Dashboard (webhook, fields, domains)
5. Setar ENABLE_ASYNC_WEBHOOK=false inicialmente, testar
6. Flipar ENABLE_ASYNC_WEBHOOK=true após confirmar
7. Habilitar feature flag whatsapp_embedded_signup por org
8. Rodar script de encriptação de tokens se migrar contas existentes

---

## 1. SQL Migrations (9 blocos, rodar em ordem)

| # | Arquivo | O que faz |
|---|---------|-----------|
| 1 | `supabase/migrations/20260522_organizations_feature_flags.sql` | feature_flags JSONB + connection_method |
| 2 | `supabase/migrations/20260522_whatsapp_access_token_encrypted.sql` | access_token_encrypted column |
| 3 | `supabase/migrations/20260522_whatsapp_webhook_events.sql` | Tabela webhook_events + claim/reprocess RPCs |
| 4 | `worder-cloud-api-fixes/01-migration-cloud-api-schema.sql` | **PRINCIPAL**: 5 tabelas, triggers, RPCs, RLS, Realtime |
| 5 | `worder-cloud-api-fixes/05A-inbox-unification.sql` | Views unificadas (inbox) + resolve_inbox_conversation |
| 6 | `worder-cloud-api-fixes/06-crons.sql` | 4 funções cron (windows, prune, stale, dead) |
| 7 | `worder-cloud-api-fixes/07-whatsapp-flows-schema.sql` | Flows: chaves RSA, whatsapp_cloud_flows, flow_events |
| 8 | `worder-cloud-api-fixes/08-solution-partner-billing.sql` | Billing: invoices, line_items, credits, geração mensal |
| 9 | `worder-cloud-api-fixes/09-whatsapp-alerts-table.sql` | whatsapp_alerts com dedup + RLS |

**Todos são idempotentes (IF NOT EXISTS). Podem ser re-executados sem risco.**

---

## 2. Environment Variables

### Novas (Cloud API):

| Variável | Onde obter |
|----------|-----------|
| `META_APP_ID` | Meta Dashboard > App > Settings > Basic > App ID |
| `META_APP_SECRET` | Mesmo lugar > App Secret > Show |
| `NEXT_PUBLIC_META_APP_ID` | Mesmo valor de META_APP_ID |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Gerar: `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Gerar: `openssl rand -base64 32` (se ja tem dados encriptados, NAO mude) |
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | Gerar: `openssl rand -base64 32` |
| `QSTASH_TOKEN` | Upstash Console > QStash > Token |
| `QSTASH_CURRENT_SIGNING_KEY` | Upstash Console > QStash > Signing Keys |
| `QSTASH_NEXT_SIGNING_KEY` | Upstash Console > QStash > Signing Keys |
| `CRON_SECRET` | Gerar: `openssl rand -hex 32` |
| `ENABLE_ASYNC_WEBHOOK` | Iniciar com `false`, flipar para `true` apos validar |

### Ja devem existir:

| Variável | Fonte |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard |
| `NEXT_PUBLIC_APP_URL` | URL do Vercel (sem trailing slash) |
| `UPSTASH_REDIS_REST_URL` | Upstash Console > Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console > Redis |

---

## 3. Meta Dashboard

### 3.1 Webhook Configuration
- URL: `https://<seu-dominio>/api/whatsapp/cloud/webhook`
- Verify Token: valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN

### 3.2 Webhook Fields (assinar todos):
- messages
- message_template_status_update
- message_template_quality_update
- template_category_update
- phone_number_quality_update
- phone_number_name_update
- account_update
- account_review_update
- business_capability_update

### 3.3 Facebook Login for Business > Settings:
- Allowed Domains: `https://<seu-dominio>`
- Valid OAuth Redirect URIs: `https://<seu-dominio>/api/whatsapp/cloud/embedded-signup`

### 3.4 Permissoes (Advanced Access):
- whatsapp_business_management
- whatsapp_business_messaging
- business_management

### 3.5 App em Live mode

---

## 4. Feature Flags (SQL por org)

```sql
-- Habilitar Embedded Signup para uma organizacao
UPDATE organizations
SET feature_flags = feature_flags || '{"whatsapp_embedded_signup": true}'::jsonb
WHERE id = '<ORGANIZATION_UUID>';
```

---

## 5. Token Encryption Backfill (se necessario)

```bash
ENCRYPTION_KEY=<sua-key> \
NEXT_PUBLIC_SUPABASE_URL=<sua-url> \
SUPABASE_SERVICE_ROLE_KEY=<sua-key> \
npx ts-node scripts/encrypt-whatsapp-tokens.ts --dry-run
```

Remover --dry-run para executar de verdade.

---

## 6. Crons (automaticos via vercel.json)

| Rota | Schedule | Funcao |
|------|----------|--------|
| /api/cron/reprocess-whatsapp-pending | * * * * * | Requeue webhook events |
| /api/cron/close-expired-whatsapp-windows | */10 * * * * | Fechar janelas 24h |
| /api/cron/reset-daily-whatsapp-counters | 0 0 * * * | Zerar contadores diarios |
| /api/cron/prune-whatsapp-webhook-events | 0 3 * * * | Limpar eventos antigos |
| /api/cron/whatsapp-resync-templates | */15 * * * * | Resync templates Meta |
| /api/cron/whatsapp-dead-alert | */15 * * * * | Alertar eventos mortos |
| /api/cron/whatsapp-quality-check | */30 * * * * | Checar quality rating |
