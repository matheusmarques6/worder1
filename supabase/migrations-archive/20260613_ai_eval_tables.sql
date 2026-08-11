-- =====================================================
-- Agentes de IA — Avaliação: critérios, casos e resultados (Bloco F4)
-- =====================================================
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS antes de CREATE POLICY. SEM DROP TABLE.
--
-- ai_eval_criteria: rubrica por agente (5 critérios padrão semeados no run).
-- ai_eval_cases:    casos de avaliação materializados de anotações/cenários/manual.
-- ai_eval_results:  veredito do juiz LLM por caso (verdict + score + por-critério).
-- Escrita acontece apenas via service role (getSupabaseAdmin), que fura RLS —
-- mesmo padrão de ai_agent_versions / agent_trace_annotations / ai_test_scenarios.
-- Leitura por org via user_belongs_to_org.
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
-- ai_eval_criteria
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_eval_criteria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  agent_id        uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  label           text NOT NULL,
  description     text,
  position        int NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_criteria_agent
  ON ai_eval_criteria (agent_id, created_at DESC);

ALTER TABLE ai_eval_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org eval criteria" ON ai_eval_criteria;
CREATE POLICY "Users can view own org eval criteria" ON ai_eval_criteria
    FOR SELECT USING (user_belongs_to_org(organization_id));

-- =====================================================
-- ai_eval_cases
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_eval_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  agent_id        uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  title           text NOT NULL,
  input           text,
  expected        text,
  source          text CHECK (source IN ('annotation','scenario','manual')),
  source_id       uuid,
  tags            text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_agent
  ON ai_eval_cases (agent_id, created_at DESC);

ALTER TABLE ai_eval_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org eval cases" ON ai_eval_cases;
CREATE POLICY "Users can view own org eval cases" ON ai_eval_cases
    FOR SELECT USING (user_belongs_to_org(organization_id));

-- =====================================================
-- ai_eval_results
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_eval_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  agent_id         uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  case_id          uuid REFERENCES ai_eval_cases(id) ON DELETE CASCADE,
  version_id       uuid REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
  verdict          text CHECK (verdict IN ('pass','fail')),
  score            int,
  criteria_results jsonb,
  judge_model      text,
  judged_output    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_results_agent
  ON ai_eval_results (agent_id, created_at DESC);

ALTER TABLE ai_eval_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org eval results" ON ai_eval_results;
CREATE POLICY "Users can view own org eval results" ON ai_eval_results
    FOR SELECT USING (user_belongs_to_org(organization_id));
