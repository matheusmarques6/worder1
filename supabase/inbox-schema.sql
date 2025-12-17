-- =====================================================
-- WORDER - INBOX WHATSAPP - SCHEMA COMPLETO
-- =====================================================
-- Execute este arquivo no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. TABELA: whatsapp_contacts (Contatos)
-- =====================================================
-- Dropa e recria para garantir estrutura correta
DROP TABLE IF EXISTS whatsapp_contact_activities CASCADE;
DROP TABLE IF EXISTS whatsapp_contact_notes CASCADE;
DROP TABLE IF EXISTS whatsapp_quick_replies CASCADE;

-- Atualiza tabela de contatos existente
ALTER TABLE whatsapp_contacts 
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS deal_id UUID,
ADD COLUMN IF NOT EXISTS pipeline_id UUID,
ADD COLUMN IF NOT EXISTS stage_id UUID,
ADD COLUMN IF NOT EXISTS shopify_customer_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'organic',
ADD COLUMN IF NOT EXISTS source_campaign_id UUID,
ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_conversations INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_messages_received INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_messages_sent INT DEFAULT 0;

-- Índices para contatos
CREATE INDEX IF NOT EXISTS idx_contacts_org_phone ON whatsapp_contacts(organization_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON whatsapp_contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_shopify ON whatsapp_contacts(shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_blocked ON whatsapp_contacts(is_blocked) WHERE is_blocked = true;

-- =====================================================
-- 2. TABELA: whatsapp_conversations (Conversas)
-- =====================================================
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS wa_conversation_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS assigned_team_id UUID,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS bot_disabled_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bot_disabled_reason TEXT,
ADD COLUMN IF NOT EXISTS bot_disabled_by UUID,
ADD COLUMN IF NOT EXISTS last_message_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS last_message_direction VARCHAR(10),
ADD COLUMN IF NOT EXISTS total_messages INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS can_send_template_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS internal_note TEXT,
ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS first_response_time_seconds INT,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolved_by UUID,
ADD COLUMN IF NOT EXISTS rating INT,
ADD COLUMN IF NOT EXISTS rating_comment TEXT;

-- Índices para conversas
CREATE INDEX IF NOT EXISTS idx_conversations_org_status ON whatsapp_conversations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON whatsapp_conversations(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON whatsapp_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON whatsapp_conversations(unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON whatsapp_conversations(priority) WHERE priority != 'normal';
CREATE INDEX IF NOT EXISTS idx_conversations_bot ON whatsapp_conversations(is_bot_active);

-- =====================================================
-- 3. TABELA: whatsapp_messages (Mensagens)
-- =====================================================
ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS meta_message_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'inbound',
ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS media_filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS media_size INT,
ADD COLUMN IF NOT EXISTS media_duration_seconds INT,
ADD COLUMN IF NOT EXISTS template_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS template_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS template_variables JSONB,
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID,
ADD COLUMN IF NOT EXISTS quoted_message JSONB,
ADD COLUMN IF NOT EXISTS error_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS sent_by_user_id UUID,
ADD COLUMN IF NOT EXISTS sent_by_user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS sent_by_bot BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sent_by_agent_id UUID,
ADD COLUMN IF NOT EXISTS sent_by_campaign_id UUID,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reaction VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Índices para mensagens
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON whatsapp_messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_meta_id ON whatsapp_messages(meta_message_id) WHERE meta_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_type ON whatsapp_messages(message_type);

-- =====================================================
-- 4. TABELA: whatsapp_contact_notes (Notas)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  
  content TEXT NOT NULL,
  note_type VARCHAR(50) DEFAULT 'general', -- 'general', 'call', 'meeting', 'follow_up', 'important'
  is_pinned BOOLEAN DEFAULT false,
  
  created_by UUID NOT NULL,
  created_by_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para notas
CREATE INDEX idx_notes_contact ON whatsapp_contact_notes(contact_id);
CREATE INDEX idx_notes_org ON whatsapp_contact_notes(organization_id);
CREATE INDEX idx_notes_created ON whatsapp_contact_notes(created_at DESC);
CREATE INDEX idx_notes_pinned ON whatsapp_contact_notes(is_pinned) WHERE is_pinned = true;

-- =====================================================
-- 5. TABELA: whatsapp_contact_activities (Atividades)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  
  activity_type VARCHAR(50) NOT NULL, 
  -- Tipos: 'conversation_started', 'conversation_closed', 'message_sent', 'message_received',
  -- 'bot_interaction', 'agent_assigned', 'tag_added', 'tag_removed', 'deal_created', 
  -- 'deal_updated', 'order_placed', 'cart_abandoned', 'blocked', 'unblocked',
  -- 'campaign_sent', 'campaign_replied', 'note_added', 'rating_received'
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Referências opcionais
  related_deal_id UUID,
  related_campaign_id UUID,
  related_order_id VARCHAR(100),
  
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para atividades
CREATE INDEX idx_activities_contact ON whatsapp_contact_activities(contact_id);
CREATE INDEX idx_activities_org ON whatsapp_contact_activities(organization_id);
CREATE INDEX idx_activities_type ON whatsapp_contact_activities(activity_type);
CREATE INDEX idx_activities_created ON whatsapp_contact_activities(created_at DESC);

-- =====================================================
-- 6. TABELA: whatsapp_quick_replies (Respostas Rápidas)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  shortcut VARCHAR(50) NOT NULL, -- ex: '/oi', '/preco', '/horario'
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  
  -- Mídia opcional
  media_url TEXT,
  media_type VARCHAR(50), -- 'image', 'video', 'document', 'audio'
  media_filename VARCHAR(255),
  
  -- Categorização
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  
  -- Uso
  use_count INT DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadados
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, shortcut)
);

-- Índices para quick replies
CREATE INDEX idx_quick_replies_org ON whatsapp_quick_replies(organization_id);
CREATE INDEX idx_quick_replies_shortcut ON whatsapp_quick_replies(organization_id, shortcut);
CREATE INDEX idx_quick_replies_category ON whatsapp_quick_replies(category) WHERE category IS NOT NULL;
CREATE INDEX idx_quick_replies_active ON whatsapp_quick_replies(is_active) WHERE is_active = true;

-- =====================================================
-- 7. TABELA: whatsapp_tags (Tags de Conversa/Contato)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6b7280', -- hex color
  description TEXT,
  
  -- Contadores
  contacts_count INT DEFAULT 0,
  conversations_count INT DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, name)
);

