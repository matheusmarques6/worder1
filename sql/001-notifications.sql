-- ============================================
-- SISTEMA DE NOTIFICAÇÕES - MIGRAÇÃO SQL
-- Versão compatível com Supabase (sem FK para users)
-- ============================================

-- Dropar objetos existentes primeiro
DROP INDEX IF EXISTS idx_notifications_user_org;
DROP INDEX IF EXISTS idx_notifications_unread;
DROP INDEX IF EXISTS idx_notifications_type;
DROP INDEX IF EXISTS idx_notifications_reference;
DROP INDEX IF EXISTS idx_notifications_created;
DROP INDEX IF EXISTS idx_comment_mentions_user;
DROP INDEX IF EXISTS idx_comment_mentions_comment;
DROP INDEX IF EXISTS idx_task_reminders_pending;
DROP INDEX IF EXISTS idx_task_reminders_user;

DROP TRIGGER IF EXISTS trigger_process_comment_mentions ON contact_comments;
DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON tasks;
DROP TRIGGER IF EXISTS trigger_notify_task_completed ON tasks;
DROP TRIGGER IF EXISTS trigger_notify_deal_assigned ON deals;
DROP TRIGGER IF EXISTS trigger_notify_deal_stage_changed ON deals;

DROP FUNCTION IF EXISTS create_notification CASCADE;
DROP FUNCTION IF EXISTS extract_mentions CASCADE;
DROP FUNCTION IF EXISTS process_comment_mentions CASCADE;
DROP FUNCTION IF EXISTS notify_task_assigned CASCADE;
DROP FUNCTION IF EXISTS notify_task_completed CASCADE;
DROP FUNCTION IF EXISTS notify_deal_assigned CASCADE;
DROP FUNCTION IF EXISTS notify_deal_stage_changed CASCADE;
DROP FUNCTION IF EXISTS check_tasks_due_soon CASCADE;
DROP FUNCTION IF EXISTS check_tasks_overdue CASCADE;
DROP FUNCTION IF EXISTS mark_notification_read CASCADE;
DROP FUNCTION IF EXISTS mark_all_notifications_read CASCADE;

-- ============================================
-- 1. TABELAS
-- ============================================

-- Tabela Principal de Notificações
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- ID do usuário (auth.users)
    
    type TEXT NOT NULL CHECK (type IN (
        'mention',
        'task_assigned',
        'task_due_soon',
        'task_overdue',
        'task_completed',
        'comment_reply',
        'deal_assigned',
        'deal_stage_changed',
        'whatsapp_mention',
        'reminder'
    )),
    
    title TEXT NOT NULL,
    message TEXT,
    
    reference_type TEXT,
    reference_id UUID,
    
    actor_id UUID, -- Quem gerou a notificação
    
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Preferências de Notificação
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    mention_enabled BOOLEAN DEFAULT true,
    task_assigned_enabled BOOLEAN DEFAULT true,
    task_due_soon_enabled BOOLEAN DEFAULT true,
    task_overdue_enabled BOOLEAN DEFAULT true,
    task_completed_enabled BOOLEAN DEFAULT true,
    comment_reply_enabled BOOLEAN DEFAULT true,
    deal_assigned_enabled BOOLEAN DEFAULT true,
    deal_stage_changed_enabled BOOLEAN DEFAULT true,
    whatsapp_mention_enabled BOOLEAN DEFAULT true,
    reminder_enabled BOOLEAN DEFAULT true,
    
    in_app_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT false,
    
    dnd_enabled BOOLEAN DEFAULT false,
    dnd_start TIME DEFAULT '22:00',
    dnd_end TIME DEFAULT '08:00',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, organization_id)
);

-- Tabela de Menções (comentários)
CREATE TABLE IF NOT EXISTS comment_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES contact_comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(comment_id, mentioned_user_id)
);

-- Tabela de Lembretes de Tarefas
CREATE TABLE IF NOT EXISTS task_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    remind_at TIMESTAMPTZ NOT NULL,
    reminder_type TEXT DEFAULT 'custom' CHECK (reminder_type IN ('due_soon', 'overdue', 'custom')),
    
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ÍNDICES
-- ============================================

CREATE INDEX idx_notifications_user_org ON notifications(user_id, organization_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, organization_id) WHERE read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_reference ON notifications(reference_type, reference_id);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

CREATE INDEX idx_comment_mentions_user ON comment_mentions(mentioned_user_id);
CREATE INDEX idx_comment_mentions_comment ON comment_mentions(comment_id);

CREATE INDEX idx_task_reminders_pending ON task_reminders(remind_at) WHERE sent = false;
CREATE INDEX idx_task_reminders_user ON task_reminders(user_id);

