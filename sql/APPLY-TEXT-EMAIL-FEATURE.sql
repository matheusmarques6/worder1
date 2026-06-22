-- =============================================================
-- Worder — Apply text-based email feature (run this once in Supabase
-- SQL Editor against the project that's serving production).
--
-- Idempotent: safe to run more than once. Combines two migrations:
--   1. supabase/migrations/2026_06_22_text_based_email_templates.sql
--   2. supabase/migrations/2026_06_22_email_template_versions.sql
--
-- After running, PostgREST auto-reloads the schema cache within a few
-- seconds. If you see "Could not find the 'editor_type' column ... in
-- the schema cache" for longer than ~30s, hit the "Reload schema" button
-- in Supabase API settings (or `NOTIFY pgrst, 'reload schema';`).
-- =============================================================

-- ── Part 1 ──────────────────────────────────────────────────
-- editor_type column on email_templates: discriminates between the
-- existing drag-and-drop ("visual", default) and the founder-style
-- text editor ("text"). Default keeps every existing row working.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS editor_type TEXT NOT NULL DEFAULT 'visual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_editor_type_check'
  ) THEN
    ALTER TABLE email_templates
      ADD CONSTRAINT email_templates_editor_type_check
      CHECK (editor_type IN ('visual', 'text'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_templates_editor_type_idx
  ON email_templates (organization_id, editor_type);

-- ── Part 2 ──────────────────────────────────────────────────
-- email_template_versions: snapshot history for both editor flavors.
-- Trigger snapshots design_json before every meaningful UPDATE, with a
-- 90-second time gate (autosave fires every ~1.5s so a naive trigger
-- would create hundreds of rows per session) and a 40-row retention cap.

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
  IF TG_OP = 'UPDATE' AND OLD.design_json IS DISTINCT FROM NEW.design_json
     AND OLD.design_json IS NOT NULL THEN

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

-- ── Force PostgREST to refresh its schema cache so the new column is
--    visible to the API immediately. Without this the API can take ~10s
--    or so to notice the new column on its own.
NOTIFY pgrst, 'reload schema';

-- ── Verify ─────────────────────────────────────────────────────────
-- Should return 1 row with column_name = 'editor_type'.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'email_templates'
   AND column_name = 'editor_type';