-- Índices para tags
CREATE INDEX idx_tags_org ON whatsapp_tags(organization_id);
CREATE INDEX idx_tags_name ON whatsapp_tags(organization_id, name);

-- =====================================================
-- 8. TABELA: whatsapp_conversation_tags (Relação N:N)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES whatsapp_tags(id) ON DELETE CASCADE,
  
  added_by UUID,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(conversation_id, tag_id)
);

CREATE INDEX idx_conv_tags_conv ON whatsapp_conversation_tags(conversation_id);
CREATE INDEX idx_conv_tags_tag ON whatsapp_conversation_tags(tag_id);

-- =====================================================
-- 9. TABELA: whatsapp_agents_online (Status dos Agentes)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_agents_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  status VARCHAR(20) DEFAULT 'online', -- 'online', 'away', 'busy', 'offline'
  status_message TEXT,
  
  -- Métricas da sessão
  active_conversations INT DEFAULT 0,
  max_conversations INT DEFAULT 10,
  
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_agents_online_org ON whatsapp_agents_online(organization_id);
CREATE INDEX idx_agents_online_status ON whatsapp_agents_online(status);

-- =====================================================
-- 10. VIEWS ÚTEIS
-- =====================================================

-- View: Conversas com dados do contato
CREATE OR REPLACE VIEW whatsapp_inbox_view AS
SELECT 
  c.id,
  c.organization_id,
  c.contact_id,
  c.phone_number,
  c.status,
  c.priority,
  c.unread_count,
  c.is_bot_active,
  c.last_message_at,
  c.last_message_preview,
  c.last_message_direction,
  c.assigned_agent_id,
  c.created_at,
  -- Dados do contato
  ct.name as contact_name,
  ct.email as contact_email,
  ct.profile_picture_url as contact_avatar,
  ct.tags as contact_tags,
  ct.total_orders as contact_total_orders,
  ct.total_spent as contact_total_spent,
  ct.is_blocked as contact_is_blocked,
  -- Dados do agente
  u.raw_user_meta_data->>'name' as agent_name
FROM whatsapp_conversations c
LEFT JOIN whatsapp_contacts ct ON c.contact_id = ct.id
LEFT JOIN auth.users u ON c.assigned_agent_id = u.id;

-- =====================================================
-- 11. FUNCTIONS
-- =====================================================

-- Function: Atualizar contadores do contato
CREATE OR REPLACE FUNCTION update_contact_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Atualiza contadores do contato
    UPDATE whatsapp_contacts 
    SET 
      total_messages_received = total_messages_received + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
      total_messages_sent = total_messages_sent + CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
      last_message_at = NEW.created_at
    WHERE id = (SELECT contact_id FROM whatsapp_conversations WHERE id = NEW.conversation_id);
    
    -- Atualiza total de mensagens da conversa
    UPDATE whatsapp_conversations
    SET 
      total_messages = total_messages + 1,
      last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.content, 100),
      last_message_type = NEW.message_type,
      last_message_direction = NEW.direction,
      unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END
    WHERE id = NEW.conversation_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar contadores
DROP TRIGGER IF EXISTS trigger_update_contact_counters ON whatsapp_messages;
CREATE TRIGGER trigger_update_contact_counters
AFTER INSERT ON whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION update_contact_counters();

