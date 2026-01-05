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
ALTER TABLE automations 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

-- 2. Criar índices para performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_contacts_store_id ON contacts(store_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_store ON contacts(organization_id, store_id);

CREATE INDEX IF NOT EXISTS idx_deals_store_id ON deals(store_id);
CREATE INDEX IF NOT EXISTS idx_deals_org_store ON deals(organization_id, store_id);

CREATE INDEX IF NOT EXISTS idx_pipelines_store_id ON pipelines(store_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_org_store ON pipelines(organization_id, store_id);

-- 3. (OPCIONAL) Migrar dados existentes para a primeira loja
-- =============================================
-- CUIDADO: Só execute isso se quiser associar dados antigos a uma loja específica
-- 
-- UPDATE contacts 
-- SET store_id = (
--   SELECT id FROM shopify_stores 
--   WHERE organization_id = contacts.organization_id 
--   LIMIT 1
-- )
-- WHERE store_id IS NULL;
--
-- UPDATE deals 
-- SET store_id = (
--   SELECT id FROM shopify_stores 
--   WHERE organization_id = deals.organization_id 
--   LIMIT 1
-- )
-- WHERE store_id IS NULL;
--
-- UPDATE pipelines 
-- SET store_id = (
--   SELECT id FROM shopify_stores 
--   WHERE organization_id = pipelines.organization_id 
--   LIMIT 1
-- )
-- WHERE store_id IS NULL;

-- 4. Verificar se as colunas foram criadas
-- =============================================
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name IN ('contacts', 'deals', 'pipelines', 'automations')
  AND column_name = 'store_id'
ORDER BY table_name;
