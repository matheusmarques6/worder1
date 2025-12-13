-- ============================================
-- KLAVIYO SCHEMA UPDATE
-- ============================================
-- Execute este script no Supabase SQL Editor

-- 1. Adicionar colunas na tabela klaviyo_accounts
ALTER TABLE klaviyo_accounts 
ADD COLUMN IF NOT EXISTS total_campaigns INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_flows INTEGER DEFAULT 0;

-- 2. Adicionar colunas na tabela campaign_metrics
ALTER TABLE campaign_metrics 
ADD COLUMN IF NOT EXISTS recipients INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0;

-- 3. Adicionar colunas na tabela flow_metrics
ALTER TABLE flow_metrics 
ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bounced INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unsubscribed INTEGER DEFAULT 0;

-- 4. Criar tabela klaviyo_lists se não existir
CREATE TABLE IF NOT EXISTS klaviyo_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  klaviyo_list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_count INTEGER DEFAULT 0,
  opt_in_process TEXT DEFAULT 'single_opt_in',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_org_date 
ON campaign_metrics(organization_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_metrics_org_revenue 
ON flow_metrics(organization_id, revenue DESC);

CREATE INDEX IF NOT EXISTS idx_klaviyo_lists_org 
ON klaviyo_lists(organization_id);

CREATE INDEX IF NOT EXISTS idx_klaviyo_accounts_active 
ON klaviyo_accounts(is_active);

-- 6. Desabilitar RLS para desenvolvimento
ALTER TABLE klaviyo_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE flow_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_lists DISABLE ROW LEVEL SECURITY;

-- ============================================
-- PRONTO! Reconecte o Klaviyo em Settings.
-- ============================================
