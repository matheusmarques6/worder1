-- =============================================
-- AUTOMATIONS SYSTEM MIGRATION
-- Execute no Supabase SQL Editor
-- =============================================

-- Tabela de regras de automação
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Identificação
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Fonte e Trigger
  source_type VARCHAR(50) NOT NULL, -- shopify, whatsapp, hotmart, webhook
  trigger_event VARCHAR(100) NOT NULL, -- order_created, order_paid, etc
  
  -- Ação
  action_type VARCHAR(50) NOT NULL DEFAULT 'create_deal', -- create_deal, move_stage, update_deal
  
  -- Destino (para create_deal e move_stage)
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  initial_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  target_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL, -- opcional
  
  -- Status do deal (para move_stage)
  mark_as_won BOOLEAN DEFAULT FALSE,
  mark_as_lost BOOLEAN DEFAULT FALSE,
  lost_reason VARCHAR(255),
  
  -- Filtros
  filters JSONB DEFAULT '{}',
  -- Estrutura: {
  --   min_value: number,
  --   max_value: number,
  --   include_tags: string[],
  --   exclude_tags: string[],
  --   product_ids: string[],
  --   avoid_duplicates: boolean
  -- }
  
  -- Configurações
  is_enabled BOOLEAN DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  
  -- Métricas
  deals_created_count INTEGER DEFAULT 0,
  deals_moved_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para automation_rules
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_source ON automation_rules(source_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(is_enabled);
CREATE INDEX IF NOT EXISTS idx_automation_rules_pipeline ON automation_rules(pipeline_id);

-- Tabela de logs de automação
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Referência à regra
  rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(255),
  
  -- Evento
  source_type VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  
  -- Resultado
  status VARCHAR(20) NOT NULL, -- success, error, skipped
  message TEXT,
  error_message TEXT,
  
  -- Referências criadas
  deal_id UUID,
  contact_id UUID,
  
  -- Dados do evento
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para automation_logs
CREATE INDEX IF NOT EXISTS idx_automation_logs_org ON automation_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule ON automation_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON automation_logs(status);
CREATE INDEX IF NOT EXISTS idx_automation_logs_source ON automation_logs(source_type);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS automation_rules_updated_at ON automation_rules;
CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_rules_updated_at();

-- Habilitar RLS
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para automation_rules
DROP POLICY IF EXISTS "automation_rules_select" ON automation_rules;
CREATE POLICY "automation_rules_select" ON automation_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "automation_rules_insert" ON automation_rules;
CREATE POLICY "automation_rules_insert" ON automation_rules
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "automation_rules_update" ON automation_rules;
CREATE POLICY "automation_rules_update" ON automation_rules
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "automation_rules_delete" ON automation_rules;
CREATE POLICY "automation_rules_delete" ON automation_rules
  FOR DELETE USING (true);

-- Políticas RLS para automation_logs
DROP POLICY IF EXISTS "automation_logs_select" ON automation_logs;
CREATE POLICY "automation_logs_select" ON automation_logs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "automation_logs_insert" ON automation_logs;
CREATE POLICY "automation_logs_insert" ON automation_logs
  FOR INSERT WITH CHECK (true);

-- Limpar logs antigos (manter 30 dias)
-- Executar periodicamente via cron
CREATE OR REPLACE FUNCTION cleanup_old_automation_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM automation_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- DONE! Tabelas criadas com sucesso
-- =============================================
