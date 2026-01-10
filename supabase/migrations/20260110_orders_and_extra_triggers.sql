-- ============================================
-- ORDERS & EXTRA TRIGGERS
-- Tabela de pedidos e triggers adicionais
-- Execute no SQL Editor do Supabase
-- ============================================

-- ============================================
-- 1. TABELA DE ORDERS (se não existir)
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Identificadores externos
  external_id TEXT,              -- ID do Shopify/plataforma
  order_number TEXT,             -- Número do pedido
  
  -- Valores
  total_price DECIMAL(12,2) DEFAULT 0,
  subtotal_price DECIMAL(12,2) DEFAULT 0,
  total_discount DECIMAL(12,2) DEFAULT 0,
  total_shipping DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  
  -- Status
  status TEXT DEFAULT 'pending',           -- pending, confirmed, processing, shipped, delivered, cancelled
  financial_status TEXT DEFAULT 'pending', -- pending, paid, partially_paid, refunded, voided
  fulfillment_status TEXT,                 -- null, fulfilled, partial, restocked
  
  -- Dados do cliente
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  
  -- Endereço de entrega
  shipping_address JSONB DEFAULT '{}',
  billing_address JSONB DEFAULT '{}',
  
  -- Itens e metadados
  line_items JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  note TEXT,
  
  -- Datas
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  -- Source
  source TEXT DEFAULT 'manual',  -- manual, shopify, api, import
  source_url TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_financial ON orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_orders_external ON orders(external_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ============================================
-- 2. TABELA DE ABANDONED CARTS
-- ============================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Identificadores
  external_id TEXT,              -- ID do checkout/cart
  checkout_token TEXT,
  
  -- Valores
  total_price DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  
  -- Dados do cliente
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  
  -- Itens
  line_items JSONB DEFAULT '[]',
  
  -- Status
  status TEXT DEFAULT 'abandoned',  -- abandoned, recovered, expired
  recovered_order_id UUID,
  
  -- URLs
  checkout_url TEXT,
  recovery_url TEXT,
  
  -- Datas
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  abandoned_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ,           -- Quando foi notificado
  recovered_at TIMESTAMPTZ,
  
  -- Controle de notificações
  notification_count INTEGER DEFAULT 0,
  last_notification_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_abandoned_org ON abandoned_carts(organization_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_status ON abandoned_carts(status);
CREATE INDEX IF NOT EXISTS idx_abandoned_at ON abandoned_carts(abandoned_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_contact ON abandoned_carts(contact_id);

-- ============================================
-- 3. TRIGGER: ORDER CREATED
-- ============================================

CREATE OR REPLACE FUNCTION trigger_order_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Só dispara para novos pedidos
  INSERT INTO event_logs (
    organization_id,
    event_type,
    contact_id,
    payload,
    source
  ) VALUES (
    NEW.organization_id,
    'order.created',
    NEW.contact_id,
    jsonb_build_object(
      'order_id', NEW.id,
      'order_number', NEW.order_number,
      'external_id', NEW.external_id,
      'total_price', NEW.total_price,
      'status', NEW.status,
      'financial_status', NEW.financial_status,
      'customer_email', NEW.customer_email,
      'customer_name', NEW.customer_name,
      'store_id', NEW.store_id,
      'storeId', NEW.store_id,
      'line_items', NEW.line_items,
      'source', NEW.source,
      'created_at', NEW.created_at
    ),
    'trigger'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger
DROP TRIGGER IF EXISTS on_order_created ON orders;
CREATE TRIGGER on_order_created
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_order_created();

-- ============================================
-- 4. TRIGGER: ORDER PAID
-- ============================================

CREATE OR REPLACE FUNCTION trigger_order_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Só dispara quando financial_status muda para 'paid'
  IF (OLD.financial_status IS DISTINCT FROM 'paid' AND NEW.financial_status = 'paid') OR
     (OLD.financial_status IS DISTINCT FROM 'partially_paid' AND NEW.financial_status = 'partially_paid') THEN
    
    INSERT INTO event_logs (
      organization_id,
      event_type,
      contact_id,
      payload,
      source
    ) VALUES (
      NEW.organization_id,
      'order.paid',
      NEW.contact_id,
      jsonb_build_object(
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'external_id', NEW.external_id,
        'total_price', NEW.total_price,
        'status', NEW.status,
        'financial_status', NEW.financial_status,
        'previous_financial_status', OLD.financial_status,
        'customer_email', NEW.customer_email,
        'customer_name', NEW.customer_name,
        'store_id', NEW.store_id,
        'storeId', NEW.store_id,
        'paid_at', NEW.paid_at,
        'source', NEW.source
      ),
      'trigger'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger
DROP TRIGGER IF EXISTS on_order_paid ON orders;
CREATE TRIGGER on_order_paid
  AFTER UPDATE OF financial_status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_order_paid();

-- ============================================
-- 5. TRIGGER: CART ABANDONED
-- ============================================

CREATE OR REPLACE FUNCTION trigger_cart_abandoned()
RETURNS TRIGGER AS $$
BEGIN
  -- Dispara quando um carrinho é marcado como abandonado
  IF NEW.status = 'abandoned' THEN
    INSERT INTO event_logs (
      organization_id,
      event_type,
      contact_id,
      payload,
      source
    ) VALUES (
      NEW.organization_id,
      'cart.abandoned',
      NEW.contact_id,
      jsonb_build_object(
        'cart_id', NEW.id,
        'external_id', NEW.external_id,
        'total_price', NEW.total_price,
        'customer_email', NEW.customer_email,
        'customer_name', NEW.customer_name,
        'store_id', NEW.store_id,
        'storeId', NEW.store_id,
        'checkout_url', NEW.checkout_url,
        'recovery_url', NEW.recovery_url,
        'line_items', NEW.line_items,
        'abandoned_at', NEW.abandoned_at
      ),
      'trigger'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger
DROP TRIGGER IF EXISTS on_cart_abandoned ON abandoned_carts;
CREATE TRIGGER on_cart_abandoned
  AFTER INSERT OR UPDATE OF status ON abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cart_abandoned();

-- ============================================
-- 6. FUNÇÃO PARA DETECTAR ANIVERSÁRIOS
-- Chamada por cron job diário
-- ============================================

CREATE OR REPLACE FUNCTION check_contact_dates()
RETURNS TABLE (
  event_id UUID,
  organization_id UUID,
  contact_id UUID,
  date_type TEXT
) AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  v_in_3_days DATE := CURRENT_DATE + INTERVAL '3 days';
  v_in_7_days DATE := CURRENT_DATE + INTERVAL '7 days';
BEGIN
  -- Buscar contatos com aniversário hoje
  RETURN QUERY
  SELECT
    gen_random_uuid() as event_id,
    c.organization_id,
    c.id as contact_id,
    'birthday_today'::TEXT as date_type
  FROM contacts c
  WHERE 
    c.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM v_today)
    AND EXTRACT(DAY FROM c.birth_date) = EXTRACT(DAY FROM v_today);

  -- Aniversário amanhã
  RETURN QUERY
  SELECT
    gen_random_uuid() as event_id,
    c.organization_id,
    c.id as contact_id,
    'birthday_tomorrow'::TEXT as date_type
  FROM contacts c
  WHERE 
    c.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM v_tomorrow)
    AND EXTRACT(DAY FROM c.birth_date) = EXTRACT(DAY FROM v_tomorrow);

  -- Aniversário em 3 dias
  RETURN QUERY
  SELECT
    gen_random_uuid() as event_id,
    c.organization_id,
    c.id as contact_id,
    'birthday_in_3_days'::TEXT as date_type
  FROM contacts c
  WHERE 
    c.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM v_in_3_days)
    AND EXTRACT(DAY FROM c.birth_date) = EXTRACT(DAY FROM v_in_3_days);

  -- Aniversário em 7 dias
  RETURN QUERY
  SELECT
    gen_random_uuid() as event_id,
    c.organization_id,
    c.id as contact_id,
    'birthday_in_7_days'::TEXT as date_type
  FROM contacts c
  WHERE 
    c.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM v_in_7_days)
    AND EXTRACT(DAY FROM c.birth_date) = EXTRACT(DAY FROM v_in_7_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. FUNÇÃO PARA EMITIR EVENTOS DE DATA
-- ============================================

CREATE OR REPLACE FUNCTION emit_date_events()
RETURNS INTEGER AS $$
DECLARE
  v_record RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_record IN SELECT * FROM check_contact_dates() LOOP
    INSERT INTO event_logs (
      organization_id,
      event_type,
      contact_id,
      payload,
      source
    ) VALUES (
      v_record.organization_id,
      'date.' || v_record.date_type,
      v_record.contact_id,
      jsonb_build_object(
        'date_type', v_record.date_type,
        'contact_id', v_record.contact_id,
        'triggered_at', NOW()
      ),
      'cron'
    );
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. ATUALIZAR find_matching_automations PARA NOVOS TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION find_matching_automations(
  p_organization_id UUID,
  p_event_type TEXT,
  p_payload JSONB
) RETURNS TABLE (
  automation_id UUID,
  automation_name TEXT,
  trigger_type TEXT
) AS $$
DECLARE
  v_trigger_type TEXT;
BEGIN
  -- Mapear event_type para trigger_type
  v_trigger_type := CASE p_event_type
    WHEN 'contact.created' THEN 'trigger_signup'
    WHEN 'tag.added' THEN 'trigger_tag'
    WHEN 'deal.created' THEN 'trigger_deal_created'
    WHEN 'deal.stage_changed' THEN 'trigger_deal_stage'
    WHEN 'deal.won' THEN 'trigger_deal_won'
    WHEN 'deal.lost' THEN 'trigger_deal_lost'
    WHEN 'order.created' THEN 'trigger_order'
    WHEN 'order.paid' THEN 'trigger_order_paid'
    WHEN 'cart.abandoned' THEN 'trigger_abandon'
    WHEN 'webhook.received' THEN 'trigger_webhook'
    WHEN 'whatsapp.received' THEN 'trigger_whatsapp'
    -- Date triggers
    WHEN 'date.birthday_today' THEN 'trigger_date'
    WHEN 'date.birthday_tomorrow' THEN 'trigger_date'
    WHEN 'date.birthday_in_3_days' THEN 'trigger_date'
    WHEN 'date.birthday_in_7_days' THEN 'trigger_date'
    ELSE NULL
  END;
  
  IF v_trigger_type IS NULL THEN
    RETURN;
  END IF;
  
  -- Buscar automações que correspondem ao trigger
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    v_trigger_type
  FROM automations a
  WHERE a.organization_id = p_organization_id
    AND a.status = 'active'
    AND a.trigger_type = v_trigger_type
    AND (
      -- Tag específica
      (v_trigger_type = 'trigger_tag' AND (
        a.trigger_config IS NULL 
        OR COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') IS NULL 
        OR COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') = 
           COALESCE(p_payload->>'tagName', p_payload->>'tag_name')
      ))
      OR
      -- Stage específico com fromStageId e stageId
      (v_trigger_type = 'trigger_deal_stage' AND (
        a.trigger_config IS NULL 
        OR (
          (COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') IS NULL 
           OR COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') = 
              COALESCE(p_payload->>'to_stage_id', p_payload->>'toStageId'))
          AND
          (COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') IS NULL 
           OR COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') = 
              COALESCE(p_payload->>'from_stage_id', p_payload->>'fromStageId'))
        )
      ))
      OR
      -- Pipeline específico
      ((v_trigger_type IN ('trigger_deal_created', 'trigger_deal_stage', 'trigger_deal_won', 'trigger_deal_lost')) AND (
        a.trigger_config IS NULL 
        OR COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') IS NULL 
        OR COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') = 
           COALESCE(p_payload->>'pipelineId', p_payload->>'pipeline_id')
      ))
      OR
      -- Store específica para triggers de pedido
      ((v_trigger_type IN ('trigger_order', 'trigger_order_paid', 'trigger_abandon')) AND (
        a.trigger_config IS NULL 
        OR COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') IS NULL 
        OR COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') = 
           COALESCE(p_payload->>'storeId', p_payload->>'store_id')
      ))
      OR
      -- Valor mínimo para pedidos
      ((v_trigger_type IN ('trigger_order', 'trigger_order_paid')) AND (
        a.trigger_config IS NULL 
        OR (a.trigger_config->>'minValue') IS NULL 
        OR (p_payload->>'total_price')::DECIMAL >= (a.trigger_config->>'minValue')::DECIMAL
      ))
      OR
      -- WhatsApp com filtro de palavra-chave
      (v_trigger_type = 'trigger_whatsapp' AND (
        a.trigger_config IS NULL 
        OR (a.trigger_config->>'keyword') IS NULL 
        OR (a.trigger_config->>'keyword') = ''
        OR LOWER(COALESCE(p_payload->>'message', p_payload->>'body', '')) 
           LIKE '%' || LOWER(a.trigger_config->>'keyword') || '%'
      ))
      OR
      -- Date trigger com filtro de timing
      (v_trigger_type = 'trigger_date' AND (
        a.trigger_config IS NULL 
        OR (a.trigger_config->>'dateType') IS NULL 
        OR (a.trigger_config->>'dateType') = p_payload->>'date_type'
        OR (
          -- Mapear config timing para event date_type
          (a.trigger_config->>'timing' = 'on_date' AND p_payload->>'date_type' = 'birthday_today')
          OR (a.trigger_config->>'timing' = '1_day_before' AND p_payload->>'date_type' = 'birthday_tomorrow')
          OR (a.trigger_config->>'timing' = '3_days_before' AND p_payload->>'date_type' = 'birthday_in_3_days')
          OR (a.trigger_config->>'timing' = '7_days_before' AND p_payload->>'date_type' = 'birthday_in_7_days')
        )
      ))
      OR
      -- Outros triggers sem condições especiais
      (v_trigger_type NOT IN (
        'trigger_tag', 'trigger_deal_stage', 'trigger_deal_created', 
        'trigger_deal_won', 'trigger_deal_lost', 'trigger_order', 
        'trigger_order_paid', 'trigger_abandon', 'trigger_whatsapp', 'trigger_date'
      ))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. RLS POLICIES PARA NOVAS TABELAS
-- ============================================

-- Orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_org_access" ON orders;
CREATE POLICY "orders_org_access" ON orders
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "orders_service_role" ON orders;
CREATE POLICY "orders_service_role" ON orders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Abandoned Carts
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abandoned_carts_org_access" ON abandoned_carts;
CREATE POLICY "abandoned_carts_org_access" ON abandoned_carts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "abandoned_carts_service_role" ON abandoned_carts;
CREATE POLICY "abandoned_carts_service_role" ON abandoned_carts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 10. ADICIONAR COLUNA birth_date EM CONTACTS (se não existir)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'birth_date') THEN
    ALTER TABLE contacts ADD COLUMN birth_date DATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_birth_date ON contacts(birth_date);

-- ============================================
-- PRONTO! Execute este SQL no Supabase
-- ============================================
