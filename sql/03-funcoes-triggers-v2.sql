-- ============================================
-- PARTE 3: FUNÇÕES E TRIGGERS (CORRIGIDO)
-- Sem triggers de deals (coluna owner_id não existe)
-- ============================================

-- Dropar triggers existentes
DROP TRIGGER IF EXISTS trigger_process_comment_mentions ON contact_comments;
DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON tasks;
DROP TRIGGER IF EXISTS trigger_notify_task_completed ON tasks;
DROP TRIGGER IF EXISTS trigger_notify_deal_assigned ON deals;
DROP TRIGGER IF EXISTS trigger_notify_deal_stage_changed ON deals;

-- Dropar funções existentes
DROP FUNCTION IF EXISTS create_notification CASCADE;
DROP FUNCTION IF EXISTS extract_mentions CASCADE;
DROP FUNCTION IF EXISTS process_comment_mentions CASCADE;
DROP FUNCTION IF EXISTS notify_task_assigned CASCADE;
DROP FUNCTION IF EXISTS notify_task_completed CASCADE;
DROP FUNCTION IF EXISTS notify_deal_assigned CASCADE;
DROP FUNCTION IF EXISTS notify_deal_stage_changed CASCADE;
DROP FUNCTION IF EXISTS check_tasks_due_soon CASCADE;
DROP FUNCTION IF EXISTS check_tasks_overdue CASCADE;

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
        BEGIN
            v_user_id := v_match::UUID;
            IF v_user_id IS NOT NULL THEN
                v_mentions := array_append(v_mentions, v_user_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
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
    v_actor_name TEXT;
BEGIN
    FOR v_mention_id IN SELECT unnest(extract_mentions(NEW.content))
    LOOP
        IF v_mention_id = NEW.user_id THEN
            CONTINUE;
        END IF;
        
        SELECT name, phone INTO v_contact FROM contacts WHERE id = NEW.contact_id;
        
        SELECT raw_user_meta_data->>'name' INTO v_actor_name 
        FROM auth.users WHERE id = NEW.user_id;
        
        v_notification_id := create_notification(
            NEW.organization_id,
            v_mention_id,
            'mention',
            COALESCE(v_actor_name, 'Alguém') || ' mencionou você em um comentário',
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
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to != COALESCE(NEW.updated_by, NEW.created_by, NEW.assigned_to) THEN
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
                jsonb_build_object('task_title', NEW.title, 'due_date', NEW.due_date)
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

-- Função para verificar tarefas vencendo (para cron)
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

-- Função para verificar tarefas atrasadas (para cron)
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

SELECT 'PARTE 3 CONCLUÍDA - Funções e triggers criados!' as status;

-- ============================================
-- NOTA: Triggers de deals foram removidos porque
-- a tabela deals não tem coluna owner_id.
-- Se quiser adicionar depois, verifique o nome
-- correto da coluna de responsável na tabela deals.
-- ============================================
