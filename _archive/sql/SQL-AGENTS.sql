-- =====================================================
-- ADICIONAR COLUNAS DE STATUS NA TABELA AGENTS
-- Execute no SQL Editor do Supabase
-- =====================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen_at);
