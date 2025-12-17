-- ============================================
-- WORDER - WhatsApp CRM Schema v3 (SEGURO)
-- Adiciona colunas faltantes antes de criar índices
-- ============================================

-- ============================================
-- PASSO 1: ADICIONAR COLUNAS FALTANTES NAS TABELAS EXISTENTES
-- ============================================

-- Adicionar coluna status em whatsapp_conversations se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'status') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN status VARCHAR(50) DEFAULT 'open';
  END IF;
END $$;

-- Adicionar outras colunas em whatsapp_conversations
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'unread_count') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN unread_count INT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'last_message_at') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'last_message_preview') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN last_message_preview TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'origin') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN origin VARCHAR(50) DEFAULT 'meta';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'chat_note') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN chat_note TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'is_bot_active') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN is_bot_active BOOLEAN DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'bot_disabled_until') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN bot_disabled_until TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'priority') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN priority VARCHAR(20) DEFAULT 'normal';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'source') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN source VARCHAR(100);
  END IF;
END $$;

-- Adicionar colunas em whatsapp_messages
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'status') THEN
    ALTER TABLE whatsapp_messages ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'meta_message_id') THEN
    ALTER TABLE whatsapp_messages ADD COLUMN meta_message_id VARCHAR(255);
  END IF;
END $$;

SELECT 'Passo 1 concluído: Colunas adicionadas!' AS resultado;

-- ============================================
-- PASSO 2: CRIAR TABELAS NOVAS
-- ============================================

-- whatsapp_accounts
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number VARCHAR(50),
  phone_number_id VARCHAR(100) NOT NULL,
  waba_id VARCHAR(100),
  business_name VARCHAR(255),
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  webhook_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_instances
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  unique_id VARCHAR(255) NOT NULL,
  qr_code TEXT,
  session_data JSONB,
  status VARCHAR(50) DEFAULT 'GENERATING',
  online_status VARCHAR(50) DEFAULT 'unavailable',
  api_type VARCHAR(50) DEFAULT 'META',
  api_url TEXT,
  api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_flows
CREATE TABLE IF NOT EXISTS whatsapp_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  flow_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(50) DEFAULT 'wa_chatbot',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  variables JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  trigger_keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_chatbots
CREATE TABLE IF NOT EXISTS whatsapp_chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  flow_id UUID REFERENCES whatsapp_flows(id) ON DELETE SET NULL,
  origin_type VARCHAR(50) NOT NULL,
  origin_id VARCHAR(255),
  trigger_type VARCHAR(50) DEFAULT 'all',
  trigger_keywords TEXT[],
  welcome_message TEXT,
  fallback_message TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- phonebooks
CREATE TABLE IF NOT EXISTS phonebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  contact_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- phonebook_contacts
CREATE TABLE IF NOT EXISTS phonebook_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phonebook_id UUID REFERENCES phonebooks(id) ON DELETE CASCADE,
  name VARCHAR(255),
  mobile VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_agents
CREATE TABLE IF NOT EXISTS whatsapp_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'agent',
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  max_concurrent_chats INT DEFAULT 10,
  assigned_chats_count INT DEFAULT 0,
  total_chats_handled INT DEFAULT 0,
  avg_response_time_seconds INT,
  activity_logs JSONB DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar FK de agent em conversations (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'assigned_agent_id') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN assigned_agent_id UUID;
  END IF;
END $$;

-- Adicionar FK de instance em conversations (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'instance_id') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN instance_id UUID;
  END IF;
END $$;

-- whatsapp_flow_sessions
CREATE TABLE IF NOT EXISTS whatsapp_flow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES whatsapp_flows(id) ON DELETE CASCADE,
  chatbot_id UUID REFERENCES whatsapp_chatbots(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  origin VARCHAR(50) NOT NULL,
  origin_id VARCHAR(255),
  sender_mobile VARCHAR(50) NOT NULL,
  current_node_id VARCHAR(255),
  session_data JSONB NOT NULL DEFAULT '{}',
  variables JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_campaigns
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  template_language VARCHAR(10) DEFAULT 'pt_BR',
  phonebook_id UUID REFERENCES phonebooks(id),
  instance_id UUID REFERENCES whatsapp_instances(id),
  status VARCHAR(50) DEFAULT 'PENDING',
  total_contacts INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  replied_count INT DEFAULT 0,
  body_variables JSONB DEFAULT '[]',
  header_variable JSONB,
  button_variables JSONB DEFAULT '[]',
  media_url TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo',
  send_interval_ms INT DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_campaign_logs
CREATE TABLE IF NOT EXISTS whatsapp_campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES phonebook_contacts(id) ON DELETE SET NULL,
  contact_name VARCHAR(255),
  contact_mobile VARCHAR(50) NOT NULL,
  meta_message_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'PENDING',
  delivery_status VARCHAR(50),
  delivery_time TIMESTAMPTZ,
  read_time TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT,
  error_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_agent_assignments
CREATE TABLE IF NOT EXISTS whatsapp_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES whatsapp_agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT
);

