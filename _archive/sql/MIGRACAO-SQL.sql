-- =============================================
-- MIGRAÇÃO: Multi-Tenant por Loja (store_id)
-- =============================================
-- Execute este SQL no Supabase SQL Editor
-- IMPORTANTE: Faça backup antes de executar!
-- =============================================

-- 1. Adicionar coluna store_id nas tabelas que ainda não têm
-- =============================================

-- Tabela contacts
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

-- Tabela deals
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

-- Tabela pipelines
ALTER TABLE pipelines 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

-- Tabela automations (se existir)
DO $$ 
BEGIN
  ALTER TABLE automations ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN
  -- Tabela não existe, ignorar
END $$;

-- 2. Criar índices para performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_contacts_store_id ON contacts(store_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_store ON contacts(organization_id, store_id);

CREATE INDEX IF NOT EXISTS idx_deals_store_id ON deals(store_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_store ON deals(organization_id, store_id);

CREATE INDEX IF NOT EXISTS idx_pipelines_store_id ON pipelines(store_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_org_store ON pipelines(organization_id, store_id);

-- 3. MIGRAR DADOS EXISTENTES PARA "OAK VINTAGE" (primeira loja)
-- =============================================

-- Primeiro, vamos ver qual é o ID da Oak Vintage
SELECT id, shop_name, shop_domain, organization_id 
FROM shopify_stores 
WHERE shop_name ILIKE '%oak%vintage%' OR shop_domain ILIKE '%oak%'
ORDER BY created_at ASC;

-- Migrar CONTATOS para a primeira loja de cada organização
UPDATE contacts 
SET store_id = (
  SELECT id FROM shopify_stores 
  WHERE organization_id = contacts.organization_id 
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE store_id IS NULL;

-- Migrar PIPELINES para a primeira loja de cada organização
UPDATE pipelines 
SET store_id = (
  SELECT id FROM shopify_stores 
  WHERE organization_id = pipelines.organization_id 
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE store_id IS NULL;

-- Migrar DEALS para a primeira loja de cada organização
UPDATE deals 
SET store_id = (
  SELECT id FROM shopify_stores 
  WHERE organization_id = deals.organization_id 
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE store_id IS NULL;

-- 4. Verificar resultado da migração
-- =============================================
SELECT 
  'contacts' as tabela, 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE store_id IS NOT NULL) as com_loja,
  COUNT(*) FILTER (WHERE store_id IS NULL) as sem_loja
FROM contacts
UNION ALL
SELECT 'pipelines', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NOT NULL), COUNT(*) FILTER (WHERE store_id IS NULL) FROM pipelines
UNION ALL
SELECT 'deals', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NOT NULL), COUNT(*) FILTER (WHERE store_id IS NULL) FROM deals;

-- 5. Verificar quais lojas receberam dados
-- =============================================
SELECT 
  s.shop_name,
  (SELECT COUNT(*) FROM contacts WHERE store_id = s.id) as contatos,
  (SELECT COUNT(*) FROM pipelines WHERE store_id = s.id) as pipelines,
  (SELECT COUNT(*) FROM deals WHERE store_id = s.id) as deals
FROM shopify_stores s
ORDER BY s.created_at;
