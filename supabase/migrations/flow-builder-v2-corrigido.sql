-- ============================================
-- FLOW BUILDER V2 - MIGRATION CORRIGIDA
-- Execute no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. TABELA: automations (atualização)
-- ============================================

-- Adicionar colunas se não existirem
DO $$
BEGIN
  -- Coluna store_id (SEM foreign key - adicione manualmente se tiver tabela stores)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'store_id') THEN
    ALTER TABLE automations ADD COLUMN store_id UUID;
  END IF;
  
  -- Coluna success_count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'success_count') THEN
    ALTER TABLE automations ADD COLUMN success_count INTEGER DEFAULT 0;
  END IF;
  
  -- Coluna error_count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'error_count') THEN
    ALTER TABLE automations ADD COLUMN error_count INTEGER DEFAULT 0;
  END IF;
  
  -- Coluna last_success_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'last_success_at') THEN
    ALTER TABLE automations ADD COLUMN last_success_at TIMESTAMPTZ;
  END IF;
  
  -- Coluna version
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'version') THEN
    ALTER TABLE automations ADD COLUMN version INTEGER DEFAULT 1;
  END IF;
  
  -- Coluna published_version
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'published_version') THEN
    ALTER TABLE automations ADD COLUMN published_version INTEGER;
  END IF;
  
  -- Coluna static_data
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'static_data') THEN
    ALTER TABLE automations ADD COLUMN static_data JSONB DEFAULT '{}';
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_automations_store ON automations(store_id);
CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);


-- ============================================
-- 2. TABELA: automation_versions
-- ============================================

CREATE TABLE IF NOT EXISTS automation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  settings JSONB,
  
  change_note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE (automation_id, version)
);

CREATE INDEX IF NOT EXISTS idx_automation_versions_automation ON automation_versions(automation_id);

ALTER TABLE automation_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org automation versions" ON automation_versions;
CREATE POLICY "Users can view org automation versions"
  ON automation_versions FOR SELECT
  USING (automation_id IN (
    SELECT id FROM automations WHERE organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  ));


-- ============================================
-- 3. TABELA: credentials (nova)
-- ============================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  type VARCHAR(128) NOT NULL,
  
  -- Dados criptografados (AES-256-GCM)
  encrypted_data TEXT NOT NULL,
  
  -- OAuth específico
  oauth_token_data JSONB,
  oauth_expires_at TIMESTAMPTZ,
  
  -- Tracking de uso
  automations_using UUID[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  last_test_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  
  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  UNIQUE (organization_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_credentials_org ON credentials(organization_id);
CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage org credentials" ON credentials;
CREATE POLICY "Users can manage org credentials"
  ON credentials FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ));


-- ============================================
-- 4. TABELA: automation_executions (atualização)
-- ============================================

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automation_executions' AND column_name = 'final_context') THEN
    ALTER TABLE automation_executions ADD COLUMN final_context JSONB;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automation_executions' AND column_name = 'wait_till') THEN
    ALTER TABLE automation_executions ADD COLUMN wait_till TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automation_executions' AND column_name = 'resume_data') THEN
    ALTER TABLE automation_executions ADD COLUMN resume_data JSONB;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automation_executions' AND column_name = 'retry_of') THEN
    ALTER TABLE automation_executions ADD COLUMN retry_of UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automation_executions' AND column_name = 'retry_count') THEN
    ALTER TABLE automation_executions ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Índice para execuções em espera
CREATE INDEX IF NOT EXISTS idx_executions_waiting ON automation_executions(wait_till) 
  WHERE status = 'waiting';


-- ============================================
-- 5. TABELA: webhooks (flow builder)
-- ============================================

CREATE TABLE IF NOT EXISTS flow_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  
  token VARCHAR(64) NOT NULL UNIQUE,
  secret VARCHAR(32) NOT NULL,
  
  custom_path VARCHAR(255),
  http_methods VARCHAR[] DEFAULT '{POST}',
  
  status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive')),
  
  received_count INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_webhooks_token ON flow_webhooks(token);
