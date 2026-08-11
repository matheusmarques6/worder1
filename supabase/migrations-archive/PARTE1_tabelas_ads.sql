-- ============================================
-- PARTE 1: TABELAS DE ADS (Google, Meta, TikTok)
-- Execute esta parte primeiro
-- ============================================

-- Habilitar extensão UUID se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. GOOGLE ADS INTEGRATION
-- ============================================

CREATE TABLE IF NOT EXISTS google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS google_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  google_ads_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  google_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  campaign_type TEXT,
  status TEXT DEFAULT 'ENABLED',
  budget_amount DECIMAL(12, 2),
  budget_type TEXT,
  bidding_strategy TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS google_ads_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_group_id UUID NOT NULL REFERENCES google_ads_ad_groups(id) ON DELETE CASCADE,
  google_keyword_id TEXT,
  keyword_text TEXT NOT NULL,
  match_type TEXT,
  status TEXT DEFAULT 'ENABLED',
  quality_score INTEGER,
  cpc_bid DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_ads_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  google_ads_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES google_ads_campaigns(id) ON DELETE CASCADE,
  ad_group_id UUID REFERENCES google_ads_ad_groups(id) ON DELETE SET NULL,
  keyword_id UUID REFERENCES google_ads_keywords(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cost DECIMAL(12, 2) DEFAULT 0,
  conversions DECIMAL(12, 2) DEFAULT 0,
  conversion_value DECIMAL(12, 2) DEFAULT 0,
  ctr DECIMAL(8, 4),
  cpc DECIMAL(10, 2),
  cpa DECIMAL(10, 2),
  roas DECIMAL(10, 2),
  quality_score INTEGER,
  impression_share DECIMAL(8, 4),
  avg_position DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_metrics_org_date ON google_ads_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_google_ads_metrics_campaign ON google_ads_metrics(campaign_id, date);

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

CREATE TABLE IF NOT EXISTS google_ads_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
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
  organization_id UUID NOT NULL,
  account_id TEXT NOT NULL,
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
  organization_id UUID NOT NULL,
  meta_ads_account_id UUID REFERENCES meta_ads_accounts(id) ON DELETE CASCADE,
  meta_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective TEXT,
  status TEXT DEFAULT 'ACTIVE',
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
  organization_id UUID NOT NULL,
  meta_ads_account_id UUID REFERENCES meta_ads_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES meta_ads_campaigns(id) ON DELETE CASCADE,
  adset_id UUID REFERENCES meta_ads_adsets(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES meta_ads_ads(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(12, 2) DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  purchase_value DECIMAL(12, 2) DEFAULT 0,
  leads INTEGER DEFAULT 0,
  add_to_cart INTEGER DEFAULT 0,
  initiate_checkout INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  video_views_25 INTEGER DEFAULT 0,
  video_views_50 INTEGER DEFAULT 0,
  video_views_75 INTEGER DEFAULT 0,
  video_views_100 INTEGER DEFAULT 0,
  cpm DECIMAL(10, 2),
  cpc DECIMAL(10, 2),
  ctr DECIMAL(8, 4),
  roas DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_metrics_org_date ON meta_ads_metrics(organization_id, date);

-- ============================================
-- 3. TIKTOK ADS INTEGRATION
-- ============================================

CREATE TABLE IF NOT EXISTS tiktok_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
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
  organization_id UUID NOT NULL,
  tiktok_ads_account_id UUID REFERENCES tiktok_ads_accounts(id) ON DELETE CASCADE,
  tiktok_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective_type TEXT,
  status TEXT DEFAULT 'ENABLE',
  budget DECIMAL(12, 2),
  budget_mode TEXT,
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
  organization_id UUID NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_ads_metrics_org_date ON tiktok_ads_metrics(organization_id, date);
