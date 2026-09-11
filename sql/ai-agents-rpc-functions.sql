-- =====================================================
-- FUNÇÕES RPC PARA SISTEMA DE AGENTES DE IA
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. BUSCAR AGENTE ATIVO PARA CONVERSA
-- =====================================================
-- Retorna o agente que deve atender uma conversa específica
-- baseado no canal (WhatsApp instance) e estágio do pipeline

-- Definição canônica:
-- supabase/migrations/20260903000002_get_active_agent_for_conversation_versioned.sql
-- Este arquivo histórico não substitui a função versionada.

-- =====================================================
-- 2. VERIFICAR COOLDOWN DO AGENTE
-- =====================================================
-- Verifica se passou tempo suficiente desde a última resposta
-- para evitar spam de mensagens

CREATE OR REPLACE FUNCTION check_agent_cooldown(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cooldown_seconds INT;
  v_last_message_at TIMESTAMPTZ;
  v_min_interval_seconds INT DEFAULT 5; -- Mínimo 5 segundos entre mensagens
BEGIN
  -- Buscar configuração de cooldown do agente
  SELECT 
    COALESCE((settings->'behavior'->>'cooldown_after_transfer')::int, 300)
  INTO v_cooldown_seconds
  FROM ai_agents
  WHERE id = p_agent_id;

  -- Buscar última mensagem do agente nesta conversa
  SELECT created_at
  INTO v_last_message_at
  FROM whatsapp_messages
  WHERE conversation_id = p_conversation_id
    AND direction = 'outbound'
    AND (metadata->>'sent_by' = 'ai_agent' OR metadata->>'sent_by' IS NULL)
  ORDER BY created_at DESC
  LIMIT 1;

  -- Se nunca respondeu, pode responder
  IF v_last_message_at IS NULL THEN
    RETURN true;
  END IF;

  -- Verificar se passou o intervalo mínimo (evitar duplicatas)
  IF (NOW() - v_last_message_at) < (v_min_interval_seconds || ' seconds')::interval THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- =====================================================
-- 3. CONTAR MENSAGENS DO AGENTE NA CONVERSA
-- =====================================================
-- Conta quantas mensagens o agente já enviou nesta conversa
-- para respeitar o limite max_messages_per_conversation

CREATE OR REPLACE FUNCTION count_agent_messages_in_conversation(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM whatsapp_messages
  WHERE conversation_id = p_conversation_id
    AND direction = 'outbound'
    AND metadata->>'sent_by' = 'ai_agent';

  RETURN COALESCE(v_count, 0);
END;
$$;

-- =====================================================
-- 4. ATUALIZAR ESTATÍSTICAS DO AGENTE
-- =====================================================
-- Atualiza contadores de uso do agente após cada interação

-- Definição histórica removida; a substituta atômica pertence ao item 67.

-- =====================================================
-- 5. INCREMENTAR CONTADOR DE AÇÃO DISPARADA
-- =====================================================
-- Registra quando uma regra When/Do foi acionada

-- RPC aposentada: não há consumidor de produção.

-- =====================================================
-- 6. BUSCA SEMÂNTICA NO CONHECIMENTO (RAG)
-- =====================================================
-- Busca chunks similares usando pgvector

-- Definição canônica:
-- supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql
-- Este arquivo histórico não cria overload sem organização.

-- =====================================================
-- 7. VERIFICAR SE HUMANO JÁ RESPONDEU
-- =====================================================
-- Verifica se um atendente humano já respondeu na conversa
-- para aplicar stop_on_human_reply

CREATE OR REPLACE FUNCTION check_human_replied(
  p_conversation_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_human_replied BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM whatsapp_messages
    WHERE conversation_id = p_conversation_id
      AND direction = 'outbound'
      AND (metadata->>'sent_by' IS NULL OR metadata->>'sent_by' != 'ai_agent')
      AND (p_since IS NULL OR created_at > p_since)
  ) INTO v_human_replied;

  RETURN v_human_replied;
END;
$$;

-- =====================================================
-- 8. DESABILITAR IA PARA CONVERSA
-- =====================================================
-- Marca a conversa para não ser mais atendida por IA

CREATE OR REPLACE FUNCTION disable_ai_for_conversation(
  p_conversation_id UUID,
  p_reason TEXT DEFAULT 'manual'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    ai_enabled = false,
    ai_disabled_at = NOW(),
    ai_disabled_reason = p_reason
  WHERE id = p_conversation_id;
END;
$$;

-- =====================================================
-- 9. HABILITAR IA PARA CONVERSA
-- =====================================================
-- Reativa atendimento por IA

CREATE OR REPLACE FUNCTION enable_ai_for_conversation(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    ai_enabled = true,
    ai_disabled_at = NULL,
    ai_disabled_reason = NULL
  WHERE id = p_conversation_id;
END;
$$;

-- =====================================================
-- 10. ADICIONAR COLUNAS DE IA NA TABELA DE CONVERSAS
-- =====================================================
-- Garante que as colunas necessárias existem

DO $$
BEGIN
  -- ai_enabled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_enabled'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_enabled BOOLEAN DEFAULT true;
  END IF;

  -- ai_agent_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_agent_id'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_agent_id UUID;
  END IF;

  -- ai_disabled_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_disabled_at'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_disabled_at TIMESTAMPTZ;
  END IF;

  -- ai_disabled_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_disabled_reason'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_disabled_reason TEXT;
  END IF;
END $$;

-- =====================================================
-- 11. CRIAR ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índice para buscar conversas com IA habilitada
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_ai_enabled 
ON whatsapp_conversations(organization_id, ai_enabled) 
WHERE ai_enabled = true;

-- Índice para buscar mensagens do agente
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_ai_agent 
ON whatsapp_messages(conversation_id, direction, created_at DESC)
WHERE direction = 'outbound';

-- Índice para agentes ativos
CREATE INDEX IF NOT EXISTS idx_ai_agents_active_org 
ON ai_agents(organization_id, is_active) 
WHERE is_active = true;

-- =====================================================
-- 12. TABELA DE LOGS DE USO (se não existir)
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  conversation_id UUID,
  provider TEXT,
  model TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  estimated_cost_cents INT DEFAULT 0,
  response_time_ms INT DEFAULT 0,
  chunks_used INT DEFAULT 0,
  sources_used TEXT[] DEFAULT '{}',
  actions_triggered TEXT[] DEFAULT '{}',
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para logs
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_org_date 
ON ai_usage_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_agent 
ON ai_usage_logs(agent_id, created_at DESC);

-- =====================================================
-- 13. GRANT PERMISSIONS (para service role)
-- =====================================================

-- As funções já são SECURITY DEFINER, então rodam com
-- permissões do criador. Mas garantir que service role
-- pode executar:

GRANT EXECUTE ON FUNCTION check_agent_cooldown TO service_role;
GRANT EXECUTE ON FUNCTION count_agent_messages_in_conversation TO service_role;
GRANT EXECUTE ON FUNCTION check_human_replied TO service_role;
GRANT EXECUTE ON FUNCTION disable_ai_for_conversation TO service_role;
GRANT EXECUTE ON FUNCTION enable_ai_for_conversation TO service_role;

-- =====================================================
-- FINALIZADO!
-- =====================================================
-- 
-- Funções criadas:
-- ✅ check_agent_cooldown - Verifica cooldown
-- ✅ count_agent_messages_in_conversation - Conta mensagens
-- ✅ check_human_replied - Verifica resposta humana
-- ✅ disable_ai_for_conversation - Desabilita IA
-- ✅ enable_ai_for_conversation - Habilita IA
--
-- Colunas adicionadas em whatsapp_conversations:
-- ✅ ai_enabled
-- ✅ ai_agent_id
-- ✅ ai_disabled_at
-- ✅ ai_disabled_reason
--
-- Tabela criada:
-- ✅ ai_usage_logs
--
-- Execute este SQL no Supabase SQL Editor
-- =====================================================
