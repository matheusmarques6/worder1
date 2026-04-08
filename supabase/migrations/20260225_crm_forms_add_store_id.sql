-- ============================================================
-- ADICIONAR store_id NA TABELA crm_forms
-- Necessário para isolamento multi-loja
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Adicionar coluna store_id (nullable para formularios existentes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crm_forms' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE crm_forms ADD COLUMN store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Indice para filtro por store
CREATE INDEX IF NOT EXISTS idx_crm_forms_store ON crm_forms(store_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_org_store ON crm_forms(organization_id, store_id);

-- ============================================================
-- FIM
-- ============================================================
