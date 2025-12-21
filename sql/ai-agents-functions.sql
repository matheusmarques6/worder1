-- =====================================================
-- FUNÇÕES RPC PARA O SISTEMA DE AGENTES DE IA
-- Execute após a migration principal
-- =====================================================

-- =====================================================
-- FUNÇÃO: BUSCA SEMÂNTICA (RAG)
-- =====================================================
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.source_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM ai_agent_chunks c
  WHERE c.agent_id = p_agent_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> p_query_embedding) >= p_match_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- =====================================================
-- FUNÇÃO: INCREMENTAR CONTADOR DE AÇÃO
-- =====================================================
CREATE OR REPLACE FUNCTION increment_action_trigger(
  action_id UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ai_agent_actions
  SET 
    times_triggered = times_triggered + 1,
    last_triggered_at = NOW()
  WHERE id = action_id;
END;
$$;

-- =====================================================
-- FUNÇÃO: ATUALIZAR ESTATÍSTICAS DO AGENTE
-- =====================================================
CREATE OR REPLACE FUNCTION update_agent_stats(
  p_agent_id UUID,
  p_tokens INT DEFAULT 0,
  p_response_time INT DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_total_messages INT;
  current_avg_time FLOAT;
BEGIN
  -- Buscar valores atuais
  SELECT total_messages, avg_response_time_ms 
  INTO current_total_messages, current_avg_time
  FROM ai_agents WHERE id = p_agent_id;
  
  -- Calcular nova média (média móvel)
  IF current_total_messages > 0 THEN
    current_avg_time := (current_avg_time * current_total_messages + p_response_time) / (current_total_messages + 1);
  ELSE
    current_avg_time := p_response_time;
  END IF;

  -- Atualizar
  UPDATE ai_agents
  SET 
    total_messages = total_messages + 1,
    total_tokens_used = total_tokens_used + p_tokens,
    avg_response_time_ms = current_avg_time,
    updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$;

-- =====================================================
-- FUNÇÃO: BUSCAR AGENTE ATIVO PARA CONVERSA
-- =====================================================
CREATE OR REPLACE FUNCTION get_active_agent_for_conversation(
  p_organization_id UUID,
  p_channel_id UUID DEFAULT NULL,
  p_pipeline_stage_id UUID DEFAULT NULL
)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  provider TEXT,
  model TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    a.provider,
    a.model
  FROM ai_agents a
  WHERE a.organization_id = p_organization_id
    AND a.is_active = true
    -- Verificar canal
    AND (
      (a.settings->'channels'->>'all_channels')::boolean = true
      OR p_channel_id IS NULL
      OR p_channel_id::text = ANY(
        SELECT jsonb_array_elements_text(a.settings->'channels'->'channel_ids')
      )
    )
    -- Verificar pipeline/etapa
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
-- FUNÇÃO: VERIFICAR COOLDOWN
-- =====================================================
CREATE OR REPLACE FUNCTION check_agent_cooldown(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  cooldown_seconds INT;
  last_transfer TIMESTAMP;
BEGIN
  -- Buscar configuração de cooldown
  SELECT (settings->'behavior'->>'cooldown_after_transfer')::int
  INTO cooldown_seconds
  FROM ai_agents WHERE id = p_agent_id;
  
  IF cooldown_seconds IS NULL OR cooldown_seconds = 0 THEN
    RETURN true; -- Sem cooldown configurado
  END IF;
  
  -- Buscar última transferência
  SELECT MAX(created_at)
  INTO last_transfer
  FROM ai_usage_logs
  WHERE agent_id = p_agent_id
    AND conversation_id = p_conversation_id::text
    AND 'transfer' = ANY(actions_triggered);
  
  IF last_transfer IS NULL THEN
    RETURN true; -- Nunca houve transferência
  END IF;
  
  -- Verificar se passou o tempo de cooldown
  RETURN (NOW() - last_transfer) > (cooldown_seconds || ' seconds')::interval;
END;
$$;

-- =====================================================
-- FUNÇÃO: CONTAR MENSAGENS NA CONVERSA
-- =====================================================
CREATE OR REPLACE FUNCTION count_agent_messages_in_conversation(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  msg_count INT;
BEGIN
  SELECT COUNT(*)
  INTO msg_count
  FROM ai_usage_logs
  WHERE agent_id = p_agent_id
    AND conversation_id = p_conversation_id::text
    AND success = true;
  
  RETURN COALESCE(msg_count, 0);
END;
$$;

-- =====================================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================

-- Índice para busca de agentes ativos
CREATE INDEX IF NOT EXISTS idx_ai_agents_active_org 
ON ai_agents(organization_id, is_active) 
WHERE is_active = true;

-- Índice para busca de chunks por agente
CREATE INDEX IF NOT EXISTS idx_ai_chunks_agent_source 
ON ai_agent_chunks(agent_id, source_id);

-- Índice para busca de ações ativas
CREATE INDEX IF NOT EXISTS idx_ai_actions_active_priority 
ON ai_agent_actions(agent_id, is_active, priority) 
WHERE is_active = true;

-- Índice para logs de uso
CREATE INDEX IF NOT EXISTS idx_ai_usage_agent_conversation 
ON ai_usage_logs(agent_id, conversation_id, created_at DESC);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT EXECUTE ON FUNCTION search_agent_knowledge TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_action_trigger TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_agent_stats TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_active_agent_for_conversation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_agent_cooldown TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION count_agent_messages_in_conversation TO authenticated, service_role;
