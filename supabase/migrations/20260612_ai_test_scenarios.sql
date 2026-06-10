-- =====================================================
-- Agentes de IA — Cenários de Test-run + Runs (Bloco F3)
-- =====================================================
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS antes de CREATE POLICY. SEM DROP TABLE.
--
-- ai_test_scenarios: cenários de teste (persona + turnos do cliente) por agente.
-- ai_scenario_runs:  resultado de cada execução (transcript + nota do juiz).
-- Escrita acontece apenas via service role (getSupabaseAdmin), que fura RLS —
-- mesmo padrão de ai_agent_versions / agent_trace_annotations. Leitura por org.
-- =====================================================

-- Helper de RLS (cria se não existir — mesmo padrão do projeto)
CREATE OR REPLACE FUNCTION user_belongs_to_org(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND organization_id = org_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ai_test_scenarios
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_test_scenarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  agent_id          uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  title             text NOT NULL,
  persona           text,
  user_turns        jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_behavior text,
  tags              text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_scenarios_agent
  ON ai_test_scenarios (agent_id, created_at DESC);

ALTER TABLE ai_test_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org test scenarios" ON ai_test_scenarios;
CREATE POLICY "Users can view own org test scenarios" ON ai_test_scenarios
    FOR SELECT USING (user_belongs_to_org(organization_id));

-- =====================================================
-- ai_scenario_runs
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_scenario_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  agent_id        uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  scenario_id     uuid NOT NULL REFERENCES ai_test_scenarios(id) ON DELETE CASCADE,
  version_id      uuid REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
  transcript      jsonb NOT NULL DEFAULT '[]'::jsonb,
  score           int,
  status          text CHECK (status IN ('pass','flag','grave')),
  note            text,
  judge_model     text,
  tokens          int,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario
  ON ai_scenario_runs (scenario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scenario_runs_agent
  ON ai_scenario_runs (agent_id, created_at DESC);

ALTER TABLE ai_scenario_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org scenario runs" ON ai_scenario_runs;
CREATE POLICY "Users can view own org scenario runs" ON ai_scenario_runs
    FOR SELECT USING (user_belongs_to_org(organization_id));
