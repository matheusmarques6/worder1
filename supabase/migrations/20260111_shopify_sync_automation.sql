-- =============================================
-- Migration: Shopify Sync & Automation Rules
-- Data: 2026-01-11
-- 
-- Adiciona tabelas para:
-- 1. Configuração de sincronização automática
-- 2. Regras de transição de deals
-- =============================================

-- =============================================
-- TABELA 1: Configuração de Sincronização
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  
  -- ========================================
  -- Sincronização de Novos Clientes
  -- ========================================
  sync_new_customers BOOLEAN DEFAULT true,
  customer_contact_type VARCHAR(20) DEFAULT 'lead' CHECK (customer_contact_type IN ('lead', 'customer', 'auto')),
  customer_pipeline_id UUID,
  customer_stage_id UUID,
  customer_auto_tags TEXT[] DEFAULT ARRAY['shopify'],
  create_deal_for_customer BOOLEAN DEFAULT false,
  customer_deal_title_template VARCHAR(200) DEFAULT 'Novo Lead: {{customer_name}}',
  
  -- ========================================
  -- Sincronização de Pedidos
  -- ========================================
  sync_new_orders BOOLEAN DEFAULT true,
  order_pipeline_id UUID,
  order_stage_id UUID,
  order_auto_tags TEXT[] DEFAULT ARRAY['shopify', 'pedido'],
  order_deal_title_template VARCHAR(200) DEFAULT 'Pedido #{{order_number}} - {{customer_name}}',
  
  -- ========================================
  -- Carrinho Abandonado
  -- ========================================
  sync_abandoned_checkouts BOOLEAN DEFAULT false,
  abandoned_pipeline_id UUID,
  abandoned_stage_id UUID,
  abandoned_delay_minutes INT DEFAULT 60,
  abandoned_auto_tags TEXT[] DEFAULT ARRAY['shopify', 'carrinho-abandonado'],
  
  -- ========================================
  -- Configurações Gerais
  -- ========================================
  update_existing_contacts BOOLEAN DEFAULT true,
  prevent_duplicate_deals BOOLEAN DEFAULT true,
  duplicate_check_hours INT DEFAULT 24,
  
  -- ========================================
  -- Timestamps
  -- ========================================
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ========================================
  -- Constraints
  -- ========================================
  CONSTRAINT fk_sync_config_store FOREIGN KEY (store_id) 
    REFERENCES shopify_stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_sync_config_customer_pipeline FOREIGN KEY (customer_pipeline_id) 
    REFERENCES pipelines(id) ON DELETE SET NULL,
  CONSTRAINT fk_sync_config_customer_stage FOREIGN KEY (customer_stage_id) 
    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  CONSTRAINT fk_sync_config_order_pipeline FOREIGN KEY (order_pipeline_id) 
    REFERENCES pipelines(id) ON DELETE SET NULL,
  CONSTRAINT fk_sync_config_order_stage FOREIGN KEY (order_stage_id) 
    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  CONSTRAINT fk_sync_config_abandoned_pipeline FOREIGN KEY (abandoned_pipeline_id) 
    REFERENCES pipelines(id) ON DELETE SET NULL,
  CONSTRAINT fk_sync_config_abandoned_stage FOREIGN KEY (abandoned_stage_id) 
    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    
  CONSTRAINT unique_sync_config_store UNIQUE(store_id)
);

-- =============================================
-- TABELA 2: Regras de Transição Automática
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_transition_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  
  -- ========================================
  -- Identificação da Regra
  -- ========================================
  rule_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  
  -- ========================================
  -- Evento Gatilho
  -- ========================================
  trigger_event VARCHAR(50) NOT NULL CHECK (trigger_event IN (
    'customers/create',
    'customers/update',
    'orders/create',
    'orders/paid',
    'orders/fulfilled',
    'orders/cancelled',
    'orders/partially_fulfilled',
    'checkouts/create',
    'checkouts/update'
  )),
  
  -- ========================================
  -- Condições (Filtros)
  -- ========================================
  from_pipeline_id UUID,              -- Pipeline atual do deal (NULL = qualquer)
  from_stage_id UUID,                 -- Estágio atual do deal (NULL = qualquer)
  min_order_value DECIMAL(10,2),      -- Valor mínimo do pedido
  max_order_value DECIMAL(10,2),      -- Valor máximo do pedido
  customer_tags_include TEXT[],        -- Cliente deve ter essas tags
  customer_tags_exclude TEXT[],        -- Cliente NÃO pode ter essas tags
  product_ids_include TEXT[],          -- Pedido deve conter esses produtos
  
  -- ========================================
  -- Ações
  -- ========================================
  action_type VARCHAR(30) DEFAULT 'move_deal' CHECK (action_type IN (
    'move_deal',
    'create_deal',
    'update_deal',
    'add_tags',
    'remove_tags'
  )),
  to_pipeline_id UUID,                 -- Pipeline destino
  to_stage_id UUID,                    -- Estágio destino
  mark_as_won BOOLEAN DEFAULT false,
  mark_as_lost BOOLEAN DEFAULT false,
  add_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  remove_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  update_deal_value BOOLEAN DEFAULT false,  -- Atualizar valor do deal com valor do pedido
  
  -- ========================================
  -- Timestamps
  -- ========================================
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ========================================
  -- Constraints
  -- ========================================
  CONSTRAINT fk_transition_store FOREIGN KEY (store_id) 
    REFERENCES shopify_stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_transition_from_pipeline FOREIGN KEY (from_pipeline_id) 
    REFERENCES pipelines(id) ON DELETE SET NULL,
  CONSTRAINT fk_transition_from_stage FOREIGN KEY (from_stage_id) 
    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  CONSTRAINT fk_transition_to_pipeline FOREIGN KEY (to_pipeline_id) 
    REFERENCES pipelines(id) ON DELETE SET NULL,
  CONSTRAINT fk_transition_to_stage FOREIGN KEY (to_stage_id) 
    REFERENCES pipeline_stages(id) ON DELETE SET NULL
);

