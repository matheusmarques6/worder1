-- ============================================
-- PARTE 2: HELP CENTER, CREDENCIAIS, NOTIFICAÇÕES
-- Execute esta parte após a PARTE 1
-- ============================================

-- ============================================
-- 4. CREDENTIALS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  created_by UUID,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT,
  credentials JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credentials_org_type ON credentials(organization_id, type);

-- ============================================
-- 5. HELP CENTER / FAQ
-- ============================================

CREATE TABLE IF NOT EXISTS help_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT '#3b82f6',
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES help_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  views INTEGER DEFAULT 0,
  helpful_yes INTEGER DEFAULT 0,
  helpful_no INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  author_id UUID,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_help_articles_status ON help_articles(status);

CREATE TABLE IF NOT EXISTS faq_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES help_categories(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  views INTEGER DEFAULT 0,
  helpful_yes INTEGER DEFAULT 0,
  helpful_no INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_items_category ON faq_items(category_id);

-- ============================================
-- 6. NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  user_id UUID,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,
  action_label TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id, created_at);

-- ============================================
-- 7. ORDERS & ABANDONED CARTS
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID,
  external_id TEXT,
  order_number TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  status TEXT DEFAULT 'pending',
  financial_status TEXT,
  fulfillment_status TEXT,
  currency TEXT DEFAULT 'BRL',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  discount_total DECIMAL(12, 2) DEFAULT 0,
  shipping_total DECIMAL(12, 2) DEFAULT 0,
  tax_total DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) DEFAULT 0,
  items JSONB DEFAULT '[]',
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'shopify',
  ordered_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_external ON orders(external_id);

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID,
  external_id TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  currency TEXT DEFAULT 'BRL',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) DEFAULT 0,
  items JSONB DEFAULT '[]',
  items_count INTEGER DEFAULT 0,
  checkout_url TEXT,
  recovery_url TEXT,
  status TEXT DEFAULT 'active',
  recovery_emails_sent INTEGER DEFAULT 0,
  recovery_whatsapp_sent INTEGER DEFAULT 0,
  recovery_sms_sent INTEGER DEFAULT 0,
  last_recovery_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  recovered_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  abandoned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_org ON abandoned_carts(organization_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status ON abandoned_carts(status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_contact ON abandoned_carts(contact_id);
