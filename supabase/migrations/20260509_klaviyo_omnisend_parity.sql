-- ================================================
-- Klaviyo / Omnisend parity: org-level send rules
-- + idempotency support for new triggers.
--
-- Run this in the Supabase SQL Editor. All ALTERs are
-- idempotent (IF NOT EXISTS) so re-runs are safe.
-- ================================================

-- 1. Quiet Hours + Frequency Cap + Skip overlap (per org)
-- Klaviyo: 16h email, 24h SMS smart sending. Quiet hours per channel.
-- Omnisend: default 20h–08h quiet, 3 SMS/day cap.
-- We expose the same knobs at the org level so the merchant can match.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT NOT NULL DEFAULT 20
  CHECK (quiet_hours_start BETWEEN 0 AND 23);
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT NOT NULL DEFAULT 8
  CHECK (quiet_hours_end BETWEEN 0 AND 23);
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS quiet_hours_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_sends_per_contact_per_day INTEGER NOT NULL DEFAULT 0
  CHECK (max_sends_per_contact_per_day >= 0);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS skip_contacts_in_active_flows BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.quiet_hours_enabled IS
  'When true, action_email postpones sends that fall inside quiet_hours_start..quiet_hours_end (in quiet_hours_timezone) to the next allowed hour.';
COMMENT ON COLUMN organizations.max_sends_per_contact_per_day IS
  '0 = unlimited. Otherwise action_email skips additional sends to the same contact once this many email_sends already exist for them today.';
COMMENT ON COLUMN organizations.skip_contacts_in_active_flows IS
  'When true, dispatchTrigger drops a new run if the contact already has any waiting/pending/running run in the org (Omnisend "Skip Contacts" behaviour).';

-- 2. trigger_filters + frequency_config columns on automations
-- Both were already saved by the flow-builder index.tsx but the
-- columns were never created on older databases.
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS trigger_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS audience_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS exit_conditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS frequency_config JSONB NOT NULL DEFAULT '{"type":"unlimited"}'::jsonb;

COMMENT ON COLUMN automations.trigger_filters IS
  'Array of {field, operator, value} evaluated against the trigger payload (SKU, cart_value, etc.). Filters which payloads start a run.';
COMMENT ON COLUMN automations.audience_filters IS
  'Array of {field, operator, value} evaluated against the contact (email_domain, total_orders, tags…). Filters which contacts can enter the flow.';
COMMENT ON COLUMN automations.exit_conditions IS
  'Array of {type, eventType?, field?, operator?, value?} evaluated before each step. Run is cancelled when any condition matches.';
COMMENT ON COLUMN automations.frequency_config IS
  'Re-entry rule: {type: "once"|"interval"|"unlimited", value?, unit?: "minutes"|"hours"|"days"|"weeks"}.';

-- 3. price_drop_subscriptions — track who watches which product price.
-- Optional; the price_drop trigger already works against contact_events
-- (anyone who viewed/added the product in the last 30 days). This table
-- is here for explicit "notify me when price drops" subscriptions.
CREATE TABLE IF NOT EXISTS price_drop_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  variant_id TEXT,
  watched_price NUMERIC(12,2),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contact_id, shopify_product_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_price_drop_subs_product
  ON price_drop_subscriptions(organization_id, shopify_product_id);

-- 4. NOTIFY PostgREST so the API picks up the new columns immediately.
NOTIFY pgrst, 'reload schema';