-- ============================================
-- 3. RLS
-- ============================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role can manage all notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can manage own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can view mentions they're involved in" ON comment_mentions;
DROP POLICY IF EXISTS "Service role can manage mentions" ON comment_mentions;
DROP POLICY IF EXISTS "Users can view own reminders" ON task_reminders;
DROP POLICY IF EXISTS "Users can manage own reminders" ON task_reminders;

CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all notifications"
    ON notifications FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "Users can view own preferences"
    ON notification_preferences FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can manage own preferences"
    ON notification_preferences FOR ALL
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can view mentions they're involved in"
    ON comment_mentions FOR SELECT
    TO authenticated
    USING (mentioned_user_id = auth.uid());

CREATE POLICY "Service role can manage mentions"
    ON comment_mentions FOR ALL
    TO service_role
    USING (true);

CREATE POLICY "Users can view own reminders"
    ON task_reminders FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can manage own reminders"
    ON task_reminders FOR ALL
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================
-- 4. FUNÇÕES
-- ============================================

-- Função para criar notificação
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
    v_prefs notification_preferences%ROWTYPE;
    v_pref_column TEXT;
    v_is_enabled BOOLEAN;
BEGIN
    SELECT * INTO v_prefs
    FROM notification_preferences
    WHERE user_id = p_user_id AND organization_id = p_organization_id;
    
    IF NOT FOUND THEN
        INSERT INTO notification_preferences (user_id, organization_id)
        VALUES (p_user_id, p_organization_id)
        RETURNING * INTO v_prefs;
    END IF;
    
    IF NOT v_prefs.in_app_enabled THEN
        RETURN NULL;
    END IF;
    
    v_pref_column := p_type || '_enabled';
    EXECUTE format('SELECT ($1).%I', v_pref_column) INTO v_is_enabled USING v_prefs;
    
    IF v_is_enabled IS FALSE THEN
        RETURN NULL;
    END IF;
    
    INSERT INTO notifications (
        organization_id, user_id, type, title, message,
        reference_type, reference_id, actor_id, metadata
    ) VALUES (
        p_organization_id, p_user_id, p_type, p_title, p_message,
        p_reference_type, p_reference_id, p_actor_id, p_metadata
    ) RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para extrair menções do texto
CREATE OR REPLACE FUNCTION extract_mentions(p_text TEXT)
RETURNS UUID[] AS $$
DECLARE
    v_mentions UUID[] := '{}';
    v_match TEXT;
    v_user_id UUID;
BEGIN
    FOR v_match IN 
        SELECT (regexp_matches(p_text, '@\[[^\]]+\]\(([a-f0-9-]+)\)', 'g'))[1]
    LOOP
        v_user_id := v_match::UUID;
        IF v_user_id IS NOT NULL THEN
            v_mentions := array_append(v_mentions, v_user_id);
        END IF;
    END LOOP;
    
    RETURN v_mentions;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para processar menções em comentários
CREATE OR REPLACE FUNCTION process_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
    v_mention_id UUID;
    v_notification_id UUID;
    v_contact RECORD;
    v_actor RECORD;
BEGIN
    FOR v_mention_id IN SELECT unnest(extract_mentions(NEW.content))
    LOOP
        IF v_mention_id = NEW.user_id THEN
            CONTINUE;
        END IF;
        
        SELECT * INTO v_contact FROM contacts WHERE id = NEW.contact_id;
        SELECT id, raw_user_meta_data->>'name' as name 
        INTO v_actor 
        FROM auth.users WHERE id = NEW.user_id;
        
        v_notification_id := create_notification(
            NEW.organization_id,
            v_mention_id,
            'mention',
            COALESCE(v_actor.name, 'Alguém') || ' mencionou você em um comentário',
            LEFT(NEW.content, 100),
            'contact',
            NEW.contact_id,
            NEW.user_id,
            jsonb_build_object(
                'comment_id', NEW.id,
                'contact_name', COALESCE(v_contact.name, v_contact.phone)
            )
        );
        
        INSERT INTO comment_mentions (comment_id, mentioned_user_id, notification_id)
        VALUES (NEW.id, v_mention_id, v_notification_id)
        ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_process_comment_mentions
    AFTER INSERT ON contact_comments
    FOR EACH ROW
    EXECUTE FUNCTION process_comment_mentions();