CREATE INDEX IF NOT EXISTS idx_flow_webhooks_automation ON flow_webhooks(automation_id);

ALTER TABLE flow_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage org flow webhooks" ON flow_webhooks;
CREATE POLICY "Users can manage org flow webhooks"
  ON flow_webhooks FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ));


-- ============================================
-- 6. TABELA: webhook_logs
-- ============================================

CREATE TABLE IF NOT EXISTS flow_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES flow_webhooks(id) ON DELETE CASCADE,
  
  payload JSONB,
  headers JSONB,
  query_params JSONB,
  ip_address INET,
  
  processed BOOLEAN DEFAULT false,
  execution_id UUID,
  
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_webhook_logs_webhook ON flow_webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_flow_webhook_logs_received ON flow_webhook_logs(received_at DESC);


-- ============================================
-- 7. TABELA: scheduled_executions
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  
  schedule_type VARCHAR(20) NOT NULL 
    CHECK (schedule_type IN ('cron', 'interval', 'once')),
  cron_expression VARCHAR(100),
  interval_seconds INTEGER,
  run_at TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  
  provider_schedule_id VARCHAR(100),
  
  status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'completed')),
  
  next_execution_at TIMESTAMPTZ,
  last_execution_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_executions_automation ON scheduled_executions(automation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_next ON scheduled_executions(next_execution_at) 
  WHERE status = 'active';


-- ============================================
-- 8. TABELA: automation_templates
-- ============================================

CREATE TABLE IF NOT EXISTS automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  settings JSONB,
  
  required_credentials VARCHAR[] DEFAULT '{}',
  
  icon VARCHAR(50),
  color VARCHAR(20),
  
  is_featured BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  
  usage_count INTEGER DEFAULT 0,
  
  tags VARCHAR[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_templates_category ON automation_templates(category);
CREATE INDEX IF NOT EXISTS idx_automation_templates_featured ON automation_templates(is_featured) WHERE is_featured = true;

-- Função para incrementar uso de template
CREATE OR REPLACE FUNCTION increment_template_usage(template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE automation_templates 
  SET usage_count = usage_count + 1 
  WHERE id = template_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 9. TRIGGERS E FUNCTIONS
-- ============================================

-- Função para atualizar estatísticas de automação
CREATE OR REPLACE FUNCTION update_automation_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'success' THEN
    UPDATE automations
    SET 
      success_count = success_count + 1,
      last_success_at = NOW()
    WHERE id = NEW.automation_id;
  ELSIF NEW.status = 'error' THEN
    UPDATE automations
    SET error_count = error_count + 1
    WHERE id = NEW.automation_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_execution_stats_change ON automation_executions;
CREATE TRIGGER on_execution_stats_change
  AFTER INSERT OR UPDATE ON automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_stats();


-- Função para incrementar contador de webhooks
CREATE OR REPLACE FUNCTION increment_flow_webhook_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE flow_webhooks
  SET 
    received_count = received_count + 1,
    last_received_at = NOW()
  WHERE id = NEW.webhook_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_flow_webhook_received ON flow_webhook_logs;
CREATE TRIGGER on_flow_webhook_received
  AFTER INSERT ON flow_webhook_logs
  FOR EACH ROW
  EXECUTE FUNCTION increment_flow_webhook_count();


-- ============================================
-- 10. TEMPLATES INICIAIS
-- ============================================

INSERT INTO automation_templates (name, description, category, nodes, edges, required_credentials, icon, color, is_featured, tags) VALUES

-- Template: Carrinho Abandonado
(
  'Recuperação de Carrinho Abandonado',
  'Envia sequência de mensagens para clientes que abandonaram o carrinho',
  'E-commerce',
  '[
    {
      "id": "trigger_1",
      "type": "triggerNode",
      "position": {"x": 250, "y": 50},
      "data": {
        "label": "Carrinho Abandonado",
        "category": "trigger",
        "nodeType": "trigger_abandon",
        "config": {"waitMinutes": 30}
      }
    },
    {
      "id": "delay_1",
      "type": "controlNode",
      "position": {"x": 250, "y": 200},
      "data": {
        "label": "Aguardar 1 hora",
        "category": "control",
        "nodeType": "control_delay",
        "config": {"value": 1, "unit": "hours"}
      }
    },
    {
      "id": "action_1",
      "type": "actionNode",
      "position": {"x": 250, "y": 350},
      "data": {
        "label": "Enviar WhatsApp",
        "category": "action",
        "nodeType": "action_whatsapp",
        "config": {
          "messageType": "template",
          "templateName": "carrinho_abandonado"
        }
      }
    }
  ]'::jsonb,
  '[
    {"id": "e1", "source": "trigger_1", "target": "delay_1"},
    {"id": "e2", "source": "delay_1", "target": "action_1"}
  ]'::jsonb,
  ARRAY['whatsappBusiness'],
  'ShoppingCart',
  '#f59e0b',
  true,
  ARRAY['whatsapp', 'e-commerce', 'carrinho', 'abandono']
),

-- Template: Boas-vindas
(
  'Boas-vindas ao Novo Cliente',
  'Envia mensagem de boas-vindas quando novo contato é criado',
  'CRM',
  '[
    {
      "id": "trigger_1",
      "type": "triggerNode",
      "position": {"x": 250, "y": 50},
      "data": {
        "label": "Novo Contato",
        "category": "trigger",
        "nodeType": "trigger_signup",
        "config": {}
      }
    },
    {
      "id": "action_1",
      "type": "actionNode",
      "position": {"x": 250, "y": 200},
      "data": {
        "label": "Enviar Boas-vindas",
        "category": "action",
        "nodeType": "action_whatsapp",
        "config": {
          "messageType": "text",
          "message": "Olá {{contact.firstName}}! Seja bem-vindo(a)! 🎉"
        }
      }
    }
  ]'::jsonb,
  '[
    {"id": "e1", "source": "trigger_1", "target": "action_1"}
  ]'::jsonb,
  ARRAY['whatsappBusiness'],
  'UserPlus',
  '#22c55e',
  true,
  ARRAY['whatsapp', 'boas-vindas', 'onboarding']
),

