-- ============================================
-- find_matching_automations — STORE-SCOPE pela COLUNA automations.store_id
-- 20260620_find_matching_automations_store_scope.sql
--
-- Contexto: múltiplas lojas Shopify vivem sob UM organization_id e
-- compartilham a mesma linha de contato por (organization_id, email).
-- Um evento de loja (checkout abandonado, pedido, etc.) só pode enrolar
-- o contato em flows DAQUELA loja — senão um checkout na "Dr. Groot"
-- fan-out o contato compartilhado para os funis da "Based" (vazamento
-- cross-loja).
--
-- O path moderno de webhook já corrige isso escopando pela COLUNA
-- automations.store_id (commit 17df2e1). Esta migration alinha a RPC do
-- path legado (event_logs → /api/workers/process-events) à MESMA
-- semântica:
--
--   quando o payload traz store id (COALESCE storeId/store_id) →
--     exige (a.store_id IS NULL OR a.store_id = <storeId>)
--   quando NÃO traz → nenhum predicado extra (org-wide inalterado).
--
-- Preserva 100% do comportamento anterior: mesma assinatura, mesmo
-- retorno, mesmo mapeamento event_type→trigger_type e todos os
-- predicados de trigger_config (incluindo o storeId em trigger_config,
-- mantido belt-and-suspenders). Idempotente (CREATE OR REPLACE, sem
-- DROP), sem mudança de dados. O cast ::uuid é guardado por regex para
-- não quebrar a query com um valor malformado no payload.
-- ============================================

CREATE OR REPLACE FUNCTION find_matching_automations(
  p_organization_id UUID,
  p_event_type TEXT,
  p_payload JSONB
) RETURNS TABLE (
  automation_id UUID,
  automation_name TEXT,
  trigger_type TEXT
) AS $$
DECLARE
  v_trigger_type TEXT;
  v_store_raw TEXT;
  v_store_id UUID;
BEGIN
  -- Mapear event_type para trigger_type
  v_trigger_type := CASE p_event_type
    WHEN 'contact.created' THEN 'trigger_signup'
    WHEN 'tag.added' THEN 'trigger_tag'
    WHEN 'deal.created' THEN 'trigger_deal_created'
    WHEN 'deal.stage_changed' THEN 'trigger_deal_stage'
    WHEN 'deal.won' THEN 'trigger_deal_won'
    WHEN 'deal.lost' THEN 'trigger_deal_lost'
    WHEN 'order.created' THEN 'trigger_order'
    WHEN 'order.paid' THEN 'trigger_order_paid'
    WHEN 'webhook.received' THEN 'trigger_webhook'
    ELSE NULL
  END;

  IF v_trigger_type IS NULL THEN
    RETURN;
  END IF;

  -- Store id do payload (COALESCE camelCase/snake_case). Só cast p/ uuid
  -- quando casa com o formato uuid — valor malformado não deve quebrar a
  -- query inteira; nesse caso tratamos como "sem loja" (org-wide).
  v_store_raw := COALESCE(p_payload->>'storeId', p_payload->>'store_id');
  IF v_store_raw IS NOT NULL AND v_store_raw ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_store_id := v_store_raw::uuid;
  ELSE
    v_store_id := NULL;
  END IF;

  -- Buscar automações que correspondem ao trigger
  -- ⚠️ CRÍTICO: Filtra por organization_id E status='active'
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    v_trigger_type
  FROM automations a
  WHERE a.organization_id = p_organization_id  -- ← ISOLAMENTO POR ORGANIZAÇÃO
    AND a.status = 'active'                     -- ← SÓ AUTOMAÇÕES ATIVAS
    AND a.trigger_type = v_trigger_type
    -- Store-scope pela COLUNA automations.store_id. Só aplica quando o
    -- payload traz store id (v_store_id NÃO nulo). Flows org-wide
    -- (store_id NULL) sempre passam; eventos sem loja mantêm org-wide.
    AND (
      v_store_id IS NULL
      OR a.store_id IS NULL
      OR a.store_id = v_store_id
    )
    -- Verificar condições adicionais do trigger_config
    -- ⚠️ Suporta tanto camelCase (do React) quanto snake_case
    AND (
      -- Tag específica (tagName ou tag_name)
      (v_trigger_type = 'trigger_tag' AND (
        a.trigger_config IS NULL
        OR (
          COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') IS NULL
          OR COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') =
             COALESCE(p_payload->>'tagName', p_payload->>'tag_name')
        )
      ))
      OR
      -- Stage específico com suporte a fromStageId (de qual estágio) e stageId (para qual estágio)
      (v_trigger_type = 'trigger_deal_stage' AND (
        a.trigger_config IS NULL
        OR (
          -- Verificar "para qual estágio" (stageId)
          (
            COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') IS NULL
            OR COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') =
               COALESCE(p_payload->>'to_stage_id', p_payload->>'toStageId')
          )
          AND
          -- Verificar "de qual estágio" (fromStageId) - opcional
          (
            COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') IS NULL
            OR COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') =
               COALESCE(p_payload->>'from_stage_id', p_payload->>'fromStageId')
          )
        )
      ))
      OR
      -- Pipeline específico (pipelineId ou pipeline_id)
      ((v_trigger_type IN ('trigger_deal_created', 'trigger_deal_stage', 'trigger_deal_won', 'trigger_deal_lost')) AND (
        a.trigger_config IS NULL
        OR (
          COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') IS NULL
          OR COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') =
             COALESCE(p_payload->>'pipelineId', p_payload->>'pipeline_id')
        )
      ))
      OR
      -- Store específica para triggers de pedido (trigger_config->>'storeId')
      -- MANTIDO belt-and-suspenders além do store-scope pela coluna acima.
      ((v_trigger_type IN ('trigger_order', 'trigger_order_paid')) AND (
        a.trigger_config IS NULL
        OR (
          COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') IS NULL
          OR COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') =
             COALESCE(p_payload->>'storeId', p_payload->>'store_id')
        )
      ))
      OR
      -- Outros triggers sem condições especiais
      (v_trigger_type NOT IN ('trigger_tag', 'trigger_deal_stage', 'trigger_deal_created', 'trigger_deal_won', 'trigger_deal_lost', 'trigger_order', 'trigger_order_paid'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
