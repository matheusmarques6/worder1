-- =====================================================
-- shopify_webhook_audit
--
-- Audit log for webhook deliveries that arrived at our endpoint but
-- couldn't be associated with any active shopify_stores row. The main
-- shopify_webhook_log requires organization_id (NOT NULL), which we
-- don't have for these — yet we still want to surface them in the
-- diagnostic dashboard so the merchant can see "Shopify is sending us
-- X deliveries from shop_domain Y that we can't match to a store."
-- =====================================================

CREATE TABLE IF NOT EXISTS shopify_webhook_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain TEXT NOT NULL,
  topic TEXT,
  webhook_id TEXT,
  status TEXT NOT NULL DEFAULT 'orphan_store',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhook_audit_shop ON shopify_webhook_audit(shop_domain, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_audit_received ON shopify_webhook_audit(received_at DESC);

ALTER TABLE shopify_webhook_audit ENABLE ROW LEVEL SECURITY;
