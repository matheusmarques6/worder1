-- ============================================
-- WORDER - TABELAS ADICIONAIS
-- Google Ads, Meta Ads, TikTok Ads, Help/FAQ
-- ============================================

-- ============================================
-- 1. GOOGLE ADS INTEGRATION
-- ============================================

-- Contas do Google Ads
CREATE TABLE IF NOT EXISTS google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL, -- Google Ads Customer ID (xxx-xxx-xxxx)
  account_name TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  refresh_token TEXT,
  access_token TEXT,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_id)
);

-- Campanhas do Google Ads
CREATE TABLE IF NOT EXISTS google_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  google_ads_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  google_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  campaign_type TEXT, -- SEARCH, SHOPPING, DISPLAY, VIDEO, PERFORMANCE_MAX
  status TEXT DEFAULT 'ENABLED', -- ENABLED, PAUSED, REMOVED
  budget_amount DECIMAL(12, 2),
  budget_type TEXT, -- DAILY, TOTAL
  bidding_strategy TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grupos de Anúncios
CREATE TABLE IF NOT EXISTS google_ads_ad_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES google_ads_campaigns(id) ON DELETE CASCADE,
  google_ad_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'ENABLED',
  cpc_bid DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keywords
CREATE TABLE IF NOT EXISTS google_ads_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_group_id UUID NOT NULL REFERENCES google_ads_ad_groups(id) ON DELETE CASCADE,
  google_keyword_id TEXT,
  keyword_text TEXT NOT NULL,
  match_type TEXT, -- EXACT, PHRASE, BROAD
  status TEXT DEFAULT 'ENABLED',
  quality_score INTEGER,
  cpc_bid DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Métricas do Google Ads (dados diários)
CREATE TABLE IF NOT EXISTS google_ads_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  google_ads_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES google_ads_campaigns(id) ON DELETE CASCADE,
  ad_group_id UUID REFERENCES google_ads_ad_groups(id) ON DELETE SET NULL,
  keyword_id UUID REFERENCES google_ads_keywords(id) ON DELETE SET NULL,
  date DATE NOT NULL,

  -- Métricas de Performance
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost DECIMAL(12, 2) DEFAULT 0,
  conversions DECIMAL(12, 2) DEFAULT 0,
  conversion_value DECIMAL(12, 2) DEFAULT 0,

  -- Métricas Calculadas (podem ser armazenadas ou calculadas)
  ctr DECIMAL(8, 4), -- Click Through Rate (%)
  cpc DECIMAL(10, 2), -- Cost Per Click
  cpa DECIMAL(10, 2), -- Cost Per Acquisition
  roas DECIMAL(10, 2), -- Return on Ad Spend

  -- Métricas de Qualidade
  quality_score INTEGER,
  impression_share DECIMAL(8, 4),
  avg_position DECIMAL(5, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, ad_group_id, keyword_id, date)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_metrics_org_date ON google_ads_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_google_ads_metrics_campaign ON google_ads_metrics(campaign_id, date);

-- Termos de Pesquisa
CREATE TABLE IF NOT EXISTS google_ads_search_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES google_ads_campaigns(id) ON DELETE CASCADE,
  search_term TEXT NOT NULL,
  keyword_text TEXT,
  match_type TEXT,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost DECIMAL(12, 2) DEFAULT 0,
  conversions DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Produtos do Shopping
CREATE TABLE IF NOT EXISTS google_ads_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  google_ads_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  product_id TEXT,
  title TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  item_group_id TEXT,
  price DECIMAL(12, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Métricas de Produtos Shopping
CREATE TABLE IF NOT EXISTS google_ads_product_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES google_ads_products(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost DECIMAL(12, 2) DEFAULT 0,
  conversions DECIMAL(12, 2) DEFAULT 0,
  revenue DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, date)
);

-- ============================================
-- 2. META/FACEBOOK ADS INTEGRATION
-- ============================================

CREATE TABLE IF NOT EXISTS meta_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL, -- Meta Ad Account ID
  account_name TEXT,
  business_id TEXT,
  access_token TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, account_id)
);

