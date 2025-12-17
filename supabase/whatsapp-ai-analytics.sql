-- ============================================
-- WORDER - WhatsApp AI Agents Analytics Schema
-- ============================================

-- 1. TABELA: Logs de Interações da IA
CREATE TABLE IF NOT EXISTS whatsapp_ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Referências
  ai_config_id UUID REFERENCES whatsapp_ai_configs(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  
  -- Configuração usada
  provider VARCHAR(50) NOT NULL,  -- openai, anthropic, gemini, deepseek
  model VARCHAR(100) NOT NULL,    -- gpt-4o, claude-3-5-sonnet, etc
  
  -- Conteúdo
  user_message TEXT NOT NULL,
  ai_response TEXT,
  system_prompt_used TEXT,
  
  -- Tokens (custo)
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  
  -- Performance
  request_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_received_at TIMESTAMPTZ,
  response_time_ms INT,  -- Latência em milissegundos
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, success, error, timeout
  error_code VARCHAR(100),
  error_message TEXT,
  
  -- Qualidade
  was_helpful BOOLEAN,           -- Feedback do usuário (futuro)
  was_transferred BOOLEAN DEFAULT FALSE,  -- Transferido para humano
  user_continued BOOLEAN,        -- Usuário continuou conversando
  conversation_resolved BOOLEAN DEFAULT FALSE, -- Conversa foi resolvida pela IA
  
  -- Metadados
  temperature FLOAT,
  max_tokens_config INT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA: Analytics Agregados de IA (por período)
CREATE TABLE IF NOT EXISTS whatsapp_ai_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_config_id UUID REFERENCES whatsapp_ai_configs(id) ON DELETE CASCADE,
  
  -- Período
  period_type VARCHAR(20) NOT NULL,  -- hourly, daily, weekly, monthly
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Volume
  total_interactions INT DEFAULT 0,
  total_conversations INT DEFAULT 0,
  total_messages_processed INT DEFAULT 0,
  total_responses_sent INT DEFAULT 0,
  
  -- Performance
  avg_response_time_ms FLOAT DEFAULT 0,
  min_response_time_ms INT,
  max_response_time_ms INT,
  p50_response_time_ms INT,
  p95_response_time_ms INT,
  p99_response_time_ms INT,
  
  -- Tokens/Custo
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  estimated_cost_usd FLOAT DEFAULT 0,
  
  -- Taxas
  success_rate FLOAT DEFAULT 0,
  error_rate FLOAT DEFAULT 0,
  resolution_rate FLOAT DEFAULT 0,
  transfer_rate FLOAT DEFAULT 0,
  
  -- Contadores de Status
  success_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  timeout_count INT DEFAULT 0,
  resolved_count INT DEFAULT 0,
  transferred_count INT DEFAULT 0,
  
  -- Distribuição por hora (JSONB para hourly breakdown)
  hourly_distribution JSONB DEFAULT '[]',
  
  -- Erros agrupados
  error_breakdown JSONB DEFAULT '{}',
  
  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA: Preços por Token (referência)
CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_price_per_1m FLOAT NOT NULL,   -- USD por 1M tokens input
  output_price_per_1m FLOAT NOT NULL,  -- USD por 1M tokens output
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, model)
);

-- Inserir preços de referência (Dezembro 2024)
INSERT INTO ai_model_pricing (provider, model, input_price_per_1m, output_price_per_1m) VALUES
  ('openai', 'gpt-4o', 2.50, 10.00),
  ('openai', 'gpt-4o-mini', 0.15, 0.60),
  ('openai', 'gpt-4-turbo', 10.00, 30.00),
  ('openai', 'gpt-3.5-turbo', 0.50, 1.50),
  ('anthropic', 'claude-3-5-sonnet-20241022', 3.00, 15.00),
  ('anthropic', 'claude-3-5-haiku-20241022', 0.80, 4.00),
  ('anthropic', 'claude-3-haiku-20240307', 0.25, 1.25),
  ('anthropic', 'claude-3-opus-20240229', 15.00, 75.00),
  ('gemini', 'gemini-1.5-flash', 0.075, 0.30),
  ('gemini', 'gemini-1.5-pro', 1.25, 5.00),
  ('gemini', 'gemini-2.0-flash-exp', 0.10, 0.40),
  ('deepseek', 'deepseek-chat', 0.14, 0.28),
  ('deepseek', 'deepseek-reasoner', 0.55, 2.19)
