-- =====================================================================
-- WORDER CRM - CATÁLOGO DE INTEGRAÇÕES
-- Execute este SQL DEPOIS do SQL de tabelas de integração
-- =====================================================================

-- =====================================================================
-- TABELAS DE CATÁLOGO
-- =====================================================================

-- Categorias de integrações
CREATE TABLE IF NOT EXISTS integration_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de integrações disponíveis
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  category_id UUID REFERENCES integration_categories(id),
  icon_url TEXT,
  color TEXT DEFAULT '#6366f1',
  auth_type TEXT DEFAULT 'oauth2', -- oauth2, api_key, webhook, none
  is_featured BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  is_builtin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  supported_webhooks TEXT[] DEFAULT '{}',
  documentation_url TEXT,
  setup_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integrações instaladas por organização
CREATE TABLE IF NOT EXISTS installed_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  integration_id UUID NOT NULL REFERENCES integrations(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, configuring, active, paused, error, disconnected
  configuration JSONB DEFAULT '{}',
  credentials JSONB DEFAULT '{}', -- Encrypted credentials
  default_pipeline_id UUID,
  default_stage_id UUID,
  auto_tags TEXT[] DEFAULT '{}',
  field_mapping JSONB DEFAULT '{}',
  webhook_url TEXT,
  webhook_secret TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  error_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_installed_org ON installed_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_installed_status ON installed_integrations(status);

-- =====================================================================
-- POPULAR CATEGORIAS
-- =====================================================================

INSERT INTO integration_categories (slug, name, description, icon, sort_order) VALUES
  ('ecommerce', 'E-commerce', 'Plataformas de e-commerce e lojas online', 'ShoppingCart', 1),
  ('communication', 'Comunicação', 'WhatsApp, SMS e canais de mensagem', 'MessageSquare', 2),
  ('forms', 'Formulários', 'Capture leads de formulários', 'FileText', 3),
  ('spreadsheets', 'Planilhas', 'Sincronize dados com planilhas', 'Table', 4),
  ('marketing', 'Marketing', 'Ferramentas de email marketing', 'Mail', 5),
  ('payments', 'Pagamentos', 'Gateways de pagamento', 'CreditCard', 6),
  ('productivity', 'Produtividade', 'Calendários e agendamentos', 'Calendar', 7),
  ('others', 'Outros', 'Outras integrações', 'Puzzle', 8)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- =====================================================================
-- POPULAR INTEGRAÇÕES
-- =====================================================================

-- Obter IDs das categorias
DO $$
DECLARE
  cat_ecommerce UUID;
  cat_communication UUID;
  cat_forms UUID;
  cat_spreadsheets UUID;
  cat_marketing UUID;
  cat_payments UUID;
  cat_productivity UUID;
  cat_others UUID;
BEGIN
  SELECT id INTO cat_ecommerce FROM integration_categories WHERE slug = 'ecommerce';
  SELECT id INTO cat_communication FROM integration_categories WHERE slug = 'communication';
  SELECT id INTO cat_forms FROM integration_categories WHERE slug = 'forms';
  SELECT id INTO cat_spreadsheets FROM integration_categories WHERE slug = 'spreadsheets';
  SELECT id INTO cat_marketing FROM integration_categories WHERE slug = 'marketing';
  SELECT id INTO cat_payments FROM integration_categories WHERE slug = 'payments';
  SELECT id INTO cat_productivity FROM integration_categories WHERE slug = 'productivity';
  SELECT id INTO cat_others FROM integration_categories WHERE slug = 'others';

  -- =====================
  -- E-COMMERCE
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, is_builtin, supported_webhooks)
  VALUES (
    'shopify',
    'Shopify',
    'Capture clientes, pedidos e carrinhos abandonados',
    'Integre sua loja Shopify para capturar automaticamente clientes, pedidos e carrinhos abandonados como leads no CRM.',
    cat_ecommerce,
    '/integrations/shopify.svg',
    '#95BF47',
    'oauth2',
    true,
    true,
    ARRAY['customers/create', 'customers/update', 'orders/create', 'orders/updated', 'checkouts/create']
  ) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    short_description = EXCLUDED.short_description,
    is_featured = EXCLUDED.is_featured;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'hotmart',
    'Hotmart',
    'Capture compradores de infoprodutos',
    'Receba automaticamente os compradores dos seus produtos digitais na Hotmart.',
    cat_ecommerce,
    '/integrations/hotmart.svg',
    '#F04E23',
    'webhook',
    false,
    ARRAY['purchase_complete', 'purchase_refund', 'subscription_cancellation']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  -- =====================
  -- COMUNICAÇÃO
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, is_builtin, supported_webhooks)
  VALUES (
    'whatsapp',
    'WhatsApp Business',
    'Capture contatos do WhatsApp',
    'Conecte o WhatsApp Business API oficial ou via Evolution API para capturar e gerenciar conversas.',
    cat_communication,
    '/integrations/whatsapp.svg',
    '#25D366',
    'api_key',
    true,
    true,
    ARRAY['messages', 'message_status']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description,
    is_featured = EXCLUDED.is_featured;

  -- =====================
  -- FORMULÁRIOS
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'google-forms',
    'Google Forms',
    'Capture respostas de formulários automaticamente',
    'Sincronize respostas do Google Forms diretamente para o CRM como novos contatos.',
    cat_forms,
    '/integrations/google-forms.svg',
    '#7248B9',
    'oauth2',
    true,
    ARRAY['form_response']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description,
    is_featured = EXCLUDED.is_featured;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'typeform',
    'Typeform',
    'Capture respostas de formulários',
    'Receba automaticamente as respostas dos seus formulários Typeform.',
    cat_forms,
    '/integrations/typeform.svg',
    '#262627',
    'webhook',
    true,
    ARRAY['form_response']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, is_builtin, supported_webhooks)
  VALUES (
    'webform',
    'Formulário Web',
    'Adicione formulários ao seu site',
    'Crie formulários personalizados e incorpore em qualquer site para capturar leads.',
    cat_forms,
    '/integrations/webform.svg',
    '#6366F1',
    'none',
    false,
    true,
    ARRAY['form_submission']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  -- =====================
  -- PLANILHAS
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'google-sheets',
    'Google Sheets',
    'Sincronize leads de planilhas',
    'Importe e exporte contatos de/para Google Sheets automaticamente.',
    cat_spreadsheets,
    '/integrations/google-sheets.svg',
    '#0F9D58',
    'oauth2',
    true,
    ARRAY[]::TEXT[]
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description,
    is_featured = EXCLUDED.is_featured;

  -- =====================
  -- MARKETING
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'mailchimp',
    'Mailchimp',
    'Sincronize contatos de email marketing',
    'Mantenha seus contatos sincronizados com o Mailchimp para campanhas de email.',
    cat_marketing,
    '/integrations/mailchimp.svg',
    '#FFE01B',
    'oauth2',
    false,
    ARRAY['subscribe', 'unsubscribe']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'rdstation',
    'RD Station',
    'Sincronize leads de marketing',
    'Integre com RD Station Marketing para sincronizar leads automaticamente.',
    cat_marketing,
    '/integrations/rdstation.svg',
    '#00A6FB',
    'oauth2',
    false,
    ARRAY['conversion', 'opportunity']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'facebook-leads',
    'Facebook Lead Ads',
    'Capture leads de anúncios do Facebook',
    'Receba automaticamente leads dos seus anúncios de Facebook e Instagram.',
    cat_marketing,
    '/integrations/facebook.svg',
    '#1877F2',
    'oauth2',
    true,
    ARRAY['leadgen']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  -- =====================
  -- PAGAMENTOS
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'stripe',
    'Stripe',
    'Capture clientes de pagamentos',
    'Sincronize clientes e pagamentos do Stripe automaticamente.',
    cat_payments,
    '/integrations/stripe.svg',
    '#635BFF',
    'api_key',
    false,
    ARRAY['customer.created', 'payment_intent.succeeded', 'invoice.paid']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'mercadopago',
    'Mercado Pago',
    'Capture clientes de pagamentos',
    'Receba automaticamente os clientes que pagaram via Mercado Pago.',
    cat_payments,
    '/integrations/mercadopago.svg',
    '#00B1EA',
    'api_key',
    false,
    ARRAY['payment', 'merchant_order']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  -- =====================
  -- PRODUTIVIDADE
  -- =====================
  
  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'calendly',
    'Calendly',
    'Capture agendamentos como leads',
    'Transforme agendamentos do Calendly em leads automaticamente.',
    cat_productivity,
    '/integrations/calendly.svg',
    '#006BFF',
    'webhook',
    true,
    ARRAY['invitee.created', 'invitee.canceled']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

  INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_featured, supported_webhooks)
  VALUES (
    'hubspot',
    'HubSpot',
    'Sincronize contatos bidirecionalmente',
    'Mantenha seus contatos sincronizados com o HubSpot CRM.',
    cat_others,
    '/integrations/hubspot.svg',
    '#FF7A59',
    'oauth2',
    false,
    ARRAY['contact.creation', 'contact.propertyChange', 'deal.creation']
  ) ON CONFLICT (slug) DO UPDATE SET
    short_description = EXCLUDED.short_description;

END $$;

-- =====================================================================
-- TRIGGER PARA UPDATED_AT
-- =====================================================================

CREATE OR REPLACE FUNCTION update_installed_integrations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_installed_integrations ON installed_integrations;
CREATE TRIGGER trg_installed_integrations
  BEFORE UPDATE ON installed_integrations
  FOR EACH ROW EXECUTE FUNCTION update_installed_integrations_timestamp();

-- =====================================================================
-- VERIFICAR
-- =====================================================================

SELECT 
  i.name,
  c.name as category,
  i.is_featured,
  i.is_builtin
FROM integrations i
LEFT JOIN integration_categories c ON i.category_id = c.id
ORDER BY c.sort_order, i.name;