CREATE TABLE IF NOT EXISTS meta_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meta_ads_account_id UUID REFERENCES meta_ads_accounts(id) ON DELETE CASCADE,
  meta_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective TEXT, -- AWARENESS, TRAFFIC, ENGAGEMENT, LEADS, APP_PROMOTION, SALES
  status TEXT DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, DELETED, ARCHIVED
  daily_budget DECIMAL(12, 2),
  lifetime_budget DECIMAL(12, 2),
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_ads_adsets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES meta_ads_campaigns(id) ON DELETE CASCADE,
  meta_adset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  optimization_goal TEXT,
  billing_event TEXT,
  bid_amount DECIMAL(12, 2),
  targeting JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_ads_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adset_id UUID NOT NULL REFERENCES meta_ads_adsets(id) ON DELETE CASCADE,
  meta_ad_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  creative_id TEXT,
  preview_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_ads_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meta_ads_account_id UUID REFERENCES meta_ads_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES meta_ads_campaigns(id) ON DELETE CASCADE,
  adset_id UUID REFERENCES meta_ads_adsets(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES meta_ads_ads(id) ON DELETE SET NULL,
  date DATE NOT NULL,

  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(12, 2) DEFAULT 0,

  -- Conversões
  purchases INTEGER DEFAULT 0,
  purchase_value DECIMAL(12, 2) DEFAULT 0,
  leads INTEGER DEFAULT 0,
  add_to_cart INTEGER DEFAULT 0,
  initiate_checkout INTEGER DEFAULT 0,

  -- Métricas de Vídeo
  video_views INTEGER DEFAULT 0,
  video_views_25 INTEGER DEFAULT 0,
  video_views_50 INTEGER DEFAULT 0,
  video_views_75 INTEGER DEFAULT 0,
  video_views_100 INTEGER DEFAULT 0,

  -- Métricas Calculadas
  cpm DECIMAL(10, 2),
  cpc DECIMAL(10, 2),
  ctr DECIMAL(8, 4),
  roas DECIMAL(10, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, adset_id, ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_metrics_org_date ON meta_ads_metrics(organization_id, date);

-- ============================================
-- 3. TIKTOK ADS INTEGRATION
-- ============================================

CREATE TABLE IF NOT EXISTS tiktok_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  advertiser_id TEXT NOT NULL,
  advertiser_name TEXT,
  access_token TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, advertiser_id)
);

CREATE TABLE IF NOT EXISTS tiktok_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tiktok_ads_account_id UUID REFERENCES tiktok_ads_accounts(id) ON DELETE CASCADE,
  tiktok_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective_type TEXT,
  status TEXT DEFAULT 'ENABLE',
  budget DECIMAL(12, 2),
  budget_mode TEXT, -- BUDGET_MODE_DAY, BUDGET_MODE_TOTAL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tiktok_ads_adgroups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES tiktok_ads_campaigns(id) ON DELETE CASCADE,
  tiktok_adgroup_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'ENABLE',
  placement_type TEXT,
  budget DECIMAL(12, 2),
  bid_type TEXT,
  bid_price DECIMAL(10, 2),
  targeting JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tiktok_ads_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tiktok_ads_account_id UUID REFERENCES tiktok_ads_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES tiktok_ads_campaigns(id) ON DELETE CASCADE,
  adgroup_id UUID REFERENCES tiktok_ads_adgroups(id) ON DELETE SET NULL,
  date DATE NOT NULL,

  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(12, 2) DEFAULT 0,

  video_views INTEGER DEFAULT 0,
  video_views_6s INTEGER DEFAULT 0,
  video_watched_25 INTEGER DEFAULT 0,
  video_watched_50 INTEGER DEFAULT 0,
  video_watched_75 INTEGER DEFAULT 0,
  video_watched_100 INTEGER DEFAULT 0,

  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(12, 2) DEFAULT 0,

  cpm DECIMAL(10, 2),
  cpc DECIMAL(10, 2),
  ctr DECIMAL(8, 4),
  cvr DECIMAL(8, 4),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, adgroup_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_ads_metrics_org_date ON tiktok_ads_metrics(organization_id, date);

-- ============================================
-- 4. CREDENTIALS TABLE (Credenciais de terceiros)
-- ============================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  type TEXT NOT NULL, -- whatsapp, email, sms, google_ads, meta_ads, tiktok_ads, http, etc
  provider TEXT, -- evolution, twilio, sendgrid, mailgun, etc

  -- Dados criptografados ou tokens
  credentials JSONB NOT NULL DEFAULT '{}', -- { api_key, secret, access_token, etc }

  -- Metadados
  metadata JSONB DEFAULT '{}', -- { phone_number, email, instance_name, etc }

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

