-- ============================================
-- WORDER - SISTEMA DE INTEGRAÇÕES V2
-- Arquitetura completa para sincronização de leads em tempo real
-- Baseado em análise de Kommo, Salesforce, HubSpot e Pipedrive
-- ============================================

-- ============================================
-- 1. MAPEAMENTOS DE IDs EXTERNOS (DEDUPLICAÇÃO)
-- ============================================
CREATE TABLE IF NOT EXISTS contact_external_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  installed_integration_id UUID NOT NULL REFERENCES installed_integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  external_platform TEXT NOT NULL,
  external_data JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(installed_integration_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_mappings_contact 
  ON contact_external_mappings(contact_id);
CREATE INDEX IF NOT EXISTS idx_external_mappings_external 
  ON contact_external_mappings(external_platform, external_id);

-- ============================================
-- 2. INSTÂNCIAS WHATSAPP (Evolution API + Cloud API)
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installed_integration_id UUID REFERENCES installed_integrations(id) ON DELETE SET NULL,
  
  -- Tipo de conexão
  provider TEXT NOT NULL DEFAULT 'evolution' CHECK (provider IN ('evolution', 'cloud_api', 'baileys')),
  
  -- Identificação
  instance_name TEXT NOT NULL,
  phone_number TEXT,
  phone_number_id TEXT, -- Para Cloud API
  waba_id TEXT, -- WhatsApp Business Account ID
  
  -- Status
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN (
    'disconnected', 'connecting', 'qr_pending', 'connected', 'error'
  )),
  qr_code TEXT, -- Base64 do QR Code atual
  qr_expires_at TIMESTAMPTZ,
  
  -- Configurações
  settings JSONB DEFAULT '{
    "reject_calls": true,
    "msg_call": "Desculpe, não atendemos ligações. Por favor, envie uma mensagem.",
    "groups_ignore": true,
    "always_online": true,
    "read_messages": true,
    "read_status": false,
    "sync_full_history": false
  }',
  
  -- Webhooks (para Evolution API)
  webhook_url TEXT,
  webhook_events TEXT[] DEFAULT ARRAY[
    'QRCODE_UPDATED',
    'CONNECTION_UPDATE', 
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'CONTACTS_UPSERT',
    'SEND_MESSAGE'
  ],
  
  -- Credenciais
  api_key TEXT, -- Evolution API key
  access_token TEXT, -- Cloud API token
  
  -- Métricas
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  contacts_synced INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  
  -- Auto-resposta
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_message TEXT,
  auto_reply_delay_seconds INTEGER DEFAULT 3,
  
  -- Controle
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, instance_name)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org 
  ON whatsapp_instances(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_phone 
  ON whatsapp_instances(phone_number) WHERE phone_number IS NOT NULL;

-- ============================================
-- 3. CONVERSAS WHATSAPP
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Identificação do chat
  chat_id TEXT NOT NULL, -- remote_jid do WhatsApp
  chat_type TEXT DEFAULT 'individual' CHECK (chat_type IN ('individual', 'group', 'broadcast')),
  
  -- Dados do contato
  remote_jid TEXT NOT NULL, -- número@s.whatsapp.net
  push_name TEXT,
  profile_picture_url TEXT,
  
  -- Status da conversa
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'spam')),
  assigned_to UUID,
  
  -- Última mensagem
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_type TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  
  -- Contadores
  unread_count INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  
  -- Labels e notas
  labels TEXT[] DEFAULT '{}',
  notes JSONB DEFAULT '[]',
  
  -- Chatbot
  chatbot_enabled BOOLEAN DEFAULT true,
  chatbot_paused_until TIMESTAMPTZ,
  current_flow_id TEXT,
  flow_state JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(instance_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact 
  ON whatsapp_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_instance 
  ON whatsapp_conversations(instance_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_msg 
  ON whatsapp_conversations(instance_id, last_message_at DESC);

-- ============================================
-- 4. MENSAGENS WHATSAPP
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  
  -- Identificação
  message_id TEXT NOT NULL, -- ID único do WhatsApp
  remote_jid TEXT NOT NULL,
  
  -- Direção e status
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'read', 'failed', 'deleted'
  )),
  
  -- Conteúdo
  message_type TEXT NOT NULL, -- text, image, video, audio, document, location, contact, sticker, reaction
  content JSONB NOT NULL, -- Estrutura varia por tipo
  text_body TEXT, -- Texto extraído para busca
  caption TEXT,
  
  -- Mídia
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  
  -- Contexto (reply/quote)
  quoted_message_id TEXT,
  quoted_content JSONB,
  
  -- Reação
  reaction TEXT,
  reaction_by TEXT,
  
  -- Metadados
  from_me BOOLEAN DEFAULT false,
  sender_name TEXT,
  sender_phone TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Processamento
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_forwarded BOOLEAN DEFAULT false,
  is_edited BOOLEAN DEFAULT false,
  
  -- Erro
  error_code TEXT,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(instance_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation 
  ON whatsapp_messages(conversation_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_search 
  ON whatsapp_messages USING gin(to_tsvector('portuguese', coalesce(text_body, '')));

-- ============================================
-- 5. FILA DE PROCESSAMENTO DE WEBHOOKS
-- ============================================
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS source_ip TEXT;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS signature_valid BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry 
  ON webhook_events(status, next_retry_at) 
  WHERE status IN ('pending', 'failed') AND attempts < max_attempts;

CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency 
  ON webhook_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================
-- 6. NORMALIZAÇÃO DE CONTATOS (DEDUPLICAÇÃO)
-- ============================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_normalized TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_normalized TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_integration_id UUID REFERENCES installed_integrations(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_platform TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_external_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_data JSONB DEFAULT '{}';

-- Função para normalizar email
CREATE OR REPLACE FUNCTION normalize_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
  IF email IS NULL OR email = '' THEN
    RETURN NULL;
  END IF;
  RETURN lower(trim(email));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para normalizar telefone (formato E.164)
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove tudo exceto dígitos e +
  cleaned := regexp_replace(phone, '[^0-9+]', '', 'g');
  
  -- Se começa com 0, assume Brasil e adiciona +55
  IF cleaned ~ '^0[0-9]' THEN
    cleaned := '+55' || substring(cleaned from 2);
  END IF;
  
  -- Se não começa com +, assume Brasil
  IF cleaned !~ '^\+' THEN
    -- Se tem 10-11 dígitos, é número brasileiro sem código
    IF length(cleaned) BETWEEN 10 AND 11 THEN
      cleaned := '+55' || cleaned;
    -- Se tem 12-13 dígitos, já tem código do país
    ELSIF length(cleaned) BETWEEN 12 AND 13 THEN
      cleaned := '+' || cleaned;
    END IF;
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para normalização automática
CREATE OR REPLACE FUNCTION normalize_contact_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_normalized := normalize_email(NEW.email);
  NEW.phone_normalized := normalize_phone(NEW.phone);
  NEW.last_activity_at := COALESCE(NEW.last_activity_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_normalize_contact ON contacts;
CREATE TRIGGER trigger_normalize_contact
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION normalize_contact_fields();

-- Índices para deduplicação
CREATE INDEX IF NOT EXISTS idx_contacts_email_normalized 
  ON contacts(organization_id, email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized 
  ON contacts(organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_jid 
  ON contacts(organization_id, whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;

-- ============================================
-- 7. FUNÇÃO DE DEDUPLICAÇÃO DE CONTATOS
-- ============================================
CREATE OR REPLACE FUNCTION find_duplicate_contact(
  p_organization_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_whatsapp_jid TEXT DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL,
  p_integration_id UUID DEFAULT NULL
)
RETURNS TABLE (
  contact_id UUID,
  match_type TEXT,
  confidence INTEGER
) AS $$
BEGIN
  -- 1. Match por external_id (100% confiança)
  IF p_external_id IS NOT NULL AND p_integration_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      cem.contact_id,
      'external_id'::TEXT,
      100
    FROM contact_external_mappings cem
    WHERE cem.installed_integration_id = p_integration_id
      AND cem.external_id = p_external_id
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Match por email normalizado (95% confiança)
  IF p_email IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.id,
      'email'::TEXT,
      95
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND c.email_normalized = normalize_email(p_email)
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3. Match por WhatsApp JID (90% confiança)
  IF p_whatsapp_jid IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.id,
      'whatsapp_jid'::TEXT,
      90
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND c.whatsapp_jid = p_whatsapp_jid
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 4. Match por telefone normalizado (85% confiança)
  IF p_phone IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.id,
      'phone'::TEXT,
      85
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND c.phone_normalized = normalize_phone(p_phone)
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. FUNÇÃO PARA CRIAR/ATUALIZAR CONTATO VIA WEBHOOK
-- ============================================
CREATE OR REPLACE FUNCTION upsert_contact_from_webhook(
  p_organization_id UUID,
  p_integration_id UUID,
  p_external_id TEXT,
  p_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_contact_id UUID;
  v_match_type TEXT;
  v_confidence INTEGER;
  v_is_new BOOLEAN := false;
  v_contact RECORD;
BEGIN
  -- Buscar duplicata
  SELECT * INTO v_contact_id, v_match_type, v_confidence
  FROM find_duplicate_contact(
    p_organization_id,
    p_data->>'email',
    p_data->>'phone',
    p_data->>'whatsapp_jid',
    p_external_id,
    p_integration_id
  );

  IF v_contact_id IS NOT NULL THEN
    -- Atualizar contato existente
    UPDATE contacts SET
      name = COALESCE(p_data->>'name', name),
      email = COALESCE(p_data->>'email', email),
      phone = COALESCE(p_data->>'phone', phone),
      whatsapp_jid = COALESCE(p_data->>'whatsapp_jid', whatsapp_jid),
      company = COALESCE(p_data->>'company', company),
      position = COALESCE(p_data->>'position', position),
      custom_fields = custom_fields || COALESCE(p_data->'custom_fields', '{}'::jsonb),
      tags = array_cat(tags, COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')),
        '{}'::TEXT[]
      )),
      last_activity_at = NOW(),
      updated_at = NOW()
    WHERE id = v_contact_id
    RETURNING * INTO v_contact;
  ELSE
    -- Criar novo contato
    v_is_new := true;
    INSERT INTO contacts (
      organization_id,
      name,
      email,
      phone,
      whatsapp_jid,
      company,
      position,
      source,
      source_integration_id,
      source_platform,
      source_external_id,
      tags,
      custom_fields,
      first_seen_at
    ) VALUES (
      p_organization_id,
      COALESCE(p_data->>'name', p_data->>'push_name', 'Novo Contato'),
      p_data->>'email',
      p_data->>'phone',
      p_data->>'whatsapp_jid',
      p_data->>'company',
      p_data->>'position',
      COALESCE(p_data->>'source', 'integration'),
      p_integration_id,
      p_data->>'platform',
      p_external_id,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')),
        '{}'::TEXT[]
      ),
      COALESCE(p_data->'custom_fields', '{}'::jsonb),
      NOW()
    )
    RETURNING * INTO v_contact;
    
    v_contact_id := v_contact.id;
    v_match_type := 'new';
    v_confidence := 100;
  END IF;

  -- Criar/atualizar mapeamento externo
  IF p_external_id IS NOT NULL AND p_integration_id IS NOT NULL THEN
    INSERT INTO contact_external_mappings (
      organization_id,
      contact_id,
      installed_integration_id,
      external_id,
      external_platform,
      external_data
    ) VALUES (
      p_organization_id,
      v_contact_id,
      p_integration_id,
      p_external_id,
      COALESCE(p_data->>'platform', 'unknown'),
      p_data
    )
    ON CONFLICT (installed_integration_id, external_id) 
    DO UPDATE SET
      external_data = EXCLUDED.external_data,
      last_synced_at = NOW(),
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'is_new', v_is_new,
    'match_type', v_match_type,
    'confidence', v_confidence
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. INTEGRAÇÕES ADICIONAIS - FACEBOOK LEAD ADS
-- ============================================
INSERT INTO integrations (slug, name, short_description, description, category_id, icon_url, color, auth_type, is_builtin, is_featured, supported_webhooks) VALUES
  (
    'facebook-lead-ads',
    'Facebook Lead Ads',
    'Capture leads de anúncios do Facebook',
    'Receba automaticamente os leads capturados pelos seus anúncios de geração de leads no Facebook.',
    (SELECT id FROM integration_categories WHERE slug = 'marketing'),
    '/integrations/facebook.svg',
    '#1877f2',
    'oauth2',
    false,
    true,
    ARRAY['leadgen']
  ),
  (
    'instagram-lead-ads',
    'Instagram Lead Ads',
    'Capture leads de anúncios do Instagram',
    'Receba automaticamente os leads capturados pelos seus anúncios no Instagram.',
    (SELECT id FROM integration_categories WHERE slug = 'marketing'),
    '/integrations/instagram.svg',
    '#e4405f',
    'oauth2',
    false,
    true,
    ARRAY['leadgen']
  ),
  (
    'evolution-api',
    'Evolution API',
    'WhatsApp via QR Code (não-oficial)',
    'Conecte seu WhatsApp pessoal ou Business via QR Code usando Evolution API. Ideal para pequenas operações.',
    (SELECT id FROM integration_categories WHERE slug = 'communication'),
    '/integrations/evolution.svg',
    '#00a884',
    'api_key',
    false,
    false,
    ARRAY['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'CONTACTS_UPSERT']
  ),
  (
    'whatsapp-cloud-api',
    'WhatsApp Cloud API',
    'API Oficial do WhatsApp Business',
    'Conecte usando a API oficial da Meta. Requer conta WhatsApp Business verificada.',
    (SELECT id FROM integration_categories WHERE slug = 'communication'),
    '/integrations/whatsapp.svg',
    '#25d366',
    'api_key',
    false,
    true,
    ARRAY['messages', 'message_status', 'account_alerts']
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  description = EXCLUDED.description,
  supported_webhooks = EXCLUDED.supported_webhooks,
  is_featured = EXCLUDED.is_featured;

-- ============================================
-- 10. RLS PARA NOVAS TABELAS
-- ============================================
ALTER TABLE contact_external_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access for contact_external_mappings" 
  ON contact_external_mappings FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org access for whatsapp_instances" 
  ON whatsapp_instances FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org access for whatsapp_conversations" 
  ON whatsapp_conversations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org access for whatsapp_messages" 
  ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 11. TRIGGERS PARA ATUALIZAÇÃO AUTOMÁTICA
-- ============================================

-- Atualizar contador de mensagens na instância
CREATE OR REPLACE FUNCTION update_instance_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE whatsapp_instances 
    SET messages_received = messages_received + 1,
        last_message_at = NOW()
    WHERE id = NEW.instance_id;
  ELSE
    UPDATE whatsapp_instances 
    SET messages_sent = messages_sent + 1,
        last_message_at = NOW()
    WHERE id = NEW.instance_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_instance_msg_count ON whatsapp_messages;
CREATE TRIGGER trigger_update_instance_msg_count
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_instance_message_count();

-- Atualizar conversa quando nova mensagem chega
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE whatsapp_conversations SET
    last_message_preview = LEFT(COALESCE(NEW.text_body, NEW.caption, '[' || NEW.message_type || ']'), 100),
    last_message_at = NEW.timestamp,
    last_message_type = NEW.message_type,
    last_message_direction = NEW.direction,
    total_messages = total_messages + 1,
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' AND NOT NEW.is_read THEN unread_count + 1 
      ELSE unread_count 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conv_on_message ON whatsapp_messages;
CREATE TRIGGER trigger_update_conv_on_message
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ============================================
-- PRONTO!
-- ============================================
SELECT 'Schema de integrações V2 criado com sucesso!' as resultado;
