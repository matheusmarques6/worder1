-- =============================================
-- MIGRATION: Adicionar campos de webhook à tabela whatsapp_instances
-- Execute no Supabase SQL Editor
-- =============================================

-- Adicionar campo webhook_url se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'whatsapp_instances' 
                   AND column_name = 'webhook_url') THEN
        ALTER TABLE whatsapp_instances 
        ADD COLUMN webhook_url TEXT;
    END IF;
END $$;

-- Adicionar campo webhook_configured se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'whatsapp_instances' 
                   AND column_name = 'webhook_configured') THEN
        ALTER TABLE whatsapp_instances 
        ADD COLUMN webhook_configured BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Adicionar campo qr_code se não existir (para armazenar QR recebido via webhook)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'whatsapp_instances' 
                   AND column_name = 'qr_code') THEN
        ALTER TABLE whatsapp_instances 
        ADD COLUMN qr_code TEXT;
    END IF;
END $$;

-- Verificar se tabela whatsapp_contacts existe, senão criar
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    name TEXT,
    profile_name TEXT,
    profile_picture_url TEXT,
    is_blocked BOOLEAN DEFAULT false,
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, phone_number)
);

-- Verificar se tabela whatsapp_conversations existe, senão criar
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
    is_bot_active BOOLEAN DEFAULT true,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    last_message_preview TEXT,
    unread_count INTEGER DEFAULT 0,
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Verificar se tabela whatsapp_messages existe, senão criar
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
    wamid TEXT,
    wa_message_id TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    media_mime_type TEXT,
    status TEXT DEFAULT 'received',
    error_code TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_org_phone 
ON whatsapp_contacts(organization_id, phone_number);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org_status 
ON whatsapp_conversations(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact 
ON whatsapp_conversations(contact_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation 
ON whatsapp_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid 
ON whatsapp_messages(wamid);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_unique_id 
ON whatsapp_instances(unique_id);

-- Tabela de configuração de IA (se não existir)
CREATE TABLE IF NOT EXISTS whatsapp_ai_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT DEFAULT 'openai' CHECK (provider IN ('openai', 'anthropic', 'gemini')),
    api_key TEXT,
    model TEXT,
    system_prompt TEXT,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id)
);

-- Comentários nas tabelas
COMMENT ON TABLE whatsapp_contacts IS 'Contatos do WhatsApp';
COMMENT ON TABLE whatsapp_conversations IS 'Conversas do WhatsApp';
COMMENT ON TABLE whatsapp_messages IS 'Mensagens do WhatsApp';
COMMENT ON TABLE whatsapp_ai_configs IS 'Configurações de IA para respostas automáticas';

-- RLS Policies (se não existirem)
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_configs ENABLE ROW LEVEL SECURITY;

-- Política para whatsapp_contacts
DROP POLICY IF EXISTS "Users can view contacts from their organization" ON whatsapp_contacts;
CREATE POLICY "Users can view contacts from their organization" ON whatsapp_contacts
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

-- Política para whatsapp_conversations
DROP POLICY IF EXISTS "Users can view conversations from their organization" ON whatsapp_conversations;
CREATE POLICY "Users can view conversations from their organization" ON whatsapp_conversations
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

-- Política para whatsapp_messages
DROP POLICY IF EXISTS "Users can view messages from their organization" ON whatsapp_messages;
CREATE POLICY "Users can view messages from their organization" ON whatsapp_messages
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

-- Política para whatsapp_ai_configs
DROP POLICY IF EXISTS "Users can manage AI configs from their organization" ON whatsapp_ai_configs;
CREATE POLICY "Users can manage AI configs from their organization" ON whatsapp_ai_configs
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

-- Atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_whatsapp_contacts_updated_at ON whatsapp_contacts;
CREATE TRIGGER update_whatsapp_contacts_updated_at
    BEFORE UPDATE ON whatsapp_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_conversations_updated_at ON whatsapp_conversations;
CREATE TRIGGER update_whatsapp_conversations_updated_at
    BEFORE UPDATE ON whatsapp_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_ai_configs_updated_at ON whatsapp_ai_configs;
CREATE TRIGGER update_whatsapp_ai_configs_updated_at
    BEFORE UPDATE ON whatsapp_ai_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- FIM DA MIGRATION
-- =============================================
SELECT 'Migration completed successfully!' as status;
