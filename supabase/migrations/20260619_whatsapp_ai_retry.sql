-- ================================================
-- AI Response Reliability — retry de resposta IA (WhatsApp)
-- ================================================
-- 1) ai_retry_count: cap de retentativas transient por rodada de resposta.
-- 2) RPC de sweep: conversas com ai_pending=true e debounce vencido há
--    >= p_older_than_seconds (job QStash perdido OU QStash off). O worker
--    /api/workers/whatsapp-ai-respond continua dono do claim atômico.
-- 3) Estende CHECK de whatsapp_alerts.type com 'ai_response_failed'
--    (padrão do DO-block guard de 20260615_whatsapp_campaign_pipeline.sql).

ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_retry_count int NOT NULL DEFAULT 0;

-- Sweep lookup (parcial: só pendentes com IA ligada)
CREATE INDEX IF NOT EXISTS idx_wcc_ai_pending_debounce
  ON whatsapp_cloud_conversations (ai_debounce_until)
  WHERE ai_pending = true AND ai_enabled = true;

CREATE OR REPLACE FUNCTION pending_whatsapp_ai_responses_for_reprocess(
  p_older_than_seconds int DEFAULT 120,
  p_limit int DEFAULT 50
)
RETURNS TABLE (conversation_id uuid, account_id uuid, organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.waba_id, c.organization_id
  FROM whatsapp_cloud_conversations c
  WHERE c.ai_pending = true
    AND c.ai_enabled = true
    AND c.ai_debounce_until IS NOT NULL
    AND c.ai_debounce_until < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY c.ai_debounce_until ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION pending_whatsapp_ai_responses_for_reprocess(int, int) TO service_role;
REVOKE ALL ON FUNCTION pending_whatsapp_ai_responses_for_reprocess(int, int) FROM PUBLIC, anon, authenticated;

-- whatsapp_alerts vem de script manual — guard (espelha 20260615:145-164).
DO $alerts$
BEGIN
  IF to_regclass('public.whatsapp_alerts') IS NOT NULL THEN
    ALTER TABLE whatsapp_alerts DROP CONSTRAINT IF EXISTS whatsapp_alerts_type_check;
    ALTER TABLE whatsapp_alerts ADD CONSTRAINT whatsapp_alerts_type_check
      CHECK (type IN (
        'quality_drop',
        'frequency_cap',
        'template_rejected',
        'template_paused',
        'template_disabled',
        'account_restricted',
        'webhook_dead',
        'window_expiry_bulk',
        'low_messaging_limit',
        'campaign_worker_stalled',
        'ai_response_failed'
      ));
  END IF;
END
$alerts$;
