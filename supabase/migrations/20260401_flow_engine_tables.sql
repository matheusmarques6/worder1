-- Event logs for flow engine triggers
CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  contact_id UUID,
  deal_id UUID,
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_pending ON event_logs(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_event_logs_org ON event_logs(organization_id, event_type);

-- Automation runs tracking
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  contact_id UUID,
  deal_id UUID,
  trigger_event_id UUID,
  status TEXT DEFAULT 'pending',
  current_node_id TEXT,
  waiting_until TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_pending ON automation_runs(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_runs_waiting ON automation_runs(status, waiting_until) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);

-- Automation run steps (per-node execution log)
CREATE TABLE IF NOT EXISTS automation_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run ON automation_run_steps(run_id);
