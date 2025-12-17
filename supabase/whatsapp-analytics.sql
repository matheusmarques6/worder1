-- ============================================
-- WORDER - WhatsApp Campaign Analytics Schema
-- ============================================

-- 1. TABELA: Analytics Agregados de Campanhas
CREATE TABLE IF NOT EXISTS whatsapp_campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  
  -- MÉTRICAS ABSOLUTAS
  total_sent INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_read INT DEFAULT 0,
  total_replied INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  total_optout INT DEFAULT 0,
  
  -- TEMPOS (em segundos)
  avg_delivery_time_seconds FLOAT DEFAULT 0,
  avg_read_time_seconds FLOAT DEFAULT 0,
  min_delivery_time_seconds FLOAT,
  max_delivery_time_seconds FLOAT,
  
  -- TAXAS PRÉ-CALCULADAS (0-100)
  delivery_rate FLOAT DEFAULT 0,
  read_rate FLOAT DEFAULT 0,
  reply_rate FLOAT DEFAULT 0,
  failure_rate FLOAT DEFAULT 0,
  
  -- DISTRIBUIÇÃO DE ERROS
  error_breakdown JSONB DEFAULT '{}',
  -- Formato: {"131047": {"count": 15, "description": "Re-engagement required"}}
  
  -- DISTRIBUIÇÃO POR HORA
  hourly_stats JSONB DEFAULT '[]',
  -- Formato: [{"hour": 9, "sent": 500, "delivered": 480, "read": 320}]
  
  -- MELHORES HORÁRIOS
  best_delivery_hour INT,
  best_read_hour INT,
  
  -- PERÍODO DE CÁLCULO
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ATUALIZAR TABELA DE LOGS (adicionar campos de tempo)
ALTER TABLE whatsapp_campaign_logs 
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_message TEXT,
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS delivery_time_seconds INT,
  ADD COLUMN IF NOT EXISTS read_time_seconds INT;

