-- =====================================================
-- form_events: time-series of every popup interaction
--
-- The popup script (api/forms/[id]/embed) beacons impressions,
-- dismissals, and submissions to /api/public/forms/[id]/events.
-- Storing each event with a timestamp lets the analytics dashboard
-- trend daily/hourly conversion in addition to the cumulative
-- counters on the forms table. Same shape Klaviyo/Omnisend use
-- under the hood.
--
-- Also adds dismissals_count column to forms for cumulative
-- reporting; the existing views_count + submissions_count cover
-- impressions + submits.
--
-- Idempotent: safe to re-run.
-- =====================================================

CREATE TABLE IF NOT EXISTS form_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'dismissed', 'submitted', 'engaged')),
  properties JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS form_events_org_form_time_idx
  ON form_events (organization_id, form_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS form_events_event_type_idx
  ON form_events (form_id, event_type, occurred_at DESC);

ALTER TABLE form_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_events_service_role ON form_events;
CREATE POLICY form_events_service_role ON form_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_events_org_isolation ON form_events;
CREATE POLICY form_events_org_isolation ON form_events
  FOR ALL USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

-- Cumulative dismissals counter on the form so the list view can
-- show drop-off ratio at a glance without joining form_events.
ALTER TABLE forms ADD COLUMN IF NOT EXISTS dismissals_count INTEGER DEFAULT 0;

-- RPC used by the events endpoint to bump a counter without racing
-- the read-modify-write cycle. Atomic UPDATE col = col + 1 server-side.
CREATE OR REPLACE FUNCTION increment_form_counter(
  p_form_id UUID,
  p_column TEXT
) RETURNS VOID AS $$
BEGIN
  -- Whitelist columns to prevent SQL injection through dynamic SQL.
  IF p_column NOT IN ('views_count', 'submissions_count', 'dismissals_count') THEN
    RAISE EXCEPTION 'invalid column: %', p_column;
  END IF;
  EXECUTE format(
    'UPDATE forms SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_column, p_column
  ) USING p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_form_counter(UUID, TEXT) TO service_role;
