-- =============================================
-- SPRINT 3: CRM AVANÇADO - CORREÇÃO
-- Execute no Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. CUSTOMER EVENTS (Event Tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  visitor_id TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  shopify_customer_id TEXT,
  
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'web',
  event_data JSONB DEFAULT '{}',
  
  product_id TEXT,
  product_name TEXT,
  product_price DECIMAL(12,2),
  product_quantity INTEGER DEFAULT 1,
  product_category TEXT,
  
  order_id TEXT,
  order_total DECIMAL(12,2),
  
  session_id TEXT,
  page_url TEXT,
  referrer_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  device_type TEXT,
  browser TEXT,
  ip_address INET,
  country TEXT,
  city TEXT,
  
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_org_type ON customer_events(organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_contact ON customer_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON customer_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_email ON customer_events(customer_email);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON customer_events(event_timestamp DESC);

ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_events_policy" ON customer_events;
CREATE POLICY "org_events_policy" ON customer_events
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 2. CUSTOMER RFM SCORES
-- =============================================
CREATE TABLE IF NOT EXISTS customer_rfm_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  last_purchase_date TIMESTAMPTZ,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  avg_order_value DECIMAL(12,2) DEFAULT 0,
  
  recency_score INTEGER CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score INTEGER CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score INTEGER CHECK (monetary_score BETWEEN 1 AND 5),
  rfm_score TEXT,
  rfm_segment TEXT,
  
  calculation_period_days INTEGER DEFAULT 365,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_rfm_org_segment ON customer_rfm_scores(organization_id, rfm_segment);

ALTER TABLE customer_rfm_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_rfm_policy" ON customer_rfm_scores;
CREATE POLICY "org_rfm_policy" ON customer_rfm_scores
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 3. CUSTOMER SEGMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'users',
  
  segment_type TEXT NOT NULL DEFAULT 'dynamic',
  rules JSONB DEFAULT '[]',
  rules_logic TEXT DEFAULT 'AND',
  rfm_segments TEXT[],
  
  contact_count INTEGER DEFAULT 0,
  last_count_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_segments_org ON customer_segments(organization_id);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_segments_policy" ON customer_segments;
CREATE POLICY "org_segments_policy" ON customer_segments
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 4. SEGMENT MEMBERS
-- =============================================
CREATE TABLE IF NOT EXISTS segment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id),
  
  UNIQUE(segment_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_members_segment ON segment_members(segment_id);

-- =============================================
-- 5. AUTOMATION PLAYBOOKS
-- =============================================
CREATE TABLE IF NOT EXISTS automation_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  
  is_template BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  
  total_runs INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_playbooks_org ON automation_playbooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_playbooks_template ON automation_playbooks(is_template) WHERE is_template = true;

ALTER TABLE automation_playbooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_playbooks_policy" ON automation_playbooks;
CREATE POLICY "org_playbooks_policy" ON automation_playbooks
  FOR ALL USING (
    organization_id IS NULL OR
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================
-- 6. PLAYBOOK RUNS
-- =============================================
CREATE TABLE IF NOT EXISTS playbook_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  playbook_id UUID NOT NULL REFERENCES automation_playbooks(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'running',
  current_step INTEGER DEFAULT 0,
  
  triggered_by TEXT,
  trigger_event_id UUID REFERENCES customer_events(id),
  
  steps_completed JSONB DEFAULT '[]',
  
  converted BOOLEAN DEFAULT false,
  conversion_order_id TEXT,
  conversion_revenue DECIMAL(12,2),
  converted_at TIMESTAMPTZ,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  next_step_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_org_status ON playbook_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_playbook ON playbook_runs(playbook_id);
CREATE INDEX IF NOT EXISTS idx_runs_next_step ON playbook_runs(next_step_at) WHERE status = 'running';

ALTER TABLE playbook_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_runs_policy" ON playbook_runs;
CREATE POLICY "org_runs_policy" ON playbook_runs
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 7. REVENUE ATTRIBUTION
-- =============================================
CREATE TABLE IF NOT EXISTS revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  order_id TEXT NOT NULL,
  order_total DECIMAL(12,2) NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  
  contact_id UUID REFERENCES contacts(id),
  customer_email TEXT,
  
  attribution_model TEXT DEFAULT 'last_touch',
  channels JSONB DEFAULT '[]',
  touchpoints JSONB DEFAULT '[]',
  
  playbook_id UUID REFERENCES automation_playbooks(id),
  playbook_run_id UUID REFERENCES playbook_runs(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribution_org ON revenue_attribution(organization_id);
CREATE INDEX IF NOT EXISTS idx_attribution_playbook ON revenue_attribution(playbook_id);

ALTER TABLE revenue_attribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_attribution_policy" ON revenue_attribution;
CREATE POLICY "org_attribution_policy" ON revenue_attribution
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 8. TEMPLATES DE PLAYBOOKS (UUID auto-gerado)
-- =============================================
INSERT INTO automation_playbooks (organization_id, name, description, category, is_template, trigger_type, trigger_config, steps, settings) VALUES
(
  NULL,
  'Carrinho Abandonado',
  'Recupere vendas enviando lembretes para quem abandonou o carrinho',
  'abandoned_cart',
  true,
  'event',
  '{"event_type": "checkout_started", "condition": "no_purchase_after", "delay_minutes": 60}',
  '[{"id": "1", "type": "wait", "config": {"minutes": 60}},{"id": "2", "type": "send_whatsapp", "config": {"template": "cart_reminder_1"}},{"id": "3", "type": "wait", "config": {"hours": 24}},{"id": "4", "type": "condition", "config": {"check": "has_purchased", "yes_goto": "end", "no_goto": "5"}},{"id": "5", "type": "send_whatsapp", "config": {"template": "cart_reminder_2_discount"}},{"id": "end", "type": "end"}]',
  '{"max_per_contact": 1, "cooldown_days": 7}'
),
(
  NULL,
  'Winback - Reativar Clientes',
  'Traga de volta clientes que não compram há muito tempo',
  'winback',
  true,
  'schedule',
  '{"schedule": "daily", "segment": "at_risk"}',
  '[{"id": "1", "type": "send_whatsapp", "config": {"template": "winback_miss_you"}},{"id": "2", "type": "wait", "config": {"days": 7}},{"id": "3", "type": "condition", "config": {"check": "has_purchased", "yes_goto": "end", "no_goto": "4"}},{"id": "4", "type": "send_whatsapp", "config": {"template": "winback_special_offer"}},{"id": "end", "type": "end"}]',
  '{"max_per_contact": 1, "cooldown_days": 30}'
),
(
  NULL,
  'Boas-vindas',
  'Dê as boas-vindas a novos clientes e apresente sua marca',
  'welcome',
  true,
  'event',
  '{"event_type": "first_purchase"}',
  '[{"id": "1", "type": "send_whatsapp", "config": {"template": "welcome_thanks"}},{"id": "2", "type": "wait", "config": {"days": 3}},{"id": "3", "type": "send_whatsapp", "config": {"template": "welcome_tips"}}]',
  '{"max_per_contact": 1}'
),
(
  NULL,
  'Pós-compra',
  'Acompanhe o cliente após a compra e peça avaliação',
  'post_purchase',
  true,
  'event',
  '{"event_type": "purchase"}',
  '[{"id": "1", "type": "wait", "config": {"days": 7}},{"id": "2", "type": "send_whatsapp", "config": {"template": "post_purchase_review"}},{"id": "3", "type": "wait", "config": {"days": 14}},{"id": "4", "type": "send_whatsapp", "config": {"template": "cross_sell_recommendation"}}]',
  '{"max_per_contact": 1, "cooldown_days": 30}'
),
(
  NULL,
  'Aniversário',
  'Parabenize clientes no aniversário com oferta especial',
  'birthday',
  true,
  'schedule',
  '{"schedule": "daily", "condition": "birthday_today"}',
  '[{"id": "1", "type": "send_whatsapp", "config": {"template": "birthday_greeting"}}]',
  '{"max_per_contact": 1}'
)
ON CONFLICT DO NOTHING;

-- =============================================
-- VERIFICAÇÃO
-- =============================================
SELECT 'customer_events' as table_name, COUNT(*) as count FROM customer_events
UNION ALL SELECT 'customer_rfm_scores', COUNT(*) FROM customer_rfm_scores
UNION ALL SELECT 'customer_segments', COUNT(*) FROM customer_segments
UNION ALL SELECT 'automation_playbooks', COUNT(*) FROM automation_playbooks
UNION ALL SELECT 'playbook_runs', COUNT(*) FROM playbook_runs
UNION ALL SELECT 'revenue_attribution', COUNT(*) FROM revenue_attribution;
