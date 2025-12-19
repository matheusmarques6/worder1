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
    model TEXT DEFAULT 'gpt-4o-mini',
    temperature DECIMAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Adicionar colunas na tabela de conversas
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES ai_agents(id),
ADD COLUMN IF NOT EXISTS bot_stopped_at TIMESTAMPTZ;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_active ON ai_agents(organization_id, is_active);

-- 4. Criar um agente padrão de exemplo (opcional)
-- INSERT INTO ai_agents (organization_id, name, description, system_prompt) VALUES 
-- ('SEU_ORG_ID', 'Atendente Virtual', 'Agente de atendimento ao cliente', 'Você é um assistente de atendimento ao cliente. Seja educado, prestativo e responda em português brasileiro.');
