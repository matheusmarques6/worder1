-- ================================================
-- organizations.feature_flags
-- Plan: Sprint 1 / Fase 3 (Embedded Signup) — feature flag infra
-- ================================================
--
-- Lightweight feature flag mechanism. Keys are short strings,
-- values arbitrary JSON (booleans, percentages, configs).
--
-- Examples:
--   { "whatsapp_embedded_signup": true }
--   { "block_evolution_create": true }
--   { "whatsapp_flows_beta": { "rollout_percent": 25 } }
--
-- Read via src/lib/feature-flags.ts isFeatureEnabled(orgId, key).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_organizations_feature_flags
  ON organizations USING gin (feature_flags);

COMMENT ON COLUMN organizations.feature_flags IS
  'Per-tenant feature flags. Read via src/lib/feature-flags.ts. Boolean keys = simple on/off; object values allow rollouts or configs.';

-- ================================================
-- whatsapp_business_accounts.connection_method
-- ================================================
-- 'manual' (legacy token paste) | 'embedded_signup' (FB.login flow)
-- Used to distinguish onboarding source for analytics and UX hints.
ALTER TABLE whatsapp_business_accounts
  ADD COLUMN IF NOT EXISTS connection_method text DEFAULT 'manual'
    CHECK (connection_method IN ('manual', 'embedded_signup'));

COMMENT ON COLUMN whatsapp_business_accounts.connection_method IS
  'How the merchant onboarded this account: manual = legacy form; embedded_signup = FB.login flow (Sprint 1 / Fase 3).';
-- ================================================
-- WhatsApp access_token encryption at-rest
-- Plan: Sprint 1 / Fase 2 (token encryption)
-- ================================================
--
-- Two-step rollout to avoid downtime:
--   1. Add nullable column. Backfill via scripts/encrypt-whatsapp-tokens.ts.
--   2. After cutover (next release), DROP COLUMN access_token (separate
--      migration 20260523_whatsapp_drop_legacy_token.sql NOT included here).
--
-- Format: iv:authTag:ciphertext (hex), AES-256-GCM, key from ENCRYPTION_KEY env.
-- Mirrors src/lib/tiktok/token-manager.ts:80-130.

ALTER TABLE whatsapp_business_accounts
  ADD COLUMN IF NOT EXISTS access_token_encrypted text;

COMMENT ON COLUMN whatsapp_business_accounts.access_token_encrypted IS
  'AES-256-GCM encrypted access token (iv:authTag:ciphertext hex format). Read via src/lib/whatsapp/account-loader.ts getAccessToken().';

-- Also covers Evolution-shared table if both schemas coexist.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_instances' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE whatsapp_instances
      ADD COLUMN IF NOT EXISTS access_token_encrypted text;
    COMMENT ON COLUMN whatsapp_instances.access_token_encrypted IS
      'AES-256-GCM encrypted access token. Read via account-loader.';
  END IF;
END $$;
-- ================================================
-- WhatsApp Webhook Events — Async ingest queue
-- Plan: Sprint 1 / Fase 1 (ingest-fast / process-later)
-- ================================================
--
-- Raw payloads from Meta land here in <50ms (HMAC-verified),
-- then a QStash-triggered worker claims them atomically and runs
-- the heavy logic (contacts, conversations, RuleEngine).
--
-- Status lifecycle:
--   pending -> processing -> done
--                         -> failed (transient: cron reprocesses)
--                         -> dead   (exceeded max attempts)

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_phone_number_id text,
  raw_payload jsonb NOT NULL,
  signature text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  in_flight_until timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker lookup (claim pending or retry-eligible)
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_status_received
  ON whatsapp_webhook_events (status, received_at)
  WHERE status IN ('pending', 'failed');

-- Diagnostics by phone number
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_phone_number
  ON whatsapp_webhook_events (waba_phone_number_id)
  WHERE waba_phone_number_id IS NOT NULL;

-- Pruning helper
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_done_processed
  ON whatsapp_webhook_events (processed_at)
  WHERE status = 'done';

-- ================================================
-- claim_whatsapp_webhook_event: atomic claim with lease
-- ================================================
-- Mirrors claim_webhook_delivery() from 20260419_webhook_rpcs.sql.
-- Atomic: status -> 'processing', attempts++, lease 30s.
-- Returns the claimed row or empty set if not claimable.
CREATE OR REPLACE FUNCTION claim_whatsapp_webhook_event(p_id uuid)
RETURNS SETOF whatsapp_webhook_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_webhook_events
  SET
    status = 'processing',
    attempts = attempts + 1,
    in_flight_until = now() + interval '30 seconds',
    updated_at = now()
  WHERE id = p_id
    AND status IN ('pending', 'failed')
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND attempts < max_attempts
  RETURNING *;
END;
$$;

-- ================================================
-- pending_whatsapp_webhook_events_for_reprocess
-- ================================================
-- Cron picks events older than threshold still in pending/failed,
-- ignoring those currently leased. Returns ids the cron should
-- re-publish to QStash (worker will then claim atomically).
CREATE OR REPLACE FUNCTION pending_whatsapp_webhook_events_for_reprocess(
  p_older_than_seconds int DEFAULT 60,
  p_limit int DEFAULT 100
)
RETURNS SETOF whatsapp_webhook_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM whatsapp_webhook_events
  WHERE status IN ('pending', 'failed')
    AND attempts < max_attempts
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND received_at < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY received_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_whatsapp_webhook_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION pending_whatsapp_webhook_events_for_reprocess(int, int) TO service_role;

-- ================================================
-- RLS: service_role only (webhooks are internal)
-- ================================================
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_webhook_events_service_role ON whatsapp_webhook_events;
CREATE POLICY whatsapp_webhook_events_service_role ON whatsapp_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE whatsapp_webhook_events IS
  'Raw Meta WhatsApp webhook payloads queued for async processing. Ingested in <50ms by the webhook route, processed by /api/workers/whatsapp-webhook triggered via QStash.';
-- ============================================================
-- WORDER — WhatsApp Cloud API Schema (Fase 1)
--
-- Creates the 5 core tables referenced by TypeScript code:
--   1. whatsapp_business_accounts  (WABA + credentials + counters)
--   2. whatsapp_contacts           (WhatsApp-specific contact data)
--   3. whatsapp_cloud_conversations(Cloud API conversations)
--   4. whatsapp_cloud_messages     (Cloud API messages)
--   5. whatsapp_templates          (ALTER existing + add Cloud cols)
--
-- Also creates:
--   - whatsapp_webhook_events      (IF NOT EXISTS — already may exist)
--   - Trigger function for component extraction on templates
--   - RPC increment_template_usage
--   - RPC reset_daily_whatsapp_counters
--   - Generic touch_updated_at trigger function
--   - RLS policies (org-scoped + service_role bypass)
--   - Realtime publication for inbox tables
--
-- Idempotent: uses IF NOT EXISTS / OR REPLACE throughout.
-- ============================================================