-- Template: Lead Scoring
(
  'Lead Scoring Automático',
  'Adiciona tags automaticamente baseado no valor do deal',
  'CRM',
  '[
    {
      "id": "trigger_1",
      "type": "triggerNode",
      "position": {"x": 250, "y": 50},
      "data": {
        "label": "Deal Criado",
        "category": "trigger",
        "nodeType": "trigger_deal_created",
        "config": {}
      }
    },
    {
      "id": "condition_1",
      "type": "conditionNode",
      "position": {"x": 250, "y": 200},
      "data": {
        "label": "Valor > R$ 1000?",
        "category": "condition",
        "nodeType": "condition_deal_value",
        "config": {
          "operator": "greater_than",
          "value": "1000"
        }
      }
    },
    {
      "id": "action_1",
      "type": "actionNode",
      "position": {"x": 100, "y": 350},
      "data": {
        "label": "Tag: Alto Valor",
        "category": "action",
        "nodeType": "action_tag",
        "config": {"tagName": "alto-valor"}
      }
    },
    {
      "id": "action_2",
      "type": "actionNode",
      "position": {"x": 400, "y": 350},
      "data": {
        "label": "Tag: Padrão",
        "category": "action",
        "nodeType": "action_tag",
        "config": {"tagName": "lead-padrao"}
      }
    }
  ]'::jsonb,
  '[
    {"id": "e1", "source": "trigger_1", "target": "condition_1"},
    {"id": "e2", "source": "condition_1", "sourceHandle": "true", "target": "action_1"},
    {"id": "e3", "source": "condition_1", "sourceHandle": "false", "target": "action_2"}
  ]'::jsonb,
  ARRAY[]::varchar[],
  'Target',
  '#a855f7',
  true,
  ARRAY['crm', 'lead-scoring', 'tags']
)

ON CONFLICT DO NOTHING;


-- ============================================
-- 11. GRANTS
-- ============================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- ============================================
-- SUCESSO!
-- ============================================
SELECT 'Migration Flow Builder V2 executada com sucesso!' as status;
