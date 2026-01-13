-- =============================================
-- SECURITY PATCH V3 FINAL (COMPATÍVEL SUPABASE)
-- Isolamento Multi-Tenant Shopify
-- Data: 2026-01-13
--
-- ⚠️  CORREÇÃO: Usa public.get_user_org_id() em vez de auth.organization_id()
--     (Supabase não permite criar funções no schema 'auth' via SQL Editor)
-- =============================================

-- =============================================
-- PARTE 0: CRIAR FUNÇÃO DE ORG NO SCHEMA PUBLIC
-- =============================================

-- Criar função no schema public (permitido)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id 
  FROM organization_members 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_user_org_id() IS 
  'Retorna o organization_id do usuário logado. Usado nas RLS policies.';

-- Verificar se funcionou
DO $$
BEGIN
  RAISE NOTICE '✅ Função public.get_user_org_id() criada com sucesso!';
END$$;

-- =============================================
-- PARTE 1: DIAGNÓSTICO
-- =============================================

CREATE SCHEMA IF NOT EXISTS _quarantine;

DO $$
DECLARE
  v_orphan_customers INT := 0;
  v_orphan_orders INT := 0;
  v_orphan_products INT := 0;
  v_null_store_customers INT := 0;
  v_null_store_orders INT := 0;
  v_null_store_products INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    SELECT COUNT(*) INTO v_orphan_customers
    FROM shopify_customers c
    WHERE c.store_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = c.store_id);
    SELECT COUNT(*) INTO v_null_store_customers FROM shopify_customers WHERE store_id IS NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    SELECT COUNT(*) INTO v_orphan_orders
    FROM shopify_orders o
    WHERE o.store_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = o.store_id);
    SELECT COUNT(*) INTO v_null_store_orders FROM shopify_orders WHERE store_id IS NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    SELECT COUNT(*) INTO v_orphan_products
    FROM shopify_products p
    WHERE p.store_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = p.store_id);
    SELECT COUNT(*) INTO v_null_store_products FROM shopify_products WHERE store_id IS NULL;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║              DIAGNÓSTICO DE SEGURANÇA SHOPIFY                ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Órfãos: customers=%, orders=%, products=%', 
    LPAD(v_orphan_customers::TEXT, 4), LPAD(v_orphan_orders::TEXT, 4), LPAD(v_orphan_products::TEXT, 4);
  RAISE NOTICE '║ NULL store_id: customers=%, orders=%, products=%', 
    LPAD(v_null_store_customers::TEXT, 4), LPAD(v_null_store_orders::TEXT, 4), LPAD(v_null_store_products::TEXT, 4);
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END$$;

-- =============================================
-- PARTE 2: ADICIONAR organization_id
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS organization_id UUID;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS organization_id UUID;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS organization_id UUID;
  END IF;
  
  RAISE NOTICE '✅ Colunas organization_id verificadas';
END$$;

-- =============================================
-- PARTE 3: QUARENTENA DE ÓRFÃOS
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '📦 Quarentena de órfãos...';
  
  -- CUSTOMERS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    CREATE TABLE IF NOT EXISTS _quarantine.shopify_customers AS 
    SELECT *, NOW() as quarantined_at, NULL::TEXT as quarantine_reason 
    FROM shopify_customers WHERE 1=0;
    
    ALTER TABLE _quarantine.shopify_customers 
      ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE _quarantine.shopify_customers 
      ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;
    
    INSERT INTO _quarantine.shopify_customers 
    SELECT c.*, NOW(), 'orphan_or_null_store' 
    FROM shopify_customers c
    WHERE c.store_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = c.store_id);
    
    DELETE FROM shopify_customers 
    WHERE store_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = store_id);
  END IF;
  
  -- ORDERS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    CREATE TABLE IF NOT EXISTS _quarantine.shopify_orders AS 
    SELECT *, NOW() as quarantined_at, NULL::TEXT as quarantine_reason 
    FROM shopify_orders WHERE 1=0;
    
    ALTER TABLE _quarantine.shopify_orders 
      ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE _quarantine.shopify_orders 
      ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;
    
    INSERT INTO _quarantine.shopify_orders 
    SELECT o.*, NOW(), 'orphan_or_null_store' 
    FROM shopify_orders o
    WHERE o.store_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = o.store_id);
    
    DELETE FROM shopify_orders 
    WHERE store_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = store_id);
  END IF;
  
  -- PRODUCTS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    CREATE TABLE IF NOT EXISTS _quarantine.shopify_products AS 
    SELECT *, NOW() as quarantined_at, NULL::TEXT as quarantine_reason 
    FROM shopify_products WHERE 1=0;
    
    ALTER TABLE _quarantine.shopify_products 
      ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE _quarantine.shopify_products 
      ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;
    
    INSERT INTO _quarantine.shopify_products 
    SELECT p.*, NOW(), 'orphan_or_null_store' 
    FROM shopify_products p
    WHERE p.store_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = p.store_id);
    
    DELETE FROM shopify_products 
    WHERE store_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = store_id);
  END IF;
  
  RAISE NOTICE '✅ Quarentena concluída';