-- whatsapp_chat_tags
CREATE TABLE IF NOT EXISTS whatsapp_chat_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366F1',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_conversation_tags
CREATE TABLE IF NOT EXISTS whatsapp_conversation_tags (
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES whatsapp_chat_tags(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (conversation_id, tag_id)
);

-- whatsapp_quick_replies
CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  shortcut VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  use_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- whatsapp_ai_configs
CREATE TABLE IF NOT EXISTS whatsapp_ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  system_prompt TEXT,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INT DEFAULT 1000,
  context_messages INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT 'Passo 2 concluído: Tabelas criadas!' AS resultado;

-- ============================================
-- PASSO 3: CRIAR ÍNDICES (só se coluna existir)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_wa_conv_org ON whatsapp_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pb_contacts_pb ON phonebook_contacts(phonebook_id);
CREATE INDEX IF NOT EXISTS idx_pb_contacts_mobile ON phonebook_contacts(mobile);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON whatsapp_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_cmp ON whatsapp_campaign_logs(campaign_id);

-- Índice em status só se a coluna existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON whatsapp_conversations(status);
  END IF;
END $$;

SELECT 'Passo 3 concluído: Índices criados!' AS resultado;

-- ============================================
-- PASSO 4: FUNÇÕES RPC
-- ============================================

CREATE OR REPLACE FUNCTION increment_campaign_sent(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_campaigns SET sent_count = sent_count + 1, updated_at = NOW() WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_campaign_delivered(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_campaigns SET delivered_count = delivered_count + 1, updated_at = NOW() WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_campaign_read(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_campaigns SET read_count = read_count + 1, updated_at = NOW() WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_campaign_failed(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Passo 4 concluído: Funções criadas!' AS resultado;

-- ============================================
-- PASSO 5: TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_phonebook_contact_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE phonebooks SET contact_count = contact_count + 1, updated_at = NOW() WHERE id = NEW.phonebook_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE phonebooks SET contact_count = GREATEST(contact_count - 1, 0), updated_at = NOW() WHERE id = OLD.phonebook_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_phonebook_count ON phonebook_contacts;
CREATE TRIGGER trigger_phonebook_count
AFTER INSERT OR DELETE ON phonebook_contacts
FOR EACH ROW EXECUTE FUNCTION update_phonebook_contact_count();

SELECT 'Passo 5 concluído: Triggers criados!' AS resultado;

-- ============================================
-- PASSO 6: RLS E GRANTS
-- ============================================

-- Habilitar RLS
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_flow_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chat_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE phonebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE phonebook_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_configs ENABLE ROW LEVEL SECURITY;

-- Grants para service_role
GRANT ALL ON whatsapp_accounts TO service_role;
GRANT ALL ON whatsapp_instances TO service_role;
GRANT ALL ON whatsapp_flows TO service_role;
GRANT ALL ON whatsapp_chatbots TO service_role;
GRANT ALL ON whatsapp_flow_sessions TO service_role;
GRANT ALL ON whatsapp_campaigns TO service_role;
GRANT ALL ON whatsapp_campaign_logs TO service_role;
GRANT ALL ON whatsapp_agents TO service_role;
GRANT ALL ON whatsapp_agent_assignments TO service_role;
GRANT ALL ON whatsapp_chat_tags TO service_role;
GRANT ALL ON whatsapp_conversation_tags TO service_role;
GRANT ALL ON whatsapp_quick_replies TO service_role;
GRANT ALL ON phonebooks TO service_role;
GRANT ALL ON phonebook_contacts TO service_role;
GRANT ALL ON whatsapp_ai_configs TO service_role;

SELECT 'Passo 6 concluído: RLS e Grants configurados!' AS resultado;

-- ============================================
-- SUCESSO!
-- ============================================
SELECT '✅ WhatsApp CRM Schema v3 instalado com sucesso!' AS resultado;