-- Trigger para notificar atribuição de tarefa
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to != COALESCE(NEW.created_by, NEW.assigned_to) THEN
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
            PERFORM create_notification(
                NEW.organization_id,
                NEW.assigned_to,
                'task_assigned',
                'Nova tarefa atribuída a você',
                NEW.title,
                'task',
                NEW.id,
                COALESCE(NEW.updated_by, NEW.created_by),
                jsonb_build_object(
                    'task_title', NEW.title,
                    'due_date', NEW.due_date
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_task_assigned
    AFTER INSERT OR UPDATE OF assigned_to ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_assigned();

-- Trigger para notificar conclusão de tarefa
CREATE OR REPLACE FUNCTION notify_task_completed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        IF NEW.created_by IS NOT NULL AND NEW.created_by != NEW.updated_by THEN
            PERFORM create_notification(
                NEW.organization_id,
                NEW.created_by,
                'task_completed',
                'Tarefa concluída',
                NEW.title || ' foi marcada como concluída',
                'task',
                NEW.id,
                NEW.updated_by,
                jsonb_build_object('task_title', NEW.title)
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_task_completed
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_completed();

-- Trigger para notificar atribuição de deal
CREATE OR REPLACE FUNCTION notify_deal_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_contact RECORD;
BEGIN
    IF NEW.owner_id IS NOT NULL AND NEW.owner_id != COALESCE(NEW.updated_by, NEW.created_by) THEN
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN
            SELECT * INTO v_contact FROM contacts WHERE id = NEW.contact_id;
            
            PERFORM create_notification(
                NEW.organization_id,
                NEW.owner_id,
                'deal_assigned',
                'Novo deal atribuído a você',
                NEW.title || ' - ' || COALESCE(v_contact.name, v_contact.phone, 'Cliente'),
                'deal',
                NEW.id,
                COALESCE(NEW.updated_by, NEW.created_by),
                jsonb_build_object(
                    'deal_title', NEW.title,
                    'deal_value', NEW.value,
                    'contact_name', COALESCE(v_contact.name, v_contact.phone)
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_deal_assigned
    AFTER INSERT OR UPDATE OF owner_id ON deals
    FOR EACH ROW
    EXECUTE FUNCTION notify_deal_assigned();

-- Trigger para notificar mudança de estágio do deal
CREATE OR REPLACE FUNCTION notify_deal_stage_changed()
RETURNS TRIGGER AS $$
DECLARE
    v_old_stage RECORD;
    v_new_stage RECORD;
BEGIN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
        SELECT * INTO v_old_stage FROM crm_pipeline_stages WHERE id = OLD.stage_id;
        SELECT * INTO v_new_stage FROM crm_pipeline_stages WHERE id = NEW.stage_id;
        
        IF NEW.owner_id IS NOT NULL AND NEW.owner_id != NEW.updated_by THEN
            PERFORM create_notification(
                NEW.organization_id,
                NEW.owner_id,
                'deal_stage_changed',
                'Deal movido para ' || COALESCE(v_new_stage.name, 'novo estágio'),
                NEW.title || ' foi movido de "' || COALESCE(v_old_stage.name, '?') || '" para "' || COALESCE(v_new_stage.name, '?') || '"',
                'deal',
                NEW.id,
                NEW.updated_by,
                jsonb_build_object(
                    'deal_title', NEW.title,
                    'old_stage', v_old_stage.name,
                    'new_stage', v_new_stage.name
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_deal_stage_changed
    AFTER UPDATE OF stage_id ON deals
    FOR EACH ROW
    EXECUTE FUNCTION notify_deal_stage_changed();

-- Função para verificar tarefas vencendo (cron)
CREATE OR REPLACE FUNCTION check_tasks_due_soon()
RETURNS void AS $$
DECLARE
    v_task RECORD;
BEGIN
    FOR v_task IN
        SELECT t.*
        FROM tasks t
        WHERE t.status != 'completed'
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
                jsonb_build_object('task_title', v_task.title, 'due_date', v_task.due_date)
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar tarefas atrasadas (cron)
CREATE OR REPLACE FUNCTION check_tasks_overdue()
RETURNS void AS $$
DECLARE
    v_task RECORD;
BEGIN
    FOR v_task IN
        SELECT t.*
        FROM tasks t
        WHERE t.status != 'completed'
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
        IF v_task.assigned_to IS NOT NULL THEN
            PERFORM create_notification(
                v_task.organization_id,
                v_task.assigned_to,
                'task_overdue',
                'Tarefa atrasada!',
                v_task.title || ' estava prevista para ' || to_char(v_task.due_date, 'DD/MM às HH24:MI'),
                'task',
                v_task.id,
                NULL,
                jsonb_build_object('task_title', v_task.title, 'due_date', v_task.due_date)
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FIM DA MIGRAÇÃO
-- ============================================

SELECT 'Migração de notificações concluída!' as status;
