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
