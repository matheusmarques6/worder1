-- =============================================================
-- RPC: count_events_by_type
-- Efficient GROUP BY counting for the metrics page.
-- Replaces the broken approach of fetching all rows (capped at
-- 1000 by PostgREST default) and counting in JavaScript.
-- =============================================================

CREATE OR REPLACE FUNCTION count_events_by_type(
  p_org_id UUID,
  p_since TIMESTAMPTZ
)
RETURNS TABLE(event_type TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT ce.event_type, COUNT(*) AS cnt
  FROM contact_events ce
  WHERE ce.organization_id = p_org_id
    AND ce.occurred_at >= p_since
  GROUP BY ce.event_type;
$$;

-- Ensure the existing index covers this query efficiently
CREATE INDEX IF NOT EXISTS idx_contact_events_org_occurred
  ON contact_events(organization_id, occurred_at);
