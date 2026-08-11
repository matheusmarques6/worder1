-- ============================================================
-- MIGRATION: Store isolation + email tracking tables
-- Date: 2026-04-01
-- ============================================================

-- 1. Add store_id to email_templates for multi-store isolation
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS store_id UUID;
CREATE INDEX IF NOT EXISTS idx_email_templates_store ON email_templates(store_id) WHERE store_id IS NOT NULL;

-- 2. Add store_id to email_campaigns (may already exist from some campaigns)
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS store_id UUID;
CREATE INDEX IF NOT EXISTS idx_email_campaigns_store ON email_campaigns(store_id) WHERE store_id IS NOT NULL;

-- 3. Add store_id to customer_segments
ALTER TABLE customer_segments ADD COLUMN IF NOT EXISTS store_id UUID;
CREATE INDEX IF NOT EXISTS idx_customer_segments_store ON customer_segments(store_id) WHERE store_id IS NOT NULL;

-- 4. Email sends table (for tracking opens/clicks per send)
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  error_message TEXT,
  resend_id TEXT,
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status);

-- 5. Add tracking stats columns to email_campaigns
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_sent INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_failed INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_recipients INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS opens INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS clicks INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS bounces INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS unsubscribes INT DEFAULT 0;

-- 6. Store stats columns
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS total_customers INT DEFAULT 0;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS total_products INT DEFAULT 0;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
