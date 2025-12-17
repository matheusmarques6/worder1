-- ============================================
-- WORDER - SQL DE CORREÇÃO
-- Execute este SQL se teve erros no schema anterior
-- ============================================

-- 1. Adicionar colunas faltantes na tabela automations (se existir)
DO $$ 
BEGIN
    -- Adicionar is_active se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'is_active') THEN
        ALTER TABLE automations ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;

    -- Adicionar trigger_type se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'trigger_type') THEN
        ALTER TABLE automations ADD COLUMN trigger_type TEXT DEFAULT 'lead_created';
    END IF;

    -- Adicionar trigger_config se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'trigger_config') THEN
        ALTER TABLE automations ADD COLUMN trigger_config JSONB DEFAULT '{}';
    END IF;

    -- Adicionar conditions se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'conditions') THEN
        ALTER TABLE automations ADD COLUMN conditions JSONB DEFAULT '{"match": "all", "rules": []}';
    END IF;

    -- Adicionar actions se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'actions') THEN
        ALTER TABLE automations ADD COLUMN actions JSONB DEFAULT '[]';
    END IF;

    -- Adicionar execution_count se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'execution_count') THEN
        ALTER TABLE automations ADD COLUMN execution_count INTEGER DEFAULT 0;
    END IF;

    -- Adicionar last_executed_at se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'last_executed_at') THEN
        ALTER TABLE automations ADD COLUMN last_executed_at TIMESTAMPTZ;
    END IF;

    -- Adicionar source_integration_id se não existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'automations' AND column_name = 'source_integration_id') THEN
        ALTER TABLE automations ADD COLUMN source_integration_id UUID;
    END IF;
END $$;

-- ============================================
-- 2. CATEGORIAS DE INTEGRAÇÕES
-- ============================================
CREATE TABLE IF NOT EXISTS integration_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir categorias padrão
INSERT INTO integration_categories (name, slug, description, icon, sort_order) VALUES
  ('E-commerce', 'ecommerce', 'Plataformas de loja virtual', 'ShoppingCart', 1),
  ('Comunicação', 'communication', 'WhatsApp, SMS, Chat', 'MessageSquare', 2),
  ('Formulários', 'forms', 'Captura de leads via formulários', 'FileText', 3),
  ('Planilhas', 'spreadsheets', 'Google Sheets, Excel', 'Table', 4),
  ('Marketing', 'marketing', 'Email marketing, Ads', 'Mail', 5),
  ('Pagamentos', 'payments', 'Gateways de pagamento', 'CreditCard', 6),
  ('Produtividade', 'productivity', 'Calendário, Tarefas', 'Calendar', 7),
  ('Outros', 'others', 'Outras integrações', 'Puzzle', 99)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 3. CATÁLOGO DE INTEGRAÇÕES (MARKETPLACE)
-- ============================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  category_id UUID REFERENCES integration_categories(id),
  icon_url TEXT,
  color TEXT DEFAULT '#6366f1',
  auth_type TEXT DEFAULT 'oauth2' CHECK (auth_type IN ('oauth2', 'api_key', 'webhook', 'none')),
  oauth_authorization_url TEXT,
  oauth_token_url TEXT,
  required_scopes TEXT[] DEFAULT '{}',
  config_schema JSONB DEFAULT '{"type": "object", "properties": {}}',
  documentation_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_builtin BOOLEAN DEFAULT false,
  latest_version TEXT DEFAULT '1.0.0',
  supported_webhooks TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir integrações padrão
INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_builtin, is_featured, supported_webhooks) VALUES
  (
    'shopify',
    'Shopify',
    'Capture clientes, pedidos e carrinhos abandonados',
    'Integração completa com Shopify para capturar automaticamente novos clientes, pedidos realizados, carrinhos abandonados e opt-ins de newsletter.',
    (SELECT id FROM integration_categories WHERE slug = 'ecommerce'),
    '/integrations/shopify.svg',
    '#96bf48',
    'oauth2',
    true,
    true,
    ARRAY['customers/create', 'orders/create', 'checkouts/create', 'customers_marketing_consent/update']
  ),
  (
    'google-forms',
    'Google Forms',
    'Capture respostas de formulários automaticamente',
    'Conecte seus formulários do Google Forms e capture automaticamente todas as respostas como leads no seu CRM.',
    (SELECT id FROM integration_categories WHERE slug = 'forms'),
    '/integrations/google-forms.svg',
    '#673ab7',
    'oauth2',
    false,
    true,
    ARRAY['response/create']
  ),
  (
    'google-sheets',
    'Google Sheets',
    'Sincronize leads de planilhas',
    'Monitore planilhas do Google Sheets e importe automaticamente novas linhas como leads.',
    (SELECT id FROM integration_categories WHERE slug = 'spreadsheets'),
    '/integrations/google-sheets.svg',
    '#0f9d58',
    'oauth2',
    false,
    true,
    ARRAY['row/create']
  ),
  (
    'whatsapp',
    'WhatsApp Business',
    'Capture contatos do WhatsApp',
    'Receba automaticamente novos contatos que enviam mensagens para seu WhatsApp Business como leads.',
    (SELECT id FROM integration_categories WHERE slug = 'communication'),
    '/integrations/whatsapp.svg',
    '#25d366',
    'api_key',
    false,
    true,
    ARRAY['messages/receive', 'contacts/create']
  ),
  (
    'web-form',
    'Formulário Web',
    'Adicione formulários ao seu site',
    'Gere um widget de formulário para incorporar no seu site e capture leads diretamente.',
    (SELECT id FROM integration_categories WHERE slug = 'forms'),
    '/integrations/web-form.svg',
    '#f97316',
    'none',
    false,
    false,
    ARRAY['submission/create']
  ),
  (
    'calendly',
    'Calendly',
    'Capture agendamentos como leads',
    'Transforme agendamentos do Calendly em leads automaticamente.',
    (SELECT id FROM integration_categories WHERE slug = 'productivity'),
    '/integrations/calendly.svg',
    '#006bff',
    'oauth2',
    false,
    false,
    ARRAY['invitee/created']
  ),
  (
    'typeform',
    'Typeform',
    'Capture respostas de formulários',
    'Conecte seus formulários do Typeform e importe respostas como leads.',
    (SELECT id FROM integration_categories WHERE slug = 'forms'),
    '/integrations/typeform.svg',
    '#262627',
    'oauth2',
    false,
    false,
    ARRAY['form_response']
  ),
  (
    'mailchimp',
    'Mailchimp',
    'Sincronize contatos de email marketing',
    'Importe e sincronize contatos do Mailchimp como leads.',
    (SELECT id FROM integration_categories WHERE slug = 'marketing'),
    '/integrations/mailchimp.svg',
    '#ffe01b',
    'oauth2',
    false,
    false,
    ARRAY['subscribe', 'unsubscribe']
  ),
  (
    'stripe',
    'Stripe',
    'Capture clientes de pagamentos',
    'Transforme clientes que pagam via Stripe em leads automaticamente.',
    (SELECT id FROM integration_categories WHERE slug = 'payments'),
    '/integrations/stripe.svg',
    '#635bff',
    'api_key',
    false,
    false,
    ARRAY['customer.created', 'charge.succeeded']
  ),
  (
    'mercado-pago',
    'Mercado Pago',
    'Capture clientes de pagamentos',
    'Importe clientes que pagam via Mercado Pago como leads.',
    (SELECT id FROM integration_categories WHERE slug = 'payments'),
    '/integrations/mercado-pago.svg',
    '#009ee3',
    'oauth2',
    false,
    false,
    ARRAY['payment.created']
  ),
  (
    'hotmart',
    'Hotmart',
    'Capture compradores de infoprodutos',
    'Importe automaticamente compradores da Hotmart como leads.',
    (SELECT id FROM integration_categories WHERE slug = 'ecommerce'),
    '/integrations/hotmart.svg',
    '#f04e23',
    'api_key',
    false,
    false,
    ARRAY['purchase.approved', 'purchase.canceled']
  ),
  (
    'rd-station',
    'RD Station',
    'Sincronize leads de marketing',
    'Importe e sincronize leads do RD Station Marketing.',
    (SELECT id FROM integration_categories WHERE slug = 'marketing'),
    '/integrations/rd-station.svg',
    '#00a9e0',
    'oauth2',
    false,
    false,
    ARRAY['conversion']
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  description = EXCLUDED.description,
  supported_webhooks = EXCLUDED.supported_webhooks,
  is_featured = EXCLUDED.is_featured,
  is_builtin = EXCLUDED.is_builtin;

-- ============================================
-- 4. INTEGRAÇÕES INSTALADAS POR ORGANIZAÇÃO
-- ============================================
CREATE TABLE IF NOT EXISTS installed_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'configuring', 'active', 'paused', 'error', 'disconnected'
  )),
  configuration JSONB DEFAULT '{}',
  field_mapping JSONB DEFAULT '{}',
  default_pipeline_id UUID REFERENCES pipelines(id),
  default_stage_id UUID REFERENCES pipeline_stages(id),
  auto_tags TEXT[] DEFAULT '{}',
  webhook_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  credentials_encrypted JSONB DEFAULT '{}',
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  sync_interval_minutes INTEGER DEFAULT 60,
  error_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_at TIMESTAMPTZ,
  installed_by UUID,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, integration_id)
);

