-- Segmentation v2 foundation — lists, segment cache, reevaluation queue,
-- and additive columns on customer_segments.
--
-- Klaviyo / Omnisend parity work. Non-destructive: keeps the existing
-- customer_segments + segment_members tables intact so the legacy
-- resolver and any in-flight static segments keep working. The data
-- migration that splits static segments → contact_lists runs in a
-- separate file (20260518_segments_v2_migrate_static.sql) once we've
-- verified the new tables work.

-- ─────────────────────────────────────────────────────────────────────
-- contact_lists — static, manually-managed audience sets
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  -- How this list was populated. UI surfaces this so the merchant
  -- knows whether contacts came from a CSV upload, a form, an
  -- integration, or were added one-by-one.
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'csv_import', 'form', 'integration', 'migrated_static_segment')),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Cached member count. Recomputed on every membership mutation
  -- (insert/delete). Avoids count(*) on the table view.
  total_contacts INT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_org ON contact_lists (organization_id) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_contact_lists_store ON contact_lists (store_id) WHERE store_id IS NOT NULL;

-- Trigger to bump updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION contact_lists_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_contact_lists_updated_at ON contact_lists;
CREATE TRIGGER trg_contact_lists_updated_at
  BEFORE UPDATE ON contact_lists
  FOR EACH ROW EXECUTE FUNCTION contact_lists_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- contact_list_members — membership of static lists
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_list_members (
  list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID,
  source TEXT,
  PRIMARY KEY (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_clm_contact ON contact_list_members (contact_id);

-- Keep total_contacts cache in sync.
CREATE OR REPLACE FUNCTION contact_list_members_sync_count() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE affected_list UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN affected_list := OLD.list_id;
  ELSE affected_list := NEW.list_id;
  END IF;
  UPDATE contact_lists
    SET total_contacts = (SELECT count(*) FROM contact_list_members WHERE list_id = affected_list)
    WHERE id = affected_list;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_clm_count_after ON contact_list_members;
CREATE TRIGGER trg_clm_count_after
  AFTER INSERT OR DELETE ON contact_list_members
  FOR EACH ROW EXECUTE FUNCTION contact_list_members_sync_count();

-- ─────────────────────────────────────────────────────────────────────
-- customer_segments — additive columns for v2
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS rule_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rule_dependencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evaluation_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (evaluation_status IN ('idle', 'running', 'error')),
  ADD COLUMN IF NOT EXISTS evaluation_error TEXT,
  -- When true the resolver reads from segment_member_cache instead of
  -- evaluating rules on every query. Worth flipping on for segments
  -- that drive heavy traffic (campaign audiences, dashboard tiles).
  ADD COLUMN IF NOT EXISTS uses_materialized_cache BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────
-- segment_member_cache — optional materialized membership
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segment_member_cache (
  segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_smc_contact ON segment_member_cache (contact_id);

-- ─────────────────────────────────────────────────────────────────────
-- segment_reeval_queue — pending reevaluations (drained by worker)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segment_reeval_queue (
  segment_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  reason TEXT,                                  -- 'event:placed_order' | 'field:total_orders' | ...
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (segment_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_srq_pending
  ON segment_reeval_queue (scheduled_at)
  WHERE processed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- RLS — same model the org uses elsewhere (membership-based)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_member_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_lists_member_access ON contact_lists;
CREATE POLICY contact_lists_member_access ON contact_lists
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS contact_list_members_access ON contact_list_members;
CREATE POLICY contact_list_members_access ON contact_list_members
  FOR ALL TO authenticated
  USING (
    list_id IN (
      SELECT id FROM contact_lists WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    list_id IN (
      SELECT id FROM contact_lists WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS segment_member_cache_access ON segment_member_cache;
CREATE POLICY segment_member_cache_access ON segment_member_cache
  FOR SELECT TO authenticated
  USING (
    segment_id IN (
      SELECT id FROM customer_segments WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Service role writes to cache & queue directly; no SELECT policy
-- needed for the queue (worker-only).

COMMENT ON TABLE contact_lists IS
  'Static audience sets (CSV imports, manual signups, form opt-ins). '
  'Counterpart to customer_segments which holds dynamic rule-based segments.';

COMMENT ON TABLE segment_member_cache IS
  'Materialized membership for high-traffic dynamic segments. Populated '
  'by the reevaluation worker; read-through to live evaluation when '
  'customer_segments.uses_materialized_cache = false.';

COMMENT ON TABLE segment_reeval_queue IS
  'Pending segment reevaluations triggered by contact/event mutations. '
  'Worker drains rows where processed_at IS NULL.';