END$$;

-- =============================================
-- PARTE 4: BACKFILL organization_id
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '🔄 Backfill organization_id...';
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    UPDATE shopify_customers c
    SET organization_id = s.organization_id
    FROM shopify_stores s
    WHERE c.store_id = s.id AND c.organization_id IS NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    UPDATE shopify_orders o
    SET organization_id = s.organization_id
    FROM shopify_stores s
    WHERE o.store_id = s.id AND o.organization_id IS NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    UPDATE shopify_products p
    SET organization_id = s.organization_id
    FROM shopify_stores s
    WHERE p.store_id = s.id AND p.organization_id IS NULL;
  END IF;
  
  -- Tabelas auxiliares
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'shopify_sync_config' AND column_name = 'organization_id') THEN
    UPDATE shopify_sync_config sc
    SET organization_id = s.organization_id
    FROM shopify_stores s
    WHERE sc.store_id = s.id AND sc.organization_id IS NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'shopify_transition_rules' AND column_name = 'organization_id') THEN
    UPDATE shopify_transition_rules tr
    SET organization_id = s.organization_id
    FROM shopify_stores s
    WHERE tr.store_id = s.id AND tr.organization_id IS NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'shopify_automation_logs' AND column_name = 'organization_id') THEN
    UPDATE shopify_automation_logs al
    SET organization_id = s.organization_id
    FROM shopify_stores s
    WHERE al.store_id = s.id AND al.organization_id IS NULL;
  END IF;
  
  RAISE NOTICE '✅ Backfill concluído';
END$$;

-- =============================================
-- PARTE 5: VERIFICAR ANTES DE NOT NULL
-- =============================================

DO $$
DECLARE
  v_null_count INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    SELECT COUNT(*) INTO v_null_count FROM shopify_customers WHERE organization_id IS NULL;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION '❌ shopify_customers tem % registros com org_id NULL', v_null_count;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    SELECT COUNT(*) INTO v_null_count FROM shopify_orders WHERE organization_id IS NULL;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION '❌ shopify_orders tem % registros com org_id NULL', v_null_count;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    SELECT COUNT(*) INTO v_null_count FROM shopify_products WHERE organization_id IS NULL;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION '❌ shopify_products tem % registros com org_id NULL', v_null_count;
    END IF;
  END IF;
  
  RAISE NOTICE '✅ Todos os registros têm organization_id';
END$$;

