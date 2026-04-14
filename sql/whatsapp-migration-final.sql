-- ============================================================
-- WORDER WhatsApp System — Complete Database Migration
-- ============================================================
-- Run in Supabase SQL Editor. All statements are idempotent (IF NOT EXISTS).
-- Requires: Supabase project with auth schema, organization tables.
-- ============================================================

-- ============================================================
-- 1. WHATSAPP INSTANCES (connected phone numbers)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  display_phone TEXT,
  business_name TEXT,
  webhook_verify_token TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  tier INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 250,
  api_version TEXT NOT NULL DEFAULT 'v21.0',
  quality_rating TEXT DEFAULT 'GREEN',
  messaging_limit TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_phone ON whatsapp_instances(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org ON whatsapp_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_store ON whatsapp_instances(organization_id, store_id);

-- ============================================================
-- 2. WHATSAPP QUEUES (departments/teams)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  greeting_message TEXT,
  out_of_hours_message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queues_org ON whatsapp_queues(organization_id);

-- ============================================================
-- 3. WHATSAPP QUEUE AGENTS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_queue_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES whatsapp_queues(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_agents_unique ON whatsapp_queue_agents(queue_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_queue_agents_agent ON whatsapp_queue_agents(agent_id);

-- ============================================================
-- 4. WHATSAPP CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  contact_id UUID,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','archived')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_agent_id UUID,
  queue_id UUID REFERENCES whatsapp_queues(id) ON DELETE SET NULL,
  bot_active BOOLEAN NOT NULL DEFAULT false,
  ai_agent_id UUID,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound','outbound')),
  service_window_expires_at TIMESTAMPTZ,
  is_contact_initiated BOOLEAN NOT NULL DEFAULT true,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  origin TEXT DEFAULT 'organic' CHECK (origin IN ('organic','ad','api','campaign','automation')),
  ad_referral JSONB,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_instance_phone ON whatsapp_conversations(instance_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON whatsapp_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_store ON whatsapp_conversations(organization_id, store_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON whatsapp_conversations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON whatsapp_conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_queue ON whatsapp_conversations(queue_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON whatsapp_conversations(organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON whatsapp_conversations(contact_id);

-- ============================================================
-- 5. WHATSAPP MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wamid TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN (
    'text','image','video','audio','document','sticker','location',
    'contacts','template','interactive','reaction','order','system','note'
  )),
  content TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  media_id TEXT,
  template_name TEXT,
  template_data JSONB,
  interactive_data JSONB,
  quoted_message_id UUID,
  context_wamid TEXT,
  sender_id UUID,
  sender_name TEXT,
  sender_type TEXT DEFAULT 'agent' CHECK (sender_type IN ('agent','bot','system','contact')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed')),
  error_code TEXT,
  error_message TEXT,
  is_from_me BOOLEAN NOT NULL DEFAULT false,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON whatsapp_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_org ON whatsapp_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON whatsapp_messages(conversation_id, status);

-- ============================================================
-- 6. WHATSAPP NOTES (internal notes on conversations)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  agent_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_conversation ON whatsapp_notes(conversation_id, created_at DESC);

-- ============================================================
-- 7. WHATSAPP TRANSFERS (transfer log)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  from_agent_id UUID,
  from_agent_name TEXT,
  to_agent_id UUID,
  to_agent_name TEXT,
  from_queue_id UUID,
  to_queue_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfers_conversation ON whatsapp_transfers(conversation_id);

-- ============================================================
-- 8. WHATSAPP QUICK REPLIES
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  shortcut TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('greeting','support','sales','closing','general')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON whatsapp_quick_replies(organization_id, shortcut);
CREATE INDEX IF NOT EXISTS idx_quick_replies_org ON whatsapp_quick_replies(organization_id);

-- ============================================================
-- 9. WHATSAPP TEMPLATES (synced from Meta)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  meta_template_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL DEFAULT 'MARKETING' CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED')),
  components JSONB NOT NULL DEFAULT '[]',
  header_type TEXT CHECK (header_type IN ('TEXT','IMAGE','VIDEO','DOCUMENT', NULL)),
  body_text TEXT,
  footer_text TEXT,
  buttons JSONB DEFAULT '[]',
  variables_count INTEGER NOT NULL DEFAULT 0,
  quality_score JSONB,
  rejection_reason TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_name_lang ON whatsapp_templates(organization_id, instance_id, name, language);
CREATE INDEX IF NOT EXISTS idx_templates_org ON whatsapp_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_status ON whatsapp_templates(organization_id, status);

-- ============================================================
-- 10. WHATSAPP CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','paused','completed','failed','cancelled')),
  audience_type TEXT NOT NULL DEFAULT 'contacts' CHECK (audience_type IN ('contacts','csv','rfm','tags','pipeline')),
  audience_filters JSONB DEFAULT '{}',
  variable_mappings JSONB DEFAULT '{}',
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10,2) DEFAULT 0,
  actual_cost NUMERIC(10,2) DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org ON whatsapp_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON whatsapp_campaigns(organization_id, status);

-- ============================================================
-- 11. WHATSAPP CAMPAIGN CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  contact_id UUID,
  phone TEXT NOT NULL,
  name TEXT,
  variables JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed','opted_out')),
  wamid TEXT,
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON whatsapp_campaign_contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_phone ON whatsapp_campaign_contacts(campaign_id, phone);

-- ============================================================
-- 12. WHATSAPP AI AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'support' CHECK (agent_type IN ('sales','support','post_sale')),
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt TEXT NOT NULL DEFAULT '',
  knowledge_base TEXT DEFAULT '',
  temperature NUMERIC(2,1) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 500,
  handoff_keywords TEXT[] DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','copilot','both')),
  max_interactions INTEGER DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_conversations INTEGER NOT NULL DEFAULT 0,
  total_messages INTEGER NOT NULL DEFAULT 0,
  avg_satisfaction NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON whatsapp_ai_agents(organization_id);

-- ============================================================
-- 13. WHATSAPP OPT STATUS (consent management)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_opt_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  contact_id UUID,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'opted_in' CHECK (status IN ('opted_in','opted_out')),
  opted_in_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  opt_in_source TEXT DEFAULT 'manual' CHECK (opt_in_source IN ('manual','widget','import','api','campaign')),
  opt_out_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opt_status_org_phone ON whatsapp_opt_status(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_opt_status_org ON whatsapp_opt_status(organization_id);

-- ============================================================
-- 14. WHATSAPP BUSINESS HOURS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  out_of_hours_message TEXT DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!',
  out_of_hours_bot_id UUID REFERENCES whatsapp_ai_agents(id) ON DELETE SET NULL,
  enable_auto_reply BOOLEAN NOT NULL DEFAULT true,
  enable_bot_outside_hours BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_hours_day ON whatsapp_business_hours(organization_id, store_id, day_of_week);

-- ============================================================
-- 15. WHATSAPP CSAT RATINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_csat_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id UUID,
  agent_id UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csat_conversation ON whatsapp_csat_ratings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_csat_agent ON whatsapp_csat_ratings(agent_id);
CREATE INDEX IF NOT EXISTS idx_csat_org ON whatsapp_csat_ratings(organization_id);

-- ============================================================
-- 16. CONTACT RFM SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_rfm_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID NOT NULL,
  recency_score INTEGER NOT NULL DEFAULT 1 CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score INTEGER NOT NULL DEFAULT 1 CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score INTEGER NOT NULL DEFAULT 1 CHECK (monetary_score BETWEEN 1 AND 5),
  rfm_segment TEXT NOT NULL DEFAULT 'new',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  days_since_last_order INTEGER,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rfm_contact ON contact_rfm_scores(organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_rfm_segment ON contact_rfm_scores(organization_id, rfm_segment);

-- ============================================================
-- 17. WHATSAPP PRODUCT INTERESTS (back-in-stock)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_product_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID,
  phone TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT,
  variant_id TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_interests_product ON whatsapp_product_interests(organization_id, product_id, notified);
CREATE INDEX IF NOT EXISTS idx_product_interests_contact ON whatsapp_product_interests(contact_id);

-- ============================================================
-- 18. WHATSAPP TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_org_name ON whatsapp_tags(organization_id, name);

-- ============================================================
-- 19. WHATSAPP CONVERSATION TAGS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES whatsapp_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_tags_unique ON whatsapp_conversation_tags(conversation_id, tag_id);

-- ============================================================
-- 20. WHATSAPP CONTACT TAGS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  tag_id UUID NOT NULL REFERENCES whatsapp_tags(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_unique ON whatsapp_contact_tags(contact_id, tag_id);

-- ============================================================
-- 21. WHATSAPP WIDGET CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_widget_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  welcome_message TEXT DEFAULT 'Olá! Como posso ajudar?',
  position TEXT NOT NULL DEFAULT 'right' CHECK (position IN ('left','right')),
  color TEXT NOT NULL DEFAULT '#25D366',
  delay_seconds INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_widget_org_store ON whatsapp_widget_config(organization_id, store_id);

-- ============================================================
-- 22. WHATSAPP FLOWS (WhatsApp native forms)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  meta_flow_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','DEPRECATED','BLOCKED')),
  categories TEXT[] DEFAULT '{}',
  flow_json JSONB NOT NULL DEFAULT '{}',
  endpoint_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_flows_org ON whatsapp_flows(organization_id);

-- ============================================================
-- 23. WHATSAPP PAYMENT LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  contact_id UUID,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  payment_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_conversation ON whatsapp_payment_links(conversation_id);

-- ============================================================
-- 24. AGENT STATUS (online/away/offline)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_agent_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','away','offline')),
  active_conversations INTEGER NOT NULL DEFAULT 0,
  max_conversations INTEGER NOT NULL DEFAULT 10,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_status_unique ON whatsapp_agent_status(agent_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_org ON whatsapp_agent_status(organization_id, status);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_queue_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_opt_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_csat_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_rfm_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_product_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_widget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agent_status ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — organization isolation
-- Every table uses organization_id matched against user_organizations
-- ============================================================

-- Helper: check if user belongs to an organization
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
$$;

-- Macro for creating standard org isolation policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_instances', 'whatsapp_queues', 'whatsapp_queue_agents',
    'whatsapp_conversations', 'whatsapp_messages', 'whatsapp_notes',
    'whatsapp_transfers', 'whatsapp_quick_replies', 'whatsapp_templates',
    'whatsapp_campaigns', 'whatsapp_campaign_contacts', 'whatsapp_ai_agents',
    'whatsapp_opt_status', 'whatsapp_business_hours', 'whatsapp_csat_ratings',
    'contact_rfm_scores', 'whatsapp_product_interests', 'whatsapp_tags',
    'whatsapp_conversation_tags', 'whatsapp_contact_tags', 'whatsapp_widget_config',
    'whatsapp_flows', 'whatsapp_payment_links', 'whatsapp_agent_status'
  ]
  LOOP
    -- Drop existing policy if it exists (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', tbl);

    -- For conversation_tags and contact_tags, we need a different approach
    IF tbl IN ('whatsapp_conversation_tags', 'whatsapp_contact_tags') THEN
      IF tbl = 'whatsapp_conversation_tags' THEN
        EXECUTE format(
          'CREATE POLICY org_isolation ON %I FOR ALL USING (
            conversation_id IN (SELECT id FROM whatsapp_conversations WHERE organization_id IN (SELECT user_org_ids()))
          )', tbl
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY org_isolation ON %I FOR ALL USING (
            organization_id IN (SELECT user_org_ids())
          )', tbl
        );
      END IF;
    ELSE
      EXECUTE format(
        'CREATE POLICY org_isolation ON %I FOR ALL USING (
          organization_id IN (SELECT user_org_ids())
        )', tbl
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- ENABLE REALTIME for conversation/message/note tables
-- ============================================================
ALTER TABLE whatsapp_conversations REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_messages REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_notes REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_agent_status REPLICA IDENTITY FULL;

-- Enable Supabase Realtime (publication)
DO $$
BEGIN
  -- Add tables to supabase_realtime publication if they're not already
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_notes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_agent_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_agent_status;
  END IF;
END $$;

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_instances', 'whatsapp_queues', 'whatsapp_conversations',
    'whatsapp_messages', 'whatsapp_notes', 'whatsapp_quick_replies',
    'whatsapp_templates', 'whatsapp_campaigns', 'whatsapp_ai_agents',
    'whatsapp_opt_status', 'whatsapp_business_hours', 'whatsapp_widget_config',
    'whatsapp_flows', 'whatsapp_agent_status', 'contact_rfm_scores'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()', tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- FUNCTION: Round-robin agent assignment
-- ============================================================
CREATE OR REPLACE FUNCTION assign_agent_round_robin(
  p_organization_id UUID,
  p_queue_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Find the online agent with fewest active conversations in this queue
  SELECT qa.agent_id INTO v_agent_id
  FROM whatsapp_agent_status ast
  JOIN whatsapp_queue_agents qa ON qa.agent_id = ast.agent_id
  WHERE ast.organization_id = p_organization_id
    AND ast.status IN ('online', 'away')
    AND ast.active_conversations < ast.max_conversations
    AND (p_queue_id IS NULL OR qa.queue_id = p_queue_id)
    AND qa.is_active = true
  ORDER BY ast.active_conversations ASC, ast.last_seen_at DESC
  LIMIT 1;

  -- Update active conversation count
  IF v_agent_id IS NOT NULL THEN
    UPDATE whatsapp_agent_status
    SET active_conversations = active_conversations + 1
    WHERE agent_id = v_agent_id AND organization_id = p_organization_id;
  END IF;

  RETURN v_agent_id;
END;
$$;

-- ============================================================
-- FUNCTION: Check business hours
-- ============================================================
CREATE OR REPLACE FUNCTION is_within_business_hours(
  p_organization_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_tz TEXT;
  v_local_time TIME;
  v_day INTEGER;
  v_is_open BOOLEAN := false;
BEGIN
  -- Get timezone from first matching business hours config
  SELECT timezone INTO v_tz
  FROM whatsapp_business_hours
  WHERE organization_id = p_organization_id
    AND (p_store_id IS NULL OR store_id = p_store_id)
  LIMIT 1;

  IF v_tz IS NULL THEN
    RETURN true; -- No business hours configured = always open
  END IF;

  v_now := now() AT TIME ZONE v_tz;
  v_local_time := v_now::TIME;
  v_day := EXTRACT(DOW FROM v_now)::INTEGER;

  SELECT true INTO v_is_open
  FROM whatsapp_business_hours
  WHERE organization_id = p_organization_id
    AND (p_store_id IS NULL OR store_id = p_store_id)
    AND day_of_week = v_day
    AND is_active = true
    AND v_local_time BETWEEN start_time AND end_time;

  RETURN COALESCE(v_is_open, false);
END;
$$;

-- ============================================================
-- DONE
-- ============================================================
