-- =============================================
-- P0 — WhatsApp Campaign Pipeline
-- 1) Índices garantidos (schemas legados podem não tê-los em prod)
-- 2) Claim atômico de campanhas agendadas (FOR UPDATE SKIP LOCKED)
-- 3) Aplicação retrograde-safe de status de webhook em campaign_recipients
--    com incremento de contadores por delta exato (1 transação)
-- 4) Remove trigger O(N^2) de recontagem (substituído pelos deltas do item 3;
--    checkCampaignCompletion recomputa totais absolutos no fim da campanha)
-- =============================================

-- 1) Índices
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled
  ON whatsapp_campaigns(scheduled_at) WHERE status = 'scheduled';

-- Índice para reclaim de jobs 'queued' órfãos (crash/timeout entre claim e
-- status terminal). O worker re-clama qualquer queued não atualizado há
-- mais de 10 minutos.
CREATE INDEX IF NOT EXISTS idx_campaigns_queued_reclaim
  ON whatsapp_campaigns(updated_at) WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_recipients_meta_msg_notnull
  ON whatsapp_campaign_recipients(meta_message_id)
  WHERE meta_message_id IS NOT NULL;

-- scheduled_messages vem de script manual (sql/fase3-scheduled-messages.sql)
-- e pode não existir em todos os ambientes — guard evita abortar a migration.
DO $do$
BEGIN
  IF to_regclass('public.scheduled_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
      ON scheduled_messages(scheduled_at) WHERE status IN ('pending', 'processing');
  END IF;
END
$do$;

-- 2) Claim atômico de campanhas agendadas + reclaim de queued órfãos.
-- O UPDATE seta updated_at = NOW() ao transitar para 'queued', o que
-- garante que um reclaim de órfão só ocorre após MAIS de 10 minutos sem
-- atualização — impedindo que o cron re-claime campanhas normalmente em
-- execução ou faça loop de reclaims.
CREATE OR REPLACE FUNCTION claim_due_whatsapp_campaigns(p_limit INT DEFAULT 3)
RETURNS SETOF whatsapp_campaigns AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_campaigns c
  SET status = 'queued', updated_at = NOW()
  WHERE c.id IN (
    SELECT w.id FROM whatsapp_campaigns w
    WHERE (w.status = 'scheduled' AND w.scheduled_at <= NOW())
       OR (w.status = 'queued' AND w.updated_at < NOW() - INTERVAL '10 minutes')
    ORDER BY w.scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION claim_due_whatsapp_campaigns TO service_role;
REVOKE ALL ON FUNCTION claim_due_whatsapp_campaigns(INT) FROM PUBLIC, anon, authenticated;

-- 3) Webhook -> recipient (anti-retrógrado + contadores por delta)
CREATE OR REPLACE FUNCTION apply_campaign_recipient_webhook(
  p_meta_message_id VARCHAR,
  p_new_status VARCHAR,
  p_error_code VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(recipient_id UUID, out_campaign_id UUID, applied BOOLEAN) AS $$
DECLARE
  v_id UUID;
  v_campaign UUID;
  v_old VARCHAR;
  v_old_ord INT;
  v_new_ord INT;
BEGIN
  SELECT r.id, r.campaign_id, r.status INTO v_id, v_campaign, v_old
  FROM whatsapp_campaign_recipients r
  WHERE r.meta_message_id = p_meta_message_id
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN; -- mensagem não pertence a campanha (caminho comum: inbox)
  END IF;

  -- Statuses fora do mapa (skipped, clicked, replied) viram ordinal 0 e podem
  -- ser sobrescritos por delivered/read — aceitável hoje (nada grava esses
  -- statuses com meta_message_id); revisar se click/reply tracking for ligado.
  v_old_ord := CASE v_old
    WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
    WHEN 'failed' THEN 4 ELSE 0 END;
  v_new_ord := CASE p_new_status
    WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
    WHEN 'failed' THEN 4 ELSE 0 END;

  -- Guard anti-retrógrado (mesma semântica do STATUS_ORDINAL do
  -- webhook-processor para whatsapp_cloud_messages); failed sempre aplica.
  IF v_new_ord <= v_old_ord AND p_new_status <> 'failed' THEN
    RETURN QUERY SELECT v_id, v_campaign, FALSE;
    RETURN;
  END IF;

  UPDATE whatsapp_campaign_recipients SET
    status = p_new_status,
    delivered_at = CASE WHEN p_new_status IN ('delivered','read') AND delivered_at IS NULL
                        THEN p_timestamp ELSE delivered_at END,
    read_at      = CASE WHEN p_new_status = 'read' AND read_at IS NULL
                        THEN p_timestamp ELSE read_at END,
    failed_at    = CASE WHEN p_new_status = 'failed' AND failed_at IS NULL
                        THEN p_timestamp ELSE failed_at END,
    error_code   = COALESCE(p_error_code, error_code),
    error_message = COALESCE(p_error_message, error_message)
  WHERE id = v_id;

  -- Contadores por delta exato:
  --  read vindo direto de sent => +delivered E +read
  UPDATE whatsapp_campaigns SET
    total_delivered = COALESCE(total_delivered, 0) +
      CASE WHEN p_new_status IN ('delivered','read') AND v_old_ord < 2 THEN 1 ELSE 0 END,
    total_read = COALESCE(total_read, 0) +
      CASE WHEN p_new_status = 'read' AND v_old_ord < 3 THEN 1 ELSE 0 END,
    total_failed = COALESCE(total_failed, 0) +
      CASE WHEN p_new_status = 'failed' AND v_old <> 'failed' THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = v_campaign;

  RETURN QUERY SELECT v_id, v_campaign, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION apply_campaign_recipient_webhook TO service_role;
REVOKE ALL ON FUNCTION apply_campaign_recipient_webhook(VARCHAR, VARCHAR, VARCHAR, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- 4) Remove o trigger de recontagem total (7 COUNT(*) por update de status;
--    com webhook atualizando recipients viraria O(N^2) por campanha).
DROP TRIGGER IF EXISTS trigger_update_campaign_metrics ON whatsapp_campaign_recipients;
DROP FUNCTION IF EXISTS update_campaign_metrics();
-- Atenção: NÃO re-aplicar supabase/campaigns-schema.sql em ambientes já
-- migrados — ele recriaria o trigger O(N^2) removido acima.
