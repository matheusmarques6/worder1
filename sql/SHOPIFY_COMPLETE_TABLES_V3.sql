-- =============================================
-- Migration: Shopify Complete Tables (V3 - FIX)
-- Data: 2026-01-13
-- 
-- Corrige tabelas que já existem parcialmente
-- =============================================

-- =============================================
-- 1. CORRIGIR SHOPIFY_CHECKOUTS (adicionar colunas faltantes)
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_checkouts') THEN
    -- Adicionar colunas que podem estar faltando
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS notification_count INTEGER DEFAULT 0;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS contact_id UUID;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS shopify_checkout_token TEXT;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
    RAISE NOTICE '✅ shopify_checkouts - colunas verificadas/adicionadas';
  ELSE
    -- Criar tabela completa
    CREATE TABLE shopify_checkouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      shopify_checkout_id TEXT NOT NULL,
      shopify_checkout_token TEXT,
      email TEXT,
      phone TEXT,
      customer_shopify_id TEXT,
      contact_id UUID,
      total_price DECIMAL(12,2) DEFAULT 0,
      subtotal_price DECIMAL(12,2) DEFAULT 0,
      total_tax DECIMAL(12,2) DEFAULT 0,
      total_discounts DECIMAL(12,2) DEFAULT 0,
      currency TEXT DEFAULT 'BRL',
      line_items JSONB DEFAULT '[]'::jsonb,
      recovery_url TEXT,
      status TEXT DEFAULT 'pending',
      shopify_created_at TIMESTAMPTZ,
      abandoned_at TIMESTAMPTZ,
      recovered_at TIMESTAMPTZ,
      converted_at TIMESTAMPTZ,
      notification_count INTEGER DEFAULT 0,
      last_notification_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(store_id, shopify_checkout_id)
    );
    RAISE NOTICE '✅ shopify_checkouts - tabela criada';
  END IF;
END$$;

-- =============================================
-- 2. SHOPIFY INVENTORY
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID,
  shopify_inventory_item_id TEXT NOT NULL,
  shopify_variant_id TEXT,
  shopify_location_id TEXT NOT NULL,
  location_name TEXT,
  sku TEXT,
  available INTEGER DEFAULT 0,
  cost DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, shopify_inventory_item_id, shopify_location_id)
);

-- =============================================
-- 3. SHOPIFY TRANSACTIONS
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id UUID,
  shopify_transaction_id TEXT NOT NULL,
  shopify_order_id TEXT,
  kind TEXT NOT NULL,
  gateway TEXT,
  status TEXT,
  amount DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  error_code TEXT,
  message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, shopify_transaction_id)
);

-- =============================================
-- 4. SHOPIFY DISCOUNT CODES
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shopify_price_rule_id TEXT,
  shopify_discount_id TEXT,
  code TEXT NOT NULL,
  value_type TEXT,
  value DECIMAL(12,2),
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  once_per_customer BOOLEAN DEFAULT FALSE,
  minimum_requirement_type TEXT,
  minimum_requirement_value DECIMAL(12,2),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, code)
);

-- =============================================
-- 5. SHOPIFY LOCATIONS
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shopify_location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  province TEXT,
  country TEXT,
  zip TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT FALSE,
  legacy BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, shopify_location_id)
);

-- =============================================
-- 6. SHOPIFY SYNC LOGS
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  entity_type TEXT,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================
-- 7. SHOPIFY RFM SCORES
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_rfm_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID,
  shopify_customer_id TEXT,
  customer_email TEXT,
  recency_score INTEGER CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score INTEGER CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score INTEGER CHECK (monetary_score BETWEEN 1 AND 5),
  days_since_last_order INTEGER,
  total_orders INTEGER,
  total_spent DECIMAL(12,2),
  average_order_value DECIMAL(12,2),
  segment TEXT,
  segment_label TEXT,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, shopify_customer_id)
);

-- =============================================
-- 8. SHOPIFY COHORT ANALYSIS
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_cohort_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cohort_month DATE NOT NULL,
  months_since_first INTEGER NOT NULL,
  customers_count INTEGER DEFAULT 0,
  active_customers INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  retention_rate DECIMAL(5,2),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, cohort_month, months_since_first)
);