-- ============================================================
-- 0. PREREQUISITES
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. whatsapp_business_accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_business_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Meta identifiers
  waba_id                 TEXT NOT NULL,
  phone_number_id         TEXT NOT NULL,
  business_id             TEXT,
  app_id                  TEXT,

  -- Display
  phone_number            TEXT,
  display_phone_number    TEXT,
  verified_name           TEXT,

  -- Credentials
  access_token            TEXT,
  access_token_encrypted  TEXT,

  -- Webhook
  webhook_verify_token    TEXT,
  webhook_configured      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Quality & limits
  quality_rating          TEXT NOT NULL DEFAULT 'UNKNOWN',
  messaging_limit         TEXT,
  throughput_level         TEXT,

  -- Account state
  status                  TEXT NOT NULL DEFAULT 'active',
  account_mode            TEXT NOT NULL DEFAULT 'LIVE',
  connection_method       TEXT NOT NULL DEFAULT 'manual',

  -- Counters
  messages_sent_today     INTEGER NOT NULL DEFAULT 0,
  messages_received_today INTEGER NOT NULL DEFAULT 0,
  total_messages_sent     BIGINT  NOT NULL DEFAULT 0,
  total_messages_received BIGINT  NOT NULL DEFAULT 0,

  -- Timestamps
  last_message_at         TIMESTAMPTZ,
  last_webhook_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- phone_number_id is the primary lookup key for webhook routing
CREATE UNIQUE INDEX IF NOT EXISTS idx_wba_phone_number_id
  ON whatsapp_business_accounts (phone_number_id);

CREATE INDEX IF NOT EXISTS idx_wba_org
  ON whatsapp_business_accounts (organization_id);

CREATE INDEX IF NOT EXISTS idx_wba_waba_id
  ON whatsapp_business_accounts (waba_id);

CREATE INDEX IF NOT EXISTS idx_wba_status
  ON whatsapp_business_accounts (organization_id, status);

-- ============================================================
-- 2. whatsapp_contacts
-- ============================================================
-- May already exist from legacy schema. CREATE IF NOT EXISTS
-- then ALTER to add any missing Cloud API columns.

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  phone_number            TEXT NOT NULL,
  name                    TEXT,
  profile_name            TEXT,
  profile_picture_url     TEXT,
  profile_picture         TEXT,

  source                  TEXT DEFAULT 'organic',
  crm_contact_id          UUID,

  is_blocked              BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason          TEXT,
  blocked_at              TIMESTAMPTZ,

  first_message_at        TIMESTAMPTZ,
  last_message_at         TIMESTAMPTZ,
  total_conversations     INTEGER NOT NULL DEFAULT 0,
  total_messages_received INTEGER NOT NULL DEFAULT 0,
  total_messages_sent     INTEGER NOT NULL DEFAULT 0,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure missing columns exist (idempotent)
DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS profile_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS profile_picture TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'organic';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS crm_contact_id UUID;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS total_conversations INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS total_messages_received INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS total_messages_sent INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wcontacts_org_phone
  ON whatsapp_contacts (organization_id, phone_number);

