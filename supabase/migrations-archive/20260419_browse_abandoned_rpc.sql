-- ================================================
-- Outbound Webhooks: detect_browse_abandoned RPC
-- Spec: docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md §6
-- ================================================
--
-- Retorna candidatos a browse.abandoned pra uma org na janela de tempo
-- [p_min_time, p_max_time]. Exclui views onde o contato colocou o MESMO
-- produto no carrinho OU fez qualquer pedido DEPOIS da visualização.
--
-- Schema real: contact_events usa occurred_at (não created_at) e properties
-- (não payload). Ver supabase/migrations/20260330_shopify_graphql_cdp.sql.

CREATE OR REPLACE FUNCTION detect_browse_abandoned(
  p_organization_id uuid,
  p_min_time timestamptz,
  p_max_time timestamptz
)
RETURNS TABLE (
  view_event_id uuid,
  contact_id uuid,
  store_id uuid,
  product_id text,
  viewed_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    v.id AS view_event_id,
    v.contact_id,
    v.store_id,
    v.properties->>'product_id' AS product_id,
    v.occurred_at AS viewed_at
  FROM contact_events v
  WHERE v.organization_id = p_organization_id
    AND v.event_type = 'viewed_product'
    AND v.occurred_at BETWEEN p_min_time AND p_max_time
    AND v.properties->>'product_id' IS NOT NULL
    AND v.contact_id IS NOT NULL
    AND v.store_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM contact_events x
      WHERE x.contact_id = v.contact_id
        AND x.event_type IN ('added_to_cart', 'placed_order')
        AND x.occurred_at > v.occurred_at
        AND (
          x.event_type = 'placed_order'
          OR x.properties->>'product_id' = v.properties->>'product_id'
        )
    );
$$;
