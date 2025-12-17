-- ============================================
-- WORDER - WhatsApp CRM Schema v4
-- Tabelas adicionais para Meta API Config
-- Execute APÓS o schema v3
-- ============================================

-- ============================================
-- TABELA: whatsapp_configs (Configuração Meta API)
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number_id VARCHAR(100) NOT NULL,
  waba_id VARCHAR(100),
  access_token TEXT NOT NULL,
  business_name VARCHAR(255),
  phone_number VARCHAR(50),
  webhook_verify_token VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  webhook_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único por organização
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_configs_org ON whatsapp_configs(organization_id);

-- RLS
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "configs_select" ON whatsapp_configs;
CREATE POLICY "configs_select" ON whatsapp_configs FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_configs.organization_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "configs_insert" ON whatsapp_configs;
CREATE POLICY "configs_insert" ON whatsapp_configs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_configs.organization_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "configs_update" ON whatsapp_configs;
CREATE POLICY "configs_update" ON whatsapp_configs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_configs.organization_id AND user_id = auth.uid())
);

-- Grant
GRANT ALL ON whatsapp_configs TO service_role;

-- ============================================
-- HABILITAR REALTIME NAS TABELAS
-- ============================================

-- Habilitar realtime para conversas
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;

-- Habilitar realtime para mensagens
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;

-- ============================================
-- FUNÇÃO PARA NOTIFICAR NOVA MENSAGEM
-- ============================================
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar conversa com última mensagem
  UPDATE whatsapp_conversations
  SET 
    last_message = NEW.content,
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1 
      ELSE unread_count 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para nova mensagem
DROP TRIGGER IF EXISTS trigger_new_message ON whatsapp_messages;
CREATE TRIGGER trigger_new_message
AFTER INSERT ON whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ============================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_updated ON whatsapp_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at DESC);

-- ============================================
-- SUCESSO!
-- ============================================
SELECT '✅ WhatsApp CRM Schema v4 (Realtime + Configs) instalado!' AS resultado;
