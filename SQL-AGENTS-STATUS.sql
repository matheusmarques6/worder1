-- =====================================================
-- ADICIONAR COLUNAS DE STATUS NA TABELA AGENTS
-- Execute no SQL Editor do Supabase
-- =====================================================

-- Adicionar coluna last_seen_at (última vez que agente estava ativo)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;

-- Adicionar coluna status (online, away, busy, offline)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';

-- Adicionar coluna avatar_url (foto do agente)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Criar índice para buscar agentes online
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen_at);
