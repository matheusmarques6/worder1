-- =============================================
-- MIGRAÇÃO: Histórico de Qualidade WhatsApp
-- Rastrear quality_rating ao longo do tempo
-- =============================================

-- 1. Tabela de histórico de qualidade
CREATE TABLE IF NOT EXISTS whatsapp_quality_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  
  -- Métricas de qualidade
  quality_rating TEXT NOT NULL CHECK (quality_rating IN ('GREEN', 'YELLOW', 'RED', 'UNKNOWN')),
  messaging_limit_tier TEXT, -- TIER_1K, TIER_10K, TIER_100K, UNLIMITED
  verified_name TEXT,
  display_phone_number TEXT,
  
  -- Metadados
  raw_response JSONB,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Para detectar mudanças
  previous_rating TEXT,
  rating_changed BOOLEAN DEFAULT false
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_quality_history_org 
  ON whatsapp_quality_history(organization_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_quality_history_phone 
  ON whatsapp_quality_history(phone_number_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_quality_history_rating 
  ON whatsapp_quality_history(quality_rating, checked_at DESC);

-- 2. Adicionar colunas na tabela de instâncias (se não existirem)
ALTER TABLE whatsapp_instances 
  ADD COLUMN IF NOT EXISTS quality_rating TEXT DEFAULT 'UNKNOWN';

ALTER TABLE whatsapp_instances 
  ADD COLUMN IF NOT EXISTS messaging_limit_tier TEXT;

ALTER TABLE whatsapp_instances 
  ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ;

-- 3. Função para salvar histórico de qualidade
CREATE OR REPLACE FUNCTION save_quality_history(
  p_organization_id UUID,
  p_phone_number_id TEXT,
  p_waba_id TEXT,
  p_quality_rating TEXT,
  p_messaging_limit_tier TEXT,
  p_verified_name TEXT,
  p_display_phone_number TEXT,
  p_raw_response JSONB
)
RETURNS UUID AS $$
DECLARE
  v_previous_rating TEXT;
  v_rating_changed BOOLEAN;
  v_history_id UUID;
BEGIN
  -- Buscar rating anterior
  SELECT quality_rating INTO v_previous_rating
  FROM whatsapp_quality_history
  WHERE phone_number_id = p_phone_number_id
  ORDER BY checked_at DESC
  LIMIT 1;
  
  -- Verificar se mudou
  v_rating_changed := (v_previous_rating IS NOT NULL AND v_previous_rating != p_quality_rating);
  
  -- Inserir histórico
  INSERT INTO whatsapp_quality_history (
    organization_id,
    phone_number_id,
    waba_id,
    quality_rating,
    messaging_limit_tier,
    verified_name,
    display_phone_number,
    raw_response,
    previous_rating,
    rating_changed
  ) VALUES (
    p_organization_id,
    p_phone_number_id,
    p_waba_id,
    p_quality_rating,
    p_messaging_limit_tier,
    p_verified_name,
    p_display_phone_number,
    p_raw_response,
    v_previous_rating,
    v_rating_changed
  )
  RETURNING id INTO v_history_id;
  
  -- Atualizar instância
  UPDATE whatsapp_instances
  SET 
    quality_rating = p_quality_rating,
    messaging_limit_tier = p_messaging_limit_tier,
    quality_checked_at = NOW()
  WHERE phone_number_id = p_phone_number_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- 4. View para dashboard de qualidade
CREATE OR REPLACE VIEW v_whatsapp_quality_dashboard AS
SELECT 
  wi.id as instance_id,
  wi.organization_id,
  wi.instance_name,
  wi.phone_number,
  wi.phone_number_id,
  wi.status as connection_status,
  wi.quality_rating,
  wi.messaging_limit_tier,
  wi.quality_checked_at,
  -- Último histórico
  (
    SELECT json_build_object(
      'rating', qh.quality_rating,
      'previous_rating', qh.previous_rating,
      'rating_changed', qh.rating_changed,
      'checked_at', qh.checked_at
    )
    FROM whatsapp_quality_history qh
    WHERE qh.phone_number_id = wi.phone_number_id
    ORDER BY qh.checked_at DESC
    LIMIT 1
  ) as last_check,
  -- Contagem de mudanças nos últimos 30 dias
  (
    SELECT COUNT(*)
    FROM whatsapp_quality_history qh
    WHERE qh.phone_number_id = wi.phone_number_id
    AND qh.rating_changed = true
    AND qh.checked_at > NOW() - INTERVAL '30 days'
  ) as rating_changes_30d,
  -- Dias no rating atual
  (
    SELECT EXTRACT(DAY FROM (NOW() - MIN(qh.checked_at)))
    FROM whatsapp_quality_history qh
    WHERE qh.phone_number_id = wi.phone_number_id
    AND qh.quality_rating = wi.quality_rating
    AND qh.checked_at > COALESCE(
      (SELECT MAX(checked_at) FROM whatsapp_quality_history 
       WHERE phone_number_id = wi.phone_number_id 
       AND quality_rating != wi.quality_rating),
      '1970-01-01'
    )
  ) as days_in_current_rating
FROM whatsapp_instances wi
WHERE wi.phone_number_id IS NOT NULL;

-- 5. Função para buscar histórico de qualidade
CREATE OR REPLACE FUNCTION get_quality_history(
  p_organization_id UUID,
  p_phone_number_id TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  phone_number_id TEXT,
  quality_rating TEXT,
  messaging_limit_tier TEXT,
  verified_name TEXT,
  previous_rating TEXT,
  rating_changed BOOLEAN,
  checked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    qh.id,
    qh.phone_number_id,
    qh.quality_rating,
    qh.messaging_limit_tier,
    qh.verified_name,
    qh.previous_rating,
    qh.rating_changed,
    qh.checked_at
  FROM whatsapp_quality_history qh
  WHERE qh.organization_id = p_organization_id
  AND (p_phone_number_id IS NULL OR qh.phone_number_id = p_phone_number_id)
  AND qh.checked_at > NOW() - (p_days || ' days')::INTERVAL
  ORDER BY qh.checked_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 6. Índice para função increment_template_usage (se não existir)
CREATE OR REPLACE FUNCTION increment_template_usage(p_template_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_templates
  SET 
    use_count = COALESCE(use_count, 0) + 1,
    last_used_at = NOW()
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql;

-- Verificação
SELECT 'Migração de Quality History concluída!' as resultado;
