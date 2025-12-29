-- =============================================
-- CRM ADVANCED FEATURES MIGRATION
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. ADICIONAR PROBABILITY NOS STAGES
-- =============================================

ALTER TABLE pipeline_stages 
ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 50;

-- Atualizar stages existentes com probabilidades padrão baseadas no nome
UPDATE pipeline_stages SET probability = 10 WHERE LOWER(name) LIKE '%lead%' AND probability = 50;
UPDATE pipeline_stages SET probability = 25 WHERE LOWER(name) LIKE '%qualif%' AND probability = 50;
UPDATE pipeline_stages SET probability = 50 WHERE LOWER(name) LIKE '%propos%' AND probability = 50;
UPDATE pipeline_stages SET probability = 75 WHERE LOWER(name) LIKE '%negoc%' AND probability = 50;
UPDATE pipeline_stages SET probability = 100 WHERE LOWER(name) LIKE '%ganho%' OR LOWER(name) LIKE '%won%' AND probability = 50;
UPDATE pipeline_stages SET probability = 0 WHERE LOWER(name) LIKE '%perdido%' OR LOWER(name) LIKE '%lost%' AND probability = 50;

COMMENT ON COLUMN pipeline_stages.probability IS 'Probabilidade de fechamento do deal neste estágio (0-100)';

-- =============================================
-- 2. ADICIONAR CAMPOS DE FORECAST NOS DEALS
-- =============================================

ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS commit_level TEXT DEFAULT 'pipeline',
ADD COLUMN IF NOT EXISTS forecast_category TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS expected_close_date DATE;

-- commit_level: 'omit', 'pipeline', 'best_case', 'commit'
-- forecast_category: 'omit', 'open', 'best_case', 'commit', 'closed'

COMMENT ON COLUMN deals.commit_level IS 'Nível de comprometimento: omit, pipeline, best_case, commit';
COMMENT ON COLUMN deals.forecast_category IS 'Categoria de forecast: omit, open, best_case, commit, closed';
COMMENT ON COLUMN deals.expected_close_date IS 'Data esperada de fechamento do deal';

-- =============================================
-- 3. CRIAR TABELA DE HISTÓRICO DE MUDANÇA DE STAGE
-- =============================================

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  from_stage_name TEXT,
  to_stage_name TEXT,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  time_in_previous_stage INTERVAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_org ON deal_stage_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_changed_at ON deal_stage_history(changed_at DESC);

-- RLS
ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stage history in their org" ON deal_stage_history
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stage history in their org" ON deal_stage_history
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- =============================================
-- 4. TRIGGER PARA CAPTURAR MUDANÇAS DE STAGE
-- =============================================

CREATE OR REPLACE FUNCTION track_deal_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_from_stage_name TEXT;
  v_to_stage_name TEXT;
  v_time_in_stage INTERVAL;
