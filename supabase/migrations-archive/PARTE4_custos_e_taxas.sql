-- ============================================
-- PARTE 4: CUSTOS DE PRODUTOS E TAXAS
-- ============================================

-- Custos de Produtos (por produto ou variante)
CREATE TABLE IF NOT EXISTS product_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  store_id UUID,

  -- Identificadores Shopify
  shopify_product_id TEXT NOT NULL,
  shopify_variant_id TEXT, -- Se NULL, é custo do produto inteiro

  -- Informações do produto (cache)
  product_title TEXT,
  variant_title TEXT,
  sku TEXT,

  -- Custo
  cost_amount DECIMAL(12, 4) NOT NULL DEFAULT 0,
  cost_currency TEXT DEFAULT 'BRL', -- BRL, USD, EUR, etc

  -- Para conversão automática
  cost_in_brl DECIMAL(12, 4), -- Custo convertido para BRL
  exchange_rate DECIMAL(12, 6) DEFAULT 1, -- Taxa de câmbio usada

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique: um custo por produto/variante por loja
  UNIQUE(organization_id, store_id, shopify_product_id, shopify_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_product_costs_org ON product_costs(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_store ON product_costs(store_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_product ON product_costs(shopify_product_id);

-- Configurações de Taxas da Organização
CREATE TABLE IF NOT EXISTS organization_tax_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE,

  -- Taxa padrão de custo (% do preço de venda para produtos sem custo cadastrado)
  default_cost_percentage DECIMAL(5, 2) DEFAULT 35.00,

  -- Moeda padrão para custos
  default_cost_currency TEXT DEFAULT 'BRL',

  -- Taxas de gateway de pagamento (%)
  payment_gateway_fee DECIMAL(5, 2) DEFAULT 0,

  -- Taxa fixa por transação (em BRL)
  payment_fixed_fee DECIMAL(10, 2) DEFAULT 0,

  -- Impostos sobre vendas (%)
  sales_tax_percentage DECIMAL(5, 2) DEFAULT 0,

  -- Taxa de marketplace/plataforma (%)
  marketplace_fee DECIMAL(5, 2) DEFAULT 0,

  -- Custo de frete padrão (se não vier da Shopify)
  default_shipping_cost DECIMAL(10, 2) DEFAULT 0,

  -- Outras taxas fixas mensais (rateadas por pedido)
  monthly_fixed_costs DECIMAL(12, 2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Taxas Adicionais Customizadas
CREATE TABLE IF NOT EXISTS custom_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,

  name TEXT NOT NULL, -- Nome da taxa (ex: "Taxa Shopify", "Embalagem", etc)
  description TEXT,

  -- Tipo: percentage (%) ou fixed (valor fixo)
  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),

  -- Valor da taxa
  fee_value DECIMAL(12, 4) NOT NULL DEFAULT 0,

  -- Sobre qual valor aplica (se percentage): revenue, subtotal, shipping
  applies_to TEXT DEFAULT 'revenue',

  -- Se é por pedido ou por item
  per_order BOOLEAN DEFAULT true, -- true = por pedido, false = por item

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_fees_org ON custom_fees(organization_id, is_active);

-- Histórico de taxas de câmbio (para conversão de custos)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate DECIMAL(12, 6) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date, from_currency, to_currency);

-- Cache de produtos da Shopify (para listagem rápida)
CREATE TABLE IF NOT EXISTS shopify_products_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  store_id UUID NOT NULL,

  shopify_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT,
  product_type TEXT,
  status TEXT DEFAULT 'active',

  -- Imagem principal
  image_url TEXT,

  -- Preço (do primeiro variante ou range)
  price_min DECIMAL(12, 2),
  price_max DECIMAL(12, 2),

  -- Variantes (JSON array)
  variants JSONB DEFAULT '[]',

  -- Contagem
  variants_count INTEGER DEFAULT 1,

  -- Tags
  tags TEXT[] DEFAULT '{}',

  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_cache_store ON shopify_products_cache(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_cache_org ON shopify_products_cache(organization_id);

-- Enable RLS
ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_products_cache ENABLE ROW LEVEL SECURITY;

-- Inserir taxas de câmbio iniciais (BRL como base)
INSERT INTO exchange_rates (from_currency, to_currency, rate, date) VALUES
('USD', 'BRL', 5.00, CURRENT_DATE),
('EUR', 'BRL', 5.50, CURRENT_DATE),
('GBP', 'BRL', 6.30, CURRENT_DATE),
('CNY', 'BRL', 0.70, CURRENT_DATE),
('BRL', 'BRL', 1.00, CURRENT_DATE)
ON CONFLICT (from_currency, to_currency, date) DO NOTHING;