-- Categorias de Artigos
CREATE TABLE IF NOT EXISTS help_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT, -- nome do ícone (lucide)
  color TEXT DEFAULT '#3b82f6',
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Artigos de Ajuda
CREATE TABLE IF NOT EXISTS help_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES help_categories(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT, -- Resumo curto
  content TEXT NOT NULL, -- Conteúdo em Markdown ou HTML

  -- SEO e busca
  keywords TEXT[] DEFAULT '{}',

  -- Estatísticas
  views INTEGER DEFAULT 0,
  helpful_yes INTEGER DEFAULT 0,
  helpful_no INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- Autor
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_help_articles_status ON help_articles(status);
CREATE INDEX IF NOT EXISTS idx_help_articles_search ON help_articles USING gin(
  to_tsvector('portuguese', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(content, ''))
);

-- FAQs (Perguntas Frequentes)
CREATE TABLE IF NOT EXISTS faq_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES help_categories(id) ON DELETE SET NULL,

  question TEXT NOT NULL,
  answer TEXT NOT NULL,

  position INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false, -- Destaque na página principal
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
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- null = para toda org

  type TEXT NOT NULL, -- info, success, warning, error, action
  title TEXT NOT NULL,
  message TEXT,

  action_url TEXT, -- link para ação
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

-- Pedidos sincronizados
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  external_id TEXT, -- shopify_order_id, etc
  order_number TEXT,

  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,

  status TEXT DEFAULT 'pending', -- pending, paid, shipped, delivered, cancelled, refunded
  financial_status TEXT, -- pending, paid, partially_paid, refunded, voided
  fulfillment_status TEXT, -- unfulfilled, partial, fulfilled

  currency TEXT DEFAULT 'BRL',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  discount_total DECIMAL(12, 2) DEFAULT 0,
  shipping_total DECIMAL(12, 2) DEFAULT 0,
  tax_total DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) DEFAULT 0,

  items JSONB DEFAULT '[]', -- [{ title, quantity, price, sku, variant_id }]

  shipping_address JSONB,
  billing_address JSONB,

  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  source TEXT DEFAULT 'shopify', -- shopify, manual, api

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

