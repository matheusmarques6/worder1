-- =============================================
-- MIGRATION: Adicionar colunas de IA/Bot nas conversas
-- Execute no Supabase SQL Editor
-- =============================================

-- 1. Adicionar colunas de controle de IA/Bot
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES ai_agents(id),
ADD COLUMN IF NOT EXISTS ai_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_disabled_reason TEXT,
ADD COLUMN IF NOT EXISTS bot_stopped_at TIMESTAMPTZ;

-- 2. Ativar Realtime para as tabelas do WhatsApp
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_ai_agent 
ON whatsapp_conversations(ai_agent_id) WHERE ai_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_bot_active 
ON whatsapp_conversations(is_bot_active) WHERE is_bot_active = true;

-- 4. Verificar se tabela ai_agents existe (se não, criar básica)
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature DECIMAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Verificação final
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'whatsapp_conversations' 
  AND column_name IN ('is_bot_active', 'ai_enabled', 'ai_agent_id', 'bot_stopped_at')
ORDER BY column_name;