-- 3. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_camp_analytics_org ON whatsapp_campaign_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_camp_analytics_campaign ON whatsapp_campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_camp_analytics_period ON whatsapp_campaign_analytics(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_camp_logs_campaign ON whatsapp_campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_camp_logs_status ON whatsapp_campaign_logs(status);
CREATE INDEX IF NOT EXISTS idx_camp_logs_sent_at ON whatsapp_campaign_logs(sent_at);

-- 4. FUNÇÃO: Calcular Analytics de Campanha
CREATE OR REPLACE FUNCTION calculate_campaign_analytics(p_campaign_id UUID)
RETURNS void AS $$
DECLARE
  v_org_id UUID;
  v_total_sent INT;
  v_total_delivered INT;
  v_total_read INT;
  v_total_replied INT;
  v_total_failed INT;
  v_avg_delivery FLOAT;
  v_avg_read FLOAT;
  v_min_delivery FLOAT;
  v_max_delivery FLOAT;
  v_errors JSONB;
  v_hourly JSONB;
  v_best_delivery_hour INT;
  v_best_read_hour INT;
BEGIN
  -- Buscar organization_id
  SELECT organization_id INTO v_org_id 
  FROM whatsapp_campaigns WHERE id = p_campaign_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found: %', p_campaign_id;
  END IF;

  -- Calcular totais
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('SENT', 'DELIVERED', 'READ')),
    COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ')),
    COUNT(*) FILTER (WHERE status = 'READ'),
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL),
    COUNT(*) FILTER (WHERE status = 'FAILED'),
    AVG(delivery_time_seconds) FILTER (WHERE delivery_time_seconds > 0),
    AVG(read_time_seconds) FILTER (WHERE read_time_seconds > 0),
    MIN(delivery_time_seconds) FILTER (WHERE delivery_time_seconds > 0),
    MAX(delivery_time_seconds) FILTER (WHERE delivery_time_seconds > 0)
  INTO v_total_sent, v_total_delivered, v_total_read, v_total_replied, v_total_failed, 
       v_avg_delivery, v_avg_read, v_min_delivery, v_max_delivery
  FROM whatsapp_campaign_logs
  WHERE campaign_id = p_campaign_id;

  -- Calcular erros por código
  SELECT COALESCE(jsonb_object_agg(error_code, json_build_object('count', cnt, 'description', err_desc)), '{}')
  INTO v_errors
  FROM (
    SELECT 
      error_code, 
      COUNT(*) as cnt,
      MAX(error_message) as err_desc
    FROM whatsapp_campaign_logs
    WHERE campaign_id = p_campaign_id AND error_code IS NOT NULL
    GROUP BY error_code
  ) t;

  -- Calcular distribuição por hora
  SELECT COALESCE(jsonb_agg(json_build_object(
    'hour', hour,
    'sent', sent,
    'delivered', delivered,
    'read', read_count,
    'delivery_rate', CASE WHEN sent > 0 THEN ROUND((delivered::numeric / sent * 100)::numeric, 2) ELSE 0 END,
    'read_rate', CASE WHEN delivered > 0 THEN ROUND((read_count::numeric / delivered * 100)::numeric, 2) ELSE 0 END
  ) ORDER BY hour), '[]')
  INTO v_hourly
  FROM (
    SELECT 
      EXTRACT(HOUR FROM sent_at)::INT as hour,
      COUNT(*) as sent,
      COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ')) as delivered,
      COUNT(*) FILTER (WHERE status = 'READ') as read_count
    FROM whatsapp_campaign_logs
    WHERE campaign_id = p_campaign_id AND sent_at IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM sent_at)
  ) t;

  -- Encontrar melhor hora para entrega
  SELECT hour INTO v_best_delivery_hour
  FROM (
    SELECT 
      EXTRACT(HOUR FROM sent_at)::INT as hour,
      CASE WHEN COUNT(*) > 0 
        THEN COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ'))::FLOAT / COUNT(*) * 100 
        ELSE 0 
      END as rate
    FROM whatsapp_campaign_logs
    WHERE campaign_id = p_campaign_id AND sent_at IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM sent_at)
    HAVING COUNT(*) >= 10
    ORDER BY rate DESC
    LIMIT 1
  ) t;

  -- Encontrar melhor hora para leitura
  SELECT hour INTO v_best_read_hour
  FROM (
    SELECT 
      EXTRACT(HOUR FROM sent_at)::INT as hour,
      CASE WHEN COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ')) > 0 
        THEN COUNT(*) FILTER (WHERE status = 'READ')::FLOAT / COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ')) * 100 
        ELSE 0 
      END as rate
    FROM whatsapp_campaign_logs
    WHERE campaign_id = p_campaign_id AND sent_at IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM sent_at)
    HAVING COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'READ')) >= 10
    ORDER BY rate DESC
    LIMIT 1
  ) t;

  -- Inserir ou atualizar analytics
  INSERT INTO whatsapp_campaign_analytics (
    organization_id, campaign_id,
    total_sent, total_delivered, total_read, total_replied, total_failed,
    avg_delivery_time_seconds, avg_read_time_seconds,
    min_delivery_time_seconds, max_delivery_time_seconds,
    delivery_rate, read_rate, reply_rate, failure_rate,
    error_breakdown, hourly_stats,
    best_delivery_hour, best_read_hour,
    calculated_at
  ) VALUES (
    v_org_id, p_campaign_id,
    COALESCE(v_total_sent, 0), COALESCE(v_total_delivered, 0), 
    COALESCE(v_total_read, 0), COALESCE(v_total_replied, 0), 
    COALESCE(v_total_failed, 0),
    COALESCE(v_avg_delivery, 0), COALESCE(v_avg_read, 0),
    v_min_delivery, v_max_delivery,
    CASE WHEN COALESCE(v_total_sent, 0) > 0 THEN ROUND((v_total_delivered::NUMERIC / v_total_sent * 100)::NUMERIC, 2) ELSE 0 END,
    CASE WHEN COALESCE(v_total_delivered, 0) > 0 THEN ROUND((v_total_read::NUMERIC / v_total_delivered * 100)::NUMERIC, 2) ELSE 0 END,
    CASE WHEN COALESCE(v_total_sent, 0) > 0 THEN ROUND((v_total_replied::NUMERIC / v_total_sent * 100)::NUMERIC, 2) ELSE 0 END,
    CASE WHEN COALESCE(v_total_sent, 0) > 0 THEN ROUND((v_total_failed::NUMERIC / v_total_sent * 100)::NUMERIC, 2) ELSE 0 END,
    v_errors, v_hourly,
    v_best_delivery_hour, v_best_read_hour,
    NOW()
  )
  ON CONFLICT (campaign_id) WHERE period_start IS NULL AND period_end IS NULL
  DO UPDATE SET
    total_sent = EXCLUDED.total_sent,
    total_delivered = EXCLUDED.total_delivered,
    total_read = EXCLUDED.total_read,
    total_replied = EXCLUDED.total_replied,
    total_failed = EXCLUDED.total_failed,
    avg_delivery_time_seconds = EXCLUDED.avg_delivery_time_seconds,
    avg_read_time_seconds = EXCLUDED.avg_read_time_seconds,
    min_delivery_time_seconds = EXCLUDED.min_delivery_time_seconds,
    max_delivery_time_seconds = EXCLUDED.max_delivery_time_seconds,
    delivery_rate = EXCLUDED.delivery_rate,
    read_rate = EXCLUDED.read_rate,
    reply_rate = EXCLUDED.reply_rate,
    failure_rate = EXCLUDED.failure_rate,
    error_breakdown = EXCLUDED.error_breakdown,
    hourly_stats = EXCLUDED.hourly_stats,
    best_delivery_hour = EXCLUDED.best_delivery_hour,
    best_read_hour = EXCLUDED.best_read_hour,
    calculated_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 5. FUNÇÃO: Atualizar status do log de campanha (chamada pelo webhook)
