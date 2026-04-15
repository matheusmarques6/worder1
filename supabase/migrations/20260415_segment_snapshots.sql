-- =============================================
-- WORDER: Segment membership snapshots
-- 20260415_segment_snapshots.sql
-- Usado por /api/cron/detect-segment-changes
-- =============================================

CREATE TABLE IF NOT EXISTS segment_memberships_snapshot (
  segment_id       UUID PRIMARY KEY,
  organization_id  UUID NOT NULL,
  contact_ids      UUID[] NOT NULL DEFAULT '{}',
  snapshotted_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS segment_snapshot_org_idx
  ON segment_memberships_snapshot (organization_id);

ALTER TABLE segment_memberships_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON segment_memberships_snapshot;
CREATE POLICY "Service role full access" ON segment_memberships_snapshot
  FOR ALL USING (true);
