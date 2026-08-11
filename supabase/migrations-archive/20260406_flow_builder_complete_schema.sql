-- =============================================
-- Migration: Flow Builder Complete Schema
-- Adds missing tables, columns, indexes, and RLS
-- for the automation flow builder to work end-to-end.
-- =============================================

-- =============================================
-- 1. email_templates (referenced by node-executors.ts)
-- =============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'custom',
  design_json JSONB,
  html TEXT,
  thumbnail_url TEXT,
  is_prebuilt BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_org ON email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_store ON email_templates(store_id) WHERE store_id IS NOT NULL;

-- =============================================
-- 2. list_contacts (referenced by node-executors.ts)
-- =============================================
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'static',
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS list_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_list_contacts_list ON list_contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_list_contacts_contact ON list_contacts(contact_id);

-- =============================================
-- 3. shopify_orders (referenced by webhook-processor.ts)
-- =============================================
CREATE TABLE IF NOT EXISTS shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  shopify_order_id BIGINT NOT NULL,
  shopify_order_number TEXT,
  contact_id UUID,
  email TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  total_price DECIMAL(12,2),
  subtotal_price DECIMAL(12,2),
  currency TEXT DEFAULT 'BRL',
  line_items JSONB DEFAULT '[]',
  shipping_address JSONB,
  billing_address JSONB,
  discount_codes JSONB DEFAULT '[]',
  tags TEXT,
  note TEXT,
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_store ON shopify_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_contact ON shopify_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_org ON shopify_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_shopify_id ON shopify_orders(shopify_order_id);

-- =============================================
-- 4. shopify_checkouts (referenced by webhook-processor.ts)
-- =============================================
CREATE TABLE IF NOT EXISTS shopify_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  shopify_checkout_id TEXT NOT NULL,
  shopify_checkout_token TEXT,
  contact_id UUID,
  email TEXT,
  cart_value DECIMAL(12,2),
  currency TEXT DEFAULT 'BRL',
  line_items JSONB DEFAULT '[]',
  abandoned_checkout_url TEXT,
  completed_at TIMESTAMPTZ,
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, shopify_checkout_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_store ON shopify_checkouts(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_contact ON shopify_checkouts(contact_id);

-- =============================================
-- 5. shopify_webhook_events (referenced by webhook route)
-- =============================================
CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL,
  topic TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_event ON shopify_webhook_events(event_id);

-- =============================================
-- 6. Fix event_logs: add missing columns
-- Code writes 'source' and 'processed' but table only has 'status'
-- =============================================
DO $$
BEGIN
  -- Add 'source' column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'source') THEN
    ALTER TABLE event_logs ADD COLUMN source TEXT DEFAULT 'system';
  END IF;

  -- Add 'processed' column if missing (boolean flag used by code)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'processed') THEN
    ALTER TABLE event_logs ADD COLUMN processed BOOLEAN DEFAULT false;
  END IF;

  -- Add 'error_message' column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'error_message') THEN
    ALTER TABLE event_logs ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- Index for unprocessed events (used by process-events worker)
CREATE INDEX IF NOT EXISTS idx_event_logs_unprocessed ON event_logs(processed, created_at) WHERE processed = false;

-- =============================================
-- 7. Fix automation_run_steps: add 'result' column
-- Code reads 'result' but table only has 'output'
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_run_steps' AND column_name = 'result') THEN
    ALTER TABLE automation_run_steps ADD COLUMN result JSONB DEFAULT '{}';
  END IF;

  -- Add 'resume_at' column used by delay worker
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_run_steps' AND column_name = 'resume_at') THEN
    ALTER TABLE automation_run_steps ADD COLUMN resume_at TIMESTAMPTZ;
  END IF;
END $$;

-- Additional indexes for automation performance
CREATE INDEX IF NOT EXISTS idx_run_steps_status ON automation_run_steps(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_run_steps_node ON automation_run_steps(node_id);

-- =============================================
-- 8. Fix automation_runs: add missing columns
-- =============================================
DO $$
BEGIN
  -- Add 'metadata' column used by event-processor.ts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'metadata') THEN
    ALTER TABLE automation_runs ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;

  -- Add 'last_error' column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'last_error') THEN
    ALTER TABLE automation_runs ADD COLUMN last_error TEXT;
  END IF;
END $$;

-- =============================================
-- 9. Fix email_sends: add missing columns
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sends' AND column_name = 'email_template_id') THEN
    ALTER TABLE email_sends ADD COLUMN email_template_id UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sends' AND column_name = 'automation_id') THEN
    ALTER TABLE email_sends ADD COLUMN automation_id UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_sends' AND column_name = 'resend_id') THEN
    ALTER TABLE email_sends ADD COLUMN resend_id TEXT;
  END IF;
END $$;

-- =============================================
-- 10. RLS Policies for flow engine tables
-- =============================================

-- Enable RLS
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for workers/crons)
CREATE POLICY IF NOT EXISTS "service_role_all_event_logs" ON event_logs FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_automation_runs" ON automation_runs FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_run_steps" ON automation_run_steps FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_email_templates" ON email_templates FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_lists" ON lists FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_list_contacts" ON list_contacts FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_shopify_orders" ON shopify_orders FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_shopify_checkouts" ON shopify_checkouts FOR ALL TO service_role USING (true);
CREATE POLICY IF NOT EXISTS "service_role_all_shopify_webhook_events" ON shopify_webhook_events FOR ALL TO service_role USING (true);

-- Authenticated users: org-scoped access
CREATE POLICY IF NOT EXISTS "org_read_event_logs" ON event_logs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "org_read_automation_runs" ON automation_runs FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "org_read_email_templates" ON email_templates FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "org_read_lists" ON lists FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "org_read_list_contacts" ON list_contacts FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "org_read_shopify_orders" ON shopify_orders FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS "org_read_shopify_checkouts" ON shopify_checkouts FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- =============================================
-- 11. Fix automations: add filter/exit/frequency columns
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'trigger_filters') THEN
    ALTER TABLE automations ADD COLUMN trigger_filters JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'audience_filters') THEN
    ALTER TABLE automations ADD COLUMN audience_filters JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'exit_conditions') THEN
    ALTER TABLE automations ADD COLUMN exit_conditions JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automations' AND column_name = 'frequency_config') THEN
    ALTER TABLE automations ADD COLUMN frequency_config JSONB DEFAULT '{"type": "once"}';
  END IF;
END $$;