-- ============================================
-- 5. REGRAS DE ROTEAMENTO DE LEADS
-- ============================================
CREATE TABLE IF NOT EXISTS lead_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 100,
  source_integration_id UUID REFERENCES integrations(id),
  conditions JSONB NOT NULL DEFAULT '{"match": "all", "rules": []}',
  pipeline_id UUID REFERENCES pipelines(id),
  stage_id UUID REFERENCES pipeline_stages(id),
  assigned_to UUID,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. LOGS DE EXECUÇÃO DE AUTOMAÇÕES
-- ============================================
CREATE TABLE IF NOT EXISTS automation_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_entity_type TEXT,
  trigger_entity_id UUID,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'skipped'
  )),
  conditions_matched BOOLEAN,
  actions_executed JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  error_stack TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. LOGS DE SYNC DE INTEGRAÇÕES
-- ============================================
CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installed_integration_id UUID NOT NULL REFERENCES installed_integrations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN (
    'full', 'incremental', 'webhook', 'manual'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'started', 'in_progress', 'completed', 'failed'
  )),
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  details JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. WEBHOOK EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_token TEXT NOT NULL,
  installed_integration_id UUID REFERENCES installed_integrations(id) ON DELETE CASCADE,
  event_type TEXT,
  payload JSONB NOT NULL,
  headers JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'skipped'
  )),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  lead_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_installed_integrations_org 
  ON installed_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_installed_integrations_status 
  ON installed_integrations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_installed_integrations_webhook 
  ON installed_integrations(webhook_token);
CREATE INDEX IF NOT EXISTS idx_lead_routing_rules_org 
  ON lead_routing_rules(organization_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_automation_logs_automation 
  ON automation_execution_logs(automation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_integration 
  ON integration_sync_logs(installed_integration_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending 
  ON webhook_events(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_events_token 
  ON webhook_events(webhook_token);

-- ============================================
-- 10. RLS
-- ============================================
ALTER TABLE integration_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Categories are viewable by all" ON integration_categories;
CREATE POLICY "Categories are viewable by all" 
  ON integration_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Integrations are viewable by all" ON integrations;
CREATE POLICY "Integrations are viewable by all" 
  ON integrations FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Org access for installed_integrations" ON installed_integrations;
CREATE POLICY "Org access for installed_integrations" 
  ON installed_integrations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Org access for lead_routing_rules" ON lead_routing_rules;
CREATE POLICY "Org access for lead_routing_rules" 
  ON lead_routing_rules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Org access for automation_execution_logs" ON automation_execution_logs;
CREATE POLICY "Org access for automation_execution_logs" 
  ON automation_execution_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Org access for integration_sync_logs" ON integration_sync_logs;
CREATE POLICY "Org access for integration_sync_logs" 
  ON integration_sync_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Webhook events access" ON webhook_events;
CREATE POLICY "Webhook events access" 
  ON webhook_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- PRONTO!
-- ============================================
SELECT 'Schema de integrações criado/atualizado com sucesso!' as resultado;