-- Carrinhos Abandonados
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  external_id TEXT, -- shopify_checkout_token, etc

  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,

  currency TEXT DEFAULT 'BRL',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) DEFAULT 0,

  items JSONB DEFAULT '[]', -- [{ title, quantity, price, sku, variant_id, image_url }]
  items_count INTEGER DEFAULT 0,

  checkout_url TEXT,
  recovery_url TEXT,

  status TEXT DEFAULT 'active', -- active, recovered, expired, converted

  -- Tracking de recuperação
  recovery_emails_sent INTEGER DEFAULT 0,
  recovery_whatsapp_sent INTEGER DEFAULT 0,
  recovery_sms_sent INTEGER DEFAULT 0,
  last_recovery_at TIMESTAMPTZ,

  recovered_at TIMESTAMPTZ,
  recovered_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  abandoned_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_org ON abandoned_carts(organization_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status ON abandoned_carts(status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_contact ON abandoned_carts(contact_id);

-- ============================================
-- 8. ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_product_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE tiktok_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_adgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. RLS POLICIES FOR NEW TABLES
-- ============================================

-- Helper para tabelas de ads com organization_id
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'google_ads_accounts', 'google_ads_metrics', 'google_ads_products',
    'meta_ads_accounts', 'meta_ads_metrics',
    'tiktok_ads_accounts', 'tiktok_ads_metrics',
    'credentials', 'notifications', 'orders', 'abandoned_carts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('
      CREATE POLICY "Users can view %I in their org" ON %I
      FOR SELECT USING (organization_id = get_user_organization_id())
    ', tbl, tbl);

    EXECUTE format('
      CREATE POLICY "Users can insert %I in their org" ON %I
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id())
    ', tbl, tbl);

    EXECUTE format('
      CREATE POLICY "Users can update %I in their org" ON %I
      FOR UPDATE USING (organization_id = get_user_organization_id())
    ', tbl, tbl);

    EXECUTE format('
      CREATE POLICY "Admins can delete %I in their org" ON %I
      FOR DELETE USING (
        organization_id = get_user_organization_id() AND
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN (''owner'', ''admin'')
        )
      )
    ', tbl, tbl);
  END LOOP;
END $$;

-- Help articles são públicos para leitura
CREATE POLICY "Anyone can view published help articles" ON help_articles
  FOR SELECT USING (status = 'published');

CREATE POLICY "Anyone can view active help categories" ON help_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view active FAQs" ON faq_items
  FOR SELECT USING (is_active = true);

-- Admins podem gerenciar help content
CREATE POLICY "Admins can manage help categories" ON help_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "Admins can manage help articles" ON help_articles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "Admins can manage FAQs" ON faq_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- ============================================
-- 10. INSERT DEFAULT HELP DATA
-- ============================================

-- Categorias de ajuda
INSERT INTO help_categories (name, slug, description, icon, color, position) VALUES
('Primeiros Passos', 'getting-started', 'Aprenda o básico sobre a plataforma', 'Rocket', '#10b981', 1),
('CRM & Contatos', 'crm-contacts', 'Gerencie seus contatos e pipeline', 'Users', '#3b82f6', 2),
('WhatsApp', 'whatsapp', 'Configuração e uso do WhatsApp Business', 'MessageCircle', '#25D366', 3),
('Email Marketing', 'email-marketing', 'Campanhas e automações de email', 'Mail', '#8b5cf6', 4),
('Automações', 'automations', 'Crie fluxos automáticos', 'Zap', '#f59e0b', 5),
('Integrações', 'integrations', 'Conecte sua loja e outras ferramentas', 'Plug', '#06b6d4', 6),
('Analytics', 'analytics', 'Relatórios e métricas', 'BarChart3', '#ec4899', 7),
('Configurações', 'settings', 'Configurações da conta e organização', 'Settings', '#6b7280', 8)
ON CONFLICT (slug) DO NOTHING;

-- FAQs iniciais
INSERT INTO faq_items (category_id, question, answer, position, is_featured)
SELECT
  c.id,
  f.question,
  f.answer,
  f.position,
  f.is_featured
FROM help_categories c,
(VALUES
  ('getting-started', 'Como faço para começar a usar a plataforma?', 'Para começar, primeiro conecte sua loja Shopify ou outra integração de e-commerce. Em seguida, configure seu WhatsApp Business e comece a criar suas automações de marketing.', 1, true),
  ('getting-started', 'Quanto tempo leva para configurar tudo?', 'A configuração básica pode ser feita em menos de 15 minutos. Conectar sua loja e WhatsApp são os primeiros passos essenciais.', 2, false),
  ('getting-started', 'Preciso de conhecimento técnico?', 'Não! Nossa plataforma foi desenvolvida para ser intuitiva. Oferecemos templates prontos e guias passo a passo.', 3, false),
  ('whatsapp', 'Como configurar o WhatsApp Business?', 'Vá em Configurações > Integrações > WhatsApp. Você pode usar a API oficial do Meta ou APIs alternativas como Evolution API.', 1, true),
  ('whatsapp', 'Posso enviar mensagens em massa?', 'Sim, mas é importante seguir as políticas do WhatsApp. Para mensagens fora da janela de 24h, use templates aprovados.', 2, false),
  ('whatsapp', 'Qual a diferença entre API oficial e não-oficial?', 'A API oficial requer aprovação da Meta e usa templates. APIs não-oficiais permitem mais flexibilidade mas podem ter riscos de bloqueio.', 3, false),
  ('automations', 'O que é uma automação?', 'Uma automação é um fluxo de ações que acontece automaticamente baseado em gatilhos, como abandono de carrinho ou novo pedido.', 1, true),
  ('automations', 'Quantas automações posso criar?', 'Depende do seu plano. O plano Starter permite até 5 automações ativas. Planos superiores têm automações ilimitadas.', 2, false),
  ('crm-contacts', 'Como importar meus contatos?', 'Você pode importar contatos via CSV, sincronizar automaticamente da Shopify ou adicionar manualmente. Vá em Contatos > Importar.', 1, true),
  ('crm-contacts', 'O que são tags e como usá-las?', 'Tags são etiquetas para organizar seus contatos. Use-as para segmentar clientes por comportamento, preferências ou status.', 2, false)
) AS f(category_slug, question, answer, position, is_featured)
WHERE c.slug = f.category_slug
ON CONFLICT DO NOTHING;

-- ============================================
-- 11. TRIGGERS FOR NEW TABLES
-- ============================================

-- Updated at triggers
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'google_ads_accounts', 'google_ads_campaigns', 'google_ads_ad_groups', 'google_ads_keywords',
    'google_ads_products', 'meta_ads_accounts', 'meta_ads_campaigns', 'meta_ads_adsets',
    'meta_ads_ads', 'tiktok_ads_accounts', 'tiktok_ads_campaigns', 'tiktok_ads_adgroups',
    'credentials', 'help_categories', 'help_articles', 'faq_items', 'orders', 'abandoned_carts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at()
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ============================================
-- 12. ENABLE REALTIME FOR KEY TABLES
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE abandoned_carts;

-- ============================================
-- DONE!
-- ============================================
