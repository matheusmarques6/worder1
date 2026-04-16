-- =============================================
-- WORDER: Tabelas faltantes (causa 500 em produção)
-- 20260416_missing_tables.sql
-- =============================================

-- contact_tags (usada por automations tag actions)
CREATE TABLE IF NOT EXISTS contact_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID NOT NULL,
  tag              TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_tags_unique
  ON contact_tags (contact_id, tag);
CREATE INDEX IF NOT EXISTS contact_tags_org_tag_idx
  ON contact_tags (organization_id, tag);
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_tags org access" ON contact_tags;
CREATE POLICY "contact_tags org access" ON contact_tags FOR ALL USING (true);

-- contact_rfm_scores (usada por RFM analytics)
CREATE TABLE IF NOT EXISTS contact_rfm_scores (
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
CREATE INDEX IF NOT EXISTS contact_rfm_scores_org_idx
  ON contact_rfm_scores (organization_id, rfm_segment);
ALTER TABLE contact_rfm_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_rfm_scores org access" ON contact_rfm_scores;
CREATE POLICY "contact_rfm_scores org access" ON contact_rfm_scores FOR ALL USING (true);

-- email_clicks (log individual de clicks)
CREATE TABLE IF NOT EXISTS email_clicks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id    UUID NOT NULL,
  url              TEXT NOT NULL,
  clicked_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_clicks_send_idx
  ON email_clicks (email_send_id);
ALTER TABLE email_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_clicks org access" ON email_clicks;
CREATE POLICY "email_clicks org access" ON email_clicks FOR ALL USING (true);

-- email_campaigns: colunas de atribuição (se não existem)
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS attributed_revenue NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions INT DEFAULT 0;

-- whatsapp_tags
CREATE TABLE IF NOT EXISTS whatsapp_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  color            TEXT DEFAULT '#6B7280',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_tags_org_name
  ON whatsapp_tags (organization_id, name);
ALTER TABLE whatsapp_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_tags org access" ON whatsapp_tags;
CREATE POLICY "whatsapp_tags org access" ON whatsapp_tags FOR ALL USING (true);

-- whatsapp_transfers (log de transferências de conversa)
CREATE TABLE IF NOT EXISTS whatsapp_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  conversation_id  UUID NOT NULL,
  from_agent_id    UUID,
  to_agent_id      UUID,
  to_queue_id      UUID,
  reason           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_transfers_conv_idx
  ON whatsapp_transfers (conversation_id, created_at DESC);
ALTER TABLE whatsapp_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_transfers org access" ON whatsapp_transfers;
CREATE POLICY "whatsapp_transfers org access" ON whatsapp_transfers FOR ALL USING (true);
