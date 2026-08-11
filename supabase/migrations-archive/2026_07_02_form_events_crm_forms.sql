-- =====================================================
-- form_events (corrective): point at crm_forms, not `forms`
--
-- The 20260513_form_events.sql migration created form_events with a
-- FK to a `forms` table that does not exist (popups live in
-- crm_forms) — on most environments that migration aborted entirely,
-- on any environment where a legacy `forms` table existed the FK
-- points at the wrong parent. This migration is safe in BOTH cases:
--
--   * form_events missing            → created correctly here
--   * form_events with FK to `forms` → constraint repointed to
--                                      crm_forms (NOT VALID so legacy
--                                      rows never block the ALTER)
--   * already correct                → no-op
--
-- Also adds:
--   * crm_forms.dismissals_count (cumulative drop-off counter)
--   * increment_crm_form_counter(form_id, column) — atomic
--     UPDATE col = col + 1 used by the events beacon and the submit
--     endpoint (replaces racy read-then-write cycles)
--
-- Idempotent: safe to re-run. No tables/columns/data are dropped.
-- =====================================================

-- ============================================
-- 1. Table (correct shape) when missing
-- ============================================
CREATE TABLE IF NOT EXISTS form_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'dismissed', 'submitted', 'engaged')),
  properties JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. Repoint the FK if a pre-existing form_events references `forms`
--    (only possible where the broken 20260513 migration applied).
-- ============================================
DO $$
DECLARE
  bad_constraint TEXT;
BEGIN
  SELECT con.conname INTO bad_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_class fref ON fref.oid = con.confrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'form_events'
    AND con.contype = 'f'
    AND fref.relname = 'forms'
  LIMIT 1;

  IF bad_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.form_events DROP CONSTRAINT %I', bad_constraint);
  END IF;

  -- Ensure a FK to crm_forms exists (covers both the repoint case and
  -- any environment where form_events was created without the FK).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_class fref ON fref.oid = con.confrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'form_events'
      AND con.contype = 'f'
      AND fref.relname = 'crm_forms'
  ) THEN
    -- NOT VALID: rows written under the old (wrong) FK may reference
    -- ids that don't exist in crm_forms; validating would abort. New
    -- writes are enforced immediately, which is what matters.
    EXECUTE 'ALTER TABLE public.form_events
               ADD CONSTRAINT form_events_form_id_crm_forms_fkey
               FOREIGN KEY (form_id) REFERENCES crm_forms(id)
               ON DELETE CASCADE NOT VALID';
  END IF;
END $$;

-- ============================================
-- 3. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS form_events_org_form_time_idx
  ON form_events (organization_id, form_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS form_events_event_type_idx
  ON form_events (form_id, event_type, occurred_at DESC);

-- ============================================
-- 4. RLS — service_role full access (the public beacon endpoint writes
--    through the admin client) + org-scoped SELECT for the dashboard,
--    following the crm_forms policy pattern (profiles/org_members).
-- ============================================
ALTER TABLE form_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'form_events'
      AND policyname = 'form_events_service_role'
  ) THEN
    CREATE POLICY form_events_service_role ON form_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'form_events'
      AND policyname = 'form_events_org_select'
  ) THEN
    CREATE POLICY form_events_org_select ON form_events
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
          UNION
          SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================
-- 5. Cumulative dismissals counter on crm_forms (views_count /
--    submissions_count / impressions_count already exist).
-- ============================================
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS dismissals_count INTEGER DEFAULT 0;

-- ============================================
-- 6. Atomic counter RPC (whitelisted columns → no dynamic-SQL
--    injection). Used by /api/public/forms/[id]/events and
--    /api/public/forms/[id]/submit instead of read-then-write.
-- ============================================
CREATE OR REPLACE FUNCTION increment_crm_form_counter(
  p_form_id UUID,
  p_column TEXT
) RETURNS VOID AS $$
BEGIN
  IF p_column NOT IN ('views_count', 'impressions_count', 'submissions_count', 'dismissals_count') THEN
    RAISE EXCEPTION 'invalid column: %', p_column;
  END IF;
  EXECUTE format(
    'UPDATE crm_forms SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_column, p_column
  ) USING p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_crm_form_counter(UUID, TEXT) TO service_role;
