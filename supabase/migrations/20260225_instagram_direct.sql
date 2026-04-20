-- =====================================================
-- Instagram Direct Integration Schema
-- =====================================================

-- OAuth States table (for secure OAuth flow)
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token TEXT NOT NULL UNIQUE,
  data JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_token ON oauth_states(state_token);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- Auto-cleanup expired states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 1. Instagram Business Accounts (connected accounts)
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,

  -- Instagram/Meta identifiers
  instagram_business_id TEXT NOT NULL,
  instagram_user_id TEXT,
  page_id TEXT, -- Facebook Page ID linked to Instagram

  -- Account info
  username TEXT,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,

  -- Auth tokens (encrypted)
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,

  -- Webhook configuration
  webhook_verify_token TEXT,
  webhook_configured BOOLEAN DEFAULT false,

  -- Status & metrics
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disconnected', 'error')),
  last_error_message TEXT,
  messages_received_today INTEGER DEFAULT 0,
  messages_sent_today INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  total_messages_sent INTEGER DEFAULT 0,

  -- Timestamps
  last_message_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, instagram_business_id)
);

-- 2. Instagram DM Contacts
CREATE TABLE IF NOT EXISTS instagram_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,

  -- Instagram identifiers
  instagram_user_id TEXT NOT NULL,
  instagram_scoped_id TEXT, -- IGSID (Instagram Scoped ID)

  -- Contact info
  username TEXT,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER,
  is_verified BOOLEAN DEFAULT false,
  is_business BOOLEAN DEFAULT false,

  -- Link to unified CRM contact
  crm_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Source tracking
  source TEXT DEFAULT 'instagram_dm',
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, instagram_user_id)
);

-- 3. Instagram DM Conversations
CREATE TABLE IF NOT EXISTS instagram_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES instagram_contacts(id) ON DELETE SET NULL,

  -- Link to unified CRM contact
  unified_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Instagram identifiers
  thread_id TEXT, -- Instagram thread/conversation ID
  participant_id TEXT NOT NULL, -- Instagram user ID of the contact

  -- Contact info (denormalized for performance)
  username TEXT,
  contact_name TEXT,
  profile_picture_url TEXT,

  -- Conversation status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived', 'spam')),
  unread_count INTEGER DEFAULT 0,

  -- 24h messaging window (Instagram policy)
  is_window_open BOOLEAN DEFAULT true,
  window_expires_at TIMESTAMPTZ,
  last_customer_message_at TIMESTAMPTZ,

  -- Message preview
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  last_message_type TEXT DEFAULT 'text',

  -- Assignment & AI
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ai_enabled BOOLEAN DEFAULT true,
  ai_agent_id UUID,
  is_bot_active BOOLEAN DEFAULT true,

  -- Tags & metadata
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, participant_id)
);

-- 4. Instagram DM Messages
CREATE TABLE IF NOT EXISTS instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES instagram_conversations(id) ON DELETE CASCADE,

  -- Instagram message identifier
  message_id TEXT NOT NULL,

  -- Direction & participants
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_user_id TEXT,
  from_username TEXT,
  to_user_id TEXT,

  -- Message content
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text', 'image', 'video', 'audio', 'file',
    'story_mention', 'story_reply', 'share', 'reel',
    'media_share', 'link', 'like', 'reaction', 'unsupported'
  )),
  text_body TEXT,
  content JSONB DEFAULT '{}', -- Full message content/attachments

  -- Media (if applicable)
  media_url TEXT,
  media_type TEXT,
  media_preview_url TEXT,

  -- Story/Reel reference
  story_id TEXT,
  story_url TEXT,
  reel_id TEXT,
  reel_url TEXT,

  -- Shared post reference
  shared_post_id TEXT,
  shared_post_url TEXT,

  -- Message status
  status TEXT DEFAULT 'received' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_message TEXT,

  -- Timestamps
  timestamp TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, message_id)
);

