-- ================================================
-- WhatsApp Webhook Events — Async ingest queue
-- Plan: Sprint 1 / Fase 1 (ingest-fast / process-later)
-- ================================================
--
-- Raw payloads from Meta land here in <50ms (HMAC-verified),
-- then a QStash-triggered worker claims them atomically and runs
-- the heavy logic (contacts, conversations, RuleEngine).
--
-- Status lifecycle:
--   pending -> processing -> done
--                         -> failed (transient: cron reprocesses)
--                         -> dead   (exceeded max attempts)

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_phone_number_id text,
  raw_payload jsonb NOT NULL,
  signature text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  in_flight_until timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker lookup (claim pending or retry-eligible)
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_status_received
  ON whatsapp_webhook_events (status, received_at)
  WHERE status IN ('pending', 'failed');

-- Diagnostics by phone number
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_phone_number
  ON whatsapp_webhook_events (waba_phone_number_id)
  WHERE waba_phone_number_id IS NOT NULL;

-- Pruning helper
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_done_processed
  ON whatsapp_webhook_events (processed_at)
  WHERE status = 'done';

-- ================================================
-- claim_whatsapp_webhook_event: atomic claim with lease
-- ================================================
-- Mirrors claim_webhook_delivery() from 20260419_webhook_rpcs.sql.
-- Atomic: status -> 'processing', attempts++, lease 30s.
-- Returns the claimed row or empty set if not claimable.
CREATE OR REPLACE FUNCTION claim_whatsapp_webhook_event(p_id uuid)
RETURNS SETOF whatsapp_webhook_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_webhook_events
  SET
    status = 'processing',
    attempts = attempts + 1,
    in_flight_until = now() + interval '30 seconds',
    updated_at = now()
  WHERE id = p_id
    AND status IN ('pending', 'failed')
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND attempts < max_attempts
  RETURNING *;
END;
$$;

-- ================================================
-- pending_whatsapp_webhook_events_for_reprocess
-- ================================================
-- Cron picks events older than threshold still in pending/failed,
-- ignoring those currently leased. Returns ids the cron should
-- re-publish to QStash (worker will then claim atomically).
CREATE OR REPLACE FUNCTION pending_whatsapp_webhook_events_for_reprocess(
  p_older_than_seconds int DEFAULT 60,
  p_limit int DEFAULT 100
)
RETURNS SETOF whatsapp_webhook_events LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM whatsapp_webhook_events
  WHERE status IN ('pending', 'failed')
    AND attempts < max_attempts
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND received_at < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY received_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_whatsapp_webhook_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION pending_whatsapp_webhook_events_for_reprocess(int, int) TO service_role;

-- ================================================
-- RLS: service_role only (webhooks are internal)
-- ================================================
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_webhook_events_service_role ON whatsapp_webhook_events;
CREATE POLICY whatsapp_webhook_events_service_role ON whatsapp_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE whatsapp_webhook_events IS
  'Raw Meta WhatsApp webhook payloads queued for async processing. Ingested in <50ms by the webhook route, processed by /api/workers/whatsapp-webhook triggered via QStash.';
