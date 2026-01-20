-- ============================================
-- SISTEMA DE NOTIFICAÇÕES COM MENÇÕES E LEMBRETES
-- Execute no Supabase SQL Editor
-- ============================================

-- ===========================================
-- 1. TABELA DE NOTIFICAÇÕES
-- ===========================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tipo e conteúdo
  type TEXT NOT NULL CHECK (type IN (
    'mention', 'task_assigned', 'task_due_soon', 'task_overdue',
    'task_completed', 'comment_reply', 'deal_assigned',
    'deal_stage_changed', 'whatsapp_mention', 'reminder',
    'system', 'integration_error'
  )),
  title TEXT NOT NULL,
  message TEXT,
  
  -- Referência ao objeto relacionado
  reference_type TEXT CHECK (reference_type IN ('contact', 'task', 'deal', 'comment', 'conversation')),
  reference_id UUID,
  
  -- Quem gerou a notificação
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  
  -- Metadados extras
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_org ON notifications(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, organization_id, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

-- ===========================================
-- 2. PREFERÊNCIAS DE NOTIFICAÇÕES
-- ===========================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Tipos de notificação habilitados
  mention_enabled BOOLEAN DEFAULT TRUE,
  task_assigned_enabled BOOLEAN DEFAULT TRUE,
  task_due_soon_enabled BOOLEAN DEFAULT TRUE,
  task_overdue_enabled BOOLEAN DEFAULT TRUE,
  task_completed_enabled BOOLEAN DEFAULT TRUE,
  comment_reply_enabled BOOLEAN DEFAULT TRUE,
  deal_assigned_enabled BOOLEAN DEFAULT TRUE,
  deal_stage_changed_enabled BOOLEAN DEFAULT TRUE,
  whatsapp_mention_enabled BOOLEAN DEFAULT TRUE,
  reminder_enabled BOOLEAN DEFAULT TRUE,
  
  -- Canais
  in_app_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  
  -- Horário de silêncio
  dnd_enabled BOOLEAN DEFAULT FALSE,
  dnd_start TIME,
  dnd_end TIME,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, organization_id)
);

-- ===========================================
-- 3. TABELA DE COMENTÁRIOS (caso não exista)
-- ===========================================

