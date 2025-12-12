-- ============================================
-- WORDER - SYNC TABLES (Shopify Orders + Klaviyo)
-- ============================================
-- Execute este script no SQL Editor do Supabase
-- Supabase Dashboard > SQL Editor > New Query > Paste > Run

-- ============================================
-- 1. SHOPIFY ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shopify_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL,
  order_number INTEGER,
  name TEXT, -- Order name like #1001
  email TEXT,
  phone TEXT,
  
  -- Monetary values
  total_price DECIMAL(12,2) DEFAULT 0,
  subtotal_price DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  total_discounts DECIMAL(12,2) DEFAULT 0,
  total_shipping DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  
  -- Status
  financial_status TEXT DEFAULT 'pending', -- pending, paid, refunded, etc
  fulfillment_status TEXT, -- null, fulfilled, partial
  
  -- Customer
  customer_id TEXT,
  customer_email TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  
  -- Line items (JSON array)
  line_items JSONB DEFAULT '[]'::jsonb,
  
  -- Addresses
  shipping_address JSONB,
  billing_address JSONB,
  
  -- Timestamps
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  
  -- Unique constraint
  UNIQUE(store_id, shopify_order_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopify_orders_store ON shopify_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created ON shopify_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_financial ON shopify_orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_customer ON shopify_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_number ON shopify_orders(order_number);

-- Disable RLS (enable with proper policies later)
ALTER TABLE shopify_orders DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SHOPIFY CUSTOMERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shopify_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_customer_id TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  
  -- Stats
  orders_count INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  
  -- Marketing
  accepts_marketing BOOLEAN DEFAULT false,
  accepts_marketing_updated_at TIMESTAMPTZ,
  
  -- Tags and notes
  tags TEXT,
  note TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(store_id, shopify_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_customers_store ON shopify_customers(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_email ON shopify_customers(email);

ALTER TABLE shopify_customers DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. SHOPIFY PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shopify_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT,
  product_type TEXT,
  vendor TEXT,
  status TEXT DEFAULT 'active',
  
  -- Variants info (first variant as default)
  price DECIMAL(12,2) DEFAULT 0,
  compare_at_price DECIMAL(12,2),
  cost_per_item DECIMAL(12,2) DEFAULT 0, -- Custo do produto
  sku TEXT,
  barcode TEXT,
  inventory_quantity INTEGER DEFAULT 0,
  
  -- Images
  image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  
  -- Variants (full data)
  variants JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  
  UNIQUE(store_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_store ON shopify_products(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_sku ON shopify_products(sku);

ALTER TABLE shopify_products DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. KLAVIYO CAMPAIGN METRICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  klaviyo_campaign_id TEXT NOT NULL,
  name TEXT,
  subject TEXT,
  status TEXT,
  
  -- Counts
  recipients INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  
  -- Rates (calculated)
  open_rate DECIMAL(5,2) DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Revenue
  revenue DECIMAL(12,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  -- Timestamps
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, klaviyo_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_org ON campaign_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_sent ON campaign_metrics(sent_at);

ALTER TABLE campaign_metrics DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. KLAVIYO FLOW METRICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS flow_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  klaviyo_flow_id TEXT NOT NULL,
  name TEXT,
  status TEXT, -- draft, manual, live
  
  -- Counts
  triggered INTEGER DEFAULT 0,
  received INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  
  -- Rates
  open_rate DECIMAL(5,2) DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Revenue
  revenue DECIMAL(12,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, klaviyo_flow_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_metrics_org ON flow_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_status ON flow_metrics(status);

ALTER TABLE flow_metrics DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. KLAVIYO LISTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS klaviyo_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  klaviyo_list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  
  -- Counts
  profile_count INTEGER DEFAULT 0,
  
  -- Opt-in process
  opt_in_process TEXT DEFAULT 'single_opt_in',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, klaviyo_list_id)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_lists_org ON klaviyo_lists(organization_id);

ALTER TABLE klaviyo_lists DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. EMAIL METRICS DAILY (Aggregated)
-- ============================================
CREATE TABLE IF NOT EXISTS email_metrics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  date DATE NOT NULL,
  
  -- Email counts
  sent INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  
  -- Revenue
  revenue DECIMAL(12,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  -- List changes
  new_subscribers INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, date)
);

CREATE INDEX IF NOT EXISTS idx_email_metrics_daily_org ON email_metrics_daily(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_metrics_daily_date ON email_metrics_daily(date);

ALTER TABLE email_metrics_daily DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================
DO $$ 
BEGIN
  -- Add missing columns to shopify_stores
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'shopify_stores' AND column_name = 'total_orders') THEN
    ALTER TABLE shopify_stores ADD COLUMN total_orders INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'shopify_stores' AND column_name = 'total_revenue') THEN
    ALTER TABLE shopify_stores ADD COLUMN total_revenue DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'shopify_stores' AND column_name = 'total_customers') THEN
    ALTER TABLE shopify_stores ADD COLUMN total_customers INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'shopify_stores' AND column_name = 'total_products') THEN
    ALTER TABLE shopify_stores ADD COLUMN total_products INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'shopify_stores' AND column_name = 'api_secret') THEN
    ALTER TABLE shopify_stores ADD COLUMN api_secret TEXT;
  END IF;

  -- Add missing columns to klaviyo_accounts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'klaviyo_accounts' AND column_name = 'total_campaigns') THEN
    ALTER TABLE klaviyo_accounts ADD COLUMN total_campaigns INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'klaviyo_accounts' AND column_name = 'total_flows') THEN
    ALTER TABLE klaviyo_accounts ADD COLUMN total_flows INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'klaviyo_accounts' AND column_name = 'total_lists') THEN
    ALTER TABLE klaviyo_accounts ADD COLUMN total_lists INTEGER DEFAULT 0;
  END IF;
END $$;

-- Disable RLS on core tables
ALTER TABLE shopify_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- ============================================
-- DONE! Tables created successfully.
-- ============================================