-- Function: Registrar atividade
CREATE OR REPLACE FUNCTION log_contact_activity(
  p_org_id UUID,
  p_contact_id UUID,
  p_conversation_id UUID,
  p_activity_type VARCHAR(50),
  p_title VARCHAR(255),
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_created_by UUID DEFAULT NULL,
  p_created_by_name VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO whatsapp_contact_activities (
    organization_id, contact_id, conversation_id, activity_type, 
    title, description, metadata, created_by, created_by_name
  )
  VALUES (
    p_org_id, p_contact_id, p_conversation_id, p_activity_type,
    p_title, p_description, p_metadata, p_created_by, p_created_by_name
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Marcar mensagens como lidas
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  p_conversation_id UUID
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE whatsapp_messages
  SET 
    status = 'read',
    read_at = NOW()
  WHERE 
    conversation_id = p_conversation_id 
    AND direction = 'inbound'
    AND status != 'read';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Zera contador de não lidas
  UPDATE whatsapp_conversations
  SET unread_count = 0
  WHERE id = p_conversation_id;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Atribuir conversa a agente
CREATE OR REPLACE FUNCTION assign_conversation_to_agent(
  p_conversation_id UUID,
  p_agent_id UUID,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_contact_id UUID;
  v_org_id UUID;
BEGIN
  -- Busca dados da conversa
  SELECT contact_id, organization_id INTO v_contact_id, v_org_id
  FROM whatsapp_conversations WHERE id = p_conversation_id;
  
  -- Atualiza a conversa
  UPDATE whatsapp_conversations
  SET 
    assigned_agent_id = p_agent_id,
    assigned_at = NOW()
  WHERE id = p_conversation_id;
  
  -- Registra atividade
  PERFORM log_contact_activity(
    v_org_id,
    v_contact_id,
    p_conversation_id,
    'agent_assigned',
    'Conversa atribuída a agente',
    NULL,
    jsonb_build_object('agent_id', p_agent_id),
    p_assigned_by,
    NULL
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Toggle bot na conversa
CREATE OR REPLACE FUNCTION toggle_conversation_bot(
  p_conversation_id UUID,
  p_is_active BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_disabled_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_contact_id UUID;
  v_org_id UUID;
BEGIN
  -- Busca dados da conversa
  SELECT contact_id, organization_id INTO v_contact_id, v_org_id
  FROM whatsapp_conversations WHERE id = p_conversation_id;
  
  -- Atualiza a conversa
  UPDATE whatsapp_conversations
  SET 
    is_bot_active = p_is_active,
    bot_disabled_reason = CASE WHEN p_is_active = false THEN p_reason ELSE NULL END,
    bot_disabled_by = CASE WHEN p_is_active = false THEN p_disabled_by ELSE NULL END,
    bot_disabled_until = NULL
  WHERE id = p_conversation_id;
  
  -- Registra atividade
  PERFORM log_contact_activity(
    v_org_id,
    v_contact_id,
    p_conversation_id,
    CASE WHEN p_is_active THEN 'bot_enabled' ELSE 'bot_disabled' END,
    CASE WHEN p_is_active THEN 'Bot ativado' ELSE 'Bot desativado' END,
    p_reason,
    jsonb_build_object('is_active', p_is_active),
    p_disabled_by,
    NULL
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. RLS (Row Level Security)
-- =====================================================

-- Habilita RLS nas novas tabelas
ALTER TABLE whatsapp_contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agents_online ENABLE ROW LEVEL SECURITY;

-- Policies para notas
CREATE POLICY "Users can view notes from their organization" ON whatsapp_contact_notes
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert notes in their organization" ON whatsapp_contact_notes
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Policies para quick replies
CREATE POLICY "Users can view quick replies from their organization" ON whatsapp_quick_replies
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage quick replies in their organization" ON whatsapp_quick_replies
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Policies para tags
CREATE POLICY "Users can view tags from their organization" ON whatsapp_tags
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tags in their organization" ON whatsapp_tags
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 13. DADOS INICIAIS (Tags padrão)
-- =====================================================

-- Inserir algumas tags padrão (execute manualmente com org_id correto)
-- INSERT INTO whatsapp_tags (organization_id, name, color) VALUES
-- ('SEU_ORG_ID', 'Lead Quente', '#ef4444'),
-- ('SEU_ORG_ID', 'VIP', '#a855f7'),
-- ('SEU_ORG_ID', 'Suporte', '#3b82f6'),
-- ('SEU_ORG_ID', 'Vendas', '#22c55e'),
-- ('SEU_ORG_ID', 'Reclamação', '#f59e0b');

-- =====================================================
-- FIM DO SCHEMA
-- =====================================================

-- Verifica se tudo foi criado
SELECT 'Schema do Inbox criado com sucesso!' as status;