CREATE TABLE IF NOT EXISTS contact_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Contexto opcional
  conversation_id UUID,
  deal_id UUID,
  task_id UUID,
  
  -- Conteúdo
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'note' CHECK (comment_type IN ('note', 'call_log', 'meeting_note', 'important', 'follow_up')),
  
  -- Menções armazenadas como array de UUIDs
  mentions UUID[] DEFAULT '{}',
  
  -- Fixar
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID REFERENCES users(id),
  
  -- Criador
  created_by UUID REFERENCES users(id),
  created_by_name TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_comments_contact ON contact_comments(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_comments_org ON contact_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_comments_pinned ON contact_comments(contact_id, is_pinned) WHERE is_pinned = TRUE;

-- ===========================================
-- 4. ROW LEVEL SECURITY
-- ===========================================

-- Notificações
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (
    auth.uid() = user_id AND
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (TRUE);

-- Preferências
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own preferences" ON notification_preferences;
CREATE POLICY "Users can manage own preferences" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Comentários
ALTER TABLE contact_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view comments" ON contact_comments;
CREATE POLICY "Org members can view comments" ON contact_comments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can insert comments" ON contact_comments;
CREATE POLICY "Org members can insert comments" ON contact_comments
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can update comments" ON contact_comments;
CREATE POLICY "Org members can update comments" ON contact_comments
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can delete comments" ON contact_comments;
CREATE POLICY "Org members can delete comments" ON contact_comments
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- ===========================================
-- 5. FUNÇÃO PARA EXTRAIR MENÇÕES DO TEXTO
-- ===========================================

-- Dropar função existente se houver
DROP FUNCTION IF EXISTS extract_mentions(TEXT);

CREATE OR REPLACE FUNCTION extract_mentions(content TEXT)
RETURNS UUID[] AS $$
DECLARE
  mentions UUID[] := '{}';
  match_record RECORD;
BEGIN
  -- Regex para encontrar @[Nome](uuid)
  FOR match_record IN
    SELECT (regexp_matches(content, '@\[[^\]]+\]\(([a-f0-9-]{36})\)', 'g'))[1] AS user_id
  LOOP
    mentions := array_append(mentions, match_record.user_id::UUID);
  END LOOP;
  
  RETURN mentions;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ===========================================
-- 6. FUNÇÃO PARA CRIAR NOTIFICAÇÃO
-- ===========================================

-- Dropar função existente se houver
DROP FUNCTION IF EXISTS create_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION create_notification(
  p_organization_id UUID,
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_preference RECORD;
  v_type_enabled BOOLEAN;
BEGIN
  -- Verificar preferências do usuário
  SELECT * INTO v_preference
  FROM notification_preferences
  WHERE user_id = p_user_id AND organization_id = p_organization_id;
  
  -- Se não tem preferências, criar com valores padrão
  IF v_preference IS NULL THEN
    INSERT INTO notification_preferences (user_id, organization_id)
    VALUES (p_user_id, p_organization_id)
    ON CONFLICT (user_id, organization_id) DO NOTHING;
    
    -- Assumir que está habilitado por padrão
    v_type_enabled := TRUE;
  ELSE
    -- Verificar se o tipo está habilitado
    EXECUTE format('SELECT $1.%I', p_type || '_enabled')
    INTO v_type_enabled
    USING v_preference;
    
    -- Se não conseguiu, assumir TRUE
    IF v_type_enabled IS NULL THEN
      v_type_enabled := TRUE;
    END IF;
    
    -- Verificar se in_app está habilitado
    IF NOT v_preference.in_app_enabled THEN
      RETURN NULL;
    END IF;
    
    -- Verificar horário de silêncio
    IF v_preference.dnd_enabled AND v_preference.dnd_start IS NOT NULL AND v_preference.dnd_end IS NOT NULL THEN
      IF CURRENT_TIME BETWEEN v_preference.dnd_start AND v_preference.dnd_end THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;
  
  -- Se o tipo não está habilitado, não criar
  IF NOT v_type_enabled THEN
    RETURN NULL;
  END IF;
  
  -- Criar a notificação
  INSERT INTO notifications (
    organization_id, user_id, type, title, message,
    reference_type, reference_id, actor_id, metadata
  ) VALUES (
    p_organization_id, p_user_id, p_type, p_title, p_message,
    p_reference_type, p_reference_id, p_actor_id, p_metadata
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 7. TRIGGER: Criar notificação ao inserir comentário com menções
-- ===========================================

-- Dropar função e trigger existentes
DROP TRIGGER IF EXISTS trigger_notify_mentions ON contact_comments;
DROP FUNCTION IF EXISTS notify_mentions_on_comment();

CREATE OR REPLACE FUNCTION notify_mentions_on_comment()
RETURNS TRIGGER AS $$
DECLARE
  mention_user_id UUID;
  actor_name TEXT;
BEGIN
  -- Se não tem menções, retornar
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Pegar nome do autor
  actor_name := COALESCE(NEW.created_by_name, 'Alguém');
  
  -- Criar notificação para cada usuário mencionado
  FOREACH mention_user_id IN ARRAY NEW.mentions
  LOOP
    -- Não notificar o próprio autor
    IF mention_user_id != NEW.created_by THEN
      PERFORM create_notification(
        NEW.organization_id,
        mention_user_id,
        'mention',
        actor_name || ' mencionou você',
        LEFT(NEW.content, 100),
        'comment',
        NEW.id,
        NEW.created_by,
        jsonb_build_object('contact_id', NEW.contact_id, 'conversation_id', NEW.conversation_id)
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_mentions ON contact_comments;
CREATE TRIGGER trigger_notify_mentions
  AFTER INSERT ON contact_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_mentions_on_comment();

-- ===========================================
-- 8. TRIGGER: Notificar quando tarefa é atribuída
-- ===========================================

-- Dropar função e trigger existentes
DROP TRIGGER IF EXISTS trigger_task_assigned ON tasks;
DROP FUNCTION IF EXISTS notify_task_assigned();

CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
  v_assigner_name TEXT;
BEGIN
  -- Só notifica se foi atribuída a alguém diferente do criador
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to != NEW.created_by THEN
    -- Buscar nome de quem atribuiu
    SELECT COALESCE(name, email) INTO v_assigner_name
    FROM users WHERE id = NEW.created_by;
    
    PERFORM create_notification(
      NEW.organization_id,
      NEW.assigned_to,
      'task_assigned',
      COALESCE(v_assigner_name, 'Alguém') || ' atribuiu uma tarefa a você',
      NEW.title,
      'task',
      NEW.id,
      NEW.created_by,
      jsonb_build_object('due_date', NEW.due_date)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_task_assigned ON tasks;
CREATE TRIGGER trigger_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW
  WHEN (NEW.assigned_to IS NOT NULL)
  EXECUTE FUNCTION notify_task_assigned();

-- ===========================================
-- 9. TRIGGER: Notificar quando tarefa é concluída
-- ===========================================

-- Dropar função e trigger existentes
DROP TRIGGER IF EXISTS trigger_task_completed ON tasks;
DROP FUNCTION IF EXISTS notify_task_completed();

CREATE OR REPLACE FUNCTION notify_task_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_completer_name TEXT;
BEGIN
  -- Só notifica se o status mudou para completed
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    -- Buscar nome de quem completou
    SELECT COALESCE(name, email) INTO v_completer_name
    FROM users WHERE id = NEW.completed_by;
    
    -- Notificar o criador da tarefa (se não for quem completou)
    IF NEW.created_by IS NOT NULL AND NEW.created_by != NEW.completed_by THEN
      PERFORM create_notification(
        NEW.organization_id,
        NEW.created_by,
        'task_completed',
        COALESCE(v_completer_name, 'Alguém') || ' concluiu a tarefa',
        NEW.title,
        'task',
        NEW.id,
        NEW.completed_by,
        '{}'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_task_completed ON tasks;
CREATE TRIGGER trigger_task_completed
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION notify_task_completed();

-- ===========================================
-- 10. TRIGGER: Notificar quando deal é atribuído
-- ===========================================

-- Dropar função e trigger existentes
DROP TRIGGER IF EXISTS trigger_deal_assigned ON deals;
DROP FUNCTION IF EXISTS notify_deal_assigned();

CREATE OR REPLACE FUNCTION notify_deal_assigned()
RETURNS TRIGGER AS $$
DECLARE
  v_assigner_name TEXT;
BEGIN
  -- Só notifica se foi atribuído a alguém diferente de quem criou/atualizou
  IF NEW.owner_id IS NOT NULL AND (OLD.owner_id IS NULL OR OLD.owner_id != NEW.owner_id) THEN
    -- Buscar nome de quem atribuiu
    SELECT COALESCE(name, email) INTO v_assigner_name
    FROM users WHERE id = COALESCE(NEW.updated_by, NEW.created_by);
    
    PERFORM create_notification(
      NEW.organization_id,
      NEW.owner_id,
      'deal_assigned',
      COALESCE(v_assigner_name, 'Alguém') || ' atribuiu um deal a você',
      NEW.title || ' - R$ ' || COALESCE(NEW.value::TEXT, '0'),
      'deal',
      NEW.id,
      COALESCE(NEW.updated_by, NEW.created_by),
      jsonb_build_object('value', NEW.value)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_deal_assigned ON deals;
CREATE TRIGGER trigger_deal_assigned
  AFTER INSERT OR UPDATE OF owner_id ON deals
  FOR EACH ROW
  WHEN (NEW.owner_id IS NOT NULL)
  EXECUTE FUNCTION notify_deal_assigned();

-- ===========================================
-- 11. TRIGGER: Notificar quando deal muda de estágio
-- ===========================================

-- Dropar função e trigger existentes
DROP TRIGGER IF EXISTS trigger_deal_stage_changed ON deals;
DROP FUNCTION IF EXISTS notify_deal_stage_changed();

CREATE OR REPLACE FUNCTION notify_deal_stage_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
BEGIN
  -- Só notifica se mudou de estágio e tem owner
  IF OLD.stage_id != NEW.stage_id AND NEW.owner_id IS NOT NULL THEN
    -- Buscar nomes dos estágios
    SELECT name INTO v_old_stage_name FROM pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO v_new_stage_name FROM pipeline_stages WHERE id = NEW.stage_id;
    
    PERFORM create_notification(
      NEW.organization_id,
      NEW.owner_id,
      'deal_stage_changed',
      'Deal movido para ' || COALESCE(v_new_stage_name, 'novo estágio'),
      NEW.title || ': ' || COALESCE(v_old_stage_name, 'Anterior') || ' → ' || COALESCE(v_new_stage_name, 'Novo'),
      'deal',
      NEW.id,
      NEW.updated_by,
      jsonb_build_object('old_stage', v_old_stage_name, 'new_stage', v_new_stage_name)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_deal_stage_changed ON deals;
CREATE TRIGGER trigger_deal_stage_changed
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION notify_deal_stage_changed();

-- ===========================================
-- 12. FUNÇÃO PARA VERIFICAR TAREFAS VENCENDO
-- (Execute via CRON - pg_cron ou API)
-- ===========================================

-- Dropar função existente
DROP FUNCTION IF EXISTS check_tasks_due_soon();

CREATE OR REPLACE FUNCTION check_tasks_due_soon()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_task RECORD;
BEGIN
  -- Buscar tarefas que vencem nas próximas 24h e não foram notificadas
  FOR v_task IN
    SELECT t.*, u.name as assigned_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.status NOT IN ('completed', 'cancelled')
      AND t.due_date IS NOT NULL
      AND t.due_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.reference_type = 'task'
          AND n.reference_id = t.id
          AND n.type = 'task_due_soon'
          AND n.created_at > NOW() - INTERVAL '24 hours'
      )
  LOOP
    -- Notificar o responsável
    IF v_task.assigned_to IS NOT NULL THEN
      PERFORM create_notification(
        v_task.organization_id,
        v_task.assigned_to,
        'task_due_soon',
        'Tarefa vence em breve',
        v_task.title || ' vence em ' || to_char(v_task.due_date, 'DD/MM às HH24:MI'),
        'task',
        v_task.id,
        NULL,
        jsonb_build_object('due_date', v_task.due_date)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 13. FUNÇÃO PARA VERIFICAR TAREFAS ATRASADAS
-- (Execute via CRON - pg_cron ou API)
-- ===========================================

-- Dropar função existente
DROP FUNCTION IF EXISTS check_tasks_overdue();

CREATE OR REPLACE FUNCTION check_tasks_overdue()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_task RECORD;
BEGIN
  -- Buscar tarefas atrasadas que não foram notificadas hoje
  FOR v_task IN
    SELECT t.*, u.name as assigned_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.status NOT IN ('completed', 'cancelled')
      AND t.due_date IS NOT NULL
      AND t.due_date < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.reference_type = 'task'
          AND n.reference_id = t.id
          AND n.type = 'task_overdue'
          AND n.created_at > NOW() - INTERVAL '24 hours'
      )
  LOOP
    -- Notificar o responsável
    IF v_task.assigned_to IS NOT NULL THEN
      PERFORM create_notification(
        v_task.organization_id,
        v_task.assigned_to,
        'task_overdue',
        'Tarefa atrasada!',
        v_task.title || ' estava prevista para ' || to_char(v_task.due_date, 'DD/MM'),
        'task',
        v_task.id,
        NULL,
        jsonb_build_object('due_date', v_task.due_date)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 14. HABILITAR REALTIME PARA NOTIFICAÇÕES
-- ===========================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ===========================================
-- PRONTO! Execute este SQL no Supabase SQL Editor
-- ===========================================
