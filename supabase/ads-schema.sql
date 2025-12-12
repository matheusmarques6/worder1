-- ============================================
-- WORDER - ADS INTEGRATIONS SCHEMA
-- ============================================
-- Execute este script no SQL Editor do Supabase
-- Supabase Dashboard > SQL Editor > New Query > Paste > Run

-- ============================================
-- 1. META (FACEBOOK) ADS
-- ============================================

-- Meta Ad Accounts
CREATE TABLE IF NOT EXISTS meta_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  ad_account_name TEXT,
  business_id TEXT,
  business_name TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT true,
  token_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, ad_account_id)
);

-- Meta Campaigns
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meta_account_id UUID REFERENCES meta_accounts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  objective TEXT,
  daily_budget DECIMAL(12, 2),
  lifetime_budget DECIMAL(12, 2),
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  created_time TIMESTAMPTZ,
  updated_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, campaign_id)
);

-- Meta Ad Sets
CREATE TABLE IF NOT EXISTS meta_adsets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  adset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  targeting JSONB,
  daily_budget DECIMAL(12, 2),
  lifetime_budget DECIMAL(12, 2),
  bid_amount DECIMAL(12, 2),
  optimization_goal TEXT,
  billing_event TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, adset_id)
);

-- Meta Ads
CREATE TABLE IF NOT EXISTS meta_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  adset_id UUID REFERENCES meta_adsets(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  creative_id TEXT,
  preview_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, ad_id)
);

-- Meta Daily Insights (aggregated metrics)
CREATE TABLE IF NOT EXISTS meta_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  level TEXT DEFAULT 'account', -- account, campaign, adset, ad
  
  -- Spend & Budget
  spend DECIMAL(12, 2) DEFAULT 0,
  
  -- Reach & Impressions
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  frequency DECIMAL(10, 4) DEFAULT 0,
  
  -- Engagement
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(10, 4) DEFAULT 0,
  cpc DECIMAL(12, 4) DEFAULT 0,
  cpm DECIMAL(12, 4) DEFAULT 0,
  
  -- Conversions
  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(12, 2) DEFAULT 0,
  cost_per_conversion DECIMAL(12, 4) DEFAULT 0,
  roas DECIMAL(10, 4) DEFAULT 0,
  
  -- Video
  video_views INTEGER DEFAULT 0,
  video_thruplay INTEGER DEFAULT 0,
  
  -- Actions breakdown
  actions JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, date, level, campaign_id, adset_id, ad_id)
);

-- ============================================
-- 2. GOOGLE ADS
-- ============================================

-- Google Ads Accounts
CREATE TABLE IF NOT EXISTS google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  manager_customer_id TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_id)
);

-- Google Ads Campaigns
CREATE TABLE IF NOT EXISTS google_ads_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  google_account_id UUID REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  campaign_type TEXT, -- SEARCH, DISPLAY, SHOPPING, VIDEO, PERFORMANCE_MAX
  bidding_strategy TEXT,
  budget_amount DECIMAL(12, 2),
  budget_type TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, campaign_id)
);

-- Google Ads Daily Metrics
CREATE TABLE IF NOT EXISTS google_ads_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  campaign_id TEXT,
  ad_group_id TEXT,
  level TEXT DEFAULT 'account', -- account, campaign, ad_group
  
  -- Spend
  cost DECIMAL(12, 2) DEFAULT 0,
  
  -- Performance
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(10, 4) DEFAULT 0,
  average_cpc DECIMAL(12, 4) DEFAULT 0,
  average_cpm DECIMAL(12, 4) DEFAULT 0,
  
  -- Conversions
  conversions DECIMAL(12, 2) DEFAULT 0,
  conversions_value DECIMAL(12, 2) DEFAULT 0,
  cost_per_conversion DECIMAL(12, 4) DEFAULT 0,
  conversion_rate DECIMAL(10, 4) DEFAULT 0,
  roas DECIMAL(10, 4) DEFAULT 0,
  
  -- Quality
  search_impression_share DECIMAL(10, 4),
  quality_score INTEGER,
  
  -- Video (for YouTube)
  video_views INTEGER DEFAULT 0,
  video_view_rate DECIMAL(10, 4) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, date, level, campaign_id, ad_group_id)
);

-- ============================================
-- 3. TIKTOK ADS
-- ============================================

-- TikTok Ad Accounts
CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  advertiser_name TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT true,
  token_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, advertiser_id)
);

-- TikTok Campaigns
CREATE TABLE IF NOT EXISTS tiktok_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tiktok_account_id UUID REFERENCES tiktok_accounts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  objective_type TEXT,
  budget DECIMAL(12, 2),
  budget_mode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, campaign_id)
);

-- TikTok Ad Groups
CREATE TABLE IF NOT EXISTS tiktok_adgroups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES tiktok_campaigns(id) ON DELETE CASCADE,
  adgroup_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  placement_type TEXT,
  budget DECIMAL(12, 2),
  bid_type TEXT,
  bid_amount DECIMAL(12, 2),
  optimization_goal TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, adgroup_id)
);

