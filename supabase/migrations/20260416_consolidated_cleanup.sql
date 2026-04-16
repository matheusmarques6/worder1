-- =============================================
-- WORDER: Consolidated cleanup + recreate
-- Run AFTER the explicit DROP TABLE statements above
-- 20260416_consolidated_cleanup.sql
-- =============================================

-- ========== deal_activities ==========
CREATE TABLE deal_activities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  deal_id          UUID NOT NULL,
  contact_id       UUID,
  user_id          UUID,
  activity_type    TEXT NOT NULL CHECK (activity_type IN (
    'note','call','email','meeting','task','stage_change','value_change','custom'
  )),
  title            TEXT,
  description      TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  is_pinned        BOOLEAN DEFAULT FALSE,
  due_at           TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX deal_activities_deal_idx    ON deal_activities (deal_id, created_at DESC);
CREATE INDEX deal_activities_org_idx     ON deal_activities (organization_id, created_at DESC);
CREATE INDEX deal_activities_contact_idx ON deal_activities (contact_id) WHERE contact_id IS NOT NULL;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deal_activities org access" ON deal_activities FOR ALL USING (true);

-- ========== ai_knowledge_sources ==========
CREATE TABLE ai_knowledge_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  agent_id         UUID NOT NULL,
  name             TEXT NOT NULL,
  source_type      TEXT NOT NULL CHECK (source_type IN (
    'file','url','text','faq','shopify_products','shopify_policies'
  )),
  content          TEXT,
  file_url         TEXT,
  file_size        INT,
  mime_type        TEXT,
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','error')),
  chunks_count     INT DEFAULT 0,
  error_message    TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ai_knowledge_sources_agent_idx ON ai_knowledge_sources (agent_id, status);
CREATE INDEX ai_knowledge_sources_org_idx   ON ai_knowledge_sources (organization_id);
ALTER TABLE ai_knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_knowledge_sources org access" ON ai_knowledge_sources FOR ALL USING (true);

-- ========== ai_knowledge_chunks ==========
CREATE TABLE ai_knowledge_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL,
  agent_id         UUID NOT NULL,
  content          TEXT NOT NULL,
  token_count      INT DEFAULT 0,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ai_knowledge_chunks_source_idx ON ai_knowledge_chunks (source_id);
CREATE INDEX ai_knowledge_chunks_agent_idx  ON ai_knowledge_chunks (agent_id);
ALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_knowledge_chunks org access" ON ai_knowledge_chunks FOR ALL USING (true);

-- ========== ai_usage_logs ==========
CREATE TABLE ai_usage_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  feature           TEXT NOT NULL,
  agent_id          UUID,
  conversation_id   UUID,
  prompt_tokens     INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens      INT GENERATED ALWAYS AS (COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) STORED,
  cost_usd          NUMERIC(10,6) DEFAULT 0,
  duration_ms       INT,
  success           BOOLEAN DEFAULT TRUE,
  error             TEXT,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ai_usage_logs_org_created_idx ON ai_usage_logs (organization_id, created_at DESC);
CREATE INDEX ai_usage_logs_org_feature_idx ON ai_usage_logs (organization_id, feature, created_at DESC);
CREATE INDEX ai_usage_logs_org_model_idx   ON ai_usage_logs (organization_id, provider, model);
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_usage_logs org access" ON ai_usage_logs FOR ALL USING (true);

-- ========== attribution_touchpoints ==========
CREATE TABLE attribution_touchpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID,
  visitor_id       TEXT,
  session_id       TEXT,
  touchpoint_type  TEXT NOT NULL CHECK (touchpoint_type IN ('first','last','assist')),
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_term         TEXT,
  utm_content      TEXT,
  gclid            TEXT,
  fbclid           TEXT,
  ttclid           TEXT,
  occurred_at      TIMESTAMPTZ DEFAULT NOW(),
  order_id         TEXT,
  revenue          NUMERIC(12,2),
  currency         TEXT DEFAULT 'BRL'
);
CREATE INDEX attribution_touchpoints_contact_idx ON attribution_touchpoints (contact_id, touchpoint_type, occurred_at DESC);
CREATE INDEX attribution_touchpoints_visitor_idx ON attribution_touchpoints (visitor_id, touchpoint_type, occurred_at DESC);
CREATE INDEX attribution_touchpoints_org_utm_idx ON attribution_touchpoints (organization_id, utm_source, utm_campaign, occurred_at DESC);
ALTER TABLE attribution_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attribution org access" ON attribution_touchpoints FOR ALL USING (true);

-- ========== contact_tags ==========
CREATE TABLE contact_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID NOT NULL,
  tag              TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX contact_tags_unique     ON contact_tags (contact_id, tag);
CREATE INDEX        contact_tags_org_tag_idx ON contact_tags (organization_id, tag);
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_tags org access" ON contact_tags FOR ALL USING (true);

-- ========== contact_rfm_scores ==========
CREATE TABLE contact_rfm_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID NOT NULL UNIQUE,
  store_id         UUID,
  recency_score    INT CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score  INT CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score   INT CHECK (monetary_score BETWEEN 1 AND 5),
  rfm_segment      TEXT,
  total_orders     INT DEFAULT 0,
  total_revenue    NUMERIC(12,2) DEFAULT 0,
  last_order_at    TIMESTAMPTZ,
  calculated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX contact_rfm_scores_org_idx ON contact_rfm_scores (organization_id, rfm_segment);
ALTER TABLE contact_rfm_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_rfm_scores org access" ON contact_rfm_scores FOR ALL USING (true);

-- ========== email_clicks ==========
CREATE TABLE email_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id UUID NOT NULL,
  url           TEXT NOT NULL,
  clicked_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX email_clicks_send_idx ON email_clicks (email_send_id);
ALTER TABLE email_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_clicks org access" ON email_clicks FOR ALL USING (true);

-- ========== whatsapp_tags ==========
CREATE TABLE whatsapp_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  color            TEXT DEFAULT '#6B7280',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX whatsapp_tags_org_name ON whatsapp_tags (organization_id, name);
ALTER TABLE whatsapp_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_tags org access" ON whatsapp_tags FOR ALL USING (true);

-- ========== whatsapp_transfers ==========
CREATE TABLE whatsapp_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  conversation_id  UUID NOT NULL,
  from_agent_id    UUID,
  to_agent_id      UUID,
  to_queue_id      UUID,
  reason           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX whatsapp_transfers_conv_idx ON whatsapp_transfers (conversation_id, created_at DESC);
ALTER TABLE whatsapp_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_transfers org access" ON whatsapp_transfers FOR ALL USING (true);

-- ========== email_campaigns: colunas de atribuição ==========
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS attributed_revenue NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions        INT DEFAULT 0;
