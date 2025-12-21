-- =====================================================
-- STORED PROCEDURES PARA O SISTEMA DE AGENTES DE IA
-- Execute após a migration principal
-- =====================================================

-- =====================================================
-- 1. BUSCA SEMÂNTICA (RAG)
-- Busca chunks similares usando pgvector
-- =====================================================

CREATE OR REPLACE FUNCTION search_agent_knowledge(
  p_agent_id UUID,
  p_query_embedding VECTOR(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  source_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS chunk_id,
    c.source_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM ai_agent_chunks c
  JOIN ai_agent_sources s ON s.id = c.source_id
  WHERE c.agent_id = p_agent_id
    AND s.status = 'ready'
    AND 1 - (c.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 2. BUSCAR AGENTE ATIVO PARA CONVERSA
-- Retorna o agente que deve responder baseado nas configurações
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_agent_for_conversation(
  p_organization_id UUID,
  p_channel_id UUID DEFAULT NULL,
  p_pipeline_stage_id UUID DEFAULT NULL
)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  priority INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id AS agent_id,
    a.name AS agent_name,
    0 AS priority
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
    -- Verificar pipeline/stage
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
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 3. VERIFICAR COOLDOWN DO AGENTE
-- Verifica se o agente pode responder (não está em cooldown)
-- =====================================================

CREATE OR REPLACE FUNCTION check_agent_cooldown(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_cooldown_seconds INT;
  v_last_transfer TIMESTAMPTZ;
BEGIN
  -- Buscar configuração de cooldown
  SELECT COALESCE((settings->'behavior'->>'cooldown_after_transfer')::int, 300)
  INTO v_cooldown_seconds
  FROM ai_agents
  WHERE id = p_agent_id;
  
  -- Se cooldown é 0, sempre permitir
  IF v_cooldown_seconds = 0 THEN
    RETURN true;
  END IF;
  
  -- Buscar última transferência
  SELECT MAX(created_at)
  INTO v_last_transfer
  FROM ai_usage_logs
  WHERE agent_id = p_agent_id
    AND conversation_id = p_conversation_id::text
    AND 'transfer' = ANY(actions_triggered);
  
  -- Se não houve transferência, permitir
  IF v_last_transfer IS NULL THEN
    RETURN true;
  END IF;
  
  -- Verificar se passou o cooldown
  RETURN (EXTRACT(EPOCH FROM (NOW() - v_last_transfer)) > v_cooldown_seconds);
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 4. CONTAR MENSAGENS DO AGENTE NA CONVERSA
-- Para verificar limite de mensagens por conversa
-- =====================================================

CREATE OR REPLACE FUNCTION count_agent_messages_in_conversation(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM ai_usage_logs
    WHERE agent_id = p_agent_id
      AND conversation_id = p_conversation_id::text
      AND success = true
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 5. INCREMENTAR CONTADOR DE AÇÃO
-- Incrementa o contador de vezes que uma ação foi disparada
-- =====================================================

CREATE OR REPLACE FUNCTION increment_action_trigger(
  p_action_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE ai_agent_actions
  SET 
    times_triggered = COALESCE(times_triggered, 0) + 1,
    last_triggered_at = NOW()
  WHERE id = p_action_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. ATUALIZAR ESTATÍSTICAS DO AGENTE
-- Atualiza contadores do agente após cada resposta
-- =====================================================

CREATE OR REPLACE FUNCTION update_agent_stats(
  p_agent_id UUID,
  p_tokens INT DEFAULT 0,
  p_response_time INT DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
  v_current_messages INT;
  v_current_tokens BIGINT;
  v_current_avg_time FLOAT;
BEGIN
  -- Buscar valores atuais
  SELECT 
    total_messages,
    total_tokens_used,
    avg_response_time_ms
  INTO v_current_messages, v_current_tokens, v_current_avg_time
  FROM ai_agents
  WHERE id = p_agent_id;
  
  -- Calcular nova média de tempo de resposta
  DECLARE
    v_new_avg_time FLOAT;
  BEGIN
    IF v_current_messages = 0 THEN
      v_new_avg_time := p_response_time;
    ELSE
      v_new_avg_time := ((v_current_avg_time * v_current_messages) + p_response_time) / (v_current_messages + 1);
    END IF;
    
    -- Atualizar
    UPDATE ai_agents
    SET 
      total_messages = COALESCE(total_messages, 0) + 1,
      total_tokens_used = COALESCE(total_tokens_used, 0) + p_tokens,
      avg_response_time_ms = v_new_avg_time,
      updated_at = NOW()
    WHERE id = p_agent_id;
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. LIMPAR CHUNKS ANTIGOS
-- Remove chunks de fontes deletadas (cleanup)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_orphan_chunks()
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM ai_agent_chunks c
  WHERE NOT EXISTS (
    SELECT 1 FROM ai_agent_sources s WHERE s.id = c.source_id
  );
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. ESTATÍSTICAS DE USO DO AGENTE
-- Retorna estatísticas agregadas do agente
-- =====================================================

CREATE OR REPLACE FUNCTION get_agent_usage_stats(
  p_agent_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_messages INT,
  total_tokens BIGINT,
  avg_response_time FLOAT,
  success_rate FLOAT,
  total_cost_cents INT,
  sources_used INT,
  actions_triggered INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INT AS total_messages,
    SUM(total_tokens)::BIGINT AS total_tokens,
    AVG(response_time_ms)::FLOAT AS avg_response_time,
    (SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0))::FLOAT AS success_rate,
    SUM(estimated_cost_cents)::INT AS total_cost_cents,
    SUM(chunks_used)::INT AS sources_used,
    SUM(ARRAY_LENGTH(actions_triggered, 1))::INT AS actions_triggered
  FROM ai_usage_logs
  WHERE agent_id = p_agent_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 9. BUSCAR FONTES PRONTAS DO AGENTE
-- Retorna apenas fontes com status 'ready'
-- =====================================================

CREATE OR REPLACE FUNCTION get_ready_sources(
  p_agent_id UUID
)
RETURNS TABLE (
  source_id UUID,
  source_name TEXT,
  source_type TEXT,
  chunks_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id AS source_id,
    s.name AS source_name,
    s.source_type,
    s.chunks_count
  FROM ai_agent_sources s
  WHERE s.agent_id = p_agent_id
    AND s.status = 'ready'
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================

-- Índice para busca de agente ativo
CREATE INDEX IF NOT EXISTS idx_ai_agents_active_lookup 
ON ai_agents (organization_id, is_active) 
WHERE is_active = true;

-- Índice para busca de logs por conversa
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_conversation 
ON ai_usage_logs (agent_id, conversation_id);

-- Índice para busca de logs por data
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_date 
ON ai_usage_logs (agent_id, created_at DESC);

-- =====================================================
-- GRANTS (se usando RLS)
-- =====================================================

-- Permitir funções para authenticated users
GRANT EXECUTE ON FUNCTION search_agent_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_agent_for_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION check_agent_cooldown TO authenticated;
GRANT EXECUTE ON FUNCTION count_agent_messages_in_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_usage_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_ready_sources TO authenticated;

-- Permitir funções para service role
GRANT EXECUTE ON FUNCTION increment_action_trigger TO service_role;
GRANT EXECUTE ON FUNCTION update_agent_stats TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_orphan_chunks TO service_role;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON FUNCTION search_agent_knowledge IS 'Busca semântica nos chunks do agente usando pgvector';
COMMENT ON FUNCTION get_active_agent_for_conversation IS 'Retorna o agente ativo para uma conversa baseado nas configurações de canais e pipelines';
COMMENT ON FUNCTION check_agent_cooldown IS 'Verifica se o agente não está em cooldown após transferência';
COMMENT ON FUNCTION count_agent_messages_in_conversation IS 'Conta mensagens do agente em uma conversa para limite';
COMMENT ON FUNCTION increment_action_trigger IS 'Incrementa contador de vezes que uma ação foi disparada';
COMMENT ON FUNCTION update_agent_stats IS 'Atualiza estatísticas do agente após cada resposta';
COMMENT ON FUNCTION get_agent_usage_stats IS 'Retorna estatísticas agregadas de uso do agente';
