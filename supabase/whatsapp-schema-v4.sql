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

-- ============================================
-- TABELA: whatsapp_instances (QR Code / Evolution)
-- ============================================
DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS api_type VARCHAR(50) DEFAULT 'EVOLUTION';
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS api_url TEXT;
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS api_key TEXT;
EXCEPTION WHEN undefined_table THEN
  CREATE TABLE whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    unique_id VARCHAR(255) UNIQUE NOT NULL,
    qr_code TEXT,
    session_data JSONB,
    status VARCHAR(50) DEFAULT 'GENERATING',
    online_status VARCHAR(50) DEFAULT 'unavailable',
    api_type VARCHAR(50) DEFAULT 'EVOLUTION',
    api_url TEXT,
    api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
END $$;

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configs_select" ON whatsapp_configs;
CREATE POLICY "configs_select" ON whatsapp_configs FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_configs.organization_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "configs_all" ON whatsapp_configs;
CREATE POLICY "configs_all" ON whatsapp_configs FOR ALL USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_configs.organization_id AND user_id = auth.uid())
);

-- Instances RLS
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instances_select" ON whatsapp_instances;
CREATE POLICY "instances_select" ON whatsapp_instances FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_instances.organization_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "instances_all" ON whatsapp_instances;
CREATE POLICY "instances_all" ON whatsapp_instances FOR ALL USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = whatsapp_instances.organization_id AND user_id = auth.uid())
);

-- Grants
GRANT ALL ON whatsapp_configs TO service_role;
GRANT ALL ON whatsapp_instances TO service_role;

-- ============================================
-- HABILITAR REALTIME NAS TABELAS
-- ============================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- FUNÇÃO PARA NOTIFICAR NOVA MENSAGEM
-- ============================================
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    last_message = NEW.content,
    last_message_at = COALESCE(NEW.sent_at, NOW()),
    last_message_preview = LEFT(NEW.content, 100),
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN COALESCE(unread_count, 0) + 1 
      ELSE unread_count 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_new_message ON whatsapp_messages;
CREATE TRIGGER trigger_new_message
AFTER INSERT ON whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_updated ON whatsapp_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_configs_phone ON whatsapp_configs(phone_number_id);

-- ============================================
-- SUCESSO!
-- ============================================
SELECT '✅ WhatsApp CRM Schema v4 instalado!' AS resultado;
