-- =============================================
-- WORDER: AI usage cost tracking + attribution helpers
-- 20260416_ai_costs_attribution.sql
-- =============================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  provider         TEXT NOT NULL,        -- 'openai', 'anthropic', 'google'
  model            TEXT NOT NULL,
  feature          TEXT NOT NULL,        -- 'whatsapp_agent', 'email_generation', 'segment_suggest', etc.
  agent_id         UUID,                 -- AI agent (se aplicável)
  conversation_id  UUID,                 -- WhatsApp conversation (se aplicável)
  prompt_tokens    INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens     INT GENERATED ALWAYS AS (COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) STORED,
  cost_usd         NUMERIC(10,6) DEFAULT 0,
  duration_ms      INT,
  success          BOOLEAN DEFAULT TRUE,
  error            TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_created_idx
  ON ai_usage_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_feature_idx
  ON ai_usage_logs (organization_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_model_idx
  ON ai_usage_logs (organization_id, provider, model);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_usage_logs org access" ON ai_usage_logs;
CREATE POLICY "ai_usage_logs org access" ON ai_usage_logs FOR ALL USING (true);

-- =============================================
-- Atribuição de conversão ads → orders (item 55)
-- Link entre um evento de compra e o click/visit inicial com utm_* / click_ids
-- =============================================

CREATE TABLE IF NOT EXISTS attribution_touchpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID,
  visitor_id       TEXT,
  session_id       TEXT,
  touchpoint_type  TEXT NOT NULL CHECK (touchpoint_type IN ('first', 'last', 'assist')),
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_term         TEXT,
  utm_content      TEXT,
  gclid            TEXT,
  fbclid           TEXT,
  ttclid           TEXT,
  occurred_at      TIMESTAMPTZ DEFAULT NOW(),
  order_id         TEXT,            -- preenchido quando converte
  revenue          NUMERIC(12,2),
  currency         TEXT DEFAULT 'BRL'
);

CREATE INDEX IF NOT EXISTS attribution_touchpoints_contact_idx
  ON attribution_touchpoints (contact_id, touchpoint_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS attribution_touchpoints_visitor_idx
  ON attribution_touchpoints (visitor_id, touchpoint_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS attribution_touchpoints_org_utm_idx
  ON attribution_touchpoints (organization_id, utm_source, utm_campaign, occurred_at DESC);

ALTER TABLE attribution_touchpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attribution org access" ON attribution_touchpoints;
CREATE POLICY "attribution org access" ON attribution_touchpoints FOR ALL USING (true);
