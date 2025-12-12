-- ============================================
-- WORDER SAAS - COMPLETE DATABASE SCHEMA
-- ============================================
-- Execute este script no SQL Editor do Supabase
-- Supabase Dashboard > SQL Editor > New Query > Paste > Run

-- ============================================
-- 1. EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- 2. CUSTOM TYPES
-- ============================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('starter', 'growth', 'enterprise');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deal_status AS ENUM ('open', 'won', 'lost');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE automation_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 3. ORGANIZATIONS (Workspaces)
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  plan plan_type DEFAULT 'starter',
  plan_contacts_limit INTEGER DEFAULT 1000,
  plan_emails_limit INTEGER DEFAULT 10000,
  plan_whatsapp_limit INTEGER DEFAULT 1000,
  billing_email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. USER PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED,
  avatar_url TEXT,
  phone TEXT,
  role user_role DEFAULT 'member',
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  preferences JSONB DEFAULT '{"theme": "dark", "notifications": true}',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. ORGANIZATION MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role DEFAULT 'member',
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- ============================================
-- 6. SHOPIFY INTEGRATION
-- ============================================
CREATE TABLE IF NOT EXISTS shopify_stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  shop_name TEXT,
  shop_email TEXT,
  access_token TEXT NOT NULL,
  api_secret TEXT,
  scope TEXT,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT,
  is_active BOOLEAN DEFAULT true,
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(12, 2) DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  webhook_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, shop_domain)
);

-- ============================================
-- 7. KLAVIYO INTEGRATION
-- ============================================
CREATE TABLE IF NOT EXISTS klaviyo_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  public_api_key TEXT,
  account_id TEXT,
  account_name TEXT,
  is_active BOOLEAN DEFAULT true,
  total_profiles INTEGER DEFAULT 0,
  total_lists INTEGER DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- ============================================
-- 8. WHATSAPP INTEGRATION
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  quality_rating TEXT DEFAULT 'GREEN',
  messaging_limit INTEGER DEFAULT 1000,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. CONTACTS (CRM)
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED,
  company TEXT,
  position TEXT,
  avatar_url TEXT,
  source TEXT DEFAULT 'manual',
  
  -- External IDs
  shopify_customer_id TEXT,
  klaviyo_profile_id TEXT,
  
  -- Metrics
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12, 2) DEFAULT 0,
  average_order_value DECIMAL(12, 2) DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  lifetime_value DECIMAL(12, 2) DEFAULT 0,
  
  -- Segmentation
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  
  -- Subscriptions
  is_subscribed_email BOOLEAN DEFAULT true,
  is_subscribed_sms BOOLEAN DEFAULT false,
  is_subscribed_whatsapp BOOLEAN DEFAULT false,
  email_consent_at TIMESTAMPTZ,
  sms_consent_at TIMESTAMPTZ,
  whatsapp_consent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for contact search
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING gin(
  (to_tsvector('portuguese', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '')))
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin(tags);

-- ============================================
-- 10. PIPELINES (CRM)
-- ============================================
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8b5cf6',
  is_default BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. PIPELINE STAGES
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8b5cf6',
  position INTEGER NOT NULL DEFAULT 0,
  probability INTEGER DEFAULT 50,
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. DEALS
-- ============================================
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  value DECIMAL(12, 2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  
  status deal_status DEFAULT 'open',
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  position INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);

-- ============================================
-- 13. DEAL ACTIVITIES
-- ============================================
CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('note', 'email', 'call', 'meeting', 'task', 'stage_change', 'value_change')),
  title TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 14. WHATSAPP CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  wa_conversation_id TEXT,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_org ON whatsapp_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_phone ON whatsapp_conversations(phone_number);

-- ============================================
-- 15. WHATSAPP MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  
  direction message_direction NOT NULL,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'template', 'interactive', 'location', 'sticker')),
  
  content TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  
  template_name TEXT,
  template_params JSONB,
  
  status message_status DEFAULT 'sent',
  error_message TEXT,
  
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_status ON whatsapp_messages(status);