-- =============================================
-- TABELA 3: Log de Execução de Regras
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  
  -- Referências
  rule_id UUID,
  config_id UUID,
  contact_id UUID,
  deal_id UUID,
  
  -- Evento
  trigger_event VARCHAR(50) NOT NULL,
  shopify_event_id VARCHAR(100),
  shopify_order_id VARCHAR(50),
  shopify_customer_id VARCHAR(50),
  
  -- Resultado
  action_taken VARCHAR(50) NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Detalhes
  details JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign Keys
  CONSTRAINT fk_log_store FOREIGN KEY (store_id) 
    REFERENCES shopify_stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_log_rule FOREIGN KEY (rule_id) 
    REFERENCES shopify_transition_rules(id) ON DELETE SET NULL,
  CONSTRAINT fk_log_config FOREIGN KEY (config_id) 
    REFERENCES shopify_sync_config(id) ON DELETE SET NULL
);

-- =============================================
-- ÍNDICES
-- =============================================

-- Sync Config
CREATE INDEX IF NOT EXISTS idx_sync_config_store ON shopify_sync_config(store_id);
CREATE INDEX IF NOT EXISTS idx_sync_config_org ON shopify_sync_config(organization_id);

-- Transition Rules
CREATE INDEX IF NOT EXISTS idx_transition_rules_store ON shopify_transition_rules(store_id);
CREATE INDEX IF NOT EXISTS idx_transition_rules_org ON shopify_transition_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_transition_rules_trigger ON shopify_transition_rules(trigger_event) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_transition_rules_active ON shopify_transition_rules(store_id, is_active, sort_order);

-- Automation Logs
CREATE INDEX IF NOT EXISTS idx_automation_logs_store ON shopify_automation_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON shopify_automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule ON shopify_automation_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_contact ON shopify_automation_logs(contact_id);

-- =============================================
-- TRIGGERS para updated_at
-- =============================================

-- Função genérica (se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para sync_config
DROP TRIGGER IF EXISTS update_shopify_sync_config_updated_at ON shopify_sync_config;
CREATE TRIGGER update_shopify_sync_config_updated_at
  BEFORE UPDATE ON shopify_sync_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para transition_rules
DROP TRIGGER IF EXISTS update_shopify_transition_rules_updated_at ON shopify_transition_rules;
CREATE TRIGGER update_shopify_transition_rules_updated_at
  BEFORE UPDATE ON shopify_transition_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Habilitar RLS
ALTER TABLE shopify_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_transition_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_automation_logs ENABLE ROW LEVEL SECURITY;

-- Policies para sync_config
DROP POLICY IF EXISTS "sync_config_select" ON shopify_sync_config;
CREATE POLICY "sync_config_select" ON shopify_sync_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "sync_config_insert" ON shopify_sync_config;
CREATE POLICY "sync_config_insert" ON shopify_sync_config
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "sync_config_update" ON shopify_sync_config;
CREATE POLICY "sync_config_update" ON shopify_sync_config
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "sync_config_delete" ON shopify_sync_config;
CREATE POLICY "sync_config_delete" ON shopify_sync_config
  FOR DELETE USING (true);

-- Policies para transition_rules
DROP POLICY IF EXISTS "transition_rules_select" ON shopify_transition_rules;
CREATE POLICY "transition_rules_select" ON shopify_transition_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "transition_rules_insert" ON shopify_transition_rules;
CREATE POLICY "transition_rules_insert" ON shopify_transition_rules
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "transition_rules_update" ON shopify_transition_rules;
CREATE POLICY "transition_rules_update" ON shopify_transition_rules
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "transition_rules_delete" ON shopify_transition_rules;
CREATE POLICY "transition_rules_delete" ON shopify_transition_rules
  FOR DELETE USING (true);

-- Policies para automation_logs
DROP POLICY IF EXISTS "automation_logs_select" ON shopify_automation_logs;
CREATE POLICY "automation_logs_select" ON shopify_automation_logs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "automation_logs_insert" ON shopify_automation_logs;
CREATE POLICY "automation_logs_insert" ON shopify_automation_logs
  FOR INSERT WITH CHECK (true);

-- =============================================
-- COMENTÁRIOS
-- =============================================

COMMENT ON TABLE shopify_sync_config IS 'Configurações de sincronização automática Shopify → CRM';
COMMENT ON TABLE shopify_transition_rules IS 'Regras de transição automática de deals baseadas em eventos Shopify';
COMMENT ON TABLE shopify_automation_logs IS 'Log de execução de automações Shopify';

COMMENT ON COLUMN shopify_sync_config.customer_contact_type IS 'lead = sempre lead, customer = sempre customer, auto = baseado em pedidos';
COMMENT ON COLUMN shopify_transition_rules.trigger_event IS 'Evento Shopify que dispara a regra';
COMMENT ON COLUMN shopify_transition_rules.from_pipeline_id IS 'Pipeline atual do deal para aplicar regra (NULL = qualquer)';
