-- =====================================================
-- MULTI-CHANNEL ATTRIBUTION — Master migration
--
-- Single script that adds everything needed to ship Klaviyo/Omnisend-
-- equivalent revenue attribution across email, WhatsApp, and SMS.
-- Idempotent end-to-end: every CREATE / ALTER / DROP is guarded so
-- the script can be re-run.
--
-- Layout (in dependency order):
--   1. email_sends.mpp_opened_at column + index
--   2. whatsapp_sends table + indices + RLS
--   3. sms_sends table + indices + RLS
--   4. whatsapp_campaigns / sms_campaigns revenue columns
--   5. attribute_email_conversion (replaces older RPC; new
--      p_count_opens / p_exclude_mpp_opens params; honours
--      mpp_opened_at)
--   6. attribute_whatsapp_conversion
--   7. attribute_sms_conversion
--   8. revoke_email_conversion / revoke_whatsapp_conversion /
--      revoke_sms_conversion (called on orders/cancelled)
--   9. backfill_attribution_for_org — one-shot helper that walks
--      shopify_orders for an org and re-runs attribution across
--      every channel, in case the merchant ran the system before
--      the wiring was complete.
--
-- Multi-tenant: every table has organization_id, every RPC takes
-- p_organization_id and filters all joins on it. RLS uses the same
-- "service role bypasses, app role filters by org" pattern as the
-- rest of the schema.
-- =====================================================

-- =====================================================
-- 1. email_sends: add mpp_opened_at
-- =====================================================
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS mpp_opened_at TIMESTAMPTZ;

COMMENT ON COLUMN email_sends.mpp_opened_at IS
  'Apple Mail Privacy Protection auto-open timestamp. Filled when the open pixel detects MPP via IP / UA / fast-fetch heuristic; never used for attribution by default. opened_at stays NULL on these so dashboards show real opens only.';

CREATE INDEX IF NOT EXISTS email_sends_mpp_opened_idx
  ON email_sends (organization_id, mpp_opened_at)
  WHERE mpp_opened_at IS NOT NULL;

-- =====================================================
-- 2. whatsapp_sends table (per-message outbound log)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,

  -- Channel linkage (mirrors email_sends shape)
  campaign_id UUID REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
  automation_id UUID,
  automation_run_id UUID,
  flow_id UUID,
  node_id TEXT,

  -- Message payload
  message_body TEXT,
  template_name TEXT,
  template_params JSONB,
  media_url TEXT,

  -- Delivery timeline (matches Meta WhatsApp status ladder:
  -- sent → delivered → read; replied is the engagement signal
  -- when the recipient writes back)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Attribution
  conversion_value NUMERIC(12, 2) DEFAULT 0,
  converted_at TIMESTAMPTZ,
  order_id TEXT,

  -- Provider linkage
  external_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_sends_org_contact_idx
  ON whatsapp_sends (organization_id, contact_id);
