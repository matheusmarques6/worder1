-- =============================================
-- SPRINT 3: CRM AVANÇADO - ESTRUTURA COMPLETA
-- Execute no Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. CUSTOMER EVENTS (Event Tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Identificadores do visitante/cliente
  visitor_id TEXT, -- Cookie/fingerprint para visitantes anônimos
  customer_email TEXT,
  customer_phone TEXT,
  shopify_customer_id TEXT,
  
  -- Evento
  event_type TEXT NOT NULL, -- page_view, product_view, add_to_cart, checkout_started, purchase, etc
  event_source TEXT NOT NULL DEFAULT 'web', -- web, app, shopify, api
  
  -- Dados do evento
  event_data JSONB DEFAULT '{}', -- Dados específicos do evento
  
  -- Produto (se aplicável)
  product_id TEXT,
  product_name TEXT,
  product_price DECIMAL(12,2),
  product_quantity INTEGER DEFAULT 1,
  product_category TEXT,
  
  -- Pedido (se aplicável)
  order_id TEXT,
  order_total DECIMAL(12,2),
  
  -- Sessão
  session_id TEXT,
  page_url TEXT,
  referrer_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  -- Device/Geo
  device_type TEXT, -- desktop, mobile, tablet
  browser TEXT,
  ip_address INET,
  country TEXT,
  city TEXT,
  
  -- Timestamps
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_events_org_type ON customer_events(organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_contact ON customer_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON customer_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_email ON customer_events(customer_email);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON customer_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_product ON customer_events(product_id);
CREATE INDEX IF NOT EXISTS idx_events_order ON customer_events(order_id);

-- RLS
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
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
  
  -- Métricas brutas
  last_purchase_date TIMESTAMPTZ,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  avg_order_value DECIMAL(12,2) DEFAULT 0,
  
  -- Scores (1-5)
  recency_score INTEGER CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score INTEGER CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score INTEGER CHECK (monetary_score BETWEEN 1 AND 5),
  rfm_score TEXT, -- Concatenado: "555", "321", etc
  
  -- Segmento derivado
  rfm_segment TEXT, -- champions, loyal, at_risk, lost, etc
  
  -- Período de cálculo
  calculation_period_days INTEGER DEFAULT 365,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_rfm_org_segment ON customer_rfm_scores(organization_id, rfm_segment);
CREATE INDEX IF NOT EXISTS idx_rfm_score ON customer_rfm_scores(rfm_score);

ALTER TABLE customer_rfm_scores ENABLE ROW LEVEL SECURITY;
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
  
  -- Tipo de segmento
  segment_type TEXT NOT NULL DEFAULT 'dynamic', -- static, dynamic, rfm
  
  -- Regras (para segmentos dinâmicos)
  rules JSONB DEFAULT '[]', -- Array de condições
  rules_logic TEXT DEFAULT 'AND', -- AND, OR
  
  -- Para segmentos RFM
  rfm_segments TEXT[], -- ['champions', 'loyal']
  
  -- Contagem (cache)
  contact_count INTEGER DEFAULT 0,
  last_count_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_segments_org ON customer_segments(organization_id);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_segments_policy" ON customer_segments
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 4. SEGMENT MEMBERS (para segmentos estáticos)
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
CREATE INDEX IF NOT EXISTS idx_segment_members_contact ON segment_members(contact_id);

-- =============================================
-- 5. AUTOMATION PLAYBOOKS (Templates)
-- =============================================
CREATE TABLE IF NOT EXISTS automation_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = template global
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- abandoned_cart, winback, welcome, post_purchase, birthday, reactivation
  
  -- Status
  is_template BOOLEAN DEFAULT false, -- Templates globais da plataforma
  is_active BOOLEAN DEFAULT true,
  
  -- Trigger
  trigger_type TEXT NOT NULL, -- event, schedule, segment_entry, manual
  trigger_config JSONB DEFAULT '{}',
  -- Ex: { "event_type": "checkout_started", "delay_minutes": 60 }
  
  -- Steps/Nodes do workflow
  steps JSONB DEFAULT '[]',
  -- Ex: [{ "id": "1", "type": "wait", "config": { "minutes": 30 } }, { "type": "send_whatsapp", "config": { "template_id": "xxx" } }]
  
  -- Configurações
  settings JSONB DEFAULT '{}',
  -- Ex: { "max_per_contact": 1, "cooldown_days": 7, "exclude_segments": [] }
  
  -- Métricas (cache)
  total_runs INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_playbooks_org ON automation_playbooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_playbooks_category ON automation_playbooks(category);
CREATE INDEX IF NOT EXISTS idx_playbooks_template ON automation_playbooks(is_template) WHERE is_template = true;

ALTER TABLE automation_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_playbooks_policy" ON automation_playbooks
  FOR ALL USING (
    organization_id IS NULL OR -- Templates globais
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

-- =============================================
-- 6. PLAYBOOK RUNS (Execuções)
-- =============================================
CREATE TABLE IF NOT EXISTS playbook_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  playbook_id UUID NOT NULL REFERENCES automation_playbooks(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, cancelled, failed
  current_step INTEGER DEFAULT 0,
  
  -- Trigger info
  triggered_by TEXT, -- event, schedule, manual
  trigger_event_id UUID REFERENCES customer_events(id),
  
  -- Resultados
  steps_completed JSONB DEFAULT '[]',
  -- Ex: [{ "step_id": "1", "completed_at": "...", "result": {...} }]
  
  -- Conversão
  converted BOOLEAN DEFAULT false,
  conversion_order_id TEXT,
  conversion_revenue DECIMAL(12,2),
  converted_at TIMESTAMPTZ,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  next_step_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_org_status ON playbook_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_playbook ON playbook_runs(playbook_id);
CREATE INDEX IF NOT EXISTS idx_runs_contact ON playbook_runs(contact_id);
CREATE INDEX IF NOT EXISTS idx_runs_next_step ON playbook_runs(next_step_at) WHERE status = 'running';

ALTER TABLE playbook_runs ENABLE ROW LEVEL SECURITY;
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
  
  -- Pedido
  order_id TEXT NOT NULL,
  order_total DECIMAL(12,2) NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  
  -- Cliente
  contact_id UUID REFERENCES contacts(id),
  customer_email TEXT,
  
  -- Atribuição
  attribution_model TEXT DEFAULT 'last_touch', -- first_touch, last_touch, linear, time_decay
  
  -- Canais atribuídos
  channels JSONB DEFAULT '[]',
  -- Ex: [{ "channel": "whatsapp", "campaign_id": "xxx", "weight": 0.6, "revenue": 100 }]
  
  -- Touchpoints
  touchpoints JSONB DEFAULT '[]',
  -- Ex: [{ "channel": "email", "timestamp": "...", "campaign_id": "xxx" }]
  
  -- Playbook attribution
  playbook_id UUID REFERENCES automation_playbooks(id),
  playbook_run_id UUID REFERENCES playbook_runs(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribution_org ON revenue_attribution(organization_id);
CREATE INDEX IF NOT EXISTS idx_attribution_order ON revenue_attribution(order_id);
CREATE INDEX IF NOT EXISTS idx_attribution_date ON revenue_attribution(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_playbook ON revenue_attribution(playbook_id);

ALTER TABLE revenue_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_attribution_policy" ON revenue_attribution
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =============================================
-- 8. FUNÇÃO: Calcular RFM Scores
-- =============================================
CREATE OR REPLACE FUNCTION calculate_rfm_scores(p_organization_id UUID, p_period_days INTEGER DEFAULT 365)
RETURNS void AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_r_boundaries DECIMAL[];
  v_f_boundaries INTEGER[];
  v_m_boundaries DECIMAL[];
BEGIN
  v_cutoff_date := NOW() - (p_period_days || ' days')::INTERVAL;
  
  -- Calcular percentis para boundaries (20%, 40%, 60%, 80%)
  SELECT ARRAY[
    PERCENTILE_CONT(0.2) WITHIN GROUP (ORDER BY days_since),
    PERCENTILE_CONT(0.4) WITHIN GROUP (ORDER BY days_since),
    PERCENTILE_CONT(0.6) WITHIN GROUP (ORDER BY days_since),
    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY days_since)
  ] INTO v_r_boundaries
  FROM (
    SELECT EXTRACT(DAY FROM NOW() - MAX(e.event_timestamp)) as days_since
    FROM customer_events e
    WHERE e.organization_id = p_organization_id
    AND e.event_type = 'purchase'
    AND e.event_timestamp >= v_cutoff_date
    GROUP BY e.contact_id
  ) t;
  
  SELECT ARRAY[
    PERCENTILE_CONT(0.2) WITHIN GROUP (ORDER BY order_count),
    PERCENTILE_CONT(0.4) WITHIN GROUP (ORDER BY order_count),
    PERCENTILE_CONT(0.6) WITHIN GROUP (ORDER BY order_count),
    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY order_count)
  ]::INTEGER[] INTO v_f_boundaries
  FROM (
    SELECT COUNT(*) as order_count
    FROM customer_events e
    WHERE e.organization_id = p_organization_id
    AND e.event_type = 'purchase'
    AND e.event_timestamp >= v_cutoff_date
    GROUP BY e.contact_id
  ) t;
  
  SELECT ARRAY[
    PERCENTILE_CONT(0.2) WITHIN GROUP (ORDER BY total),
    PERCENTILE_CONT(0.4) WITHIN GROUP (ORDER BY total),
    PERCENTILE_CONT(0.6) WITHIN GROUP (ORDER BY total),
    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY total)
  ] INTO v_m_boundaries
  FROM (
    SELECT SUM(e.order_total) as total
    FROM customer_events e
    WHERE e.organization_id = p_organization_id
    AND e.event_type = 'purchase'
    AND e.event_timestamp >= v_cutoff_date
    GROUP BY e.contact_id
  ) t;
  
  -- Inserir/Atualizar scores
  INSERT INTO customer_rfm_scores (
    organization_id, contact_id, last_purchase_date, total_orders, total_spent, avg_order_value,
    recency_score, frequency_score, monetary_score, rfm_score, rfm_segment,
    calculation_period_days, calculated_at
  )
  SELECT 
    p_organization_id,
    c.id,
    MAX(e.event_timestamp),
    COUNT(e.id)::INTEGER,
    COALESCE(SUM(e.order_total), 0),
    COALESCE(AVG(e.order_total), 0),
    CASE 
      WHEN EXTRACT(DAY FROM NOW() - MAX(e.event_timestamp)) <= COALESCE(v_r_boundaries[1], 30) THEN 5
      WHEN EXTRACT(DAY FROM NOW() - MAX(e.event_timestamp)) <= COALESCE(v_r_boundaries[2], 60) THEN 4
      WHEN EXTRACT(DAY FROM NOW() - MAX(e.event_timestamp)) <= COALESCE(v_r_boundaries[3], 90) THEN 3
      WHEN EXTRACT(DAY FROM NOW() - MAX(e.event_timestamp)) <= COALESCE(v_r_boundaries[4], 180) THEN 2
      ELSE 1
    END,
    CASE 
      WHEN COUNT(e.id) >= COALESCE(v_f_boundaries[4], 5) THEN 5
      WHEN COUNT(e.id) >= COALESCE(v_f_boundaries[3], 3) THEN 4
      WHEN COUNT(e.id) >= COALESCE(v_f_boundaries[2], 2) THEN 3
      WHEN COUNT(e.id) >= COALESCE(v_f_boundaries[1], 1) THEN 2
      ELSE 1
    END,
    CASE 
      WHEN SUM(e.order_total) >= COALESCE(v_m_boundaries[4], 1000) THEN 5
      WHEN SUM(e.order_total) >= COALESCE(v_m_boundaries[3], 500) THEN 4
      WHEN SUM(e.order_total) >= COALESCE(v_m_boundaries[2], 200) THEN 3
      WHEN SUM(e.order_total) >= COALESCE(v_m_boundaries[1], 50) THEN 2
      ELSE 1
    END,
    '', -- rfm_score será calculado abaixo
    '', -- rfm_segment será calculado abaixo
    p_period_days,
    NOW()
  FROM contacts c
  LEFT JOIN customer_events e ON e.contact_id = c.id 
    AND e.event_type = 'purchase' 
    AND e.event_timestamp >= v_cutoff_date
  WHERE c.organization_id = p_organization_id
  GROUP BY c.id
  ON CONFLICT (organization_id, contact_id) DO UPDATE SET
    last_purchase_date = EXCLUDED.last_purchase_date,
    total_orders = EXCLUDED.total_orders,
    total_spent = EXCLUDED.total_spent,
    avg_order_value = EXCLUDED.avg_order_value,
    recency_score = EXCLUDED.recency_score,
    frequency_score = EXCLUDED.frequency_score,
    monetary_score = EXCLUDED.monetary_score,
    calculation_period_days = EXCLUDED.calculation_period_days,
    calculated_at = NOW(),
    updated_at = NOW();
  
  -- Atualizar rfm_score e rfm_segment
  UPDATE customer_rfm_scores SET
    rfm_score = recency_score::TEXT || frequency_score::TEXT || monetary_score::TEXT,
    rfm_segment = CASE
      WHEN recency_score >= 4 AND frequency_score >= 4 AND monetary_score >= 4 THEN 'champions'
      WHEN recency_score >= 3 AND frequency_score >= 3 AND monetary_score >= 3 THEN 'loyal'
      WHEN recency_score >= 4 AND frequency_score <= 2 THEN 'new_customers'
      WHEN recency_score >= 3 AND frequency_score >= 3 AND monetary_score <= 2 THEN 'potential_loyal'
      WHEN recency_score <= 2 AND frequency_score >= 3 THEN 'at_risk'
      WHEN recency_score <= 2 AND frequency_score >= 4 AND monetary_score >= 4 THEN 'cant_lose'
      WHEN recency_score <= 2 AND frequency_score <= 2 AND monetary_score <= 2 THEN 'lost'
      WHEN recency_score <= 3 AND frequency_score <= 2 THEN 'hibernating'
      ELSE 'others'
    END
  WHERE organization_id = p_organization_id;
  
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 9. TEMPLATES DE PLAYBOOKS (Dados iniciais)
-- =============================================
INSERT INTO automation_playbooks (id, organization_id, name, description, category, is_template, trigger_type, trigger_config, steps, settings) VALUES
-- Carrinho Abandonado
(
  'playbook-abandoned-cart',
  NULL,
  'Carrinho Abandonado',
  'Recupere vendas enviando lembretes para quem abandonou o carrinho',
  'abandoned_cart',
  true,
  'event',
  '{"event_type": "checkout_started", "condition": "no_purchase_after", "delay_minutes": 60}',
  '[
    {"id": "1", "type": "wait", "config": {"minutes": 60}},
    {"id": "2", "type": "send_whatsapp", "config": {"template": "cart_reminder_1"}},
    {"id": "3", "type": "wait", "config": {"hours": 24}},
    {"id": "4", "type": "condition", "config": {"check": "has_purchased", "yes_goto": "end", "no_goto": "5"}},
    {"id": "5", "type": "send_whatsapp", "config": {"template": "cart_reminder_2_discount"}},
    {"id": "end", "type": "end"}
  ]',
  '{"max_per_contact": 1, "cooldown_days": 7}'
),
-- Winback
(
  'playbook-winback',
  NULL,
  'Winback - Reativar Clientes',
  'Traga de volta clientes que não compram há muito tempo',
  'winback',
  true,
  'schedule',
  '{"schedule": "daily", "segment": "at_risk"}',
  '[
    {"id": "1", "type": "send_whatsapp", "config": {"template": "winback_miss_you"}},
    {"id": "2", "type": "wait", "config": {"days": 7}},
    {"id": "3", "type": "condition", "config": {"check": "has_purchased", "yes_goto": "end", "no_goto": "4"}},
    {"id": "4", "type": "send_whatsapp", "config": {"template": "winback_special_offer"}},
    {"id": "end", "type": "end"}
  ]',
  '{"max_per_contact": 1, "cooldown_days": 30}'
),
-- Boas-vindas
(
  'playbook-welcome',
  NULL,
  'Boas-vindas',
  'Dê as boas-vindas a novos clientes e apresente sua marca',
  'welcome',
  true,
  'event',
  '{"event_type": "first_purchase"}',
  '[
    {"id": "1", "type": "send_whatsapp", "config": {"template": "welcome_thanks"}},
    {"id": "2", "type": "wait", "config": {"days": 3}},
    {"id": "3", "type": "send_whatsapp", "config": {"template": "welcome_tips"}}
  ]',
  '{"max_per_contact": 1}'
),
-- Pós-compra
(
  'playbook-post-purchase',
  NULL,
  'Pós-compra',
  'Acompanhe o cliente após a compra e peça avaliação',
  'post_purchase',
  true,
  'event',
  '{"event_type": "purchase"}',
  '[
    {"id": "1", "type": "wait", "config": {"days": 7}},
    {"id": "2", "type": "send_whatsapp", "config": {"template": "post_purchase_review"}},
    {"id": "3", "type": "wait", "config": {"days": 14}},
    {"id": "4", "type": "send_whatsapp", "config": {"template": "cross_sell_recommendation"}}
  ]',
  '{"max_per_contact": 1, "cooldown_days": 30}'
),
-- Aniversário
(
  'playbook-birthday',
  NULL,
  'Aniversário',
  'Parabenize clientes no aniversário com oferta especial',
  'birthday',
  true,
  'schedule',
  '{"schedule": "daily", "condition": "birthday_today"}',
  '[
    {"id": "1", "type": "send_whatsapp", "config": {"template": "birthday_greeting"}}
  ]',
  '{"max_per_contact": 1}'
)
ON CONFLICT DO NOTHING;

-- =============================================
-- VERIFICAÇÃO FINAL
-- =============================================
SELECT 'customer_events' as table_name, COUNT(*) as count FROM customer_events
UNION ALL SELECT 'customer_rfm_scores', COUNT(*) FROM customer_rfm_scores
UNION ALL SELECT 'customer_segments', COUNT(*) FROM customer_segments
UNION ALL SELECT 'automation_playbooks', COUNT(*) FROM automation_playbooks
UNION ALL SELECT 'playbook_runs', COUNT(*) FROM playbook_runs
UNION ALL SELECT 'revenue_attribution', COUNT(*) FROM revenue_attribution;
