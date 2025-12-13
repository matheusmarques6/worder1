-- ============================================
-- KLAVIYO COMPLETE FIX - Execute no Supabase SQL Editor
-- ============================================

-- 1. Adicionar TODAS as colunas na tabela klaviyo_accounts
ALTER TABLE klaviyo_accounts 
ADD COLUMN IF NOT EXISTS public_key TEXT,
ADD COLUMN IF NOT EXISTS total_campaigns INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_flows INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_lists INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_profiles INTEGER DEFAULT 0;

-- 2. Adicionar colunas na tabela campaign_metrics
ALTER TABLE campaign_metrics 
ADD COLUMN IF NOT EXISTS recipients INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opened INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS clicked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bounced INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unsubscribed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS open_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS click_rate DECIMAL(5,2) DEFAULT 0;

-- 3. Adicionar colunas na tabela flow_metrics
ALTER TABLE flow_metrics 
ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bounced INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unsubscribed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trigger_type TEXT,
ADD COLUMN IF NOT EXISTS triggered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opened INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS clicked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS open_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS click_rate DECIMAL(5,2) DEFAULT 0;

-- 4. Criar tabela klaviyo_lists se não existir
CREATE TABLE IF NOT EXISTS klaviyo_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  klaviyo_list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_count INTEGER DEFAULT 0,
  opt_in_process TEXT DEFAULT 'single_opt_in',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, klaviyo_list_id)
);

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_org ON campaign_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_org ON flow_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_lists_org ON klaviyo_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_accounts_active ON klaviyo_accounts(is_active);

-- 6. Criar unique constraints se não existirem
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_metrics_org_campaign_unique'
  ) THEN
    ALTER TABLE campaign_metrics ADD CONSTRAINT campaign_metrics_org_campaign_unique 
    UNIQUE (organization_id, klaviyo_campaign_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'flow_metrics_org_flow_unique'
  ) THEN
    ALTER TABLE flow_metrics ADD CONSTRAINT flow_metrics_org_flow_unique 
    UNIQUE (organization_id, klaviyo_flow_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 7. Desabilitar RLS para desenvolvimento
ALTER TABLE klaviyo_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE flow_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_lists DISABLE ROW LEVEL SECURITY;

-- 8. Verificar estrutura final
SELECT 'klaviyo_accounts' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'klaviyo_accounts'
ORDER BY ordinal_position;

-- ============================================
-- PRONTO! Agora reconecte o Klaviyo em Settings.
-- ============================================
