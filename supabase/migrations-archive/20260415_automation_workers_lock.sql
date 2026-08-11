-- =============================================
-- WORDER: Worker lock / optimistic concurrency for automation_runs
-- 20260415_automation_workers_lock.sql
-- =============================================

ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS lock_token   UUID,
  ADD COLUMN IF NOT EXISTS locked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by    TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_node_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error   TEXT;

-- Índice para busca de runs expirados (heartbeat stale)
CREATE INDEX IF NOT EXISTS automation_runs_locked_idx
  ON automation_runs (locked_at)
  WHERE lock_token IS NOT NULL;

-- Mesma lógica para automation_pending_steps (delays)
ALTER TABLE automation_pending_steps
  ADD COLUMN IF NOT EXISTS lock_token UUID,
  ADD COLUMN IF NOT EXISTS locked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by  TEXT;

CREATE INDEX IF NOT EXISTS automation_pending_steps_locked_idx
  ON automation_pending_steps (locked_at)
  WHERE lock_token IS NOT NULL;

-- Função para adquirir lock de run (atomic):
-- 1. Só pega se status é 'pending' OU (lock expirado há > 5min)
-- 2. Seta lock_token, locked_at, locked_by, status='running'
CREATE OR REPLACE FUNCTION claim_automation_run(
  p_run_id UUID,
  p_worker_id TEXT,
  p_new_token UUID,
  p_stale_lock_minutes INT DEFAULT 5
) RETURNS TABLE (
  id UUID,
  automation_id UUID,
  contact_id UUID,
  deal_id UUID,
  metadata JSONB,
  status TEXT,
  lock_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE automation_runs r
     SET status = 'running',
         lock_token = p_new_token,
         locked_at = NOW(),
         locked_by = p_worker_id,
         last_heartbeat_at = NOW(),
         started_at = COALESCE(r.started_at, NOW())
   WHERE r.id = p_run_id
     AND (
       r.status IN ('pending', 'waiting')
       OR (r.lock_token IS NOT NULL
           AND r.locked_at < NOW() - (p_stale_lock_minutes || ' minutes')::INTERVAL)
     )
  RETURNING r.id, r.automation_id, r.contact_id, r.deal_id, r.metadata, r.status, r.lock_token;
END;
$$;

-- Heartbeat: renova locked_at para evitar que outro worker pense que está stale
CREATE OR REPLACE FUNCTION heartbeat_automation_run(
  p_run_id UUID,
  p_token UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ok BOOLEAN := false;
BEGIN
  UPDATE automation_runs
     SET last_heartbeat_at = NOW()
   WHERE id = p_run_id AND lock_token = p_token
   RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

-- Release lock ao concluir/pausar
CREATE OR REPLACE FUNCTION release_automation_run(
  p_run_id UUID,
  p_token UUID,
  p_new_status TEXT,
  p_error TEXT DEFAULT NULL,
  p_result JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ok BOOLEAN := false;
BEGIN
  UPDATE automation_runs
     SET status = p_new_status,
         lock_token = NULL,
         locked_at = NULL,
         locked_by = NULL,
         completed_at = CASE WHEN p_new_status IN ('completed', 'failed', 'cancelled')
                             THEN NOW() ELSE completed_at END,
         last_error = COALESCE(p_error, last_error),
         result = COALESCE(p_result, result)
   WHERE id = p_run_id AND lock_token = p_token
   RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

-- Cron cleanup: solta runs cujo heartbeat está stale (worker crashou)
CREATE OR REPLACE FUNCTION reclaim_stale_automation_runs(
  p_minutes INT DEFAULT 10
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_reclaimed INT;
BEGIN
  UPDATE automation_runs
     SET status = 'pending',
         lock_token = NULL,
         locked_at = NULL,
         locked_by = NULL,
         last_error = CONCAT('reclaimed: heartbeat stale >', p_minutes, 'min')
   WHERE lock_token IS NOT NULL
     AND last_heartbeat_at < NOW() - (p_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS count_reclaimed = ROW_COUNT;
  RETURN count_reclaimed;
END;
$$;