ON CONFLICT (provider, model) DO UPDATE SET
  input_price_per_1m = EXCLUDED.input_price_per_1m,
  output_price_per_1m = EXCLUDED.output_price_per_1m,
  updated_at = NOW();

-- 4. ATUALIZAR TABELA DE CONFIGS (adicionar campos de métricas)
ALTER TABLE whatsapp_ai_configs 
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS fallback_message TEXT,
  ADD COLUMN IF NOT EXISTS transfer_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS working_hours JSONB,
  ADD COLUMN IF NOT EXISTS total_interactions INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_usd FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;

-- 5. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_ai_interactions_org ON whatsapp_ai_interactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_config ON whatsapp_ai_interactions(ai_config_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_created ON whatsapp_ai_interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_status ON whatsapp_ai_interactions(status);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_conv ON whatsapp_ai_interactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_provider ON whatsapp_ai_interactions(provider);

CREATE INDEX IF NOT EXISTS idx_ai_analytics_org ON whatsapp_ai_analytics(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_period ON whatsapp_ai_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_type ON whatsapp_ai_analytics(period_type);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_config ON whatsapp_ai_analytics(ai_config_id);

-- 6. FUNÇÃO: Registrar Interação de IA
CREATE OR REPLACE FUNCTION log_ai_interaction(
  p_org_id UUID,
  p_config_id UUID,
  p_conversation_id UUID,
  p_message_id UUID,
  p_provider VARCHAR,
  p_model VARCHAR,
  p_user_message TEXT,
  p_ai_response TEXT,
  p_input_tokens INT,
  p_output_tokens INT,
  p_response_time_ms INT,
  p_status VARCHAR,
  p_error_code VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_temperature FLOAT DEFAULT NULL,
  p_max_tokens INT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_interaction_id UUID;
  v_cost FLOAT;
  v_pricing RECORD;
BEGIN
  -- Buscar preço do modelo
  SELECT * INTO v_pricing
  FROM ai_model_pricing
  WHERE provider = p_provider AND model = p_model;

  -- Calcular custo
  IF v_pricing IS NOT NULL THEN
    v_cost := (p_input_tokens::FLOAT / 1000000 * v_pricing.input_price_per_1m) +
              (p_output_tokens::FLOAT / 1000000 * v_pricing.output_price_per_1m);
  ELSE
    v_cost := 0;
  END IF;

  -- Inserir log
  INSERT INTO whatsapp_ai_interactions (
    organization_id, ai_config_id, conversation_id, message_id,
    provider, model, user_message, ai_response,
    input_tokens, output_tokens, total_tokens,
    response_time_ms, status, error_code, error_message,
    temperature, max_tokens_config,
    response_received_at,
    request_started_at
  ) VALUES (
    p_org_id, p_config_id, p_conversation_id, p_message_id,
    p_provider, p_model, p_user_message, p_ai_response,
    p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
    p_response_time_ms, p_status, p_error_code, p_error_message,
    p_temperature, p_max_tokens,
    NOW(),
    NOW() - (p_response_time_ms || ' milliseconds')::INTERVAL
  )
  RETURNING id INTO v_interaction_id;

  -- Atualizar contador no config
  IF p_config_id IS NOT NULL THEN
    UPDATE whatsapp_ai_configs
    SET 
      total_interactions = COALESCE(total_interactions, 0) + 1,
      total_tokens_used = COALESCE(total_tokens_used, 0) + p_input_tokens + p_output_tokens,
      total_cost_usd = COALESCE(total_cost_usd, 0) + v_cost,
      last_interaction_at = NOW(),
      updated_at = NOW()
    WHERE id = p_config_id;
  END IF;

  RETURN v_interaction_id;
END;
$$ LANGUAGE plpgsql;

-- 7. FUNÇÃO: Calcular Analytics de IA
CREATE OR REPLACE FUNCTION calculate_ai_analytics(
  p_org_id UUID,
  p_period_type VARCHAR,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_config_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_stats RECORD;
  v_hourly JSONB;
  v_errors JSONB;
  v_cost FLOAT;
BEGIN
  -- Calcular estatísticas
  SELECT
    COUNT(*) as total_interactions,
    COUNT(DISTINCT conversation_id) as total_conversations,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'error') as error_count,
    COUNT(*) FILTER (WHERE status = 'timeout') as timeout_count,
    COUNT(*) FILTER (WHERE conversation_resolved = true) as resolved_count,
    COUNT(*) FILTER (WHERE was_transferred = true) as transferred_count,
    AVG(response_time_ms) FILTER (WHERE response_time_ms > 0) as avg_response_time,
    MIN(response_time_ms) FILTER (WHERE response_time_ms > 0) as min_response_time,
    MAX(response_time_ms) FILTER (WHERE response_time_ms > 0) as max_response_time,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE response_time_ms > 0) as p50_response_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE response_time_ms > 0) as p95_response_time,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE response_time_ms > 0) as p99_response_time,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_tokens) as total_tokens
  INTO v_stats
  FROM whatsapp_ai_interactions
  WHERE organization_id = p_org_id
    AND created_at >= p_start
    AND created_at < p_end
    AND (p_config_id IS NULL OR ai_config_id = p_config_id);

  -- Calcular custo estimado
  SELECT COALESCE(SUM(
    (i.input_tokens::FLOAT / 1000000 * p.input_price_per_1m) +
    (i.output_tokens::FLOAT / 1000000 * p.output_price_per_1m)
  ), 0)
  INTO v_cost
  FROM whatsapp_ai_interactions i
  LEFT JOIN ai_model_pricing p ON i.provider = p.provider AND i.model = p.model
  WHERE i.organization_id = p_org_id
    AND i.created_at >= p_start
    AND i.created_at < p_end
    AND (p_config_id IS NULL OR i.ai_config_id = p_config_id);

  -- Calcular distribuição por hora
  SELECT COALESCE(jsonb_agg(json_build_object(
    'hour', hour,
    'interactions', interactions,
    'avg_latency', avg_latency,
    'success_rate', success_rate
  ) ORDER BY hour), '[]')
  INTO v_hourly
  FROM (
    SELECT 
      EXTRACT(HOUR FROM created_at)::INT as hour,
      COUNT(*) as interactions,
      ROUND(AVG(response_time_ms)::NUMERIC, 0) as avg_latency,
      ROUND((COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 2) as success_rate
    FROM whatsapp_ai_interactions
    WHERE organization_id = p_org_id
      AND created_at >= p_start
      AND created_at < p_end
      AND (p_config_id IS NULL OR ai_config_id = p_config_id)
    GROUP BY EXTRACT(HOUR FROM created_at)
  ) t;

  -- Calcular erros por tipo
  SELECT COALESCE(jsonb_object_agg(
    COALESCE(error_code, 'unknown'),
    json_build_object('count', cnt, 'percent', pct)
  ), '{}')
  INTO v_errors
  FROM (
    SELECT 
      error_code,
      COUNT(*) as cnt,
      ROUND((COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100)::NUMERIC, 2) as pct
    FROM whatsapp_ai_interactions
    WHERE organization_id = p_org_id
      AND created_at >= p_start
      AND created_at < p_end
      AND status = 'error'
      AND (p_config_id IS NULL OR ai_config_id = p_config_id)
    GROUP BY error_code
  ) t;

  -- Inserir ou atualizar analytics
  INSERT INTO whatsapp_ai_analytics (
    organization_id, ai_config_id, period_type, period_start, period_end,
    total_interactions, total_conversations,
    success_count, error_count, timeout_count,
    resolved_count, transferred_count,
    avg_response_time_ms, min_response_time_ms, max_response_time_ms,
    p50_response_time_ms, p95_response_time_ms, p99_response_time_ms,
    total_input_tokens, total_output_tokens, total_tokens,
    estimated_cost_usd,
    success_rate, error_rate, resolution_rate, transfer_rate,
    hourly_distribution, error_breakdown,
    calculated_at
  ) VALUES (
    p_org_id, p_config_id, p_period_type, p_start, p_end,
    COALESCE(v_stats.total_interactions, 0),
    COALESCE(v_stats.total_conversations, 0),
    COALESCE(v_stats.success_count, 0),
    COALESCE(v_stats.error_count, 0),
    COALESCE(v_stats.timeout_count, 0),
    COALESCE(v_stats.resolved_count, 0),
    COALESCE(v_stats.transferred_count, 0),
    COALESCE(v_stats.avg_response_time, 0),
    v_stats.min_response_time,
    v_stats.max_response_time,
    v_stats.p50_response_time::INT,
    v_stats.p95_response_time::INT,
    v_stats.p99_response_time::INT,
    COALESCE(v_stats.total_input_tokens, 0),
    COALESCE(v_stats.total_output_tokens, 0),
    COALESCE(v_stats.total_tokens, 0),
    v_cost,
    CASE WHEN COALESCE(v_stats.total_interactions, 0) > 0 
      THEN ROUND((v_stats.success_count::NUMERIC / v_stats.total_interactions * 100)::NUMERIC, 2) ELSE 0 END,
    CASE WHEN COALESCE(v_stats.total_interactions, 0) > 0 
      THEN ROUND((v_stats.error_count::NUMERIC / v_stats.total_interactions * 100)::NUMERIC, 2) ELSE 0 END,
    CASE WHEN COALESCE(v_stats.total_conversations, 0) > 0 
      THEN ROUND((v_stats.resolved_count::NUMERIC / v_stats.total_conversations * 100)::NUMERIC, 2) ELSE 0 END,
    CASE WHEN COALESCE(v_stats.total_conversations, 0) > 0 
      THEN ROUND((v_stats.transferred_count::NUMERIC / v_stats.total_conversations * 100)::NUMERIC, 2) ELSE 0 END,
    v_hourly,
    v_errors,
    NOW()
  )
  ON CONFLICT (organization_id, ai_config_id, period_type, period_start) 
  WHERE ai_config_id IS NOT NULL
  DO UPDATE SET
    total_interactions = EXCLUDED.total_interactions,
    total_conversations = EXCLUDED.total_conversations,
    success_count = EXCLUDED.success_count,
    error_count = EXCLUDED.error_count,
    timeout_count = EXCLUDED.timeout_count,
    resolved_count = EXCLUDED.resolved_count,
    transferred_count = EXCLUDED.transferred_count,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    min_response_time_ms = EXCLUDED.min_response_time_ms,
    max_response_time_ms = EXCLUDED.max_response_time_ms,
    p50_response_time_ms = EXCLUDED.p50_response_time_ms,
    p95_response_time_ms = EXCLUDED.p95_response_time_ms,
    p99_response_time_ms = EXCLUDED.p99_response_time_ms,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    total_tokens = EXCLUDED.total_tokens,
    estimated_cost_usd = EXCLUDED.estimated_cost_usd,
    success_rate = EXCLUDED.success_rate,
    error_rate = EXCLUDED.error_rate,
    resolution_rate = EXCLUDED.resolution_rate,
    transfer_rate = EXCLUDED.transfer_rate,
    hourly_distribution = EXCLUDED.hourly_distribution,
    error_breakdown = EXCLUDED.error_breakdown,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 8. RLS POLICIES
ALTER TABLE whatsapp_ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_interactions_org_access" ON whatsapp_ai_interactions;
CREATE POLICY "ai_interactions_org_access" ON whatsapp_ai_interactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members 
      WHERE organization_id = whatsapp_ai_interactions.organization_id 
      AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_analytics_org_access" ON whatsapp_ai_analytics;
CREATE POLICY "ai_analytics_org_access" ON whatsapp_ai_analytics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members 
      WHERE organization_id = whatsapp_ai_analytics.organization_id 
      AND user_id = auth.uid()
    )
  );

