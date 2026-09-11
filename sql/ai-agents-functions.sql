-- =====================================================
-- FUNÇÕES RPC PARA O SISTEMA DE AGENTES DE IA
-- Execute após a migration principal
-- =====================================================

-- =====================================================
-- FUNÇÃO: BUSCA SEMÂNTICA (RAG)
-- =====================================================
-- Definição canônica:
-- supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql
-- Este arquivo histórico não cria overload sem organização.

-- =====================================================
-- FUNÇÃO: INCREMENTAR CONTADOR DE AÇÃO
-- =====================================================
-- RPC aposentada: não há consumidor de produção.

-- =====================================================
-- FUNÇÃO: ATUALIZAR ESTATÍSTICAS DO AGENTE
-- =====================================================
-- Definição histórica removida; a substituta atômica pertence ao item 67.

-- =====================================================
-- FUNÇÃO: BUSCAR AGENTE ATIVO PARA CONVERSA
-- =====================================================
-- Definição canônica:
-- supabase/migrations/20260903000002_get_active_agent_for_conversation_versioned.sql
-- Este arquivo histórico não substitui a função versionada.

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
GRANT EXECUTE ON FUNCTION check_agent_cooldown TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION count_agent_messages_in_conversation TO authenticated, service_role;
