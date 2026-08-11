-- ============================================
-- FLOW WEBHOOKS - Tabelas para triggers de webhook externos
-- Execute no SQL Editor do Supabase
-- ============================================

-- Tabela principal de webhooks
CREATE TABLE IF NOT EXISTS flow_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  node_id TEXT,
  
  -- Identificação
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  secret TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  
  -- Stats
  received_count INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_flow_webhooks_org ON flow_webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_flow_webhooks_automation ON flow_webhooks(automation_id);
CREATE INDEX IF NOT EXISTS idx_flow_webhooks_token ON flow_webhooks(token);

-- Tabela de logs de webhooks recebidos
CREATE TABLE IF NOT EXISTS flow_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES flow_webhooks(id) ON DELETE CASCADE,
  
  -- Dados recebidos
  payload JSONB,
  headers JSONB,
  query_params JSONB,
  ip_address TEXT,
  
  -- Status
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  
  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_flow_webhook_logs_webhook ON flow_webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_flow_webhook_logs_received ON flow_webhook_logs(received_at DESC);

-- Trigger para atualizar contador e last_received_at
CREATE OR REPLACE FUNCTION update_webhook_stats()
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

DROP TRIGGER IF EXISTS trigger_update_webhook_stats ON flow_webhook_logs;
CREATE TRIGGER trigger_update_webhook_stats
  AFTER INSERT ON flow_webhook_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_stats();

-- RLS Policies
ALTER TABLE flow_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policy para flow_webhooks
CREATE POLICY "flow_webhooks_org_access" ON flow_webhooks
  FOR ALL USING (
    organization_id = get_user_organization_id()
  );

-- Policy para flow_webhook_logs (via webhook)
CREATE POLICY "flow_webhook_logs_org_access" ON flow_webhook_logs
  FOR ALL USING (
    webhook_id IN (
      SELECT id FROM flow_webhooks 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- CREDENTIALS TABLE (se não existir)
-- ============================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Identificação
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  
  -- Dados criptografados
  encrypted_data TEXT NOT NULL,
  
  -- Status de teste
  last_test_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  
  -- Quais automações usam esta credencial
  automations_using UUID[] DEFAULT '{}',
  
  -- Metadata
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_credentials_org ON credentials(organization_id);
CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);

-- RLS
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credentials_org_access" ON credentials
  FOR ALL USING (
    organization_id = get_user_organization_id()
  );

-- ============================================
-- VERIFICAÇÃO
-- ============================================

SELECT 
  tablename,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) as policies
FROM (
  VALUES 
    ('flow_webhooks'),
    ('flow_webhook_logs'),
    ('credentials')
) AS t(tablename)
ORDER BY tablename;
