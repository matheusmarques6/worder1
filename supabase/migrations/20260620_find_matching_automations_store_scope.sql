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
-- IMPORTANTE: este corpo é uma cópia VERBATIM da definição VIVA em
-- 20260110_orders_and_extra_triggers.sql (o último CREATE OR REPLACE
-- antes desta) — preserva 100% o mapeamento event_type→trigger_type
-- (incl. cart.abandoned, whatsapp.received, date.birthday_*) e TODOS os
-- predicados de trigger_config (tag, deal stage/pipeline, store, minValue,
-- whatsapp keyword, date timing). A ÚNICA adição é o bloco v_store_id +
-- o predicado da coluna a.store_id. Idempotente (CREATE OR REPLACE, sem
-- DROP), sem mudança de dados. O cast ::uuid é guardado por regex.
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
    WHEN 'cart.abandoned' THEN 'trigger_abandon'
    WHEN 'webhook.received' THEN 'trigger_webhook'
    WHEN 'whatsapp.received' THEN 'trigger_whatsapp'
    -- Date triggers
    WHEN 'date.birthday_today' THEN 'trigger_date'
    WHEN 'date.birthday_tomorrow' THEN 'trigger_date'
    WHEN 'date.birthday_in_3_days' THEN 'trigger_date'
    WHEN 'date.birthday_in_7_days' THEN 'trigger_date'
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
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    v_trigger_type
  FROM automations a
  WHERE a.organization_id = p_organization_id
    AND a.status = 'active'
    AND a.trigger_type = v_trigger_type
    -- Store-scope pela COLUNA automations.store_id. Só aplica quando o
    -- payload traz store id (v_store_id NÃO nulo). Flows org-wide
    -- (store_id NULL) sempre passam; eventos sem loja mantêm org-wide.
    AND (
      v_store_id IS NULL
      OR a.store_id IS NULL
      OR a.store_id = v_store_id
    )
    AND (
      -- Tag específica
      (v_trigger_type = 'trigger_tag' AND (
        a.trigger_config IS NULL
        OR COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') IS NULL
        OR COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') =
           COALESCE(p_payload->>'tagName', p_payload->>'tag_name')
      ))
      OR
      -- Stage específico com fromStageId e stageId
      (v_trigger_type = 'trigger_deal_stage' AND (
        a.trigger_config IS NULL
        OR (
          (COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') IS NULL
           OR COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') =
              COALESCE(p_payload->>'to_stage_id', p_payload->>'toStageId'))
          AND
          (COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') IS NULL
           OR COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') =
              COALESCE(p_payload->>'from_stage_id', p_payload->>'fromStageId'))
        )
      ))
      OR
      -- Pipeline específico
      ((v_trigger_type IN ('trigger_deal_created', 'trigger_deal_stage', 'trigger_deal_won', 'trigger_deal_lost')) AND (
        a.trigger_config IS NULL
        OR COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') IS NULL
        OR COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') =
           COALESCE(p_payload->>'pipelineId', p_payload->>'pipeline_id')
      ))
      OR
      -- Store específica para triggers de pedido (trigger_config->>'storeId')
      -- MANTIDO belt-and-suspenders além do store-scope pela coluna acima.
      ((v_trigger_type IN ('trigger_order', 'trigger_order_paid', 'trigger_abandon')) AND (
        a.trigger_config IS NULL
        OR COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') IS NULL
        OR COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') =
           COALESCE(p_payload->>'storeId', p_payload->>'store_id')
      ))
      OR
      -- Valor mínimo para pedidos
      ((v_trigger_type IN ('trigger_order', 'trigger_order_paid')) AND (
        a.trigger_config IS NULL
        OR (a.trigger_config->>'minValue') IS NULL
        OR (p_payload->>'total_price')::DECIMAL >= (a.trigger_config->>'minValue')::DECIMAL
      ))
      OR
      -- WhatsApp com filtro de palavra-chave
      (v_trigger_type = 'trigger_whatsapp' AND (
        a.trigger_config IS NULL
        OR (a.trigger_config->>'keyword') IS NULL
        OR (a.trigger_config->>'keyword') = ''
        OR LOWER(COALESCE(p_payload->>'message', p_payload->>'body', ''))
           LIKE '%' || LOWER(a.trigger_config->>'keyword') || '%'
      ))
      OR
      -- Date trigger com filtro de timing
      (v_trigger_type = 'trigger_date' AND (
        a.trigger_config IS NULL
        OR (a.trigger_config->>'dateType') IS NULL
        OR (a.trigger_config->>'dateType') = p_payload->>'date_type'
        OR (
          -- Mapear config timing para event date_type
          (a.trigger_config->>'timing' = 'on_date' AND p_payload->>'date_type' = 'birthday_today')
          OR (a.trigger_config->>'timing' = '1_day_before' AND p_payload->>'date_type' = 'birthday_tomorrow')
          OR (a.trigger_config->>'timing' = '3_days_before' AND p_payload->>'date_type' = 'birthday_in_3_days')
          OR (a.trigger_config->>'timing' = '7_days_before' AND p_payload->>'date_type' = 'birthday_in_7_days')
        )
      ))
      OR
      -- Outros triggers sem condições especiais
      (v_trigger_type NOT IN (
        'trigger_tag', 'trigger_deal_stage', 'trigger_deal_created',
        'trigger_deal_won', 'trigger_deal_lost', 'trigger_order',
        'trigger_order_paid', 'trigger_abandon', 'trigger_whatsapp', 'trigger_date'
      ))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