-- 9. GRANTS
GRANT ALL ON whatsapp_ai_interactions TO authenticated;
GRANT ALL ON whatsapp_ai_interactions TO service_role;
GRANT ALL ON whatsapp_ai_analytics TO authenticated;
GRANT ALL ON whatsapp_ai_analytics TO service_role;
GRANT SELECT ON ai_model_pricing TO authenticated;
GRANT ALL ON ai_model_pricing TO service_role;

-- 10. VIEW para facilitar consultas de agentes com métricas
CREATE OR REPLACE VIEW v_ai_agents_summary AS
SELECT 
  c.id,
  c.organization_id,
  COALESCE(c.name, 'Agente ' || LEFT(c.id::TEXT, 8)) as name,
  c.description,
  c.provider,
  c.model,
  c.is_active,
  c.temperature,
  c.max_tokens,
  c.system_prompt,
  COALESCE(c.total_interactions, 0) as total_interactions,
  COALESCE(c.total_tokens_used, 0) as total_tokens_used,
  COALESCE(c.total_cost_usd, 0) as total_cost_usd,
  c.last_interaction_at,
  c.created_at,
  c.updated_at
FROM whatsapp_ai_configs c;

GRANT SELECT ON v_ai_agents_summary TO authenticated;
GRANT SELECT ON v_ai_agents_summary TO service_role;

-- 11. Unique constraint para analytics sem config_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analytics_org_period_null_config 
ON whatsapp_ai_analytics (organization_id, period_type, period_start) 
WHERE ai_config_id IS NULL;
