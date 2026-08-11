-- =============================================================
-- Worder: Email template version history
--
-- Snapshots email_templates.design_json before each meaningful update so
-- editors (both the visual drag-and-drop and the new text-based one) get
-- a restore-from-history affordance across sessions.
--
-- Autosave fires every ~1.5s, so a naive "snapshot on every change"
-- trigger would create hundreds of rows per editing session. Two guards
-- keep the table sane:
--   1. Time gate — at most one snapshot per template per 90 seconds.
--      Bursts of autosaves collapse into a single restore point.
--   2. Retention cap — keep the 40 most recent snapshots per template;
--      older ones are pruned in the same trigger.
--
-- Multi-tenant: every row carries organization_id; the API filters on it
-- and the service-role client is the only writer. RLS policies mirror the
-- permissive saved_block_versions setup (enforcement lives in the API).
-- =============================================================

CREATE TABLE IF NOT EXISTS email_template_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID NOT NULL,
  organization_id  UUID NOT NULL,
  version          INT NOT NULL,
  design_json      JSONB NOT NULL,
  editor_type      TEXT,
  comment          TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_template_versions_unique
  ON email_template_versions (template_id, version);

CREATE INDEX IF NOT EXISTS email_template_versions_org_idx
  ON email_template_versions (organization_id, template_id, created_at DESC);

ALTER TABLE email_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_template_versions select" ON email_template_versions;
CREATE POLICY "email_template_versions select" ON email_template_versions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "email_template_versions insert" ON email_template_versions;
CREATE POLICY "email_template_versions insert" ON email_template_versions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "email_template_versions delete" ON email_template_versions;
CREATE POLICY "email_template_versions delete" ON email_template_versions
  FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION bump_email_template_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_version INT;
  last_snapshot TIMESTAMPTZ;
BEGIN
  -- Only snapshot when the canonical design payload actually changed.
  -- Renames, subject tweaks, store re-attachment etc. don't create
  -- restore points.
  IF TG_OP = 'UPDATE' AND OLD.design_json IS DISTINCT FROM NEW.design_json
     AND OLD.design_json IS NOT NULL THEN

    -- Time gate: skip if we snapshotted this template in the last 90s.
    SELECT MAX(created_at) INTO last_snapshot
      FROM email_template_versions
     WHERE template_id = NEW.id;

    IF last_snapshot IS NULL OR last_snapshot < NOW() - INTERVAL '90 seconds' THEN
      SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
        FROM email_template_versions
       WHERE template_id = NEW.id;

      INSERT INTO email_template_versions
        (template_id, organization_id, version, design_json, editor_type, comment)
      VALUES
        (NEW.id, NEW.organization_id, next_version, OLD.design_json,
         OLD.editor_type, 'auto-snapshot');

      -- Retention: keep the 40 most recent snapshots per template.
      DELETE FROM email_template_versions
       WHERE template_id = NEW.id
         AND id NOT IN (
           SELECT id FROM email_template_versions
            WHERE template_id = NEW.id
            ORDER BY version DESC
            LIMIT 40
         );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_email_template_version ON email_templates;
CREATE TRIGGER trg_bump_email_template_version
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION bump_email_template_version();