-- TikTok Daily Metrics
CREATE TABLE IF NOT EXISTS tiktok_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  campaign_id TEXT,
  adgroup_id TEXT,
  ad_id TEXT,
  level TEXT DEFAULT 'advertiser', -- advertiser, campaign, adgroup, ad
  
  -- Spend
  spend DECIMAL(12, 2) DEFAULT 0,
  
  -- Performance
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(10, 4) DEFAULT 0,
  cpc DECIMAL(12, 4) DEFAULT 0,
  cpm DECIMAL(12, 4) DEFAULT 0,
  
  -- Video
  video_views INTEGER DEFAULT 0,
  video_watched_2s INTEGER DEFAULT 0,
  video_watched_6s INTEGER DEFAULT 0,
  average_video_play DECIMAL(10, 2) DEFAULT 0,
  video_play_actions INTEGER DEFAULT 0,
  
  -- Engagement
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  follows INTEGER DEFAULT 0,
  
  -- Conversions
  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(12, 2) DEFAULT 0,
  cost_per_conversion DECIMAL(12, 4) DEFAULT 0,
  conversion_rate DECIMAL(10, 4) DEFAULT 0,
  roas DECIMAL(10, 4) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, date, level, campaign_id, adgroup_id, ad_id)
);

-- ============================================
-- 4. AGGREGATED DASHBOARD METRICS
-- ============================================

-- Daily aggregated metrics for fast dashboard loading
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Revenue (Shopify)
  gross_revenue DECIMAL(12, 2) DEFAULT 0,
  net_revenue DECIMAL(12, 2) DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  average_order_value DECIMAL(12, 2) DEFAULT 0,
  units_sold INTEGER DEFAULT 0,
  
  -- Costs
  product_cost DECIMAL(12, 2) DEFAULT 0,
  shipping_cost DECIMAL(12, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  
  -- Marketing Spend (sum of all ad platforms)
  marketing_spend DECIMAL(12, 2) DEFAULT 0,
  meta_spend DECIMAL(12, 2) DEFAULT 0,
  google_spend DECIMAL(12, 2) DEFAULT 0,
  tiktok_spend DECIMAL(12, 2) DEFAULT 0,
  
  -- Marketing Performance
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  blended_cpa DECIMAL(12, 4) DEFAULT 0,
  blended_roas DECIMAL(10, 4) DEFAULT 0,
  
  -- Email (Klaviyo)
  email_revenue DECIMAL(12, 2) DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  
  -- Profit
  gross_profit DECIMAL(12, 2) DEFAULT 0,
  net_profit DECIMAL(12, 2) DEFAULT 0,
  profit_margin DECIMAL(10, 4) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, date)
);