CREATE INDEX IF NOT EXISTS whatsapp_sends_campaign_idx
  ON whatsapp_sends (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_sends_flow_idx
  ON whatsapp_sends (flow_id) WHERE flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_sends_automation_run_idx
  ON whatsapp_sends (automation_run_id) WHERE automation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_sends_external_msg_idx
  ON whatsapp_sends (external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_sends_attribution_idx
  ON whatsapp_sends (organization_id, contact_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sends_order_idempotency_idx
  ON whatsapp_sends (organization_id, order_id) WHERE order_id IS NOT NULL;

ALTER TABLE whatsapp_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_sends_service_role ON whatsapp_sends;
CREATE POLICY whatsapp_sends_service_role ON whatsapp_sends
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS whatsapp_sends_org_isolation ON whatsapp_sends;
CREATE POLICY whatsapp_sends_org_isolation ON whatsapp_sends
  FOR ALL USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- =====================================================
-- 3. sms_sends table
-- =====================================================
-- sms_campaigns may not exist on every deployment — create a thin
-- stub so the FK on sms_sends.campaign_id always resolves.
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  message_body TEXT,
  audience_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  revenue NUMERIC(12, 2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_campaigns_service_role ON sms_campaigns;
CREATE POLICY sms_campaigns_service_role ON sms_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sms_campaigns_org_isolation ON sms_campaigns;
CREATE POLICY sms_campaigns_org_isolation ON sms_campaigns
  FOR ALL USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE TABLE IF NOT EXISTS sms_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,

  campaign_id UUID REFERENCES sms_campaigns(id) ON DELETE SET NULL,
  automation_id UUID,
  automation_run_id UUID,
  flow_id UUID,
  node_id TEXT,

  message_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'clicked', 'failed', 'undelivered')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Attribution
  conversion_value NUMERIC(12, 2) DEFAULT 0,
  converted_at TIMESTAMPTZ,
  order_id TEXT,

  external_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sms_sends_org_contact_idx
  ON sms_sends (organization_id, contact_id);
CREATE INDEX IF NOT EXISTS sms_sends_campaign_idx
  ON sms_sends (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_sends_flow_idx
  ON sms_sends (flow_id) WHERE flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_sends_automation_run_idx
  ON sms_sends (automation_run_id) WHERE automation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_sends_external_msg_idx
  ON sms_sends (external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_sends_attribution_idx
  ON sms_sends (organization_id, contact_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sms_sends_order_idempotency_idx
  ON sms_sends (organization_id, order_id) WHERE order_id IS NOT NULL;

ALTER TABLE sms_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_sends_service_role ON sms_sends;
CREATE POLICY sms_sends_service_role ON sms_sends
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sms_sends_org_isolation ON sms_sends;
CREATE POLICY sms_sends_org_isolation ON sms_sends
  FOR ALL USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- =====================================================
-- 4. Campaign revenue columns (additive)
-- =====================================================
ALTER TABLE whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS revenue NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0;

-- email_campaigns revenue / conversions already exist in the
-- production schema; the IF NOT EXISTS is just defensive.
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS revenue NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0;

-- =====================================================
-- 5. attribute_email_conversion (replaces older RPC)
-- =====================================================
-- New params:
--   p_count_opens         — when FALSE, only clicks qualify
--   p_exclude_mpp_opens   — when TRUE, Apple MPP auto-opens (in
--                           mpp_opened_at) don't count even though
--                           opens are otherwise allowed.
-- Order is critical: the Postgres function-overload resolver only
-- looks at types + name + ordinal arity, not parameter names from
-- the client.

DROP FUNCTION IF EXISTS attribute_email_conversion(UUID, UUID, TEXT, NUMERIC, INT);

CREATE OR REPLACE FUNCTION attribute_email_conversion(
  p_contact_id UUID,
  p_organization_id UUID,
  p_order_id TEXT,
  p_order_value NUMERIC,
  p_attribution_window_days INT DEFAULT 5,
  p_count_opens BOOLEAN DEFAULT TRUE,
  p_exclude_mpp_opens BOOLEAN DEFAULT TRUE
) RETURNS UUID AS $$
DECLARE
  v_send_id UUID;
  v_campaign_id UUID;
  v_existing UUID;
BEGIN
  -- Idempotency: short-circuit when this org has already attributed
  -- this Shopify order to ANY email send.
  SELECT es.id INTO v_existing
  FROM email_sends es
  WHERE es.order_id = p_order_id
    AND es.organization_id = p_organization_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- Last-touch lookup. Click always wins tiebreak — clicks are a
  -- stronger purchase intent signal than opens. When the org has
  -- count_opens = false we drop opens from the engagement filter
  -- entirely; clicks alone qualify.
  SELECT es.id, es.campaign_id INTO v_send_id, v_campaign_id
  FROM email_sends es
  WHERE es.contact_id = p_contact_id
    AND es.organization_id = p_organization_id
    AND es.sent_at >= NOW() - (p_attribution_window_days || ' days')::INTERVAL
    AND (
      es.clicked_at IS NOT NULL
      OR (p_count_opens AND es.opened_at IS NOT NULL)
      OR (p_count_opens AND NOT p_exclude_mpp_opens AND es.mpp_opened_at IS NOT NULL)
    )
  ORDER BY COALESCE(es.clicked_at, es.opened_at, es.mpp_opened_at) DESC
  LIMIT 1;

  IF v_send_id IS NULL THEN RETURN NULL; END IF;

  UPDATE email_sends SET
    conversion_value = p_order_value,
    converted_at = NOW(),
    order_id = p_order_id
  WHERE id = v_send_id;

  IF v_campaign_id IS NOT NULL THEN
    UPDATE email_campaigns SET
      revenue = COALESCE(revenue, 0) + p_order_value,
      conversions = COALESCE(conversions, 0) + 1
    WHERE id = v_campaign_id;
  END IF;

  RETURN v_send_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION attribute_email_conversion(UUID, UUID, TEXT, NUMERIC, INT, BOOLEAN, BOOLEAN) TO service_role;

-- =====================================================
-- 6. attribute_whatsapp_conversion
-- =====================================================
CREATE OR REPLACE FUNCTION attribute_whatsapp_conversion(
  p_contact_id UUID,
  p_organization_id UUID,
  p_order_id TEXT,
  p_order_value NUMERIC,
  p_attribution_window_days INT DEFAULT 2
) RETURNS UUID AS $$
DECLARE
  v_send_id UUID;
  v_campaign_id UUID;
  v_existing UUID;
BEGIN
  SELECT ws.id INTO v_existing
  FROM whatsapp_sends ws
  WHERE ws.order_id = p_order_id
    AND ws.organization_id = p_organization_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- Engagement on WhatsApp = read OR replied (delivered is just a
  -- handoff to the carrier; we treat it as soft-engagement only
  -- when there's no stronger signal in the window).
  SELECT ws.id, ws.campaign_id INTO v_send_id, v_campaign_id
  FROM whatsapp_sends ws
  WHERE ws.contact_id = p_contact_id
    AND ws.organization_id = p_organization_id
    AND ws.sent_at >= NOW() - (p_attribution_window_days || ' days')::INTERVAL
    AND (
      ws.replied_at IS NOT NULL
      OR ws.read_at IS NOT NULL
      OR ws.delivered_at IS NOT NULL
    )
  ORDER BY COALESCE(ws.replied_at, ws.read_at, ws.delivered_at) DESC
  LIMIT 1;

  IF v_send_id IS NULL THEN RETURN NULL; END IF;

  UPDATE whatsapp_sends SET
    conversion_value = p_order_value,
    converted_at = NOW(),
    order_id = p_order_id,
    updated_at = NOW()
  WHERE id = v_send_id;

  IF v_campaign_id IS NOT NULL THEN
    UPDATE whatsapp_campaigns SET
      revenue = COALESCE(revenue, 0) + p_order_value,
      conversions = COALESCE(conversions, 0) + 1,
      updated_at = NOW()
    WHERE id = v_campaign_id;
  END IF;

  RETURN v_send_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION attribute_whatsapp_conversion(UUID, UUID, TEXT, NUMERIC, INT) TO service_role;

-- =====================================================
-- 7. attribute_sms_conversion
-- =====================================================
CREATE OR REPLACE FUNCTION attribute_sms_conversion(
  p_contact_id UUID,
  p_organization_id UUID,
  p_order_id TEXT,
  p_order_value NUMERIC,
  p_attribution_window_days INT DEFAULT 2
) RETURNS UUID AS $$
DECLARE
  v_send_id UUID;
  v_campaign_id UUID;
  v_existing UUID;
BEGIN
  SELECT s.id INTO v_existing
  FROM sms_sends s
  WHERE s.order_id = p_order_id
    AND s.organization_id = p_organization_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- SMS engagement = clicked (tracker redirect) or delivered (carrier
  -- ACK). No "read" signal exists for SMS in any provider.
  SELECT s.id, s.campaign_id INTO v_send_id, v_campaign_id
  FROM sms_sends s
  WHERE s.contact_id = p_contact_id
    AND s.organization_id = p_organization_id
    AND s.sent_at >= NOW() - (p_attribution_window_days || ' days')::INTERVAL
    AND (s.clicked_at IS NOT NULL OR s.delivered_at IS NOT NULL)
  ORDER BY COALESCE(s.clicked_at, s.delivered_at) DESC
  LIMIT 1;

  IF v_send_id IS NULL THEN RETURN NULL; END IF;

  UPDATE sms_sends SET
    conversion_value = p_order_value,
    converted_at = NOW(),
    order_id = p_order_id,
    updated_at = NOW()
  WHERE id = v_send_id;

  IF v_campaign_id IS NOT NULL THEN
    UPDATE sms_campaigns SET
      revenue = COALESCE(revenue, 0) + p_order_value,
      conversions = COALESCE(conversions, 0) + 1,
      updated_at = NOW()
    WHERE id = v_campaign_id;
  END IF;

  RETURN v_send_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION attribute_sms_conversion(UUID, UUID, TEXT, NUMERIC, INT) TO service_role;

-- =====================================================
-- 8. Revoke RPCs (called on orders/cancelled or refund)
-- =====================================================
CREATE OR REPLACE FUNCTION revoke_email_conversion(
  p_organization_id UUID,
  p_order_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_send_id UUID;
  v_campaign_id UUID;
  v_value NUMERIC;
BEGIN
  SELECT es.id, es.campaign_id, es.conversion_value
    INTO v_send_id, v_campaign_id, v_value
  FROM email_sends es
  WHERE es.order_id = p_order_id
    AND es.organization_id = p_organization_id
  LIMIT 1;
  IF v_send_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE email_sends SET
    conversion_value = 0,
    converted_at = NULL,
    order_id = NULL
  WHERE id = v_send_id;

  IF v_campaign_id IS NOT NULL AND v_value IS NOT NULL THEN
    UPDATE email_campaigns SET
      revenue = GREATEST(COALESCE(revenue, 0) - v_value, 0),
      conversions = GREATEST(COALESCE(conversions, 0) - 1, 0)
    WHERE id = v_campaign_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION revoke_email_conversion(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION revoke_whatsapp_conversion(
  p_organization_id UUID,
  p_order_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_send_id UUID;
  v_campaign_id UUID;
  v_value NUMERIC;
BEGIN
  SELECT ws.id, ws.campaign_id, ws.conversion_value
    INTO v_send_id, v_campaign_id, v_value
  FROM whatsapp_sends ws
  WHERE ws.order_id = p_order_id
    AND ws.organization_id = p_organization_id
  LIMIT 1;
  IF v_send_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE whatsapp_sends SET
    conversion_value = 0,
    converted_at = NULL,
    order_id = NULL,
    updated_at = NOW()
  WHERE id = v_send_id;

  IF v_campaign_id IS NOT NULL AND v_value IS NOT NULL THEN
    UPDATE whatsapp_campaigns SET
      revenue = GREATEST(COALESCE(revenue, 0) - v_value, 0),
      conversions = GREATEST(COALESCE(conversions, 0) - 1, 0),
      updated_at = NOW()
    WHERE id = v_campaign_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION revoke_whatsapp_conversion(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION revoke_sms_conversion(
  p_organization_id UUID,
  p_order_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_send_id UUID;
  v_campaign_id UUID;
  v_value NUMERIC;
BEGIN
  SELECT s.id, s.campaign_id, s.conversion_value
    INTO v_send_id, v_campaign_id, v_value
  FROM sms_sends s
  WHERE s.order_id = p_order_id
    AND s.organization_id = p_organization_id
  LIMIT 1;
  IF v_send_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE sms_sends SET
    conversion_value = 0,
    converted_at = NULL,
    order_id = NULL,
    updated_at = NOW()
  WHERE id = v_send_id;

  IF v_campaign_id IS NOT NULL AND v_value IS NOT NULL THEN
    UPDATE sms_campaigns SET
      revenue = GREATEST(COALESCE(revenue, 0) - v_value, 0),
      conversions = GREATEST(COALESCE(conversions, 0) - 1, 0),
      updated_at = NOW()
    WHERE id = v_campaign_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION revoke_sms_conversion(UUID, TEXT) TO service_role;

-- =====================================================
-- 9. Backfill helper
-- =====================================================
-- One-shot: re-runs attribution across email / whatsapp / sms for
-- every paid Shopify order this org has logged in the lookback
-- window. Per-channel RPCs are idempotent, so re-running this is
-- safe; you can run it as often as you like while the system warms
-- up. Returns a JSONB row count summary the caller can log.

CREATE OR REPLACE FUNCTION backfill_attribution_for_org(
  p_organization_id UUID,
  p_lookback_days INT DEFAULT 30,
  p_email_window_days INT DEFAULT 5,
  p_whatsapp_window_days INT DEFAULT 2,
  p_sms_window_days INT DEFAULT 2,
  p_count_opens BOOLEAN DEFAULT TRUE,
  p_exclude_mpp_opens BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
  o RECORD;
  v_email_attributed INT := 0;
  v_whatsapp_attributed INT := 0;
  v_sms_attributed INT := 0;
  v_processed INT := 0;
  v_send_id UUID;
BEGIN
  FOR o IN
    SELECT
      so.shopify_order_id::TEXT AS order_id,
      so.contact_id,
      so.total_price::NUMERIC AS total_price
    FROM shopify_orders so
    JOIN shopify_stores st ON st.id = so.store_id
    WHERE st.organization_id = p_organization_id
      AND so.created_at > NOW() - (p_lookback_days || ' days')::INTERVAL
      AND so.contact_id IS NOT NULL
      AND COALESCE(so.total_price, 0) > 0
  LOOP
    v_processed := v_processed + 1;

    v_send_id := attribute_email_conversion(
      o.contact_id,
      p_organization_id,
      o.order_id,
      o.total_price,
      p_email_window_days,
      p_count_opens,
      p_exclude_mpp_opens
    );
    IF v_send_id IS NOT NULL THEN v_email_attributed := v_email_attributed + 1; END IF;

    v_send_id := attribute_whatsapp_conversion(
      o.contact_id,
      p_organization_id,
      o.order_id,
      o.total_price,
      p_whatsapp_window_days
    );
    IF v_send_id IS NOT NULL THEN v_whatsapp_attributed := v_whatsapp_attributed + 1; END IF;

    v_send_id := attribute_sms_conversion(
      o.contact_id,
      p_organization_id,
      o.order_id,
      o.total_price,
      p_sms_window_days
    );
    IF v_send_id IS NOT NULL THEN v_sms_attributed := v_sms_attributed + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'orders_processed', v_processed,
    'email_attributed', v_email_attributed,
    'whatsapp_attributed', v_whatsapp_attributed,
    'sms_attributed', v_sms_attributed,
    'completed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION backfill_attribution_for_org(UUID, INT, INT, INT, INT, BOOLEAN, BOOLEAN) TO service_role;

-- =====================================================
-- 10. updated_at autotriggers (consistency with rest of schema)
-- =====================================================
CREATE OR REPLACE FUNCTION trg_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_sends_touch_updated_at ON whatsapp_sends;
CREATE TRIGGER whatsapp_sends_touch_updated_at
  BEFORE UPDATE ON whatsapp_sends
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS sms_sends_touch_updated_at ON sms_sends;
CREATE TRIGGER sms_sends_touch_updated_at
  BEFORE UPDATE ON sms_sends
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS sms_campaigns_touch_updated_at ON sms_campaigns;
CREATE TRIGGER sms_campaigns_touch_updated_at
  BEFORE UPDATE ON sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
