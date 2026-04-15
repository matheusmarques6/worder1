-- =====================================================
-- SQL CONSOLIDADO - TODAS AS TABELAS NECESSÁRIAS
-- Execute no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PARTE 1: TABELAS DO INBOX (Fase 1)
-- =====================================================

-- 1.1 Colunas em whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_disabled_at TIMESTAMPTZ;

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_disabled_reason VARCHAR(255);

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT true;

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS assigned_to UUID;

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID;

-- 1.2 Tabela de Notas
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

CREATE INDEX IF NOT EXISTS idx_wcn_contact ON whatsapp_contact_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_wcn_org ON whatsapp_contact_notes(organization_id);

ALTER TABLE whatsapp_contact_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wcn_all" ON whatsapp_contact_notes;
CREATE POLICY "wcn_all" ON whatsapp_contact_notes FOR ALL USING (true) WITH CHECK (true);

-- 1.3 Tabela de Atividades
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

CREATE INDEX IF NOT EXISTS idx_ca_contact ON contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_ca_org ON contact_activities(organization_id);

ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ca_all" ON contact_activities;
CREATE POLICY "ca_all" ON contact_activities FOR ALL USING (true) WITH CHECK (true);

-- 1.4 Tabela de Comentários
CREATE TABLE IF NOT EXISTS contact_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  conversation_id UUID,
  deal_id UUID,
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

CREATE INDEX IF NOT EXISTS idx_cc_contact ON contact_comments(contact_id);
CREATE INDEX IF NOT EXISTS idx_cc_org ON contact_comments(organization_id);

ALTER TABLE contact_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cc_all" ON contact_comments;
CREATE POLICY "cc_all" ON contact_comments FOR ALL USING (true) WITH CHECK (true);

-- 1.5 Tabela de Agentes WhatsApp
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

CREATE INDEX IF NOT EXISTS idx_wa_org ON whatsapp_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_store ON whatsapp_agents(store_id);

ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_all" ON whatsapp_agents;
CREATE POLICY "wa_all" ON whatsapp_agents FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- PARTE 2: TABELAS DO CRM
-- =====================================================

-- 2.1 Tabela de Pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  store_id UUID,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(50) DEFAULT '#3B82F6',
  description TEXT,
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_org ON pipelines(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_store ON pipelines(store_id);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pipelines_all" ON pipelines;
CREATE POLICY "pipelines_all" ON pipelines FOR ALL USING (true) WITH CHECK (true);

-- 2.2 Tabela de Pipeline Stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(50) DEFAULT '#6B7280',
  position INTEGER DEFAULT 0,
  probability INTEGER DEFAULT 0,
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stages_pipeline ON pipeline_stages(pipeline_id);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stages_all" ON pipeline_stages;
CREATE POLICY "stages_all" ON pipeline_stages FOR ALL USING (true) WITH CHECK (true);

-- 2.3 Tabela de Deals
CREATE TABLE IF NOT EXISTS deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  store_id UUID,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  contact_id UUID,
  contact_phone VARCHAR(50),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  value DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'BRL',
  status VARCHAR(50) DEFAULT 'open',
  priority VARCHAR(20) DEFAULT 'medium',
  expected_close_date DATE,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  assigned_to UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_store ON deals(store_id);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deals_all" ON deals;
CREATE POLICY "deals_all" ON deals FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- PARTE 3: TABELAS DE ORGANIZAÇÃO
-- =====================================================

-- 3.1 Tabela de Membros da Organização
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  permissions JSONB DEFAULT '{}'::jsonb,
  invited_by UUID,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_all" ON organization_members;
CREATE POLICY "org_members_all" ON organization_members FOR ALL USING (true) WITH CHECK (true);

-- 3.2 Tabela de Notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(500),
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  actor_id UUID,
  entity_type VARCHAR(100),
  entity_id UUID,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_org ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_all" ON notifications;
CREATE POLICY "notif_all" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- 3.3 Tabela de Stores (se não existir)
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  platform VARCHAR(50) DEFAULT 'shopify',
  shopify_store_id VARCHAR(255),
  shopify_access_token TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_org ON stores(organization_id);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stores_all" ON stores;
CREATE POLICY "stores_all" ON stores FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- PARTE 4: TABELAS AUXILIARES
-- =====================================================

-- 4.1 Tabela de Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID,
  unified_contact_id UUID,
  deal_id UUID,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome TEXT,
  assigned_to UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_all" ON tasks;
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (true) WITH CHECK (true);

-- 4.2 Tabela de Invoices
CREATE TABLE IF NOT EXISTS contact_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  invoice_number VARCHAR(100),
  issue_date DATE,
  due_date DATE,
  amount DECIMAL(15,2),
  status VARCHAR(50) DEFAULT 'pending',
  file_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_contact ON contact_invoices(contact_id);

ALTER TABLE contact_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_all" ON contact_invoices;
CREATE POLICY "invoices_all" ON contact_invoices FOR ALL USING (true) WITH CHECK (true);


-- =====================================================
-- PARTE 5: VERIFICAÇÃO FINAL
-- =====================================================

SELECT '✅ VERIFICANDO TABELAS CRIADAS:' as resultado;

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'whatsapp_contact_notes',
  'contact_activities',
  'contact_comments',
  'whatsapp_agents',
  'pipelines',
  'pipeline_stages',
  'deals',
  'organization_members',
  'notifications',
  'stores',
  'tasks',
  'contact_invoices'
)
ORDER BY table_name;

SELECT '✅ SQL CONSOLIDADO EXECUTADO COM SUCESSO!' as resultado;