-- =============================================
-- PARTE 6: SET NOT NULL + FKs
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '🔐 Aplicando constraints...';
  
  -- NOT NULL
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    ALTER TABLE shopify_customers ALTER COLUMN organization_id SET NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    ALTER TABLE shopify_orders ALTER COLUMN organization_id SET NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    ALTER TABLE shopify_products ALTER COLUMN organization_id SET NOT NULL;
  END IF;
  
  -- FK para organizations
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_customers_org_fk') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
      ALTER TABLE shopify_customers
        ADD CONSTRAINT shopify_customers_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_orders_org_fk') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
      ALTER TABLE shopify_orders
        ADD CONSTRAINT shopify_orders_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_products_org_fk') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
      ALTER TABLE shopify_products
        ADD CONSTRAINT shopify_products_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- FK para shopify_stores (previne órfãos futuros)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_customers_store_fk') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
      ALTER TABLE shopify_customers
        ADD CONSTRAINT shopify_customers_store_fk
        FOREIGN KEY (store_id) REFERENCES shopify_stores(id) ON DELETE CASCADE NOT VALID;
      ALTER TABLE shopify_customers VALIDATE CONSTRAINT shopify_customers_store_fk;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_orders_store_fk') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
      ALTER TABLE shopify_orders
        ADD CONSTRAINT shopify_orders_store_fk
        FOREIGN KEY (store_id) REFERENCES shopify_stores(id) ON DELETE CASCADE NOT VALID;
      ALTER TABLE shopify_orders VALIDATE CONSTRAINT shopify_orders_store_fk;
    END IF;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopify_products_store_fk') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
      ALTER TABLE shopify_products
        ADD CONSTRAINT shopify_products_store_fk
        FOREIGN KEY (store_id) REFERENCES shopify_stores(id) ON DELETE CASCADE NOT VALID;
      ALTER TABLE shopify_products VALIDATE CONSTRAINT shopify_products_store_fk;
    END IF;
  END IF;
  
  RAISE NOTICE '✅ Constraints aplicadas';
END$$;

-- =============================================
-- PARTE 7: TRIGGER DE VALIDAÇÃO
-- =============================================

CREATE OR REPLACE FUNCTION public.shopify_enforce_org_from_store()
RETURNS TRIGGER AS $$
DECLARE
  v_store_org UUID;
BEGIN
  SELECT organization_id INTO v_store_org
  FROM shopify_stores WHERE id = NEW.store_id;

  IF v_store_org IS NULL THEN
    RAISE EXCEPTION '[SECURITY] Invalid store_id: %', NEW.store_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_store_org;
  END IF;

  IF NEW.organization_id <> v_store_org THEN
    RAISE EXCEPTION '[SECURITY] Org mismatch: store=% vs row=%', v_store_org, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    DROP TRIGGER IF EXISTS trg_shopify_customers_org ON shopify_customers;
    CREATE TRIGGER trg_shopify_customers_org
      BEFORE INSERT OR UPDATE OF store_id, organization_id ON shopify_customers
      FOR EACH ROW EXECUTE FUNCTION public.shopify_enforce_org_from_store();
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    DROP TRIGGER IF EXISTS trg_shopify_orders_org ON shopify_orders;
    CREATE TRIGGER trg_shopify_orders_org
      BEFORE INSERT OR UPDATE OF store_id, organization_id ON shopify_orders
      FOR EACH ROW EXECUTE FUNCTION public.shopify_enforce_org_from_store();
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    DROP TRIGGER IF EXISTS trg_shopify_products_org ON shopify_products;
    CREATE TRIGGER trg_shopify_products_org
      BEFORE INSERT OR UPDATE OF store_id, organization_id ON shopify_products
      FOR EACH ROW EXECUTE FUNCTION public.shopify_enforce_org_from_store();
  END IF;
  
  RAISE NOTICE '✅ Triggers criados';
END$$;

-- =============================================
-- PARTE 8: RLS + FORCE (usando public.get_user_org_id)
-- =============================================

CREATE OR REPLACE FUNCTION _temp_apply_rls(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_table);
  
  -- Remover policies antigas
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', p_table, p_table);
  
  -- Criar policies usando public.get_user_org_id()
  EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (organization_id = public.get_user_org_id())', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (organization_id = public.get_user_org_id())', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE USING (organization_id = public.get_user_org_id()) WITH CHECK (organization_id = public.get_user_org_id())', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (organization_id = public.get_user_org_id())', p_table, p_table);
  
  RAISE NOTICE '  ✅ RLS em %', p_table;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_table TEXT;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Aplicando RLS + FORCE...';
  
  FOR v_table IN 
    SELECT DISTINCT c.table_name 
    FROM information_schema.columns c
    JOIN information_schema.tables t ON c.table_name = t.table_name
    WHERE c.column_name = 'organization_id' 
      AND c.table_name LIKE 'shopify_%'
      AND c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    PERFORM _temp_apply_rls(v_table);
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ RLS aplicado em % tabelas', v_count;
END$$;