BEGIN
  -- Só executa se o stage_id mudou
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Buscar nomes dos stages
    SELECT name INTO v_from_stage_name 
    FROM pipeline_stages WHERE id = OLD.stage_id;
    
    SELECT name INTO v_to_stage_name 
    FROM pipeline_stages WHERE id = NEW.stage_id;
    
    -- Calcular tempo no estágio anterior
    v_time_in_stage := NOW() - COALESCE(OLD.updated_at, OLD.created_at);
    
    -- Inserir no histórico
    INSERT INTO deal_stage_history (
      deal_id,
      organization_id,
      from_stage_id,
      to_stage_id,
      from_stage_name,
      to_stage_name,
      time_in_previous_stage,
      changed_at
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      OLD.stage_id,
      NEW.stage_id,
      v_from_stage_name,
      v_to_stage_name,
      v_time_in_stage,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS deal_stage_change_trigger ON deals;

-- Criar trigger
CREATE TRIGGER deal_stage_change_trigger
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION track_deal_stage_change();

-- =============================================
-- 5. CRIAR TABELA DE DEFINIÇÕES DE CUSTOM FIELDS
-- =============================================

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'contact', 'deal', 'company'
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'number', 'date', 'select', 'multiselect', 'boolean', 'url', 'email', 'phone'
  options JSONB, -- para select/multiselect: ["Opção 1", "Opção 2"]
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  validation_regex TEXT,
  placeholder TEXT,
  help_text TEXT,
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, entity_type, field_key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_custom_fields_org_entity ON custom_field_definitions(organization_id, entity_type);

-- RLS
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage custom fields in their org" ON custom_field_definitions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_custom_field_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS custom_field_updated_at ON custom_field_definitions;
CREATE TRIGGER custom_field_updated_at
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_field_timestamp();

-- =============================================
-- 6. VIEW PARA FORECAST (facilita queries)
-- =============================================

CREATE OR REPLACE VIEW deal_forecast_view AS
SELECT 
  d.id,
  d.organization_id,
  d.pipeline_id,
  d.stage_id,
  d.title,
  d.value,
  d.status,
  d.commit_level,
  d.forecast_category,
  d.expected_close_date,
  d.created_at,
  d.updated_at,
  ps.name AS stage_name,
  ps.probability AS stage_probability,
  ROUND(d.value * COALESCE(ps.probability, 50) / 100, 2) AS weighted_value,
  p.name AS pipeline_name,
  c.first_name || ' ' || COALESCE(c.last_name, '') AS contact_name,
  c.email AS contact_email
FROM deals d
LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
LEFT JOIN pipelines p ON d.pipeline_id = p.id
LEFT JOIN contacts c ON d.contact_id = c.id
WHERE d.status = 'open';

-- =============================================
-- 7. FUNÇÃO PARA CALCULAR MÉTRICAS DE FORECAST
-- =============================================

CREATE OR REPLACE FUNCTION get_forecast_metrics(
  p_organization_id UUID,
  p_pipeline_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_pipeline NUMERIC,
  weighted_pipeline NUMERIC,
  commit_total NUMERIC,
  best_case_total NUMERIC,
  pipeline_total NUMERIC,
  deal_count BIGINT,
  avg_deal_value NUMERIC,
  avg_probability NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(d.value), 0) AS total_pipeline,
    COALESCE(SUM(d.value * COALESCE(ps.probability, 50) / 100), 0) AS weighted_pipeline,
    COALESCE(SUM(CASE WHEN d.commit_level = 'commit' THEN d.value ELSE 0 END), 0) AS commit_total,
    COALESCE(SUM(CASE WHEN d.commit_level IN ('commit', 'best_case') THEN d.value ELSE 0 END), 0) AS best_case_total,
    COALESCE(SUM(CASE WHEN d.commit_level = 'pipeline' THEN d.value ELSE 0 END), 0) AS pipeline_total,
    COUNT(*) AS deal_count,
    COALESCE(AVG(d.value), 0) AS avg_deal_value,
    COALESCE(AVG(ps.probability), 50) AS avg_probability
  FROM deals d
  LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
  WHERE d.organization_id = p_organization_id
    AND d.status = 'open'
    AND (p_pipeline_id IS NULL OR d.pipeline_id = p_pipeline_id)
    AND (p_start_date IS NULL OR d.created_at >= p_start_date)
    AND (p_end_date IS NULL OR d.created_at <= p_end_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================
-- 8. FUNÇÃO PARA CALCULAR VELOCIDADE DE VENDAS
-- =============================================

CREATE OR REPLACE FUNCTION get_sales_velocity(
  p_organization_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  avg_time_in_stage INTERVAL,
  deals_passed INTEGER,
  conversion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dsh.to_stage_id,
    dsh.to_stage_name,
    AVG(dsh.time_in_previous_stage) AS avg_time_in_stage,
    COUNT(DISTINCT dsh.deal_id)::INTEGER AS deals_passed,
    ROUND(
      COUNT(DISTINCT dsh.deal_id)::NUMERIC / 
      NULLIF(COUNT(DISTINCT dsh2.deal_id), 0) * 100,
      2
    ) AS conversion_rate
  FROM deal_stage_history dsh
  LEFT JOIN deal_stage_history dsh2 ON dsh2.from_stage_id = dsh.to_stage_id
    AND dsh2.organization_id = dsh.organization_id
    AND dsh2.changed_at >= NOW() - (p_days || ' days')::INTERVAL
  WHERE dsh.organization_id = p_organization_id
    AND dsh.changed_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY dsh.to_stage_id, dsh.to_stage_name
  ORDER BY dsh.to_stage_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================
-- 9. ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =============================================

-- Índices para forecast
CREATE INDEX IF NOT EXISTS idx_deals_forecast ON deals(organization_id, status, commit_level);
CREATE INDEX IF NOT EXISTS idx_deals_expected_close ON deals(organization_id, expected_close_date) WHERE status = 'open';

-- =============================================
-- VERIFICAÇÃO FINAL
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration CRM Advanced Features executada com sucesso!';
  RAISE NOTICE '  - Coluna probability adicionada em pipeline_stages';
  RAISE NOTICE '  - Colunas de forecast adicionadas em deals';
  RAISE NOTICE '  - Tabela deal_stage_history criada';
  RAISE NOTICE '  - Trigger de mudança de stage criado';
  RAISE NOTICE '  - Tabela custom_field_definitions criada';
  RAISE NOTICE '  - View deal_forecast_view criada';
  RAISE NOTICE '  - Funções get_forecast_metrics e get_sales_velocity criadas';
END $$;
