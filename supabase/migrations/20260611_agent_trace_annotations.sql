-- =====================================================
-- Agentes de IA — Anotação de turnos / Flywheel (Bloco F2)
-- =====================================================
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS antes de CREATE POLICY.
--
-- Rótulos (bom / ruim / correção) sobre agent_traces, alimentando o flywheel
-- de avaliação e fine-tune. Escrita acontece apenas via service role
-- (getSupabaseAdmin), que fura RLS — mesmo padrão de agent_traces
-- (whatsapp-cloud-ai-enable.sql) e ai_agent_versions (Bloco F1).
-- =====================================================

CREATE TABLE IF NOT EXISTS agent_trace_annotations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  agent_id        uuid NOT NULL,
  trace_id        uuid NOT NULL UNIQUE REFERENCES agent_traces(id) ON DELETE CASCADE,
  rating          text NOT NULL CHECK (rating IN ('good','bad','fix')),
  correction_text text,
  annotated_by    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trace_annotations_agent
  ON agent_trace_annotations (agent_id, created_at DESC);

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

ALTER TABLE agent_trace_annotations ENABLE ROW LEVEL SECURITY;

-- Leitura por org (INSERT/UPDATE/DELETE acontecem via service role, que fura RLS)
DROP POLICY IF EXISTS "Users can view own org trace annotations" ON agent_trace_annotations;
CREATE POLICY "Users can view own org trace annotations" ON agent_trace_annotations
    FOR SELECT USING (user_belongs_to_org(organization_id));
