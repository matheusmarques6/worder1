-- =====================================================
-- SQL COMPLETO PARA CORRIGIR FUNCIONALIDADES DO INBOX
-- Execute no Supabase SQL Editor
-- Ordem: Executar de cima para baixo
-- =====================================================

-- =====================================================
-- PARTE 1: COLUNAS NECESSÁRIAS EM whatsapp_conversations
-- =====================================================

-- 1.1 Coluna ai_enabled (para o botão "IA Ativa")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_enabled'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_enabled BOOLEAN DEFAULT true;
    RAISE NOTICE 'Coluna ai_enabled criada';
  ELSE
    RAISE NOTICE 'Coluna ai_enabled já existe';
  END IF;
END $$;

-- 1.2 Coluna ai_disabled_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_disabled_at'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_disabled_at TIMESTAMPTZ;
    RAISE NOTICE 'Coluna ai_disabled_at criada';
  ELSE
    RAISE NOTICE 'Coluna ai_disabled_at já existe';
  END IF;
END $$;

-- 1.3 Coluna ai_disabled_reason
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_disabled_reason'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_disabled_reason VARCHAR(255);
    RAISE NOTICE 'Coluna ai_disabled_reason criada';
  ELSE
    RAISE NOTICE 'Coluna ai_disabled_reason já existe';
  END IF;
END $$;

-- 1.4 Coluna ai_agent_id (referência ao agente de IA)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_agent_id'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN ai_agent_id UUID;
    RAISE NOTICE 'Coluna ai_agent_id criada';
  ELSE
    RAISE NOTICE 'Coluna ai_agent_id já existe';
  END IF;
END $$;

-- 1.5 Coluna is_bot_active (para o botão "Bot On/Off")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'is_bot_active'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN is_bot_active BOOLEAN DEFAULT true;
    RAISE NOTICE 'Coluna is_bot_active criada';
  ELSE
    RAISE NOTICE 'Coluna is_bot_active já existe';
  END IF;
END $$;

-- 1.6 Coluna assigned_to (para atribuição de conversas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN assigned_to UUID;
    RAISE NOTICE 'Coluna assigned_to criada';
  ELSE
    RAISE NOTICE 'Coluna assigned_to já existe';
  END IF;
END $$;

-- 1.7 Coluna assigned_agent_id (compatibilidade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_conversations' AND column_name = 'assigned_agent_id'
  ) THEN
    ALTER TABLE whatsapp_conversations ADD COLUMN assigned_agent_id UUID;
    RAISE NOTICE 'Coluna assigned_agent_id criada';
  ELSE
    RAISE NOTICE 'Coluna assigned_agent_id já existe';
  END IF;
END $$;


-- =====================================================
-- PARTE 2: TABELA DE NOTAS DO CONTATO
-- (Para a aba "Notas" funcionar)
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
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON whatsapp_contact_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_org ON whatsapp_contact_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_created ON whatsapp_contact_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_notes_pinned ON whatsapp_contact_notes(is_pinned DESC, created_at DESC);

-- RLS
ALTER TABLE whatsapp_contact_notes ENABLE ROW LEVEL SECURITY;

-- Política de SELECT
DROP POLICY IF EXISTS "notes_select_policy" ON whatsapp_contact_notes;
CREATE POLICY "notes_select_policy" ON whatsapp_contact_notes 
FOR SELECT USING (true);

-- Política de INSERT
DROP POLICY IF EXISTS "notes_insert_policy" ON whatsapp_contact_notes;
CREATE POLICY "notes_insert_policy" ON whatsapp_contact_notes 
FOR INSERT WITH CHECK (true);

-- Política de UPDATE
DROP POLICY IF EXISTS "notes_update_policy" ON whatsapp_contact_notes;
CREATE POLICY "notes_update_policy" ON whatsapp_contact_notes 
FOR UPDATE USING (true);

-- Política de DELETE
DROP POLICY IF EXISTS "notes_delete_policy" ON whatsapp_contact_notes;
CREATE POLICY "notes_delete_policy" ON whatsapp_contact_notes 
FOR DELETE USING (true);


-- =====================================================
-- PARTE 3: TABELA DE ATIVIDADES DO CONTATO (TIMELINE)
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
CREATE INDEX IF NOT EXISTS idx_activities_contact ON contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_org ON contact_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON contact_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_created ON contact_activities(created_at DESC);

-- RLS
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_select_policy" ON contact_activities;
CREATE POLICY "activities_select_policy" ON contact_activities 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "activities_insert_policy" ON contact_activities;
CREATE POLICY "activities_insert_policy" ON contact_activities 
FOR INSERT WITH CHECK (true);


-- =====================================================
-- PARTE 4: TABELA DE COMENTÁRIOS (TIMELINE COM @MENÇÕES)
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
CREATE INDEX IF NOT EXISTS idx_comments_contact ON contact_comments(contact_id);
CREATE INDEX IF NOT EXISTS idx_comments_org ON contact_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON contact_comments(created_at DESC);

-- RLS
ALTER TABLE contact_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_policy" ON contact_comments;
CREATE POLICY "comments_select_policy" ON contact_comments 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert_policy" ON contact_comments;
CREATE POLICY "comments_insert_policy" ON contact_comments 
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "comments_update_policy" ON contact_comments;
CREATE POLICY "comments_update_policy" ON contact_comments 
FOR UPDATE USING (true);

DROP POLICY IF EXISTS "comments_delete_policy" ON contact_comments;
CREATE POLICY "comments_delete_policy" ON contact_comments 
FOR DELETE USING (true);


-- =====================================================
-- PARTE 5: GARANTIR QUE whatsapp_agents EXISTE
-- (Para o botão "Atribuir" funcionar)
-- =====================================================

-- Verificar se tabela existe, se não criar estrutura básica
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'whatsapp_agents'
  ) THEN
    CREATE TABLE whatsapp_agents (
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
    
    CREATE INDEX IF NOT EXISTS idx_agents_org ON whatsapp_agents(organization_id);
    CREATE INDEX IF NOT EXISTS idx_agents_store ON whatsapp_agents(store_id);
    CREATE INDEX IF NOT EXISTS idx_agents_user ON whatsapp_agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_agents_active ON whatsapp_agents(is_active);
    
    ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "agents_policy" ON whatsapp_agents FOR ALL USING (true);
    
    RAISE NOTICE 'Tabela whatsapp_agents criada';
  ELSE
    RAISE NOTICE 'Tabela whatsapp_agents já existe';
  END IF;
END $$;


-- =====================================================
-- PARTE 6: VERIFICAÇÃO FINAL
-- =====================================================

-- Verificar colunas em whatsapp_conversations
SELECT '=== Colunas em whatsapp_conversations ===' as info;

SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'whatsapp_conversations' 
AND column_name IN (
  'ai_enabled',
  'ai_disabled_at',
  'ai_disabled_reason',
  'ai_agent_id',
  'is_bot_active',
  'assigned_to',
  'assigned_agent_id'
)
ORDER BY column_name;

-- Verificar tabelas criadas
SELECT '=== Tabelas do Inbox ===' as info;

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'whatsapp_contact_notes',
  'contact_activities', 
  'contact_comments',
  'whatsapp_agents'
)
ORDER BY table_name;


-- =====================================================
-- DONE!
-- =====================================================
SELECT '✅ SQL executado com sucesso!' as resultado;
