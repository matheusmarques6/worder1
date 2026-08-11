-- =============================================
-- INSTAGRAM MESSAGING API - MIGRACAO
-- 20260307_instagram_messaging.sql
--
-- Tabelas para integracao com Instagram Direct Messaging
-- Documentacao: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging
-- =============================================

-- Instagram Accounts (Contas conectadas)
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,

  -- Meta/Instagram IDs
  ig_user_id TEXT NOT NULL, -- Instagram Business Account ID (IGSID)
  page_id TEXT, -- Facebook Page ID associada
  business_id TEXT, -- Meta Business ID

  -- Perfil
  username TEXT,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  media_count INTEGER DEFAULT 0,

  -- Access Token
  access_token TEXT NOT NULL, -- Long-lived access token (60 dias)
  token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,

  -- Webhook
  webhook_verify_token TEXT DEFAULT gen_random_uuid()::text,
  webhook_configured BOOLEAN DEFAULT false,
  webhook_url TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'disconnected', 'error')),
  error_message TEXT,
  last_error_at TIMESTAMPTZ,

  -- Metricas
  messages_sent_today INTEGER DEFAULT 0,
  messages_received_today INTEGER DEFAULT 0,
  total_messages_sent INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  conversations_count INTEGER DEFAULT 0,

  -- Timestamps
  last_message_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id, ig_user_id)
);

-- Instagram Contacts (Usuarios que interagiram)
CREATE TABLE IF NOT EXISTS instagram_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Instagram IDs
  ig_user_id TEXT NOT NULL, -- Instagram Scoped User ID
  username TEXT,
  name TEXT,
  profile_picture_url TEXT,

  -- Vinculos
  crm_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Metadata
  source TEXT DEFAULT 'instagram_dm',
  is_business BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  followers_count INTEGER,

  -- Tags e notas
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  -- Timestamps
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id, ig_user_id)
);

-- Instagram Conversations
CREATE TABLE IF NOT EXISTS instagram_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES instagram_contacts(id) ON DELETE SET NULL,

  -- IDs
  ig_user_id TEXT NOT NULL, -- ID do usuario na conversa
  thread_id TEXT, -- ID da thread do Instagram (se disponivel)

  -- Contato info
  contact_name TEXT,
  contact_username TEXT,
  contact_picture_url TEXT,

  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed', 'spam', 'archived')),
  is_window_open BOOLEAN DEFAULT true, -- Janela de 7 dias
  window_expires_at TIMESTAMPTZ,

  -- Atribuicao
  assigned_to UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  department_id UUID,

  -- Bot/Automacao
  bot_enabled BOOLEAN DEFAULT false,
  bot_paused_until TIMESTAMPTZ,
  automation_tags TEXT[] DEFAULT '{}',

  -- Ultima mensagem
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  last_customer_message_at TIMESTAMPTZ,
  last_agent_message_at TIMESTAMPTZ,

  -- Metricas
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,

  UNIQUE(account_id, ig_user_id)
);

-- Instagram Messages
CREATE TABLE IF NOT EXISTS instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES instagram_conversations(id) ON DELETE CASCADE,

  -- IDs
  message_id TEXT NOT NULL UNIQUE, -- Mid do Instagram

  -- Direcao
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,

  -- Conteudo
  message_type TEXT NOT NULL DEFAULT 'text',
  content JSONB NOT NULL DEFAULT '{}',
  text_body TEXT,
  media_url TEXT,
  media_type TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_code TEXT,
  error_message TEXT,

  -- Reacao
  reaction TEXT,
  reaction_at TIMESTAMPTZ,

  -- Leitura
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Metadados
  is_echo BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  is_unsupported BOOLEAN DEFAULT false,
  reply_to_message_id TEXT,

  -- AI/Bot
  is_from_bot BOOLEAN DEFAULT false,
  ai_agent_id UUID,

  -- Timestamps
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_org ON instagram_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_user ON instagram_accounts(ig_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON instagram_accounts(status);

CREATE INDEX IF NOT EXISTS idx_instagram_contacts_org ON instagram_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_ig_user ON instagram_contacts(ig_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_crm ON instagram_contacts(crm_contact_id);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_org ON instagram_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_account ON instagram_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_contact ON instagram_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_status ON instagram_conversations(status);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_assigned ON instagram_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_last_msg ON instagram_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_org ON instagram_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_conversation ON instagram_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_message_id ON instagram_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_timestamp ON instagram_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_status ON instagram_messages(status);

-- RLS Policies
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_messages ENABLE ROW LEVEL SECURITY;

-- Policies para instagram_accounts
CREATE POLICY "Users can view their org instagram accounts"
ON instagram_accounts FOR SELECT
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert instagram accounts for their org"
ON instagram_accounts FOR INSERT
WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their org instagram accounts"
ON instagram_accounts FOR UPDATE
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their org instagram accounts"
ON instagram_accounts FOR DELETE
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Policies para instagram_contacts
CREATE POLICY "Users can view their org instagram contacts"
ON instagram_contacts FOR SELECT
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage their org instagram contacts"
ON instagram_contacts FOR ALL
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Policies para instagram_conversations
CREATE POLICY "Users can view their org instagram conversations"
ON instagram_conversations FOR SELECT
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage their org instagram conversations"
ON instagram_conversations FOR ALL
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Policies para instagram_messages
CREATE POLICY "Users can view their org instagram messages"
ON instagram_messages FOR SELECT
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage their org instagram messages"
ON instagram_messages FOR ALL
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Service role bypass
CREATE POLICY "Service role has full access to instagram_accounts"
ON instagram_accounts FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to instagram_contacts"
ON instagram_contacts FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to instagram_conversations"
ON instagram_conversations FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to instagram_messages"
ON instagram_messages FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Funcoes auxiliares

-- Funcao para atualizar updated_at
CREATE OR REPLACE FUNCTION update_instagram_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
CREATE TRIGGER update_instagram_accounts_updated_at
  BEFORE UPDATE ON instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION update_instagram_updated_at();

CREATE TRIGGER update_instagram_contacts_updated_at
  BEFORE UPDATE ON instagram_contacts
  FOR EACH ROW EXECUTE FUNCTION update_instagram_updated_at();

CREATE TRIGGER update_instagram_conversations_updated_at
  BEFORE UPDATE ON instagram_conversations
  FOR EACH ROW EXECUTE FUNCTION update_instagram_updated_at();

CREATE TRIGGER update_instagram_messages_updated_at
  BEFORE UPDATE ON instagram_messages
  FOR EACH ROW EXECUTE FUNCTION update_instagram_updated_at();

-- Reset diario de contadores
CREATE OR REPLACE FUNCTION reset_instagram_daily_counters()
RETURNS void AS $$
BEGIN
  UPDATE instagram_accounts
  SET
    messages_sent_today = 0,
    messages_received_today = 0
  WHERE messages_sent_today > 0 OR messages_received_today > 0;
END;
$$ LANGUAGE plpgsql;
