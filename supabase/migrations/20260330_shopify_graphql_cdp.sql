-- ============================================================
-- MIGRATION: Shopify GraphQL + CDP Foundation
-- Date: 2026-03-30
-- Description: Creates contact_events and shopify_webhook_log
--              tables, adds CDP columns to contacts and
--              shopify_stores.
-- ============================================================

-- ============================================================
-- 1. CONTACT EVENTS — CDP Timeline
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,

  -- Event type and source
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'shopify',

  -- Full event payload
  properties JSONB NOT NULL DEFAULT '{}',

  -- Monetary value (orders, checkouts)
  monetary_value DECIMAL(12,2),
  currency TEXT DEFAULT 'BRL',

  -- External reference
  shopify_resource_id TEXT,
  shopify_resource_type TEXT,

  -- Anonymous visitor tracking
  session_id TEXT,
  anonymous_id TEXT,

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Idempotency
  idempotency_key TEXT UNIQUE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_contact_events_contact ON contact_events(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_events_type ON contact_events(organization_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_events_idempotency ON contact_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_contact_events_shopify_resource ON contact_events(shopify_resource_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_session ON contact_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_events_anonymous ON contact_events(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_events_org_occurred ON contact_events(organization_id, occurred_at DESC);

-- RLS
ALTER TABLE contact_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation_contact_events" ON contact_events
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ============================================================
-- 2. SHOPIFY WEBHOOK LOG — Idempotency + Debug
-- ============================================================

CREATE TABLE IF NOT EXISTS shopify_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  webhook_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  shop_domain TEXT,
  shopify_resource_id TEXT,

  -- Processing
  status TEXT DEFAULT 'received',
  error_message TEXT,
  attempts INT DEFAULT 0,
  processing_time_ms INT,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  UNIQUE(webhook_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_id ON shopify_webhook_log(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_log_store ON shopify_webhook_log(store_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_log_topic ON shopify_webhook_log(topic, received_at DESC);

ALTER TABLE shopify_webhook_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. NEW COLUMNS ON shopify_stores
-- ============================================================

ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS api_version TEXT DEFAULT '2026-01';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS initial_sync_completed BOOLEAN DEFAULT false;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS pixel_installed BOOLEAN DEFAULT false;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS embed_installed BOOLEAN DEFAULT false;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS scopes TEXT[];
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- ============================================================
-- 4. NEW COLUMNS ON contacts (CDP enrichment)
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'subscriber';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_order_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS days_since_last_order INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_recency INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_frequency INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_monetary INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS predicted_clv DECIMAL(12,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS churn_risk DECIMAL(5,4);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_consent BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_consent_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_consent_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS browser TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS os TEXT;

-- ============================================================
-- 5. NEW COLUMNS ON shopify_checkouts
-- ============================================================

ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMPTZ;
ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS recovery_email_count INT DEFAULT 0;