-- ============================================
-- 16. WHATSAPP TEMPLATES
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  
  wa_template_id TEXT,
  name TEXT NOT NULL,
  language TEXT DEFAULT 'pt_BR',
  category TEXT,
  status TEXT DEFAULT 'PENDING',
  
  header_type TEXT,
  header_content TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB DEFAULT '[]',
  
  variables TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 17. AUTOMATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  status automation_status DEFAULT 'draft',
  
  -- Trigger configuration
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  
  -- Flow nodes and edges (for visual builder)
  nodes JSONB DEFAULT '[]',
  edges JSONB DEFAULT '[]',
  
  -- Stats
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  total_revenue DECIMAL(12, 2) DEFAULT 0,
  
  last_run_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_org ON automations(organization_id);
CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);

-- ============================================
-- 18. AUTOMATION RUNS
-- ============================================
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_node_id TEXT,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 19. AUTOMATION RUN STEPS
-- ============================================
CREATE TABLE IF NOT EXISTS automation_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 20. DAILY METRICS
-- ============================================
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Revenue
  revenue DECIMAL(12, 2) DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  average_order_value DECIMAL(12, 2) DEFAULT 0,
  
  -- Email
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  emails_unsubscribed INTEGER DEFAULT 0,
  email_revenue DECIMAL(12, 2) DEFAULT 0,
  
  -- WhatsApp
  whatsapp_sent INTEGER DEFAULT 0,
  whatsapp_delivered INTEGER DEFAULT 0,
  whatsapp_read INTEGER DEFAULT 0,
  whatsapp_received INTEGER DEFAULT 0,
  
  -- Contacts
  new_contacts INTEGER DEFAULT 0,
  total_contacts INTEGER DEFAULT 0,
  
  -- Automations
  automations_triggered INTEGER DEFAULT 0,
  automations_completed INTEGER DEFAULT 0,
  automation_revenue DECIMAL(12, 2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_org_date ON daily_metrics(organization_id, date);

-- ============================================
-- 21. CAMPAIGN METRICS (Klaviyo sync)
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  klaviyo_campaign_id TEXT,
  name TEXT NOT NULL,
  subject TEXT,
  
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  
  open_rate DECIMAL(5, 2) DEFAULT 0,
  click_rate DECIMAL(5, 2) DEFAULT 0,
  
  revenue DECIMAL(12, 2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 22. FLOW METRICS (Klaviyo sync)
-- ============================================
CREATE TABLE IF NOT EXISTS flow_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  klaviyo_flow_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'manual',
  
  triggered INTEGER DEFAULT 0,
  received INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  
  revenue DECIMAL(12, 2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 23. REPORTS
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('email', 'ecommerce', 'automation', 'crm', 'whatsapp', 'custom')),
  
  config JSONB DEFAULT '{}',
  
  schedule TEXT DEFAULT 'none' CHECK (schedule IN ('none', 'daily', 'weekly', 'monthly')),
  schedule_time TIME,
  schedule_day INTEGER,
  recipients TEXT[] DEFAULT '{}',
  
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 24. API KEYS
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  
  permissions TEXT[] DEFAULT '{}',
  
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 25. WEBHOOKS
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 26. ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  
  old_data JSONB,
  new_data JSONB,
  
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- ============================================
-- 27. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organization
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Organization members policies
CREATE POLICY "Members can view own organization" ON organization_members
  FOR SELECT USING (user_id = auth.uid());

-- Generic organization-based policies (apply to most tables)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'contacts', 'pipelines', 'deals', 'whatsapp_conversations', 
    'whatsapp_templates', 'automations', 'daily_metrics', 
    'campaign_metrics', 'flow_metrics', 'reports', 'api_keys', 
    'webhooks', 'activity_log', 'shopify_stores', 'klaviyo_accounts',
    'whatsapp_accounts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Select policy
    EXECUTE format('
      CREATE POLICY "Users can view %I in their org" ON %I
      FOR SELECT USING (organization_id = get_user_organization_id())
    ', tbl, tbl);
    
    -- Insert policy
    EXECUTE format('
      CREATE POLICY "Users can insert %I in their org" ON %I
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id())
    ', tbl, tbl);
    
    -- Update policy
    EXECUTE format('
      CREATE POLICY "Users can update %I in their org" ON %I
      FOR UPDATE USING (organization_id = get_user_organization_id())
    ', tbl, tbl);
    
    -- Delete policy (admin/owner only)
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

-- Pipeline stages policies (based on pipeline)
CREATE POLICY "Users can view pipeline stages" ON pipeline_stages
  FOR SELECT USING (
    pipeline_id IN (SELECT id FROM pipelines WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can manage pipeline stages" ON pipeline_stages
  FOR ALL USING (
    pipeline_id IN (SELECT id FROM pipelines WHERE organization_id = get_user_organization_id())
  );

-- Deal activities policies
CREATE POLICY "Users can view deal activities" ON deal_activities
  FOR SELECT USING (
    deal_id IN (SELECT id FROM deals WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can manage deal activities" ON deal_activities
  FOR ALL USING (
    deal_id IN (SELECT id FROM deals WHERE organization_id = get_user_organization_id())
  );

-- WhatsApp messages policies
CREATE POLICY "Users can view messages" ON whatsapp_messages
  FOR SELECT USING (
    conversation_id IN (SELECT id FROM whatsapp_conversations WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can manage messages" ON whatsapp_messages
  FOR ALL USING (
    conversation_id IN (SELECT id FROM whatsapp_conversations WHERE organization_id = get_user_organization_id())
  );

-- Automation runs policies
CREATE POLICY "Users can view automation runs" ON automation_runs
  FOR SELECT USING (
    automation_id IN (SELECT id FROM automations WHERE organization_id = get_user_organization_id())
  );

-- Automation run steps policies
CREATE POLICY "Users can view run steps" ON automation_run_steps
  FOR SELECT USING (
    run_id IN (
      SELECT ar.id FROM automation_runs ar
      JOIN automations a ON ar.automation_id = a.id
      WHERE a.organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 28. FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'organizations', 'profiles', 'shopify_stores', 'klaviyo_accounts',
    'whatsapp_accounts', 'contacts', 'pipelines', 'deals',
    'whatsapp_conversations', 'whatsapp_templates', 'automations',
    'campaign_metrics', 'flow_metrics', 'reports', 'webhooks'
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

-- Create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Create organization for new user
  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', NEW.email),
    LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g')) || '-' || SUBSTRING(NEW.id::TEXT, 1, 8)
  )
  RETURNING id INTO org_id;
  
  -- Create profile
  INSERT INTO profiles (id, email, first_name, last_name, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    org_id,
    'owner'
  );
  
  -- Add as organization member
  INSERT INTO organization_members (organization_id, user_id, role, joined_at)
  VALUES (org_id, NEW.id, 'owner', NOW());
  
  -- Create default pipeline
  INSERT INTO pipelines (organization_id, name, is_default, position)
  VALUES (org_id, 'Sales Pipeline', true, 0);
  
  -- Create default pipeline stages
  INSERT INTO pipeline_stages (pipeline_id, name, color, position, probability, is_won, is_lost)
  SELECT 
    p.id,
    s.name,
    s.color,
    s.position,
    s.probability,
    s.is_won,
    s.is_lost
  FROM pipelines p,
  (VALUES 
    ('Lead', '#6366f1', 0, 10, false, false),
    ('Qualified', '#8b5cf6', 1, 25, false, false),
    ('Proposal', '#a855f7', 2, 50, false, false),
    ('Negotiation', '#f59e0b', 3, 75, false, false),
    ('Closed Won', '#22c55e', 4, 100, true, false),
    ('Closed Lost', '#ef4444', 5, 0, false, true)
  ) AS s(name, color, position, probability, is_won, is_lost)
  WHERE p.organization_id = org_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Update contact metrics from deals
CREATE OR REPLACE FUNCTION update_contact_from_deal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
    UPDATE contacts
    SET 
      total_orders = total_orders + 1,
      total_spent = total_spent + NEW.value,
      last_order_at = NOW(),
      lifetime_value = lifetime_value + NEW.value
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contact_on_deal_won
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_from_deal();

-- Update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ============================================
-- 29. STORAGE BUCKETS
-- ============================================
-- Run these in Supabase Dashboard > Storage

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES 
--   ('avatars', 'avatars', true),
--   ('attachments', 'attachments', false),
--   ('exports', 'exports', false);

-- ============================================
-- 30. DONE!
-- ============================================
-- Schema created successfully!
-- Now configure your environment variables:
--
-- NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
-- NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
-- SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
