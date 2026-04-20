-- ================================================
-- Outbound Webhooks: RPCs
-- Spec: docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md §5
-- ================================================

-- Insert idempotente em batch; retorna IDs realmente inseridos.
CREATE OR REPLACE FUNCTION dispatch_insert_deliveries(p_rows jsonb)
RETURNS TABLE (id uuid) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  INSERT INTO webhook_deliveries (
    subscription_id, organization_id, store_id, event_type, event_id,
    payload, url, status
  )
  SELECT
    (r->>'subscription_id')::uuid,
    (r->>'organization_id')::uuid,
    (r->>'store_id')::uuid,
    r->>'event_type',
    r->>'event_id',
    (r->'payload')::jsonb,
    r->>'url',
    COALESCE(r->>'status', 'pending')
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (subscription_id, event_id) DO NOTHING
  RETURNING webhook_deliveries.id;
END;
$$;

-- Reivindicação atômica do worker: claim + increment de attempt_count + lease.
-- Retorna a linha completa se reivindicada, NULL caso contrário.
CREATE OR REPLACE FUNCTION claim_webhook_delivery(p_id uuid)
RETURNS SETOF webhook_deliveries LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE webhook_deliveries
  SET
    status = 'in_flight',
    attempt_count = attempt_count + 1,
    in_flight_until = now() + interval '10 seconds',
    last_attempt_at = now(),
    updated_at = now()
  WHERE id = p_id
    AND status IN ('pending', 'retrying')
    AND (in_flight_until IS NULL OR in_flight_until < now())
  RETURNING *;
END;
$$;
