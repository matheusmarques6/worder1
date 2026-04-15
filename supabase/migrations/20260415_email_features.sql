-- =============================================
-- WORDER: Email features — A/B test, scheduled, versioning
-- 20260415_email_features.sql
-- =============================================

-- 1. A/B testing em email_campaigns
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS ab_test_enabled  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ab_test_percent  INT DEFAULT 50 CHECK (ab_test_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS ab_variant_b     JSONB, -- { subject, preheader, template_id, design_json }
  ADD COLUMN IF NOT EXISTS ab_winner_metric TEXT DEFAULT 'open_rate' CHECK (ab_winner_metric IN ('open_rate','click_rate','conversion_rate')),
  ADD COLUMN IF NOT EXISTS ab_duration_hours INT DEFAULT 4,
  ADD COLUMN IF NOT EXISTS ab_winner        TEXT CHECK (ab_winner IN ('a','b') OR ab_winner IS NULL),
  ADD COLUMN IF NOT EXISTS ab_resolved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_opens      INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_clicks     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_delivered  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_bounced    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_complained INT DEFAULT 0;

-- Index for scheduled campaigns cron
CREATE INDEX IF NOT EXISTS email_campaigns_scheduled_idx
  ON email_campaigns (status, scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'scheduled';

-- Email sends: registrar qual variant foi enviada
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS ab_variant TEXT CHECK (ab_variant IN ('a','b') OR ab_variant IS NULL);

-- 2. Saved blocks versioning
CREATE TABLE IF NOT EXISTS saved_block_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id         UUID NOT NULL,
  organization_id  UUID NOT NULL,
  version          INT NOT NULL,
  block_json       JSONB NOT NULL,
  created_by       UUID,
  comment          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_block_versions_unique
  ON saved_block_versions (block_id, version);

CREATE INDEX IF NOT EXISTS saved_block_versions_org_idx
  ON saved_block_versions (organization_id, block_id, created_at DESC);

ALTER TABLE saved_block_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_block_versions select" ON saved_block_versions;
CREATE POLICY "saved_block_versions select" ON saved_block_versions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "saved_block_versions insert" ON saved_block_versions;
CREATE POLICY "saved_block_versions insert" ON saved_block_versions
  FOR INSERT WITH CHECK (true);

-- Trigger para incrementar versão no saved_blocks
CREATE OR REPLACE FUNCTION bump_saved_block_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_version INT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.block_json IS DISTINCT FROM NEW.block_json THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
      FROM saved_block_versions
     WHERE block_id = NEW.id;
    INSERT INTO saved_block_versions (block_id, organization_id, version, block_json, comment)
    VALUES (NEW.id, NEW.organization_id, next_version, OLD.block_json, 'auto-snapshot before update');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_saved_block_version ON saved_blocks;
CREATE TRIGGER trg_bump_saved_block_version
  BEFORE UPDATE ON saved_blocks
  FOR EACH ROW
  EXECUTE FUNCTION bump_saved_block_version();

-- 3. Segmentação avançada: suporte a grupos com AND/OR
-- Estrutura esperada em segments.conditions:
-- {
--   "operator": "and" | "or",
--   "rules": [
--     { "field": "email", "operator": "equals", "value": "foo" },
--     {
--       "operator": "or",
--       "rules": [...]
--     }
--   ]
-- }
-- Nada a alterar no schema além de garantir JSONB. Já é JSONB.

-- 4. RPC para resolver conditions hierárquicas (alternativa server-side)
-- Não implementamos aqui — resolvido no TS em src/lib/segments/resolver.ts