CREATE OR REPLACE FUNCTION update_campaign_log_status(
  p_message_id VARCHAR,
  p_status VARCHAR,
  p_timestamp TIMESTAMPTZ DEFAULT NOW(),
  p_error_code VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_log_record RECORD;
BEGIN
  -- Buscar log pelo message_id
  SELECT * INTO v_log_record
  FROM whatsapp_campaign_logs
  WHERE message_id = p_message_id;

  IF v_log_record IS NULL THEN
    RETURN;
  END IF;

  -- Atualizar baseado no status
  IF p_status = 'delivered' AND v_log_record.delivered_at IS NULL THEN
    UPDATE whatsapp_campaign_logs
    SET 
      status = 'DELIVERED',
      delivered_at = p_timestamp,
      delivery_time_seconds = EXTRACT(EPOCH FROM (p_timestamp - COALESCE(sent_at, created_at)))::INT,
      updated_at = NOW()
    WHERE message_id = p_message_id;
    
  ELSIF p_status = 'read' THEN
    UPDATE whatsapp_campaign_logs
    SET 
      status = 'READ',
      read_at = p_timestamp,
      read_time_seconds = CASE 
        WHEN delivered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (p_timestamp - delivered_at))::INT
        ELSE NULL
      END,
      updated_at = NOW()
    WHERE message_id = p_message_id;
    
  ELSIF p_status = 'failed' THEN
    UPDATE whatsapp_campaign_logs
    SET 
      status = 'FAILED',
      failed_at = p_timestamp,
      error_code = p_error_code,
      error_message = p_error_message,
      updated_at = NOW()
    WHERE message_id = p_message_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. RLS POLICIES
ALTER TABLE whatsapp_campaign_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_analytics_org_access" ON whatsapp_campaign_analytics;
CREATE POLICY "campaign_analytics_org_access" ON whatsapp_campaign_analytics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members 
      WHERE organization_id = whatsapp_campaign_analytics.organization_id 
      AND user_id = auth.uid()
    )
  );

-- 7. GRANTS
GRANT ALL ON whatsapp_campaign_analytics TO authenticated;
GRANT ALL ON whatsapp_campaign_analytics TO service_role;

-- 8. TRIGGER para recalcular analytics quando log é atualizado
CREATE OR REPLACE FUNCTION trigger_recalculate_campaign_analytics()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalcular analytics da campanha
  PERFORM calculate_campaign_analytics(NEW.campaign_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_campaign_analytics ON whatsapp_campaign_logs;
CREATE TRIGGER trg_recalculate_campaign_analytics
  AFTER INSERT OR UPDATE ON whatsapp_campaign_logs
  FOR EACH ROW
  WHEN (NEW.status IN ('DELIVERED', 'READ', 'FAILED'))
  EXECUTE FUNCTION trigger_recalculate_campaign_analytics();

-- 9. VIEW para facilitar consultas de analytics
CREATE OR REPLACE VIEW v_campaign_analytics_summary AS
SELECT 
  c.id as campaign_id,
  c.title as campaign_title,
  c.status as campaign_status,
  c.template_name,
  c.organization_id,
  c.total_contacts,
  c.started_at,
  c.completed_at,
  COALESCE(a.total_sent, 0) as total_sent,
  COALESCE(a.total_delivered, 0) as total_delivered,
  COALESCE(a.total_read, 0) as total_read,
  COALESCE(a.total_replied, 0) as total_replied,
  COALESCE(a.total_failed, 0) as total_failed,
  COALESCE(a.delivery_rate, 0) as delivery_rate,
  COALESCE(a.read_rate, 0) as read_rate,
  COALESCE(a.reply_rate, 0) as reply_rate,
  COALESCE(a.failure_rate, 0) as failure_rate,
  COALESCE(a.avg_delivery_time_seconds, 0) as avg_delivery_time_seconds,
  COALESCE(a.avg_read_time_seconds, 0) as avg_read_time_seconds,
  a.best_delivery_hour,
  a.best_read_hour,
  a.error_breakdown,
  a.hourly_stats,
  a.calculated_at
FROM whatsapp_campaigns c
LEFT JOIN whatsapp_campaign_analytics a ON c.id = a.campaign_id
WHERE a.period_start IS NULL AND a.period_end IS NULL;

GRANT SELECT ON v_campaign_analytics_summary TO authenticated;
GRANT SELECT ON v_campaign_analytics_summary TO service_role;
