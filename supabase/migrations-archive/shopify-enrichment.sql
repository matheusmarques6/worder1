-- ============================================
-- Migration: Enriquecer dados de clientes Shopify
-- Adiciona campos para tracking de comportamento e histórico
-- ============================================

-- ============================================
-- 1. NOVOS CAMPOS NA TABELA CONTACTS
-- ============================================

-- Dados da última compra
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_order_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_order_value DECIMAL(12, 2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_order_number TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_order_products JSONB DEFAULT '[]';

-- Primeira compra
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_order_at TIMESTAMPTZ;

-- Métricas calculadas
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS days_since_last_order INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS order_frequency_days DECIMAL(8, 2);

-- Produtos favoritos (top 10 mais comprados)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS favorite_products JSONB DEFAULT '[]';

-- Comportamento no site (se usar pixel)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_page_views INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_viewed_products JSONB DEFAULT '[]';

-- RFM Score (Recency, Frequency, Monetary)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_recency_score INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_frequency_score INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_monetary_score INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS rfm_segment TEXT;

-- ============================================
-- 2. TABELA DE PRODUTOS COMPRADOS
-- ============================================

CREATE TABLE IF NOT EXISTS contact_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Dados do pedido
  order_id TEXT NOT NULL,
  order_number TEXT,
  order_date TIMESTAMPTZ NOT NULL,
  
  -- Dados do produto
  product_id TEXT,
  product_title TEXT NOT NULL,
  product_sku TEXT,
  product_vendor TEXT,
  product_type TEXT,
  product_image_url TEXT,
  
  variant_id TEXT,
  variant_title TEXT,
  
  -- Valores
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(12, 2),
  total_price DECIMAL(12, 2),
  currency TEXT DEFAULT 'BRL',
  
  -- Source
  source TEXT DEFAULT 'shopify',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contact_purchases
CREATE INDEX IF NOT EXISTS idx_contact_purchases_contact ON contact_purchases(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_org ON contact_purchases(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_product ON contact_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_date ON contact_purchases(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_contact_purchases_order ON contact_purchases(order_id);

-- RLS para contact_purchases
ALTER TABLE contact_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchases from their organization"
  ON contact_purchases FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role can manage purchases"
  ON contact_purchases FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 3. ADICIONAR CAMPOS À CONTACT_ACTIVITIES
-- ============================================

-- Adicionar campos que podem não existir
ALTER TABLE contact_activities ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE contact_activities ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE contact_activities ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE contact_activities ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();

-- Índice para busca por source
CREATE INDEX IF NOT EXISTS idx_contact_activities_source ON contact_activities(source, source_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_type ON contact_activities(type);

-- ============================================
-- 4. TABELA DE SESSÕES (para pixel de tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS contact_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Identificadores
  session_id TEXT NOT NULL,
  visitor_id TEXT,
  
  -- Dados do visitante
  email TEXT,
  phone TEXT,
  
  -- Dados da sessão
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Páginas e produtos
  page_views INTEGER DEFAULT 0,
  pages_visited JSONB DEFAULT '[]',
  products_viewed JSONB DEFAULT '[]',
  
  -- Carrinho
  cart_items JSONB DEFAULT '[]',
  cart_value DECIMAL(12, 2) DEFAULT 0,
  
  -- Conversão
  converted BOOLEAN DEFAULT false,
  conversion_order_id TEXT,
  
  -- UTM
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  
  -- Source
  source TEXT DEFAULT 'shopify',
  shop_domain TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contact_sessions
CREATE INDEX IF NOT EXISTS idx_contact_sessions_contact ON contact_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_sessions_org ON contact_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_sessions_session ON contact_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_contact_sessions_visitor ON contact_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_contact_sessions_started ON contact_sessions(started_at DESC);

-- RLS para contact_sessions
ALTER TABLE contact_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sessions from their organization"
  ON contact_sessions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
    UNION
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role can manage sessions"
  ON contact_sessions FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 5. CAMPOS PARA SHOPIFY_STORES (tracking)
-- ============================================

ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT false;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS tracking_script_id TEXT;

-- ============================================
-- 6. ÍNDICES ADICIONAIS NA TABELA CONTACTS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_contacts_last_order ON contacts(last_order_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_rfm_segment ON contacts(rfm_segment);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_shopify_id ON contacts(shopify_customer_id);

-- ============================================
-- 7. FUNÇÃO PARA CALCULAR RFM (executar periodicamente)
-- ============================================

CREATE OR REPLACE FUNCTION calculate_contact_rfm(p_organization_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE contacts c
  SET
    -- Recency: dias desde última compra (1-5, onde 5 = mais recente)
    rfm_recency_score = CASE
      WHEN last_order_at IS NULL THEN 1
      WHEN EXTRACT(DAY FROM NOW() - last_order_at) <= 30 THEN 5
      WHEN EXTRACT(DAY FROM NOW() - last_order_at) <= 60 THEN 4
      WHEN EXTRACT(DAY FROM NOW() - last_order_at) <= 90 THEN 3
      WHEN EXTRACT(DAY FROM NOW() - last_order_at) <= 180 THEN 2
      ELSE 1
    END,
    
    -- Frequency: número de pedidos (1-5)
    rfm_frequency_score = CASE
      WHEN total_orders >= 10 THEN 5
      WHEN total_orders >= 5 THEN 4
      WHEN total_orders >= 3 THEN 3
      WHEN total_orders >= 2 THEN 2
      ELSE 1
    END,
    
    -- Monetary: valor total gasto (1-5)
    rfm_monetary_score = CASE
      WHEN total_spent >= 5000 THEN 5
      WHEN total_spent >= 2000 THEN 4
      WHEN total_spent >= 1000 THEN 3
      WHEN total_spent >= 500 THEN 2
      ELSE 1
    END,
    
    -- Dias desde última compra
    days_since_last_order = CASE
      WHEN last_order_at IS NOT NULL THEN EXTRACT(DAY FROM NOW() - last_order_at)::INTEGER
      ELSE NULL
    END,
    
    updated_at = NOW()
  WHERE c.organization_id = p_organization_id
    AND c.total_orders > 0;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Atualizar segmento baseado nos scores
  UPDATE contacts c
  SET
    rfm_segment = CASE
      -- Champions (alta em tudo)
      WHEN rfm_recency_score >= 4 AND rfm_frequency_score >= 4 AND rfm_monetary_score >= 4 THEN 'champion'
      
      -- Loyal (frequência alta)
      WHEN rfm_frequency_score >= 4 THEN 'loyal'
      
      -- Potential Loyalists (recentes com potencial)
      WHEN rfm_recency_score >= 4 AND rfm_frequency_score >= 2 THEN 'potential_loyal'
      
      -- New Customers (recentes, primeira compra)
      WHEN rfm_recency_score >= 4 AND rfm_frequency_score = 1 THEN 'new_customer'
      
      -- Promising (recentes, valor médio)
      WHEN rfm_recency_score >= 3 AND rfm_monetary_score >= 3 THEN 'promising'
      
      -- Need Attention (foram bons, esfriando)
      WHEN rfm_recency_score = 3 AND rfm_frequency_score >= 3 THEN 'need_attention'
      
      -- About to Sleep (cada vez menos ativos)
      WHEN rfm_recency_score = 2 AND rfm_frequency_score >= 2 THEN 'about_to_sleep'
      
      -- At Risk (eram bons, sumiram)
      WHEN rfm_recency_score <= 2 AND rfm_frequency_score >= 3 THEN 'at_risk'
      
      -- Hibernating (inativos há muito tempo)
      WHEN rfm_recency_score = 1 AND rfm_frequency_score >= 2 THEN 'hibernating'
      
      -- Lost (sem atividade significativa)
      ELSE 'lost'
    END
  WHERE c.organization_id = p_organization_id
    AND c.rfm_recency_score IS NOT NULL;
  
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT ALL ON contact_purchases TO service_role;
GRANT ALL ON contact_sessions TO service_role;
GRANT SELECT ON contact_purchases TO authenticated;
GRANT SELECT ON contact_sessions TO authenticated;
