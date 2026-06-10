-- =====================================================
-- Agentes de IA — Versionamento (Bloco F1)
-- =====================================================
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS antes de CREATE POLICY.
--
-- Snapshots de system_prompt/persona/settings de ai_agents, criados
-- automaticamente no save (PUT/PATCH) quando há mudança versionável.
-- Escrita acontece apenas via service role (getSupabaseAdmin), que fura RLS —
-- mesmo padrão de agent_traces (whatsapp-cloud-ai-enable.sql).
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  agent_id        uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  version_number  int NOT NULL,
  label           text NOT NULL DEFAULT 'Alteração de prompt',
  status          text NOT NULL DEFAULT 'produção' CHECK (status IN ('produção','rascunho','arquivada')),
  system_prompt   text,
  persona         jsonb,
  settings        jsonb,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent
  ON ai_agent_versions (agent_id, version_number DESC);

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

ALTER TABLE ai_agent_versions ENABLE ROW LEVEL SECURITY;

-- Leitura por org (INSERT/UPDATE acontecem via service role, que fura RLS)
DROP POLICY IF EXISTS "Users can view own org agent versions" ON ai_agent_versions;
CREATE POLICY "Users can view own org agent versions" ON ai_agent_versions
    FOR SELECT USING (user_belongs_to_org(organization_id));
