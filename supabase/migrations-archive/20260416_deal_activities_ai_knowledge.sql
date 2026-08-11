-- =============================================
-- WORDER: Deal activities + AI knowledge tables
-- 20260416_deal_activities_ai_knowledge.sql
-- =============================================

-- Deal activities (notes, calls, emails, meetings, tasks)
CREATE TABLE IF NOT EXISTS deal_activities (
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

CREATE INDEX IF NOT EXISTS deal_activities_deal_idx
  ON deal_activities (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_activities_org_idx
  ON deal_activities (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_activities_contact_idx
  ON deal_activities (contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deal_activities org access" ON deal_activities;
CREATE POLICY "deal_activities org access" ON deal_activities FOR ALL USING (true);

-- AI knowledge sources (documents uploaded to agents)
CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
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

CREATE INDEX IF NOT EXISTS ai_knowledge_sources_agent_idx
  ON ai_knowledge_sources (agent_id, status);
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_org_idx
  ON ai_knowledge_sources (organization_id);

ALTER TABLE ai_knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_knowledge_sources org access" ON ai_knowledge_sources;
CREATE POLICY "ai_knowledge_sources org access" ON ai_knowledge_sources FOR ALL USING (true);

-- AI knowledge chunks (embeddings storage)
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL,
  agent_id         UUID NOT NULL,
  content          TEXT NOT NULL,
  token_count      INT DEFAULT 0,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_source_idx
  ON ai_knowledge_chunks (source_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_agent_idx
  ON ai_knowledge_chunks (agent_id);

ALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_knowledge_chunks org access" ON ai_knowledge_chunks;
CREATE POLICY "ai_knowledge_chunks org access" ON ai_knowledge_chunks FOR ALL USING (true);