-- =============================================
-- 9. ÍNDICES
-- =============================================

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_org ON shopify_checkouts(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_inventory_org ON shopify_inventory(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_transactions_org ON shopify_transactions(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_discounts_org ON shopify_discount_codes(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_locations_org ON shopify_locations(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_org ON shopify_sync_logs(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_rfm_org ON shopify_rfm_scores(organization_id);
  CREATE INDEX IF NOT EXISTS idx_shopify_cohort_org ON shopify_cohort_analysis(organization_id);
  RAISE NOTICE '✅ Índices criados';
END$$;

-- =============================================
-- 10. TRIGGERS DE VALIDAÇÃO
-- =============================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'shopify_checkouts',
    'shopify_inventory', 
    'shopify_transactions',
    'shopify_discount_codes',
    'shopify_locations',
    'shopify_sync_logs',
    'shopify_rfm_scores',
    'shopify_cohort_analysis'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_org ON %I', v_table, v_table);
      EXECUTE format('CREATE TRIGGER trg_%s_org
        BEFORE INSERT OR UPDATE OF store_id, organization_id ON %I
        FOR EACH ROW EXECUTE FUNCTION public.shopify_enforce_org_from_store()', v_table, v_table);
    END IF;
  END LOOP;
  RAISE NOTICE '✅ Triggers de validação criados';
END$$;

-- =============================================
-- 11. RLS + FORCE
-- =============================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'shopify_checkouts',
    'shopify_inventory', 
    'shopify_transactions',
    'shopify_discount_codes',
    'shopify_locations',
    'shopify_sync_logs',
    'shopify_rfm_scores',
    'shopify_cohort_analysis'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_table);
      
      EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', v_table, v_table);
      EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', v_table, v_table);
      EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', v_table, v_table);
      EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', v_table, v_table);
      
      EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (organization_id = public.get_user_org_id())', v_table, v_table);
      EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (organization_id = public.get_user_org_id())', v_table, v_table);
      EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE USING (organization_id = public.get_user_org_id()) WITH CHECK (organization_id = public.get_user_org_id())', v_table, v_table);
      EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (organization_id = public.get_user_org_id())', v_table, v_table);
    END IF;
  END LOOP;
  RAISE NOTICE '✅ RLS aplicado';
END$$;

-- =============================================
-- 12. TRIGGERS updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_tables TEXT[] := ARRAY['shopify_checkouts', 'shopify_inventory', 'shopify_discount_codes', 'shopify_locations'];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', v_table, v_table);
      EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', v_table, v_table);
    END IF;
  END LOOP;
  RAISE NOTICE '✅ Triggers updated_at criados';
END$$;

-- =============================================
-- 13. VIEWS
-- =============================================

DROP VIEW IF EXISTS shopify_rfm_summary;
CREATE VIEW shopify_rfm_summary AS
SELECT 
  store_id,
  organization_id,
  segment,
  segment_label,
  COUNT(*) as customer_count,
  ROUND(AVG(total_spent)::numeric, 2) as avg_spent,
  ROUND(AVG(total_orders)::numeric, 1) as avg_orders,
  ROUND(AVG(days_since_last_order)::numeric, 0) as avg_recency
FROM shopify_rfm_scores
GROUP BY store_id, organization_id, segment, segment_label;

DROP VIEW IF EXISTS shopify_abandoned_pending;
CREATE VIEW shopify_abandoned_pending AS
SELECT 
  id,
  store_id,
  organization_id,
  shopify_checkout_id,
  email,
  phone,
  total_price,
  status,
  abandoned_at,
  notification_count,
  EXTRACT(HOUR FROM NOW() - abandoned_at)::INTEGER as hours_abandoned
FROM shopify_checkouts
WHERE status = 'abandoned'
  AND notification_count < 3
  AND abandoned_at > NOW() - INTERVAL '7 days';

-- =============================================
-- 14. FUNÇÕES AUXILIARES
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_sync_logs(p_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM shopify_sync_logs WHERE started_at < NOW() - (p_days || ' days')::INTERVAL AND status IN ('completed', 'failed');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_checkouts_abandoned(p_hours INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE v_updated INTEGER;
BEGIN
  UPDATE shopify_checkouts
  SET status = 'abandoned', abandoned_at = shopify_created_at + (p_hours || ' hours')::INTERVAL
  WHERE status = 'pending' AND shopify_created_at < NOW() - (p_hours || ' hours')::INTERVAL AND abandoned_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- VERIFICAÇÃO FINAL
-- =============================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY['shopify_checkouts','shopify_inventory','shopify_transactions','shopify_discount_codes','shopify_locations','shopify_sync_logs','shopify_rfm_scores','shopify_cohort_analysis'];
  v_table TEXT;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '                    VERIFICAÇÃO FINAL                           ';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
      RAISE NOTICE '✅ %', v_table;
      v_count := v_count + 1;
    ELSE
      RAISE NOTICE '❌ % NÃO criada', v_table;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '📊 % de 8 tabelas OK', v_count;
  RAISE NOTICE '';
  RAISE NOTICE '✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!';
  RAISE NOTICE '';
END$$;
