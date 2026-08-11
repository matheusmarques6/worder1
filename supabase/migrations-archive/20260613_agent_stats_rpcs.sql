-- =============================================
-- Onda 13.5 — RPCs de estatisticas do agente IA.
--
-- update_agent_stats: o engine JA CHAMA esta function
-- (src/lib/ai/engine.ts:435) com fallback manual quando ela nao existe.
-- O fallback e read-modify-write (race) e nao calcula avg_response_time_ms
-- — por isso os dashboards mostravam latencia 0. Criar a function resolve
-- atomicidade + media incremental sem mudanca de codigo.
--
-- increment_agent_conversations: total_conversations nunca era incrementado
-- por nada (sempre 0 na lista de agentes). O cloud-sender passa a chamar
-- 1x no primeiro vinculo conversa<->agente.
--
-- Versao single-UPDATE (diferente da referencia em
-- sql/ai-agents-stored-procedures.sql:174 que fazia SELECT previo):
-- o increment e a media acontecem no mesmo statement, sob lock de row.
-- =============================================

CREATE OR REPLACE FUNCTION update_agent_stats(
  p_agent_id UUID,
  p_tokens INT DEFAULT 0,
  p_response_time INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE ai_agents
  SET
    total_messages       = COALESCE(total_messages, 0) + 1,
    total_tokens_used    = COALESCE(total_tokens_used, 0) + p_tokens,
    avg_response_time_ms = CASE
      WHEN COALESCE(total_messages, 0) = 0 THEN p_response_time
      ELSE ((COALESCE(avg_response_time_ms, 0) * total_messages) + p_response_time)
           / (total_messages + 1)
    END,
    updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_agent_conversations(p_agent_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE ai_agents
  SET total_conversations = COALESCE(total_conversations, 0) + 1,
      updated_at = NOW()
  WHERE id = p_agent_id;
$$;

GRANT EXECUTE ON FUNCTION update_agent_stats(UUID, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION increment_agent_conversations(UUID) TO service_role;
