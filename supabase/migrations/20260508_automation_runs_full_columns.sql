-- =====================================================
-- automation_runs + contact_activities — missing columns
--
-- Vercel logs surfaced multiple PGRST204 errors that explain why no
-- email ever shipped from cart-recovery automations:
--
--   "Could not find the 'organization_id' column of 'automation_runs'"
--   "Could not find the 'deal_id' column of 'automation_runs'"
--   "Could not find the 'occurred_at' column of 'contact_activities'"
--
-- The merchant's automation_runs table appears to have been created
-- via a much older migration that didn't include even foundational
-- columns. We add ALL of them defensively (IF NOT EXISTS), so re-
-- running this is always safe and the table ends up with the full
-- schema regardless of how it was originally provisioned.
-- =====================================================

-- automation_runs ------------------------------------------
-- Foundational identity / tenancy / linking columns first
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS organization_id    UUID,
  ADD COLUMN IF NOT EXISTS automation_id      UUID,
  ADD COLUMN IF NOT EXISTS contact_id         UUID,
  ADD COLUMN IF NOT EXISTS deal_id            UUID,
  ADD COLUMN IF NOT EXISTS trigger_event_id   UUID,
  ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'pending';

-- State machine + scheduling
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS waiting_until      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_node_id    TEXT,
  ADD COLUMN IF NOT EXISTS started_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- Result + error reporting
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS result             JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS node_results       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message      TEXT,
  ADD COLUMN IF NOT EXISTS error_node_id      TEXT,
  ADD COLUMN IF NOT EXISTS last_error         TEXT,
  ADD COLUMN IF NOT EXISTS metadata           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_data       JSONB DEFAULT '{}'::jsonb;

-- Run-lock columns (heartbeat-based concurrency control)
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS lock_token         UUID,
  ADD COLUMN IF NOT EXISTS locked_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by          TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_data        JSONB,
  ADD COLUMN IF NOT EXISTS resume_at          TIMESTAMPTZ;

-- Index used by /api/cron/check-delayed-runs
--   WHERE status='waiting' AND waiting_until <= NOW()
CREATE INDEX IF NOT EXISTS idx_automation_runs_waiting
  ON automation_runs (waiting_until)
  WHERE status = 'waiting';

-- Index used by /api/cron/process-runs + /api/cron/auto-process
--   WHERE status='pending' AND created_at < NOW() - 5s
CREATE INDEX IF NOT EXISTS idx_automation_runs_pending
  ON automation_runs (created_at)
  WHERE status = 'pending';

-- Index for idempotency lookups in dispatchTrigger
--   metadata->>'idempotency_key'
CREATE INDEX IF NOT EXISTS idx_automation_runs_idempotency
  ON automation_runs ((metadata->>'idempotency_key'))
  WHERE metadata->>'idempotency_key' IS NOT NULL;

-- Tenant scope index (most queries filter on it)
CREATE INDEX IF NOT EXISTS idx_automation_runs_org
  ON automation_runs (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- Per-automation index (history view in flow editor)
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
  ON automation_runs (automation_id, created_at DESC);


-- contact_activities ----------------------------------------
ALTER TABLE contact_activities
  ADD COLUMN IF NOT EXISTS organization_id  UUID,
  ADD COLUMN IF NOT EXISTS contact_id       UUID,
  ADD COLUMN IF NOT EXISTS type             TEXT,
  ADD COLUMN IF NOT EXISTS title            TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS url              TEXT,
  ADD COLUMN IF NOT EXISTS source           TEXT,
  ADD COLUMN IF NOT EXISTS source_id        TEXT,
  ADD COLUMN IF NOT EXISTS metadata         JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();

-- Refresh PostgREST schema cache so the new columns become reachable
-- without needing a server restart.
NOTIFY pgrst, 'reload schema';

