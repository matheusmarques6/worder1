-- =====================================================
-- WhatsApp Cloud AI — Enable auto-reply (Fase 2a / P0)
-- =====================================================
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS antes de CREATE POLICY.
--
-- NOTA DE DESIGN: as RPCs de guard (cooldown / max_messages / stop_on_human)
-- contra tabelas Cloud foram implementadas como HELPERS TS no
-- src/lib/ai/cloud-runner.ts (não como funções SQL). Motivos: (a) não depender
-- da migration estar aplicada para o tsc passar; (b) simplicidade. As RPCs
-- legadas (check_agent_cooldown, count_agent_messages_in_conversation,
-- check_human_replied) leem tabelas legadas (whatsapp_messages) e NÃO servem
-- para o canal Cloud. get_active_agent_for_conversation é agnóstica (lê
-- ai_agents) e continua reutilizada pelo runner.
-- =====================================================

-- -----------------------------------------------------
-- 1. whatsapp_cloud_conversations — colunas de IA
-- -----------------------------------------------------
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_disabled_at timestamptz;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_disabled_reason text;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_debounce_until timestamptz;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_pending boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wcc_ai_enabled
  ON whatsapp_cloud_conversations (organization_id, ai_enabled)
  WHERE ai_enabled;

-- -----------------------------------------------------
-- 2. whatsapp_cloud_messages — autoria (bot/humano/ia)
-- -----------------------------------------------------
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS sent_by_bot boolean NOT NULL DEFAULT false;
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS sender text;
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS ai_agent_id uuid;

-- -----------------------------------------------------
-- 3. agent_traces — trace mínimo por run
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid,
  agent_id        uuid,
  provider        text,
  model           text,
  input           text,
  output          text,
  tool_calls      jsonb,
  tokens          int,
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_org_created
  ON agent_traces (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_conversation
  ON agent_traces (conversation_id);

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

ALTER TABLE agent_traces ENABLE ROW LEVEL SECURITY;

-- Leitura por org (INSERT/UPDATE acontecem via service role, que fura RLS)
DROP POLICY IF EXISTS "Users can view own org traces" ON agent_traces;
CREATE POLICY "Users can view own org traces" ON agent_traces
    FOR SELECT USING (user_belongs_to_org(organization_id));
