-- =====================================================
-- PASSO 2: CRIAR TABELAS E COLUNAS NECESSÁRIAS
-- Execute DEPOIS do diagnóstico
-- =====================================================

-- =====================================================
-- 2.1 ADICIONAR COLUNAS EM whatsapp_conversations
-- =====================================================

-- ai_enabled
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;

-- ai_disabled_at
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_disabled_at TIMESTAMPTZ;

-- ai_disabled_reason
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_disabled_reason VARCHAR(255);

-- ai_agent_id
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_agent_id UUID;

-- is_bot_active
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT true;

-- assigned_to
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- assigned_agent_id
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID;


-- =====================================================
-- 2.2 CRIAR TABELA whatsapp_contact_notes
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_contact_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  conversation_id UUID,
  content TEXT NOT NULL DEFAULT '',
  note_type VARCHAR(50) DEFAULT 'note',
  attachments JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  created_by UUID,
  created_by_name VARCHAR(255) DEFAULT 'Usuário',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wcn_contact ON whatsapp_contact_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_wcn_org ON whatsapp_contact_notes(organization_id);

-- RLS
ALTER TABLE whatsapp_contact_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wcn_all" ON whatsapp_contact_notes;
CREATE POLICY "wcn_all" ON whatsapp_contact_notes FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- 2.3 CRIAR TABELA contact_activities
-- =====================================================

CREATE TABLE IF NOT EXISTS contact_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  conversation_id UUID,
  deal_id UUID,
  task_id UUID,
  activity_type VARCHAR(100) NOT NULL,
  title VARCHAR(500),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ca_contact ON contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_ca_org ON contact_activities(organization_id);

-- RLS
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_all" ON contact_activities;
CREATE POLICY "ca_all" ON contact_activities FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- 2.4 CRIAR TABELA contact_comments
-- =====================================================

CREATE TABLE IF NOT EXISTS contact_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  conversation_id UUID,
  deal_id UUID,
  task_id UUID,
  content TEXT NOT NULL,
  comment_type VARCHAR(50) DEFAULT 'note',
  mentions UUID[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT false,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID,
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cc_contact ON contact_comments(contact_id);
CREATE INDEX IF NOT EXISTS idx_cc_org ON contact_comments(organization_id);

-- RLS
ALTER TABLE contact_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_all" ON contact_comments;
CREATE POLICY "cc_all" ON contact_comments FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- 2.5 CRIAR TABELA whatsapp_agents (se não existir)
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  store_id UUID,
  user_id UUID,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'agent',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  max_concurrent_chats INTEGER DEFAULT 10,
  current_chat_count INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_all" ON whatsapp_agents;
CREATE POLICY "wa_all" ON whatsapp_agents FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- 2.6 VERIFICAÇÃO FINAL
-- =====================================================

SELECT '✅ TABELAS CRIADAS:' as resultado;

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'whatsapp_contact_notes',
  'contact_activities', 
  'contact_comments',
  'whatsapp_agents'
);

SELECT '✅ COLUNAS ADICIONADAS:' as resultado;

SELECT column_name
FROM information_schema.columns 
WHERE table_name = 'whatsapp_conversations' 
AND column_name IN (
  'ai_enabled',
  'is_bot_active',
  'assigned_to',
  'ai_agent_id'
);