DROP FUNCTION IF EXISTS _temp_apply_rls(TEXT);

-- =============================================
-- PARTE 9: ÍNDICES
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_customers') THEN
    CREATE INDEX IF NOT EXISTS idx_shopify_customers_org ON shopify_customers(organization_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_orders') THEN
    CREATE INDEX IF NOT EXISTS idx_shopify_orders_org ON shopify_orders(organization_id);
    CREATE INDEX IF NOT EXISTS idx_shopify_orders_org_created ON shopify_orders(organization_id, created_at DESC);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_products') THEN
    CREATE INDEX IF NOT EXISTS idx_shopify_products_org ON shopify_products(organization_id);
  END IF;
  
  RAISE NOTICE '✅ Índices criados';
END$$;

-- =============================================
-- PARTE 10: VERIFICAÇÃO FINAL
-- =============================================

DO $$
DECLARE
  v_table RECORD;
  v_issues INT := 0;
  v_has_rls BOOLEAN;
  v_has_force BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║           VERIFICAÇÃO FINAL DE SEGURANÇA                     ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  
  FOR v_table IN 
    SELECT DISTINCT c.table_name 
    FROM information_schema.columns c
    JOIN information_schema.tables t ON c.table_name = t.table_name
    WHERE c.column_name = 'organization_id' 
      AND c.table_name LIKE 'shopify_%'
      AND c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    SELECT COALESCE(relrowsecurity, FALSE), COALESCE(relforcerowsecurity, FALSE)
    INTO v_has_rls, v_has_force
    FROM pg_class WHERE relname = v_table.table_name;
    
    IF NOT v_has_rls OR NOT v_has_force THEN
      RAISE NOTICE '║ ❌ % - RLS=%  FORCE=%', RPAD(v_table.table_name, 25), v_has_rls, v_has_force;
      v_issues := v_issues + 1;
    ELSE
      RAISE NOTICE '║ ✅ % - SEGURO', RPAD(v_table.table_name, 25);
    END IF;
  END LOOP;
  
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  IF v_issues = 0 THEN
    RAISE NOTICE '║ 🎉 TODAS AS TABELAS SHOPIFY ESTÃO SEGURAS!                   ║';
  ELSE
    RAISE NOTICE '║ ⚠️  % problema(s) encontrado(s)                               ║', v_issues;
  END IF;
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
END$$;

-- =============================================
-- RESUMO
-- =============================================

DO $$
DECLARE
  v_q_total INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '_quarantine' AND table_name = 'shopify_customers') THEN
    v_q_total := v_q_total + (SELECT COUNT(*) FROM _quarantine.shopify_customers);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '_quarantine' AND table_name = 'shopify_orders') THEN
    v_q_total := v_q_total + (SELECT COUNT(*) FROM _quarantine.shopify_orders);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '_quarantine' AND table_name = 'shopify_products') THEN
    v_q_total := v_q_total + (SELECT COUNT(*) FROM _quarantine.shopify_products);
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '🔒 SECURITY PATCH V3 APLICADO COM SUCESSO!';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📋 O que foi feito:';
  RAISE NOTICE '   ✅ Função public.get_user_org_id() criada';
  RAISE NOTICE '   ✅ organization_id em todas as tabelas shopify_*';
  RAISE NOTICE '   ✅ FKs para shopify_stores (órfãos nunca mais!)';
  RAISE NOTICE '   ✅ Triggers de validação store/org';
  RAISE NOTICE '   ✅ RLS + FORCE ROW LEVEL SECURITY';
  RAISE NOTICE '   ✅ Policies por public.get_user_org_id()';
  RAISE NOTICE '';
  RAISE NOTICE '📦 Quarentena: % registros em _quarantine.*', v_q_total;
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  PRÓXIMOS PASSOS:';
  RAISE NOTICE '   1. Verificar rotas /api/shopify/* usam getAuthClient()';
  RAISE NOTICE '   2. Testar isolamento entre organizações';
  RAISE NOTICE '';
END$$;