-- 5. Instagram Message Templates (for quick replies)
CREATE TABLE IF NOT EXISTS instagram_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  shortcut TEXT, -- e.g., "/greeting"

  use_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Instagram accounts
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_org ON instagram_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_store ON instagram_accounts(store_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON instagram_accounts(status);

-- Instagram contacts
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_org ON instagram_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_user ON instagram_contacts(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_crm ON instagram_contacts(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_username ON instagram_contacts(username);

-- Instagram conversations
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_org ON instagram_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_account ON instagram_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_contact ON instagram_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_unified ON instagram_conversations(unified_contact_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_status ON instagram_conversations(status);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_last_msg ON instagram_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_assigned ON instagram_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_participant ON instagram_conversations(account_id, participant_id);

-- Instagram messages
CREATE INDEX IF NOT EXISTS idx_instagram_messages_org ON instagram_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_conversation ON instagram_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_account ON instagram_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_timestamp ON instagram_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_direction ON instagram_messages(direction);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_msg_id ON instagram_messages(account_id, message_id);

-- Quick replies
CREATE INDEX IF NOT EXISTS idx_instagram_quick_replies_org ON instagram_quick_replies(organization_id);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_quick_replies ENABLE ROW LEVEL SECURITY;

-- Instagram accounts policies
CREATE POLICY "Users can view their organization's Instagram accounts"
  ON instagram_accounts FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert Instagram accounts for their organization"
  ON instagram_accounts FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their organization's Instagram accounts"
  ON instagram_accounts FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their organization's Instagram accounts"
  ON instagram_accounts FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Instagram contacts policies
CREATE POLICY "Users can view their organization's Instagram contacts"
  ON instagram_contacts FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their organization's Instagram contacts"
  ON instagram_contacts FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Instagram conversations policies
CREATE POLICY "Users can view their organization's Instagram conversations"
  ON instagram_conversations FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their organization's Instagram conversations"
  ON instagram_conversations FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Instagram messages policies
CREATE POLICY "Users can view their organization's Instagram messages"
  ON instagram_messages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert Instagram messages for their organization"
  ON instagram_messages FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Quick replies policies
CREATE POLICY "Users can view their organization's quick replies"
  ON instagram_quick_replies FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their organization's quick replies"
  ON instagram_quick_replies FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to upsert Instagram conversation
CREATE OR REPLACE FUNCTION upsert_instagram_conversation(
  p_organization_id UUID,
  p_store_id UUID,
  p_account_id UUID,
  p_participant_id TEXT,
  p_username TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_profile_picture_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  INSERT INTO instagram_conversations (
    organization_id,
    store_id,
    account_id,
    participant_id,
    username,
    contact_name,
    profile_picture_url,
    status,
    is_window_open,
    window_expires_at
  ) VALUES (
    p_organization_id,
    p_store_id,
    p_account_id,
    p_participant_id,
    p_username,
    p_contact_name,
    p_profile_picture_url,
    'open',
    true,
    NOW() + INTERVAL '24 hours'
  )
  ON CONFLICT (account_id, participant_id)
  DO UPDATE SET
    username = COALESCE(EXCLUDED.username, instagram_conversations.username),
    contact_name = COALESCE(EXCLUDED.contact_name, instagram_conversations.contact_name),
    profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, instagram_conversations.profile_picture_url),
    updated_at = NOW()
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update conversation on new message
CREATE OR REPLACE FUNCTION update_instagram_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE instagram_conversations
  SET
    last_message_at = NEW.timestamp,
    last_message_preview = LEFT(NEW.text_body, 100),
    last_message_direction = NEW.direction,
    last_message_type = NEW.message_type,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    is_window_open = CASE
      WHEN NEW.direction = 'inbound' THEN true
      ELSE is_window_open
    END,
    window_expires_at = CASE
      WHEN NEW.direction = 'inbound' THEN NEW.timestamp + INTERVAL '24 hours'
      ELSE window_expires_at
    END,
    last_customer_message_at = CASE
      WHEN NEW.direction = 'inbound' THEN NEW.timestamp
      ELSE last_customer_message_at
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_instagram_conversation_on_message
  AFTER INSERT ON instagram_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_conversation_on_message();

-- Function to update account stats
CREATE OR REPLACE FUNCTION update_instagram_account_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE instagram_accounts
    SET
      messages_received_today = messages_received_today + 1,
      total_messages_received = total_messages_received + 1,
      last_message_at = NEW.timestamp,
      last_webhook_at = NOW()
    WHERE id = NEW.account_id;
  ELSE
    UPDATE instagram_accounts
    SET
      messages_sent_today = messages_sent_today + 1,
      total_messages_sent = total_messages_sent + 1,
      last_message_at = NEW.timestamp
    WHERE id = NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_instagram_account_stats
  AFTER INSERT ON instagram_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_account_stats();

-- =====================================================
-- Add Instagram to integrations catalog
-- =====================================================

INSERT INTO integrations (
  slug,
  name,
  short_description,
  description,
  icon_url,
  color,
  category_id,
  auth_type,
  is_featured,
  is_premium,
  is_builtin,
  is_active,
  supported_webhooks
) VALUES (
  'instagram-direct',
  'Instagram Direct',
  'Responda mensagens do Instagram Direct',
  'Conecte sua conta do Instagram Business para receber e responder mensagens do Direct diretamente na plataforma. Crie automações para mover leads para pipelines específicos quando receberem mensagens.',
  '/integrations/instagram.svg',
  '#E4405F',
  (SELECT id FROM integration_categories WHERE slug = 'communication' LIMIT 1),
  'oauth2',
  true,
  false,
  true,
  true,
  ARRAY['message_received', 'story_mention', 'story_reply']
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  description = EXCLUDED.description,
  is_active = true,
  supported_webhooks = EXCLUDED.supported_webhooks;

-- =====================================================
-- Add Instagram triggers to automation system
-- =====================================================

-- Ensure automation_rules supports Instagram
DO $$
BEGIN
  -- Add instagram to source_type check constraint if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automation_rules_source_type_check'
  ) THEN
    ALTER TABLE automation_rules
    ADD CONSTRAINT automation_rules_source_type_check
    CHECK (source_type IN ('shopify', 'whatsapp', 'instagram', 'form', 'manual', 'webhook'));
  END IF;
EXCEPTION
  WHEN others THEN
    -- Constraint might already exist or table structure different
    NULL;
END $$;

-- Add sample automation rule for Instagram (commented out - for reference)
-- INSERT INTO automation_rules (
--   organization_id,
--   name,
--   description,
--   source_type,
--   trigger_event,
--   action_type,
--   pipeline_id,
--   initial_stage_id,
--   is_active
-- ) VALUES (
--   'your-org-id',
--   'Instagram DM → Pipeline',
--   'Quando receber mensagem no Instagram Direct, criar lead no pipeline',
--   'instagram',
--   'message_received',
--   'create_deal',
--   'your-pipeline-id',
--   'your-stage-id',
--   true
-- );
