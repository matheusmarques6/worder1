-- ============================================================
-- WORDER — Cron SQL Functions (Fase 1)
--
-- Pure-SQL functions called by QStash / Vercel Cron / pg_cron.
-- Each is idempotent and safe to call at any frequency.
--
-- Functions created:
--   1. close_expired_whatsapp_windows()
--   2. prune_whatsapp_webhook_events()
--   3. stale_pending_templates(threshold_minutes)
--   4. dead_whatsapp_events_summary(age_interval)
--
-- Idempotent: uses CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- 1. close_expired_whatsapp_windows
-- ============================================================
-- Closes the 24-hour messaging window on Cloud API conversations
-- where window_expires_at has passed but is_window_open is still TRUE.
-- Returns count of conversations updated.

CREATE OR REPLACE FUNCTION close_expired_whatsapp_windows()
RETURNS TABLE(conversations_closed BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  UPDATE whatsapp_cloud_conversations
  SET
    is_window_open = FALSE,
    updated_at     = now()
  WHERE is_window_open = TRUE
    AND window_expires_at IS NOT NULL
    AND window_expires_at < now();

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION close_expired_whatsapp_windows() TO service_role;

-- ============================================================
-- 2. prune_whatsapp_webhook_events
-- ============================================================
-- Deletes successfully-processed webhook events older than 7 days.
-- Keeps failed/dead events for debugging.
-- Returns count of events pruned.

CREATE OR REPLACE FUNCTION prune_whatsapp_webhook_events()
RETURNS TABLE(events_pruned BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  DELETE FROM whatsapp_webhook_events
  WHERE status = 'done'
    AND processed_at < now() - interval '7 days';

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION prune_whatsapp_webhook_events() TO service_role;

-- ============================================================
-- 3. stale_pending_templates
-- ============================================================
-- Returns templates stuck in PENDING status longer than threshold.
-- Useful for alerting: "these templates may have been rejected
-- silently by Meta or the webhook missed the status update."

CREATE OR REPLACE FUNCTION stale_pending_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id  UUID,
  name         TEXT,
  language     TEXT,
  waba_id      UUID,
  created_at   TIMESTAMPTZ,
  age_minutes  DOUBLE PRECISION
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.waba_id,
    t.created_at,
    EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0 AS age_minutes
  FROM whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION stale_pending_templates(INTEGER) TO service_role;

-- ============================================================
-- 4. dead_whatsapp_events_summary
-- ============================================================
-- Returns a per-phone-number summary of webhook events that are
-- stuck (dead or failed beyond max_attempts) within a recent window.
-- Used by the ops dashboard / alerting cron.

CREATE OR REPLACE FUNCTION dead_whatsapp_events_summary(
  p_since INTERVAL DEFAULT '15 minutes'::interval
)
RETURNS TABLE(
  phone_number_id TEXT,
  dead_count      BIGINT,
  failed_count    BIGINT,
  oldest_event    TIMESTAMPTZ,
  newest_event    TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.waba_phone_number_id          AS phone_number_id,
    count(*) FILTER (WHERE e.status = 'dead')   AS dead_count,
    count(*) FILTER (WHERE e.status = 'failed'
                       AND e.attempts >= e.max_attempts) AS failed_count,
    min(e.received_at)              AS oldest_event,
    max(e.received_at)              AS newest_event
  FROM whatsapp_webhook_events e
  WHERE e.status IN ('dead', 'failed')
    AND e.received_at > now() - p_since
  GROUP BY e.waba_phone_number_id
  ORDER BY dead_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION dead_whatsapp_events_summary(INTERVAL) TO service_role;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Cron functions created' AS resultado;
