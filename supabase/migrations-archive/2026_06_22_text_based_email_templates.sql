-- =============================================================
-- Worder: Text-based email templates
--
-- Adds an `editor_type` discriminator to email_templates so a single
-- table holds both the existing drag-and-drop ("visual") emails and
-- the new founder-style ("text") emails. Defaults to 'visual' so every
-- existing row keeps its behavior with zero data backfill.
--
-- Multi-tenant guard: rows already carry organization_id (+ optional
-- store_id) and the API filters on auth.user.organization_id; no RLS
-- change is needed for the new column itself.
-- =============================================================

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS editor_type TEXT NOT NULL DEFAULT 'visual';

-- Constrain to known values. New editor flavors land here later.
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

-- Filterable list queries hit this column ("show only text-based" toggle).
CREATE INDEX IF NOT EXISTS email_templates_editor_type_idx
  ON email_templates (organization_id, editor_type);
