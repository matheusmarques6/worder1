-- =====================================================
-- MIGRATION: Garantir estrutura de whatsapp_contacts
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- 1. CRIAR TABELA whatsapp_contacts SE NÃO EXISTIR
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Dados básicos
  phone_number VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  profile_name VARCHAR(255), -- Nome do WhatsApp (pushName)
  email VARCHAR(255),
  profile_picture_url TEXT,
  
  -- Endereço
  address JSONB DEFAULT '{}',
  
  -- Segmentação
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  
  -- CRM
  deal_id UUID,
  pipeline_id UUID,
  stage_id UUID,
  
  -- Shopify
  shopify_customer_id VARCHAR(100),
  total_orders INT DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  
  -- Status
  is_blocked BOOLEAN DEFAULT false,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  
  -- Origem
  source VARCHAR(50) DEFAULT 'whatsapp',
  source_campaign_id UUID,
  
  -- Métricas
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  total_conversations INT DEFAULT 0,
  total_messages_received INT DEFAULT 0,
  total_messages_sent INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organization_id, phone_number)
);

-- 2. ADICIONAR COLUNAS SE NÃO EXISTIREM
DO $$ 
BEGIN
  -- Colunas básicas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'profile_name') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN profile_name VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'profile_picture_url') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN profile_picture_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'address') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN address JSONB DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'tags') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'is_blocked') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN is_blocked BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'source') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN source VARCHAR(50) DEFAULT 'whatsapp';
  END IF;
  
  -- Métricas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'total_conversations') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN total_conversations INT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'total_messages_received') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN total_messages_received INT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'total_messages_sent') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN total_messages_sent INT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'first_message_at') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN first_message_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'last_message_at') THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. GARANTIR QUE whatsapp_conversations TEM contact_id E phone_number
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'contact_id') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN contact_id UUID REFERENCES whatsapp_contacts(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'phone_number') THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN phone_number VARCHAR(50);
  END IF;
END $$;

-- 4. CRIAR ÍNDICES
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_org_phone 
  ON whatsapp_contacts(organization_id, phone_number);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_tags 
  ON whatsapp_contacts USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_blocked 
  ON whatsapp_contacts(is_blocked) WHERE is_blocked = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_last_message 
  ON whatsapp_contacts(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact 
  ON whatsapp_conversations(contact_id) WHERE contact_id IS NOT NULL;

-- 5. FUNÇÃO PARA INCREMENTAR CONVERSAS DO CONTATO
CREATE OR REPLACE FUNCTION increment_contact_conversations(p_contact_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_contacts
  SET 
    total_conversations = COALESCE(total_conversations, 0) + 1,
    updated_at = NOW()
  WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

-- 6. MIGRAR DADOS EXISTENTES: Criar contatos para conversas órfãs
-- Isso cria contatos para conversas que já existem mas não têm contact_id
INSERT INTO whatsapp_contacts (
  organization_id,
  phone_number,
  name,
  profile_name,
  source,
  first_message_at,
  last_message_at,
  total_conversations
)
SELECT DISTINCT ON (c.organization_id, COALESCE(c.phone_number, c.contact_phone))
  c.organization_id,
  COALESCE(c.phone_number, c.contact_phone) as phone_number,
  COALESCE(c.contact_name, COALESCE(c.phone_number, c.contact_phone)) as name,
  c.contact_name as profile_name,
  'whatsapp' as source,
  c.created_at as first_message_at,
  c.last_message_at,
  1 as total_conversations
FROM whatsapp_conversations c
WHERE c.contact_id IS NULL
  AND COALESCE(c.phone_number, c.contact_phone) IS NOT NULL
ON CONFLICT (organization_id, phone_number) DO NOTHING;

-- 7. VINCULAR CONTATOS ÀS CONVERSAS ÓRFÃS
UPDATE whatsapp_conversations c
SET contact_id = ct.id
FROM whatsapp_contacts ct
WHERE c.contact_id IS NULL
  AND c.organization_id = ct.organization_id
  AND COALESCE(c.phone_number, c.contact_phone) = ct.phone_number;

-- 8. GARANTIR phone_number ESTÁ PREENCHIDO (copiar de contact_phone se necessário)
UPDATE whatsapp_conversations
SET phone_number = contact_phone
WHERE phone_number IS NULL AND contact_phone IS NOT NULL;

-- 9. HABILITAR RLS
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- 10. POLICIES PARA whatsapp_contacts
DROP POLICY IF EXISTS "Users can view contacts from their organization" ON whatsapp_contacts;
CREATE POLICY "Users can view contacts from their organization" ON whatsapp_contacts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert contacts in their organization" ON whatsapp_contacts;
CREATE POLICY "Users can insert contacts in their organization" ON whatsapp_contacts
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update contacts in their organization" ON whatsapp_contacts;
CREATE POLICY "Users can update contacts in their organization" ON whatsapp_contacts
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- 11. POLICY PARA SERVICE ROLE (webhook)
DROP POLICY IF EXISTS "Service role can do anything on whatsapp_contacts" ON whatsapp_contacts;
CREATE POLICY "Service role can do anything on whatsapp_contacts" ON whatsapp_contacts
  FOR ALL USING (true) WITH CHECK (true);

-- 12. VERIFICAÇÃO FINAL
SELECT 'Migration concluída!' as status;

-- Verificar quantos contatos foram criados
SELECT 
  'Contatos criados' as info,
  COUNT(*) as total
FROM whatsapp_contacts;

-- Verificar conversas com contact_id vinculado
SELECT 
  'Conversas com contact_id' as info,
  COUNT(*) FILTER (WHERE contact_id IS NOT NULL) as com_contato,
  COUNT(*) FILTER (WHERE contact_id IS NULL) as sem_contato
FROM whatsapp_conversations;
