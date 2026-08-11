-- =====================================================
-- Agentes de IA — Sugestões de melhoria de prompt (Bloco F5)
-- =====================================================
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS antes de CREATE POLICY. SEM DROP TABLE.
--
-- Propostas geradas por uma chamada de LLM (≤3 por geração) a partir dos piores
-- sinais (anotações bad/fix + casos de avaliação com nota baixa). Cada proposta
-- carrega o PROMPT NOVO COMPLETO; o diff é calculado em tempo de leitura contra
-- o system_prompt ATUAL do agente (sempre fresco). Aplicar uma proposta escreve
-- ai_agents.system_prompt e cria uma versão 'produção' (via serviço F1) —
-- applied_version_id aponta para ela.
-- Escrita acontece apenas via service role (getSupabaseAdmin), que fura RLS —
-- mesmo padrão de ai_agent_versions / ai_eval_* / agent_trace_annotations.
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
-- ai_prompt_proposals
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_prompt_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  title              text NOT NULL,
  reason             text,
  impact             text,
  proposed_prompt    text NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','applied','dismissed')),
  source_trace_ids   uuid[] NOT NULL DEFAULT '{}',
  applied_version_id uuid REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_proposals_agent
  ON ai_prompt_proposals (agent_id, status, created_at DESC);

ALTER TABLE ai_prompt_proposals ENABLE ROW LEVEL SECURITY;

-- Leitura por org (INSERT/UPDATE acontecem via service role, que fura RLS)
DROP POLICY IF EXISTS "Users can view own org prompt proposals" ON ai_prompt_proposals;
CREATE POLICY "Users can view own org prompt proposals" ON ai_prompt_proposals
    FOR SELECT USING (user_belongs_to_org(organization_id));