-- ============================================
-- 5. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meta_insights_org_date ON meta_insights(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON meta_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_google_metrics_org_date ON google_ads_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_google_metrics_campaign ON google_ads_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_metrics_org_date ON tiktok_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_tiktok_metrics_campaign ON tiktok_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_org_date ON daily_metrics(organization_id, date);

-- ============================================
-- 6. RLS POLICIES
-- ============================================

ALTER TABLE meta_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_adgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies for all ads tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'meta_accounts', 'meta_campaigns', 'meta_adsets', 'meta_ads', 'meta_insights',
    'google_ads_accounts', 'google_ads_campaigns', 'google_ads_metrics',
    'tiktok_accounts', 'tiktok_campaigns', 'tiktok_adgroups', 'tiktok_metrics',
    'daily_metrics'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can view %I in their org" ON %I;
      CREATE POLICY "Users can view %I in their org" ON %I
      FOR SELECT USING (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);
    
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can insert %I in their org" ON %I;
      CREATE POLICY "Users can insert %I in their org" ON %I
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);
    
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can update %I in their org" ON %I;
      CREATE POLICY "Users can update %I in their org" ON %I
      FOR UPDATE USING (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);
    
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can delete %I in their org" ON %I;
      CREATE POLICY "Users can delete %I in their org" ON %I
      FOR DELETE USING (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ============================================
-- 7. HELPER FUNCTIONS
-- ============================================

-- Function to get aggregated ads metrics for a date range
CREATE OR REPLACE FUNCTION get_ads_metrics(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  platform TEXT,
  spend DECIMAL,
  impressions BIGINT,
  clicks BIGINT,
  conversions BIGINT,
  conversion_value DECIMAL,
  cpa DECIMAL,
  roas DECIMAL,
  ctr DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  -- Meta Ads
  SELECT 
    'meta'::TEXT as platform,
    COALESCE(SUM(m.spend), 0) as spend,
    COALESCE(SUM(m.impressions), 0)::BIGINT as impressions,
    COALESCE(SUM(m.clicks), 0)::BIGINT as clicks,
    COALESCE(SUM(m.conversions), 0)::BIGINT as conversions,
    COALESCE(SUM(m.conversion_value), 0) as conversion_value,
    CASE WHEN SUM(m.conversions) > 0 THEN SUM(m.spend) / SUM(m.conversions) ELSE 0 END as cpa,
    CASE WHEN SUM(m.spend) > 0 THEN SUM(m.conversion_value) / SUM(m.spend) ELSE 0 END as roas,
    CASE WHEN SUM(m.impressions) > 0 THEN (SUM(m.clicks)::DECIMAL / SUM(m.impressions)) * 100 ELSE 0 END as ctr
  FROM meta_insights m
  WHERE m.organization_id = p_organization_id
    AND m.date BETWEEN p_start_date AND p_end_date
    AND m.level = 'account'
  
  UNION ALL
  
  -- Google Ads
  SELECT 
    'google'::TEXT as platform,
    COALESCE(SUM(g.cost), 0) as spend,
    COALESCE(SUM(g.impressions), 0)::BIGINT as impressions,
    COALESCE(SUM(g.clicks), 0)::BIGINT as clicks,
    COALESCE(SUM(g.conversions), 0)::BIGINT as conversions,
    COALESCE(SUM(g.conversions_value), 0) as conversion_value,
    CASE WHEN SUM(g.conversions) > 0 THEN SUM(g.cost) / SUM(g.conversions) ELSE 0 END as cpa,
    CASE WHEN SUM(g.cost) > 0 THEN SUM(g.conversions_value) / SUM(g.cost) ELSE 0 END as roas,
    CASE WHEN SUM(g.impressions) > 0 THEN (SUM(g.clicks)::DECIMAL / SUM(g.impressions)) * 100 ELSE 0 END as ctr
  FROM google_ads_metrics g
  WHERE g.organization_id = p_organization_id
    AND g.date BETWEEN p_start_date AND p_end_date
    AND g.level = 'account'
  
  UNION ALL
  
  -- TikTok Ads
  SELECT 
    'tiktok'::TEXT as platform,
    COALESCE(SUM(t.spend), 0) as spend,
    COALESCE(SUM(t.impressions), 0)::BIGINT as impressions,
    COALESCE(SUM(t.clicks), 0)::BIGINT as clicks,
    COALESCE(SUM(t.conversions), 0)::BIGINT as conversions,
    COALESCE(SUM(t.conversion_value), 0) as conversion_value,
    CASE WHEN SUM(t.conversions) > 0 THEN SUM(t.spend) / SUM(t.conversions) ELSE 0 END as cpa,
    CASE WHEN SUM(t.spend) > 0 THEN SUM(t.conversion_value) / SUM(t.spend) ELSE 0 END as roas,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.clicks)::DECIMAL / SUM(t.impressions)) * 100 ELSE 0 END as ctr
  FROM tiktok_metrics t
  WHERE t.organization_id = p_organization_id
    AND t.date BETWEEN p_start_date AND p_end_date
    AND t.level = 'advertiser';
END;
$$ LANGUAGE plpgsql;

-- Function to update daily aggregated metrics
CREATE OR REPLACE FUNCTION update_daily_metrics(
  p_organization_id UUID,
  p_date DATE
)
RETURNS VOID AS $$
DECLARE
  v_meta_spend DECIMAL := 0;
  v_google_spend DECIMAL := 0;
  v_tiktok_spend DECIMAL := 0;
  v_total_impressions INTEGER := 0;
  v_total_clicks INTEGER := 0;
  v_total_conversions INTEGER := 0;
BEGIN
  -- Get Meta spend
  SELECT COALESCE(SUM(spend), 0) INTO v_meta_spend
  FROM meta_insights
  WHERE organization_id = p_organization_id
    AND date = p_date
    AND level = 'account';
  
  -- Get Google spend
  SELECT COALESCE(SUM(cost), 0) INTO v_google_spend
  FROM google_ads_metrics
  WHERE organization_id = p_organization_id
    AND date = p_date
    AND level = 'account';
  
  -- Get TikTok spend
  SELECT COALESCE(SUM(spend), 0) INTO v_tiktok_spend
  FROM tiktok_metrics
  WHERE organization_id = p_organization_id
    AND date = p_date
    AND level = 'advertiser';
  
  -- Update daily_metrics
  INSERT INTO daily_metrics (
    organization_id,
    date,
    marketing_spend,
    meta_spend,
    google_spend,
    tiktok_spend,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_date,
    v_meta_spend + v_google_spend + v_tiktok_spend,
    v_meta_spend,
    v_google_spend,
    v_tiktok_spend,
    NOW()
  )
  ON CONFLICT (organization_id, date)
  DO UPDATE SET
    marketing_spend = EXCLUDED.marketing_spend,
    meta_spend = EXCLUDED.meta_spend,
    google_spend = EXCLUDED.google_spend,
    tiktok_spend = EXCLUDED.tiktok_spend,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DONE!
-- ============================================
