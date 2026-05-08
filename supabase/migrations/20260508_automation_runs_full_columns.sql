-- =====================================================
-- automation_runs + contact_activities — missing columns
--
-- Vercel logs surfaced two PGRST204 errors that explain why no email
-- ever shipped from cart-recovery automations:
--
--   "Could not find the 'deal_id' column of 'automation_runs'"
--   "Could not find the 'occurred_at' column of 'contact_activities'"
--
-- Plus the run-resume / lock paths reference columns that may be
-- missing on installs that predate them:
--   waiting_until, current_node_id, completed_at, last_error,
--   lock_token, locked_at, locked_by, last_heartbeat_at, result
--
-- All ADD COLUMN IF NOT EXISTS so re-running is safe.
-- =====================================================

-- automation_runs ------------------------------------------
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS deal_id            UUID,
  ADD COLUMN IF NOT EXISTS waiting_until      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_node_id    TEXT,
  ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error         TEXT,
  ADD COLUMN IF NOT EXISTS result             JSONB,
  ADD COLUMN IF NOT EXISTS metadata           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lock_token         UUID,
  ADD COLUMN IF NOT EXISTS locked_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by          TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

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


-- contact_activities ----------------------------------------
ALTER TABLE contact_activities
  ADD COLUMN IF NOT EXISTS occurred_at  TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS url          TEXT,
  ADD COLUMN IF NOT EXISTS source       TEXT,
  ADD COLUMN IF NOT EXISTS source_id    TEXT,
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}'::jsonb;

-- Refresh PostgREST schema cache so the new columns become reachable
-- without needing a server restart.
NOTIFY pgrst, 'reload schema';
