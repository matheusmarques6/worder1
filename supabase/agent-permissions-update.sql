-- =====================================================
-- ATUALIZAÇÃO DA TABELA agent_permissions
-- Adiciona novas colunas para permissões granulares
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- Verificar se as colunas já existem antes de adicionar

-- Permissões de CRM
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_access_crm') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_access_crm BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_access_pipelines') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_access_pipelines BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_create_deals') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_create_deals BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_manage_tags') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_manage_tags BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Permissões de Analytics
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_view_analytics') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_view_analytics BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_view_reports') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_view_reports BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Permissões de Contato
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_view_contact_info') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_view_contact_info BOOLEAN DEFAULT true;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_edit_contact_info') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_edit_contact_info BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_add_notes') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_add_notes BOOLEAN DEFAULT true;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_view_order_history') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_view_order_history BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Permissões de WhatsApp/Conversas
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_view_all_conversations') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_view_all_conversations BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_transfer_conversations') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_transfer_conversations BOOLEAN DEFAULT true;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_use_ai_suggestions') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_use_ai_suggestions BOOLEAN DEFAULT true;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_send_media') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_send_media BOOLEAN DEFAULT true;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'can_use_quick_replies') THEN
    ALTER TABLE agent_permissions ADD COLUMN can_use_quick_replies BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Limites e Horários
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'max_concurrent_chats') THEN
    ALTER TABLE agent_permissions ADD COLUMN max_concurrent_chats INTEGER DEFAULT 10;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'allowed_hours_start') THEN
    ALTER TABLE agent_permissions ADD COLUMN allowed_hours_start TIME;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'allowed_hours_end') THEN
    ALTER TABLE agent_permissions ADD COLUMN allowed_hours_end TIME;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'allowed_days') THEN
    ALTER TABLE agent_permissions ADD COLUMN allowed_days INTEGER[];
  END IF;
END $$;

-- Nível de acesso
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_permissions' AND column_name = 'access_level') THEN
    ALTER TABLE agent_permissions ADD COLUMN access_level VARCHAR(20) DEFAULT 'agent';
  END IF;
END $$;

-- Comentários para documentação
COMMENT ON COLUMN agent_permissions.can_access_crm IS 'Permite acesso ao módulo CRM';
COMMENT ON COLUMN agent_permissions.can_access_pipelines IS 'Permite acesso a pipelines do CRM';
COMMENT ON COLUMN agent_permissions.can_create_deals IS 'Permite criar deals no CRM';
COMMENT ON COLUMN agent_permissions.can_manage_tags IS 'Permite gerenciar tags';
COMMENT ON COLUMN agent_permissions.can_view_analytics IS 'Permite ver analytics e relatórios';
COMMENT ON COLUMN agent_permissions.can_view_reports IS 'Permite ver relatórios detalhados';
COMMENT ON COLUMN agent_permissions.can_view_all_conversations IS 'Permite ver todas as conversas (não só as atribuídas)';
COMMENT ON COLUMN agent_permissions.max_concurrent_chats IS 'Limite de chats simultâneos';
COMMENT ON COLUMN agent_permissions.allowed_hours_start IS 'Hora de início do expediente';
COMMENT ON COLUMN agent_permissions.allowed_hours_end IS 'Hora de fim do expediente';
COMMENT ON COLUMN agent_permissions.allowed_days IS 'Dias da semana permitidos (0=Dom, 1=Seg, ..., 6=Sab)';
COMMENT ON COLUMN agent_permissions.access_level IS 'Nível de acesso: agent, supervisor, admin';

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_agent_permissions_agent_id ON agent_permissions(agent_id);

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'agent_permissions'
ORDER BY ordinal_position;