CREATE INDEX IF NOT EXISTS idx_wcontacts_crm
  ON whatsapp_contacts (crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wcontacts_blocked
  ON whatsapp_contacts (organization_id)
  WHERE is_blocked = TRUE;

-- ============================================================
-- 3. whatsapp_cloud_conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_cloud_conversations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- References
  waba_id                   UUID NOT NULL REFERENCES whatsapp_business_accounts(id) ON DELETE CASCADE,
  contact_id                UUID REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,

  -- WhatsApp identifiers
  wa_id                     TEXT NOT NULL,
  chat_id                   TEXT,

  -- Denormalized contact info (fast display)
  contact_name              TEXT,
  contact_phone             TEXT,
  profile_picture           TEXT,

  -- State
  status                    TEXT NOT NULL DEFAULT 'open',
  is_window_open            BOOLEAN NOT NULL DEFAULT FALSE,
  window_expires_at         TIMESTAMPTZ,

  -- Assignment
  assigned_to               UUID,
  labels                    TEXT[],

  -- Counters / previews
  unread_count              INTEGER NOT NULL DEFAULT 0,
  last_message_at           TIMESTAMPTZ,
  last_customer_message_at  TIMESTAMPTZ,
  last_message_preview      TEXT,
  last_message_direction    TEXT,

  -- Timestamps
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was created by a prior migration without them
DO $$ BEGIN
  ALTER TABLE whatsapp_cloud_conversations ADD COLUMN IF NOT EXISTS profile_picture TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE whatsapp_cloud_conversations ADD COLUMN IF NOT EXISTS labels TEXT[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE whatsapp_cloud_conversations ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE whatsapp_cloud_conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE whatsapp_cloud_conversations ADD COLUMN IF NOT EXISTS last_message_direction TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wcc_waba_waid
  ON whatsapp_cloud_conversations (waba_id, wa_id);

CREATE INDEX IF NOT EXISTS idx_wcc_org_status
  ON whatsapp_cloud_conversations (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_wcc_org_last_msg
  ON whatsapp_cloud_conversations (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_wcc_contact
  ON whatsapp_cloud_conversations (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wcc_assigned
  ON whatsapp_cloud_conversations (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wcc_unread
  ON whatsapp_cloud_conversations (organization_id)
  WHERE unread_count > 0;

-- ============================================================
-- 4. whatsapp_cloud_messages
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_cloud_messages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- References
  waba_id                 UUID NOT NULL REFERENCES whatsapp_business_accounts(id) ON DELETE CASCADE,
  conversation_id         UUID REFERENCES whatsapp_cloud_conversations(id) ON DELETE SET NULL,

  -- WhatsApp message identifier (Meta's wamid)
  message_id              TEXT NOT NULL,

  -- Routing
  direction               TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number             TEXT,
  to_number               TEXT,

  -- Content
  message_type            TEXT NOT NULL DEFAULT 'text',
  content                 JSONB,
  text_body               TEXT,
  caption                 TEXT,
  media_id                TEXT,
  template_name           TEXT,

  -- Status lifecycle: received/sent → delivered → read → failed
  status                  TEXT NOT NULL DEFAULT 'pending',
  error_code              TEXT,
  error_message           TEXT,

  -- Meta conversation/pricing data (from status webhooks)
  conversation_id_meta    TEXT,
  conversation_category   TEXT,
  pricing_billable        BOOLEAN,
  pricing_category        TEXT,
  pricing_model           TEXT,

  -- Timestamps
  timestamp               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wcm_message_id
  ON whatsapp_cloud_messages (message_id);

CREATE INDEX IF NOT EXISTS idx_wcm_conversation
  ON whatsapp_cloud_messages (conversation_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_wcm_org
  ON whatsapp_cloud_messages (organization_id);

CREATE INDEX IF NOT EXISTS idx_wcm_status
  ON whatsapp_cloud_messages (status)
  WHERE status IN ('pending', 'sent', 'failed');

CREATE INDEX IF NOT EXISTS idx_wcm_direction
  ON whatsapp_cloud_messages (conversation_id, direction);

-- ============================================================
-- 5. whatsapp_templates — ALTER existing table
-- ============================================================
-- The table already exists (from complete-schema.sql) with:
--   id, organization_id, whatsapp_account_id, wa_template_id, name,
--   language, category, status, header_type, header_content,
--   body_text, footer_text, buttons, variables, created_at, updated_at
--
-- We ADD Cloud API columns the TypeScript code expects.

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS waba_id UUID REFERENCES whatsapp_business_accounts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS template_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS meta_template_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS components JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS quality_score JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS category_change_history JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS last_category_change_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- body_text already exists; make sure header_text and header_type are present
DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS header_text TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS header_media_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS body_variables INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS times_sent BIGINT NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS use_count BIGINT NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS variables_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Unique constraint for upsert on sync (waba_id, name, language)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_wt_waba_name_lang'
  ) THEN
    ALTER TABLE whatsapp_templates
      ADD CONSTRAINT uq_wt_waba_name_lang UNIQUE (waba_id, name, language);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Unique constraint uq_wt_waba_name_lang could not be created: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_wt_org
  ON whatsapp_templates (organization_id);

CREATE INDEX IF NOT EXISTS idx_wt_waba
  ON whatsapp_templates (waba_id)
  WHERE waba_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wt_status
  ON whatsapp_templates (status);

CREATE INDEX IF NOT EXISTS idx_wt_org_status
  ON whatsapp_templates (organization_id, status);

-- ============================================================
-- 6. whatsapp_webhook_events (IF NOT EXISTS — may already exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_phone_number_id    TEXT,
  raw_payload             JSONB NOT NULL,
  signature               TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts                INTEGER NOT NULL DEFAULT 0,
  max_attempts            INTEGER NOT NULL DEFAULT 5,
  last_error              TEXT,
  in_flight_until         TIMESTAMPTZ,
  received_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wwe_status_received
  ON whatsapp_webhook_events (status, received_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_wwe_phone
  ON whatsapp_webhook_events (waba_phone_number_id)
  WHERE waba_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wwe_done_processed
  ON whatsapp_webhook_events (processed_at)
  WHERE status = 'done';

-- ============================================================
-- 7. TRIGGER: touch_updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON whatsapp_business_accounts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON whatsapp_contacts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON whatsapp_cloud_conversations
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON whatsapp_cloud_messages
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON whatsapp_webhook_events
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 8. TRIGGER: Extract components from whatsapp_templates
-- ============================================================
-- When components JSONB is set (via Meta sync or direct insert),
-- auto-extract header_type, header_text, body_text, body_variables,
-- footer_text from the components array.

CREATE OR REPLACE FUNCTION whatsapp_templates_extract_components()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  comp       JSONB;
  comp_type  TEXT;
  var_count  INTEGER := 0;
BEGIN
  IF NEW.components IS NULL OR jsonb_array_length(NEW.components) = 0 THEN
    RETURN NEW;
  END IF;

  FOR comp IN SELECT * FROM jsonb_array_elements(NEW.components)
  LOOP
    comp_type := upper(comp ->> 'type');

    IF comp_type = 'HEADER' THEN
      NEW.header_type := coalesce(comp ->> 'format', 'TEXT');
      NEW.header_text := comp ->> 'text';
    ELSIF comp_type = 'BODY' THEN
      NEW.body_text := comp ->> 'text';
      -- Count {{n}} placeholders
      IF NEW.body_text IS NOT NULL THEN
        SELECT count(*)::INTEGER INTO var_count
        FROM regexp_matches(NEW.body_text, '\{\{\d+\}\}', 'g');
        NEW.body_variables := var_count;
        NEW.variables_count := var_count;
      END IF;
    ELSIF comp_type = 'FOOTER' THEN
      NEW.footer_text := comp ->> 'text';
    ELSIF comp_type = 'BUTTONS' THEN
      NEW.buttons := comp -> 'buttons';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Drop and recreate to ensure both INSERT and UPDATE are covered
DROP TRIGGER IF EXISTS trg_wt_extract_components ON whatsapp_templates;

CREATE TRIGGER trg_wt_extract_components
  BEFORE INSERT OR UPDATE OF components ON whatsapp_templates
  FOR EACH ROW
  WHEN (NEW.components IS NOT NULL)
  EXECUTE FUNCTION whatsapp_templates_extract_components();

-- ============================================================
-- 9. RPC: increment_whatsapp_template_usage
-- ============================================================
-- Named differently from the automation_templates version to avoid
-- CREATE OR REPLACE overwriting the existing increment_template_usage.

CREATE OR REPLACE FUNCTION increment_whatsapp_template_usage(p_template_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE whatsapp_templates
  SET
    use_count  = use_count + 1,
    times_sent = times_sent + 1,
    last_used_at = now(),
    updated_at   = now()
  WHERE id = p_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_whatsapp_template_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_whatsapp_template_usage(UUID) TO service_role;

-- ============================================================
-- 10. RPC: reset_daily_whatsapp_counters
-- ============================================================
-- Called by a daily cron (midnight UTC) to zero out *_today counters.

CREATE OR REPLACE FUNCTION reset_daily_whatsapp_counters()
RETURNS TABLE(accounts_reset BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  UPDATE whatsapp_business_accounts
  SET
    messages_sent_today     = 0,
    messages_received_today = 0,
    updated_at              = now()
  WHERE messages_sent_today > 0 OR messages_received_today > 0;

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_daily_whatsapp_counters() TO service_role;

-- ============================================================
-- 11. RLS — Enable + Policies
-- ============================================================

ALTER TABLE whatsapp_business_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_cloud_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_cloud_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates            ENABLE ROW LEVEL SECURITY;

-- Helper: apply standard org-scoped + service_role policies
-- Uses profiles subquery instead of auth.organization_id() for Supabase compatibility
DO $$
DECLARE
  t TEXT;
  org_check TEXT := '(SELECT organization_id FROM public.profiles WHERE id = auth.uid())';
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'whatsapp_business_accounts',
    'whatsapp_contacts',
    'whatsapp_cloud_conversations',
    'whatsapp_cloud_messages',
    'whatsapp_templates'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_org_select" ON %I', t, t);
    EXECUTE format('
      CREATE POLICY "%s_org_select" ON %I
      FOR SELECT USING (organization_id = %s)', t, t, org_check);

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_insert" ON %I', t, t);
    EXECUTE format('
      CREATE POLICY "%s_org_insert" ON %I
      FOR INSERT WITH CHECK (organization_id = %s)', t, t, org_check);

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_update" ON %I', t, t);
    EXECUTE format('
      CREATE POLICY "%s_org_update" ON %I
      FOR UPDATE
      USING (organization_id = %s)
      WITH CHECK (organization_id = %s)', t, t, org_check, org_check);

    EXECUTE format('DROP POLICY IF EXISTS "%s_org_delete" ON %I', t, t);
    EXECUTE format('
      CREATE POLICY "%s_org_delete" ON %I
      FOR DELETE USING (organization_id = %s)', t, t, org_check);

    EXECUTE format('DROP POLICY IF EXISTS "%s_service_role" ON %I', t, t);
    EXECUTE format('
      CREATE POLICY "%s_service_role" ON %I
      FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END;
$$;

-- webhook_events: service_role only (already handled in its own migration,
-- but ensure it's set if the table was just created here)
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_webhook_events_service_role ON whatsapp_webhook_events;
CREATE POLICY whatsapp_webhook_events_service_role ON whatsapp_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 12. REALTIME PUBLICATION
-- ============================================================
-- Publish conversation/message/template changes for live inbox.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'whatsapp_cloud_conversations',
    'whatsapp_cloud_messages',
    'whatsapp_templates'
  ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 13. Webhook event RPCs (self-contained — OR REPLACE is safe
--     if 20260522_whatsapp_webhook_events.sql already ran)
-- ============================================================

-- Atomic claim with 30-second lease. Worker calls this to
-- grab an event for processing; prevents double-processing.
CREATE OR REPLACE FUNCTION claim_whatsapp_webhook_event(p_id UUID)
RETURNS SETOF whatsapp_webhook_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_webhook_events
  SET
    status          = 'processing',
    attempts        = attempts + 1,
    in_flight_until = now() + interval '30 seconds',
    updated_at      = now()
  WHERE id = p_id
    AND status IN ('pending', 'failed')
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND attempts < max_attempts
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_whatsapp_webhook_event(UUID) TO service_role;

-- Cron picks events older than threshold still in pending/failed,
-- ignoring those currently leased. Returns rows the cron should
-- re-publish to QStash (worker will then claim atomically).
CREATE OR REPLACE FUNCTION pending_whatsapp_webhook_events_for_reprocess(
  p_older_than_seconds INT DEFAULT 60,
  p_limit INT DEFAULT 100
)
RETURNS SETOF whatsapp_webhook_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM whatsapp_webhook_events
  WHERE status IN ('pending', 'failed')
    AND attempts < max_attempts
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND received_at < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY received_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION pending_whatsapp_webhook_events_for_reprocess(INT, INT) TO service_role;

-- ============================================================
-- DONE
-- ============================================================
-- NOTE (Fase 2 fix needed): automations/templates/route.ts:128
-- calls increment_template_usage with { template_id } but the
-- SQL parameter is p_template_id. template-manager.ts:444 uses
-- the correct name. Fix the automations route in Fase 2.
SELECT 'Cloud API schema migration complete' AS resultado;
-- ============================================================
-- WORDER — Inbox Unification Views (Fase 1)
--
-- Creates unified views that merge legacy (Evolution/QR)
-- conversations/messages with Cloud API conversations/messages.
-- The TypeScript inbox components can query a single view instead
-- of deciding which table to hit.
--
-- Objects created:
--   - whatsapp_inbox_conversations  (VIEW)
--   - whatsapp_inbox_messages       (VIEW)
--   - resolve_inbox_conversation    (RPC)
--   - "provider" column on legacy tables (idempotent)
--
-- Idempotent: uses CREATE OR REPLACE / IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- 1. Add "provider" column to legacy tables
-- ============================================================
-- The unified view uses provider='evolution' vs provider='cloud'
-- to identify the source. Legacy rows default to 'evolution'.

DO $$ BEGIN
  ALTER TABLE whatsapp_conversations
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_conversations does not exist — skipping provider column';
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_messages does not exist — skipping provider column';
  WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 2. VIEW: whatsapp_inbox_conversations
-- ============================================================
-- Union of legacy whatsapp_conversations + whatsapp_cloud_conversations.
-- Both sides are coerced to a common column set.

CREATE OR REPLACE VIEW whatsapp_inbox_conversations AS

-- Cloud API conversations
SELECT
  c.id,
  c.organization_id,
  'cloud'::TEXT                         AS provider,
  c.waba_id                             AS account_id,
  c.contact_id,
  c.wa_id                               AS phone_number,
  c.chat_id,
  c.contact_name,
  c.contact_phone,
  c.profile_picture,
  c.status,
  c.is_window_open,
  c.window_expires_at,
  c.assigned_to,
  c.unread_count,
  c.last_message_at,
  c.last_customer_message_at,
  c.last_message_preview,
  c.last_message_direction,
  c.created_at,
  c.updated_at
FROM whatsapp_cloud_conversations c

UNION ALL

-- Legacy Evolution conversations
SELECT
  lc.id,
  lc.organization_id,
  'evolution'::TEXT                      AS provider,
  NULL::UUID                             AS account_id,
  lc.contact_id,
  lc.phone_number,
  NULL::TEXT                             AS chat_id,
  lc.contact_name,
  lc.phone_number                       AS contact_phone,
  NULL::TEXT                             AS profile_picture,
  lc.status,
  FALSE                                  AS is_window_open,
  NULL::TIMESTAMPTZ                      AS window_expires_at,
  lc.assigned_to,
  COALESCE(lc.unread_count, 0)           AS unread_count,
  lc.last_message_at,
  NULL::TIMESTAMPTZ                     AS last_customer_message_at,
  lc.last_message_preview,
  NULL::TEXT                             AS last_message_direction,
  lc.created_at,
  lc.updated_at
FROM whatsapp_conversations lc;

-- ============================================================
-- 3. VIEW: whatsapp_inbox_messages
-- ============================================================
-- NOTE: Legacy whatsapp_messages does NOT have organization_id.
-- We JOIN through whatsapp_conversations to obtain it.
-- Legacy content is plain TEXT, not JSONB — we wrap it safely.

CREATE OR REPLACE VIEW whatsapp_inbox_messages AS

-- Cloud API messages
SELECT
  m.id,
  m.organization_id,
  'cloud'::TEXT                          AS provider,
  m.conversation_id,
  m.message_id,
  m.message_id                           AS wa_message_id,
  m.direction,
  m.message_type,
  m.content,
  m.text_body,
  m.caption,
  m.media_id,
  NULL::TEXT                              AS media_url,
  NULL::TEXT                              AS media_filename,
  NULL::TEXT                              AS media_mime_type,
  m.template_name,
  m.status,
  m.error_code,
  m.error_message,
  FALSE                                   AS sent_by_bot,
  NULL::TIMESTAMPTZ                       AS delivered_at,
  NULL::TIMESTAMPTZ                       AS read_at,
  m.timestamp                            AS sent_at,
  m.created_at
FROM whatsapp_cloud_messages m

UNION ALL

-- Legacy Evolution messages (JOIN to get organization_id)
-- Uses only columns guaranteed to exist in the base whatsapp_messages table
SELECT
  lm.id,
  lc.organization_id,
  'evolution'::TEXT                       AS provider,
  lm.conversation_id,
  lm.id::TEXT                            AS message_id,
  lm.id::TEXT                            AS wa_message_id,
  'inbound'::TEXT                        AS direction,
  'text'::TEXT                           AS message_type,
  lm.content::JSONB                      AS content,
  CASE
    WHEN lm.content IS NOT NULL THEN lm.content::TEXT
    ELSE ''
  END                                    AS text_body,
  NULL::TEXT                              AS caption,
  NULL::TEXT                              AS media_id,
  NULL::TEXT                              AS media_url,
  NULL::TEXT                              AS media_filename,
  NULL::TEXT                              AS media_mime_type,
  NULL::TEXT                              AS template_name,
  'sent'::TEXT                           AS status,
  NULL::TEXT                              AS error_code,
  NULL::TEXT                              AS error_message,
  FALSE                                   AS sent_by_bot,
  NULL::TIMESTAMPTZ                       AS delivered_at,
  NULL::TIMESTAMPTZ                       AS read_at,
  lm.created_at                          AS sent_at,
  lm.created_at
FROM whatsapp_messages lm
JOIN whatsapp_conversations lc ON lc.id = lm.conversation_id;

-- ============================================================
-- 4. RPC: resolve_inbox_conversation
-- ============================================================
-- Sets conversation status='closed' in the correct underlying table,
-- regardless of provider. Returns the updated row count.

CREATE OR REPLACE FUNCTION resolve_inbox_conversation(
  p_conversation_id UUID,
  p_resolved_by     UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  affected INTEGER := 0;
  cloud_found BOOLEAN;
BEGIN
  -- Try Cloud API table first
  UPDATE whatsapp_cloud_conversations
  SET status = 'closed', updated_at = now()
  WHERE id = p_conversation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected > 0 THEN
    RETURN affected;
  END IF;

  -- Fall back to legacy table
  UPDATE whatsapp_conversations
  SET
    status      = 'closed',
    resolved_at = now(),
    resolved_by = p_resolved_by,
    updated_at  = now()
  WHERE id = p_conversation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_inbox_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_inbox_conversation(UUID, UUID) TO service_role;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Inbox unification views created' AS resultado;
-- ============================================================
-- WORDER — Cron SQL Functions (Fase 1)
--
-- Pure-SQL functions called by QStash / Vercel Cron / pg_cron.
-- Each is idempotent and safe to call at any frequency.
--
-- Functions created:
--   1. close_expired_whatsapp_windows()
--   2. prune_whatsapp_webhook_events()
--   3. stale_pending_templates(threshold_minutes)
--   4. dead_whatsapp_events_summary(age_interval)
--
-- Idempotent: uses CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- 1. close_expired_whatsapp_windows
-- ============================================================
-- Closes the 24-hour messaging window on Cloud API conversations
-- where window_expires_at has passed but is_window_open is still TRUE.
-- Returns count of conversations updated.

CREATE OR REPLACE FUNCTION close_expired_whatsapp_windows()
RETURNS TABLE(conversations_closed BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  UPDATE whatsapp_cloud_conversations
  SET
    is_window_open = FALSE,
    updated_at     = now()
  WHERE is_window_open = TRUE
    AND window_expires_at IS NOT NULL
    AND window_expires_at < now();

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION close_expired_whatsapp_windows() TO service_role;

-- ============================================================
-- 2. prune_whatsapp_webhook_events
-- ============================================================
-- Deletes successfully-processed webhook events older than 7 days.
-- Keeps failed/dead events for debugging.
-- Returns count of events pruned.

CREATE OR REPLACE FUNCTION prune_whatsapp_webhook_events()
RETURNS TABLE(events_pruned BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  DELETE FROM whatsapp_webhook_events
  WHERE status = 'done'
    AND processed_at < now() - interval '7 days';

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION prune_whatsapp_webhook_events() TO service_role;

-- ============================================================
-- 3. stale_pending_templates
-- ============================================================
-- Returns templates stuck in PENDING status longer than threshold.
-- Useful for alerting: "these templates may have been rejected
-- silently by Meta or the webhook missed the status update."

CREATE OR REPLACE FUNCTION stale_pending_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id  UUID,
  name         TEXT,
  language     TEXT,
  waba_id      UUID,
  created_at   TIMESTAMPTZ,
  age_minutes  DOUBLE PRECISION
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.waba_id,
    t.created_at,
    EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0 AS age_minutes
  FROM whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION stale_pending_templates(INTEGER) TO service_role;

-- ============================================================
-- 4. dead_whatsapp_events_summary
-- ============================================================
-- Returns a per-phone-number summary of webhook events that are
-- stuck (dead or failed beyond max_attempts) within a recent window.
-- Used by the ops dashboard / alerting cron.

CREATE OR REPLACE FUNCTION dead_whatsapp_events_summary(
  p_since INTERVAL DEFAULT '15 minutes'::interval
)
RETURNS TABLE(
  phone_number_id TEXT,
  dead_count      BIGINT,
  failed_count    BIGINT,
  oldest_event    TIMESTAMPTZ,
  newest_event    TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.waba_phone_number_id          AS phone_number_id,
    count(*) FILTER (WHERE e.status = 'dead')   AS dead_count,
    count(*) FILTER (WHERE e.status = 'failed'
                       AND e.attempts >= e.max_attempts) AS failed_count,
    min(e.received_at)              AS oldest_event,
    max(e.received_at)              AS newest_event
  FROM whatsapp_webhook_events e
  WHERE e.status IN ('dead', 'failed')
    AND e.received_at > now() - p_since
  GROUP BY e.waba_phone_number_id
  ORDER BY dead_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION dead_whatsapp_events_summary(INTERVAL) TO service_role;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Cron functions created' AS resultado;
-- ============================================================
-- WORDER — WhatsApp Flows Schema (Fase 6 — Bloco A)
--
-- Adds:
--   1. ALTER whatsapp_business_accounts — flow encryption key columns
--   2. CREATE TABLE whatsapp_cloud_flows — Meta-managed Flow definitions
--   3. CREATE TABLE whatsapp_flow_events — interaction event tracking
--   4. ALTER whatsapp_flows — add Meta-specific columns (bot-builder compat)
--   5. Indexes, RLS policies, realtime publication
--
-- Idempotent: uses IF NOT EXISTS / DO $$ blocks throughout.
-- ============================================================

-- ============================================================
-- 1. ALTER whatsapp_business_accounts — Flow key columns
-- ============================================================

ALTER TABLE whatsapp_business_accounts
  ADD COLUMN IF NOT EXISTS flow_public_key_pem TEXT,
  ADD COLUMN IF NOT EXISTS flow_private_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS flow_key_uploaded_at TIMESTAMPTZ;

-- Legacy column compat (used by existing setup-flows route check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_business_accounts'
    AND column_name = 'flow_public_key_uploaded'
  ) THEN
    ALTER TABLE whatsapp_business_accounts
      ADD COLUMN flow_public_key_uploaded BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_business_accounts'
    AND column_name = 'flow_keys_created_at'
  ) THEN
    ALTER TABLE whatsapp_business_accounts
      ADD COLUMN flow_keys_created_at TIMESTAMPTZ;
  END IF;
END
$$;

-- ============================================================
-- 2. whatsapp_cloud_flows — Meta-managed Flow definitions
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_cloud_flows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  waba_id           UUID NOT NULL REFERENCES whatsapp_business_accounts(id) ON DELETE CASCADE,
  meta_flow_id      TEXT,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PUBLISHED','DEPRECATED','BLOCKED','THROTTLED')),
  flow_json         JSONB NOT NULL DEFAULT '{}',
  flow_type         TEXT NOT NULL DEFAULT 'STATIC'
    CHECK (flow_type IN ('STATIC','DYNAMIC')),
  times_sent        BIGINT NOT NULL DEFAULT 0,
  times_completed   BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(waba_id, meta_flow_id)
);

-- ============================================================
-- 3. whatsapp_flow_events — Interaction event tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_flow_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id           UUID REFERENCES whatsapp_cloud_flows(id) ON DELETE CASCADE,
  contact_phone     TEXT NOT NULL DEFAULT '',
  flow_token        TEXT NOT NULL DEFAULT '',
  event_type        TEXT NOT NULL CHECK (event_type IN ('started','screen_completed','completed','abandoned')),
  screen            TEXT,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Denormalized columns for backward compatibility with existing route
  account_id        UUID REFERENCES whatsapp_business_accounts(id) ON DELETE CASCADE,
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  action            TEXT,
  request_data      JSONB,
  response_data     JSONB,
  phone_number      TEXT,
  error_message     TEXT,
  processing_ms     INTEGER
);

-- ============================================================
-- 4. ALTER whatsapp_flows — Meta-specific columns (bot-builder compat)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'meta_flow_id'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN meta_flow_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'account_id'
  ) THEN
    ALTER TABLE whatsapp_flows
      ADD COLUMN account_id UUID REFERENCES whatsapp_business_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'flow_json'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN flow_json JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'category'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN category TEXT DEFAULT 'OTHER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'meta_status'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN meta_status TEXT DEFAULT 'DRAFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'endpoint_url'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN endpoint_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'template_slug'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN template_slug TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'total_starts'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN total_starts BIGINT NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_flows'
    AND column_name = 'total_completions'
  ) THEN
    ALTER TABLE whatsapp_flows ADD COLUMN total_completions BIGINT NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- ============================================================
-- 5. Indexes
-- ============================================================

-- whatsapp_cloud_flows indexes
CREATE INDEX IF NOT EXISTS idx_wcf_org ON whatsapp_cloud_flows(organization_id);
CREATE INDEX IF NOT EXISTS idx_wcf_waba ON whatsapp_cloud_flows(waba_id);

-- whatsapp_flow_events indexes
CREATE INDEX IF NOT EXISTS idx_wcfe_flow ON whatsapp_flow_events(flow_id);
CREATE INDEX IF NOT EXISTS idx_wcfe_token ON whatsapp_flow_events(flow_token);

-- Legacy whatsapp_flows indexes (table may not exist)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_wf_meta_flow_id
    ON whatsapp_flows (meta_flow_id)
    WHERE meta_flow_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_wf_account_id
    ON whatsapp_flows (account_id)
    WHERE account_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- whatsapp_flow_events compat indexes
CREATE INDEX IF NOT EXISTS idx_wfe_org_created
  ON whatsapp_flow_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wfe_account_action
  ON whatsapp_flow_events (account_id, action);

-- ============================================================
-- 6. RLS Policies
-- ============================================================

ALTER TABLE whatsapp_cloud_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_flow_events ENABLE ROW LEVEL SECURITY;

-- whatsapp_cloud_flows: service_role bypass
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_cloud_flows' AND policyname = 'service_role_all_cloud_flows'
  ) THEN
    CREATE POLICY service_role_all_cloud_flows ON whatsapp_cloud_flows
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- whatsapp_cloud_flows: org-scoped read for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_cloud_flows' AND policyname = 'org_read_cloud_flows'
  ) THEN
    CREATE POLICY org_read_cloud_flows ON whatsapp_cloud_flows
      FOR SELECT TO authenticated
      USING (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      );
  END IF;
END
$$;

-- whatsapp_flow_events: service_role bypass
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_flow_events' AND policyname = 'service_role_all_flow_events'
  ) THEN
    CREATE POLICY service_role_all_flow_events ON whatsapp_flow_events
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- whatsapp_flow_events: org-scoped read for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_flow_events' AND policyname = 'org_read_flow_events'
  ) THEN
    CREATE POLICY org_read_flow_events ON whatsapp_flow_events
      FOR SELECT TO authenticated
      USING (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      );
  END IF;
END
$$;

-- ============================================================
-- 7. RPC — Increment flow counters (works for both tables)
-- ============================================================

CREATE OR REPLACE FUNCTION increment_flow_counter(
  p_flow_id UUID,
  p_column TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_column = 'total_starts' THEN
    UPDATE whatsapp_flows SET total_starts = total_starts + 1 WHERE id = p_flow_id;
  ELSIF p_column = 'total_completions' THEN
    UPDATE whatsapp_flows SET total_completions = total_completions + 1 WHERE id = p_flow_id;
  ELSIF p_column = 'times_sent' THEN
    UPDATE whatsapp_cloud_flows SET times_sent = times_sent + 1 WHERE id = p_flow_id;
  ELSIF p_column = 'times_completed' THEN
    UPDATE whatsapp_cloud_flows SET times_completed = times_completed + 1 WHERE id = p_flow_id;
  END IF;
END;
$$;

-- ============================================================
-- 8. Realtime publication
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_flow_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_flow_events;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_cloud_flows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_cloud_flows;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END
$$;
-- ============================================================
-- WORDER — Solution Partner Billing Schema (Fase 7)
--
-- Prepara o schema de billing para o modelo Solution Partner:
--   1. ALTER organizations — colunas de billing model
--   2. CREATE TABLE billing_invoices — faturas mensais
--   3. CREATE TABLE billing_line_items — itens por categoria
--   4. CREATE TABLE billing_credits — controle de créditos Meta
--   5. Functions para geração mensal de faturas
--   6. RLS policies
--
-- Idempotent: uses IF NOT EXISTS / DO $$ blocks throughout.
-- ============================================================


-- ============================================================
-- 1. ALTER organizations — Billing model columns
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'flat'
    CHECK (billing_model IN ('flat', 'markup', 'hybrid', 'custom'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS message_markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credit_limit_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credit_used_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_currency TEXT NOT NULL DEFAULT 'BRL'
    CHECK (billing_currency IN ('BRL', 'USD', 'MXN', 'COP'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_email TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- Constraint: credit_used cannot exceed limit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_credit_within_limit'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT chk_credit_within_limit
      CHECK (credit_used_usd <= credit_limit_usd + 100);  -- USD 100 buffer para race conditions
  END IF;
END $$;


-- ============================================================
-- 2. billing_invoices — Faturas mensais por organização
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Período
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  invoice_number  TEXT UNIQUE,

  -- Valores
  subtotal_usd    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tax_usd         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_usd       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_applied  NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_due_usd  NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  -- Conversão para moeda local
  exchange_rate   NUMERIC(10,4),
  total_local     NUMERIC(12,2),
  currency        TEXT NOT NULL DEFAULT 'BRL',

  -- Status
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),

  -- Pagamento
  paid_at         TIMESTAMPTZ,
  payment_method  TEXT,
  payment_ref     TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date        DATE,

  -- Metadata
  notes           TEXT,
  metadata        JSONB DEFAULT '{}'::JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org
  ON billing_invoices(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_period
  ON billing_invoices(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
  ON billing_invoices(status);

-- Updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_billing_invoices_updated_at'
  ) THEN
    CREATE TRIGGER trg_billing_invoices_updated_at
      BEFORE UPDATE ON billing_invoices
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;


-- ============================================================
-- 3. billing_line_items — Itens de cobrança por categoria
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Categoria de mensagem (alinha com pricing Meta)
  category        TEXT NOT NULL
    CHECK (category IN (
      'marketing',
      'utility',
      'authentication',
      'service',
      'platform_fee',
      'flows',
      'ai_usage',
      'overage',
      'addon',
      'discount',
      'other'
    )),

  -- Descrição legível
  description     TEXT NOT NULL,

  -- Quantidades
  quantity        INT NOT NULL DEFAULT 0,
  unit_cost_usd   NUMERIC(10,6) NOT NULL DEFAULT 0.000000,
  meta_cost_usd   NUMERIC(12,2) NOT NULL DEFAULT 0.00,  -- custo Meta puro
  markup_pct      NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  total_usd       NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  -- Período de referência
  period_start    DATE,
  period_end      DATE,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_invoice
  ON billing_line_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_org
  ON billing_line_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_category
  ON billing_line_items(category);


-- ============================================================
-- 4. billing_credits — Controle de créditos Meta
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Tipo de crédito
  credit_type     TEXT NOT NULL DEFAULT 'meta_partner'
    CHECK (credit_type IN ('meta_partner', 'promotional', 'refund', 'manual')),

  -- Valores
  amount_usd      NUMERIC(12,2) NOT NULL,
  remaining_usd   NUMERIC(12,2) NOT NULL,

  -- Validade
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,

  -- Referência
  description     TEXT,
  granted_by      UUID,  -- user_id que concedeu
  invoice_id      UUID REFERENCES billing_invoices(id),

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_credits_org
  ON billing_credits(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_credits_expires
  ON billing_credits(expires_at)
  WHERE remaining_usd > 0;


-- ============================================================
-- 5. FUNCTIONS — Geração mensal de faturas
-- ============================================================

-- 5a. Gerar número de invoice sequencial
CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id UUID, p_period DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_short TEXT;
  v_seq INT;
BEGIN
  -- Pegar primeiras 4 letras do nome da org (uppercase)
  SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 4))
  INTO v_org_short
  FROM organizations
  WHERE id = p_org_id;

  -- Contar invoices existentes para esta org
  SELECT COUNT(*) + 1
  INTO v_seq
  FROM billing_invoices
  WHERE organization_id = p_org_id;

  RETURN 'WDR-' || COALESCE(v_org_short, 'UNKN') || '-'
    || TO_CHAR(p_period, 'YYYYMM') || '-'
    || LPAD(v_seq::TEXT, 4, '0');
END;
$$;


-- 5b. Calcular custo de mensagens por categoria para um período
CREATE OR REPLACE FUNCTION calculate_message_costs(
  p_org_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE (
  category TEXT,
  quantity BIGINT,
  meta_cost_usd NUMERIC,
  markup_pct NUMERIC,
  total_usd NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_markup NUMERIC;
BEGIN
  -- Pegar markup da organização
  SELECT COALESCE(o.message_markup_pct, 0)
  INTO v_markup
  FROM organizations o
  WHERE o.id = p_org_id;

  RETURN QUERY
  SELECT
    COALESCE(wcm.conversation_category, 'service')::TEXT AS category,
    COUNT(*)::BIGINT AS quantity,
    -- Custo Meta estimado por categoria (BR pricing 2026)
    ROUND(
      COUNT(*) * CASE COALESCE(wcm.conversation_category, 'service')
        WHEN 'marketing'       THEN 0.0625  -- ~USD 0.0625 por conversa marketing BR
        WHEN 'utility'         THEN 0.0080  -- ~USD 0.008
        WHEN 'authentication'  THEN 0.0340  -- ~USD 0.034
        WHEN 'service'         THEN 0.0300  -- ~USD 0.030
        ELSE 0.0300
      END,
      2
    )::NUMERIC AS meta_cost_usd,
    v_markup AS markup_pct,
    ROUND(
      COUNT(*) * CASE COALESCE(wcm.conversation_category, 'service')
        WHEN 'marketing'       THEN 0.0625
        WHEN 'utility'         THEN 0.0080
        WHEN 'authentication'  THEN 0.0340
        WHEN 'service'         THEN 0.0300
        ELSE 0.0300
      END * (1 + v_markup / 100.0),
      2
    )::NUMERIC AS total_usd
  FROM whatsapp_cloud_messages wcm
  JOIN whatsapp_business_accounts wba ON wcm.waba_id = wba.id
  WHERE wba.organization_id = p_org_id
    AND wcm.direction = 'outbound'
    AND wcm.created_at >= p_start::TIMESTAMPTZ
    AND wcm.created_at < (p_end + INTERVAL '1 day')::TIMESTAMPTZ
  GROUP BY wcm.conversation_category;
END;
$$;


-- 5c. Gerar fatura mensal para uma organização
CREATE OR REPLACE FUNCTION generate_monthly_invoice(
  p_org_id UUID,
  p_year INT DEFAULT EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM NOW() - INTERVAL '1 month')::INT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id UUID;
  v_period_start DATE;
  v_period_end DATE;
  v_invoice_number TEXT;
  v_subtotal NUMERIC := 0;
  v_credit_applied NUMERIC := 0;
  v_org_currency TEXT;
  v_exchange_rate NUMERIC;
  rec RECORD;
BEGIN
  -- Calcular período
  v_period_start := MAKE_DATE(p_year, p_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Verificar se já existe fatura para este período
  IF EXISTS (
    SELECT 1 FROM billing_invoices
    WHERE organization_id = p_org_id
      AND period_start = v_period_start
      AND status != 'cancelled'
  ) THEN
    RAISE NOTICE 'Invoice already exists for org % period %', p_org_id, v_period_start;
    SELECT id INTO v_invoice_id
    FROM billing_invoices
    WHERE organization_id = p_org_id
      AND period_start = v_period_start
      AND status != 'cancelled'
    LIMIT 1;
    RETURN v_invoice_id;
  END IF;

  -- Gerar número
  v_invoice_number := generate_invoice_number(p_org_id, v_period_start);

  -- Buscar moeda da org
  SELECT billing_currency INTO v_org_currency
  FROM organizations WHERE id = p_org_id;

  -- Exchange rate estimado (para exibição)
  v_exchange_rate := CASE v_org_currency
    WHEN 'BRL' THEN 5.20
    WHEN 'MXN' THEN 17.50
    WHEN 'COP' THEN 4200.00
    ELSE 1.00
  END;

  -- Criar invoice
  INSERT INTO billing_invoices (
    organization_id, period_start, period_end,
    invoice_number, currency, exchange_rate,
    status, due_date
  ) VALUES (
    p_org_id, v_period_start, v_period_end,
    v_invoice_number, v_org_currency, v_exchange_rate,
    'draft', v_period_end + INTERVAL '15 days'
  )
  RETURNING id INTO v_invoice_id;

  -- Inserir line items por categoria
  FOR rec IN
    SELECT * FROM calculate_message_costs(p_org_id, v_period_start, v_period_end)
  LOOP
    INSERT INTO billing_line_items (
      invoice_id, organization_id, category, description,
      quantity, unit_cost_usd, meta_cost_usd, markup_pct, total_usd,
      period_start, period_end
    ) VALUES (
      v_invoice_id, p_org_id, rec.category,
      'WhatsApp ' || INITCAP(rec.category) || ' messages',
      rec.quantity,
      CASE WHEN rec.quantity > 0 THEN rec.meta_cost_usd / rec.quantity ELSE 0 END,
      rec.meta_cost_usd,
      rec.markup_pct,
      rec.total_usd,
      v_period_start, v_period_end
    );
    v_subtotal := v_subtotal + rec.total_usd;
  END LOOP;

  -- Aplicar créditos disponíveis
  SELECT LEAST(v_subtotal, COALESCE(SUM(remaining_usd), 0))
  INTO v_credit_applied
  FROM billing_credits
  WHERE organization_id = p_org_id
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > NOW());

  -- Debitar créditos (FIFO por data de concessão)
  IF v_credit_applied > 0 THEN
    DECLARE
      v_remaining_to_apply NUMERIC := v_credit_applied;
      credit_rec RECORD;
    BEGIN
      FOR credit_rec IN
        SELECT id, remaining_usd
        FROM billing_credits
        WHERE organization_id = p_org_id
          AND remaining_usd > 0
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY granted_at ASC
      LOOP
        EXIT WHEN v_remaining_to_apply <= 0;

        IF credit_rec.remaining_usd <= v_remaining_to_apply THEN
          UPDATE billing_credits
            SET remaining_usd = 0
            WHERE id = credit_rec.id;
          v_remaining_to_apply := v_remaining_to_apply - credit_rec.remaining_usd;
        ELSE
          UPDATE billing_credits
            SET remaining_usd = remaining_usd - v_remaining_to_apply
            WHERE id = credit_rec.id;
          v_remaining_to_apply := 0;
        END IF;
      END LOOP;
    END;

    -- Adicionar line item de crédito
    INSERT INTO billing_line_items (
      invoice_id, organization_id, category, description,
      quantity, total_usd, period_start, period_end
    ) VALUES (
      v_invoice_id, p_org_id, 'discount',
      'Meta Partner credit applied',
      1, -v_credit_applied,
      v_period_start, v_period_end
    );
  END IF;

  -- Atualizar totais da fatura
  UPDATE billing_invoices SET
    subtotal_usd = v_subtotal,
    tax_usd = 0,  -- impostos calculados separadamente (NF-e)
    total_usd = v_subtotal,
    credit_applied = v_credit_applied,
    amount_due_usd = GREATEST(v_subtotal - v_credit_applied, 0),
    total_local = ROUND(GREATEST(v_subtotal - v_credit_applied, 0) * v_exchange_rate, 2),
    status = CASE
      WHEN GREATEST(v_subtotal - v_credit_applied, 0) = 0 THEN 'paid'
      ELSE 'pending'
    END
  WHERE id = v_invoice_id;

  -- Atualizar credit_used na org
  UPDATE organizations SET
    credit_used_usd = credit_used_usd + v_credit_applied
  WHERE id = p_org_id;

  RETURN v_invoice_id;
END;
$$;


-- 5d. Gerar faturas para TODAS as orgs com billing_model = 'markup'
CREATE OR REPLACE FUNCTION generate_all_monthly_invoices(
  p_year INT DEFAULT EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM NOW() - INTERVAL '1 month')::INT
)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  invoice_id UUID,
  amount_due NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  org_rec RECORD;
  v_invoice_id UUID;
BEGIN
  FOR org_rec IN
    SELECT o.id, o.name
    FROM organizations o
    WHERE o.status = 'active'
      AND o.billing_model IN ('markup', 'hybrid')
    ORDER BY o.name
  LOOP
    v_invoice_id := generate_monthly_invoice(org_rec.id, p_year, p_month);

    RETURN QUERY
    SELECT
      org_rec.id,
      org_rec.name,
      v_invoice_id,
      bi.amount_due_usd
    FROM billing_invoices bi
    WHERE bi.id = v_invoice_id;
  END LOOP;
END;
$$;


-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- billing_invoices: org members can read their own invoices
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_invoices_org_read'
  ) THEN
    CREATE POLICY billing_invoices_org_read ON billing_invoices
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- service_role bypass
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_invoices_service'
  ) THEN
    CREATE POLICY billing_invoices_service ON billing_invoices
      FOR ALL
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- billing_line_items: org members can read
ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_line_items_org_read'
  ) THEN
    CREATE POLICY billing_line_items_org_read ON billing_line_items
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_line_items_service'
  ) THEN
    CREATE POLICY billing_line_items_service ON billing_line_items
      FOR ALL
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- billing_credits: org members can read
ALTER TABLE billing_credits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_credits_org_read'
  ) THEN
    CREATE POLICY billing_credits_org_read ON billing_credits
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_credits_service'
  ) THEN
    CREATE POLICY billing_credits_service ON billing_credits
      FOR ALL
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- 7. COMMENTS (documentação inline)
-- ============================================================

COMMENT ON TABLE billing_invoices IS 'Faturas mensais por organização — modelo Solution Partner';
COMMENT ON TABLE billing_line_items IS 'Itens de cobrança por categoria de mensagem WhatsApp';
COMMENT ON TABLE billing_credits IS 'Créditos Meta Partner e promocionais por organização';
COMMENT ON FUNCTION generate_monthly_invoice IS 'Gera fatura mensal para uma organização com line items por categoria';
COMMENT ON FUNCTION generate_all_monthly_invoices IS 'Gera faturas para todas as orgs com billing markup/hybrid';
COMMENT ON FUNCTION calculate_message_costs IS 'Calcula custo de mensagens por categoria para um período';
-- =============================================
-- 09: whatsapp_alerts table
-- Dedicated table for WhatsApp operational alerts.
-- Replaces broken inserts into non-existent `notifications` columns.
-- =============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  waba_id         UUID REFERENCES whatsapp_business_accounts(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'quality_drop',
                    'frequency_cap',
                    'template_rejected',
                    'template_paused',
                    'template_disabled',
                    'account_restricted',
                    'webhook_dead',
                    'window_expiry_bulk',
                    'low_messaging_limit'
                  )),
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title           TEXT NOT NULL,
  body            TEXT,
  metadata        JSONB DEFAULT '{}',
  dedup_key       TEXT,
  acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_org_ack_created
  ON whatsapp_alerts (organization_id, acknowledged, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_type_created
  ON whatsapp_alerts (type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_alerts_dedup
  ON whatsapp_alerts (organization_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND acknowledged = FALSE;

-- 3. RLS
ALTER TABLE whatsapp_alerts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read alerts scoped to their organization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_alerts' AND policyname = 'whatsapp_alerts_org_read'
  ) THEN
    CREATE POLICY whatsapp_alerts_org_read ON whatsapp_alerts
      FOR SELECT
      TO authenticated
      USING (organization_id IN (
        SELECT organization_id
        FROM public.profiles
        WHERE id = auth.uid()
      ));
  END IF;
END
$$;

-- service_role bypasses RLS (full access for server-side inserts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_alerts' AND policyname = 'whatsapp_alerts_service_role_all'
  ) THEN
    CREATE POLICY whatsapp_alerts_service_role_all ON whatsapp_alerts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
