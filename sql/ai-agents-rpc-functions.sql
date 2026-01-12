-- =====================================================
-- FUNÇÕES RPC PARA SISTEMA DE AGENTES DE IA
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. BUSCAR AGENTE ATIVO PARA CONVERSA
-- =====================================================
-- Retorna o agente que deve atender uma conversa específica
-- baseado no canal (WhatsApp instance) e estágio do pipeline

CREATE OR REPLACE FUNCTION get_active_agent_for_conversation(
  p_organization_id UUID,
  p_channel_id UUID DEFAULT NULL,
  p_pipeline_stage_id UUID DEFAULT NULL
)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  priority INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as agent_id,
    a.name as agent_name,
    1 as priority
  FROM ai_agents a
  WHERE a.organization_id = p_organization_id
    AND a.is_active = true
    -- Verificar canal (se especificado e configurado)
    AND (
      (a.settings->'channels'->>'all_channels')::boolean = true
      OR p_channel_id IS NULL
      OR p_channel_id::text = ANY(
        SELECT jsonb_array_elements_text(a.settings->'channels'->'channel_ids')
      )
    )
    -- Verificar pipeline/stage (se especificado e configurado)
    AND (
      (a.settings->'pipelines'->>'all_pipelines')::boolean = true
      OR p_pipeline_stage_id IS NULL
      OR p_pipeline_stage_id::text = ANY(
        SELECT jsonb_array_elements_text(a.settings->'pipelines'->'stage_ids')
      )
    )
  ORDER BY a.created_at ASC
  LIMIT 1;
END;
$$;

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

CREATE OR REPLACE FUNCTION update_agent_stats(
  p_agent_id UUID,
  p_tokens INT DEFAULT 0,
  p_response_time INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_messages INT;
  v_current_avg_time INT;
BEGIN
  -- Buscar valores atuais
  SELECT total_messages, COALESCE(avg_response_time_ms, 0)
  INTO v_current_messages, v_current_avg_time
  FROM ai_agents
  WHERE id = p_agent_id;

  -- Atualizar
  UPDATE ai_agents
  SET 
    total_messages = COALESCE(total_messages, 0) + 1,
    total_tokens_used = COALESCE(total_tokens_used, 0) + p_tokens,
    avg_response_time_ms = CASE 
      WHEN v_current_messages = 0 OR v_current_messages IS NULL THEN p_response_time
      ELSE ((v_current_avg_time * v_current_messages) + p_response_time) / (v_current_messages + 1)
    END,
    updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$;

-- =====================================================
-- 5. INCREMENTAR CONTADOR DE AÇÃO DISPARADA
-- =====================================================
-- Registra quando uma regra When/Do foi acionada

CREATE OR REPLACE FUNCTION increment_action_trigger(
  p_action_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_agent_actions
  SET 
    times_triggered = COALESCE(times_triggered, 0) + 1,
    last_triggered_at = NOW()
  WHERE id = p_action_id;
END;
$$;

-- =====================================================
-- 6. BUSCA SEMÂNTICA NO CONHECIMENTO (RAG)
-- =====================================================
-- Busca chunks similares usando pgvector

CREATE OR REPLACE FUNCTION search_agent_knowledge(
  p_agent_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  source_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as chunk_id,
    c.source_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> p_query_embedding))::FLOAT as similarity
  FROM ai_agent_chunks c
  WHERE c.agent_id = p_agent_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> p_query_embedding)) > p_match_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

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

GRANT EXECUTE ON FUNCTION get_active_agent_for_conversation TO service_role;
GRANT EXECUTE ON FUNCTION check_agent_cooldown TO service_role;
GRANT EXECUTE ON FUNCTION count_agent_messages_in_conversation TO service_role;
GRANT EXECUTE ON FUNCTION update_agent_stats TO service_role;
GRANT EXECUTE ON FUNCTION increment_action_trigger TO service_role;
GRANT EXECUTE ON FUNCTION search_agent_knowledge TO service_role;
GRANT EXECUTE ON FUNCTION check_human_replied TO service_role;
GRANT EXECUTE ON FUNCTION disable_ai_for_conversation TO service_role;
GRANT EXECUTE ON FUNCTION enable_ai_for_conversation TO service_role;

-- =====================================================
-- FINALIZADO!
-- =====================================================
-- 
-- Funções criadas:
-- ✅ get_active_agent_for_conversation - Busca agente ativo
-- ✅ check_agent_cooldown - Verifica cooldown
-- ✅ count_agent_messages_in_conversation - Conta mensagens
-- ✅ update_agent_stats - Atualiza estatísticas
-- ✅ increment_action_trigger - Incrementa ações
-- ✅ search_agent_knowledge - Busca RAG
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
