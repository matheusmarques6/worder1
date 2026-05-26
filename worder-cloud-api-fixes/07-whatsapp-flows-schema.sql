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

-- Legacy whatsapp_flows indexes
CREATE INDEX IF NOT EXISTS idx_wf_meta_flow_id
  ON whatsapp_flows (meta_flow_id)
  WHERE meta_flow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wf_account_id
  ON whatsapp_flows (account_id)
  WHERE account_id IS NOT NULL;

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
