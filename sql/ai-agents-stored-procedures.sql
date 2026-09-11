-- =====================================================
-- STORED PROCEDURES PARA O SISTEMA DE AGENTES DE IA
-- Execute após a migration principal
-- =====================================================

-- =====================================================
-- 1. BUSCA SEMÂNTICA (RAG)
-- Busca chunks similares usando pgvector
-- =====================================================

-- Definição canônica:
-- supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql
-- Este arquivo histórico não cria overload sem organização.

-- =====================================================
-- 2. BUSCAR AGENTE ATIVO PARA CONVERSA
-- Retorna o agente que deve responder baseado nas configurações
-- =====================================================

-- Definição canônica:
-- supabase/migrations/20260903000002_get_active_agent_for_conversation_versioned.sql
-- Este arquivo histórico não substitui a função versionada.

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

-- RPC aposentada: não há consumidor de produção.

-- =====================================================
-- 6. ATUALIZAR ESTATÍSTICAS DO AGENTE
-- Atualiza contadores do agente após cada resposta
-- =====================================================

-- Definição histórica removida; a substituta atômica pertence ao item 67.

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
GRANT EXECUTE ON FUNCTION check_agent_cooldown TO authenticated;
GRANT EXECUTE ON FUNCTION count_agent_messages_in_conversation TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_usage_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_ready_sources TO authenticated;

-- Permitir funções para service role
GRANT EXECUTE ON FUNCTION cleanup_orphan_chunks TO service_role;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON FUNCTION check_agent_cooldown IS 'Verifica se o agente não está em cooldown após transferência';
COMMENT ON FUNCTION count_agent_messages_in_conversation IS 'Conta mensagens do agente em uma conversa para limite';
COMMENT ON FUNCTION get_agent_usage_stats IS 'Retorna estatísticas agregadas de uso do agente';
