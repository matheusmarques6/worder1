-- =====================================================
-- MIGRAÇÃO: Sistema de Agentes de IA para WhatsApp
-- Execute este SQL no Supabase antes de fazer deploy
-- =====================================================

-- 1. Tabela de agentes de IA
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    provider TEXT DEFAULT 'openai',
    model TEXT DEFAULT 'gpt-4o-mini',
    api_key TEXT,
    temperature DECIMAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Adicionar colunas na tabela de conversas
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_agent_id UUID;

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS bot_stopped_at TIMESTAMPTZ;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_active ON ai_agents(organization_id, is_active);

-- PROVIDERS SUPORTADOS:
-- openai: gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo
-- anthropic: claude-3-haiku-20240307, claude-3-sonnet-20240229, claude-3-opus-20240229
-- groq: llama-3.1-8b-instant, llama-3.1-70b-versatile, mixtral-8x7b-32768
-- google: gemini-1.5-flash, gemini-1.5-pro
