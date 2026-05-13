-- =====================================================
-- shopify_import_jobs resume index
--
-- syncOrdersGraphQL (and the upcoming bulk worker) starts every run
-- by looking for a job row for the same (store, sync_type) in
-- 'running' / 'pending' / 'paused' state so it can resume from
-- last_cursor instead of starting over. This index covers that exact
-- predicate ordered by created_at DESC.
--
-- Idempotent.
-- =====================================================

CREATE INDEX IF NOT EXISTS shopify_import_jobs_resume_idx
  ON shopify_import_jobs (store_id, organization_id, status, created_at DESC);
