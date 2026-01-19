-- ============================================
-- PARTE 2: ÍNDICES E RLS
-- Execute após a Parte 1
-- ============================================

-- Dropar índices existentes
DROP INDEX IF EXISTS idx_notifications_user_org;
DROP INDEX IF EXISTS idx_notifications_unread;
DROP INDEX IF EXISTS idx_notifications_type;
DROP INDEX IF EXISTS idx_notifications_reference;
DROP INDEX IF EXISTS idx_notifications_created;
DROP INDEX IF EXISTS idx_comment_mentions_user;
DROP INDEX IF EXISTS idx_comment_mentions_comment;
DROP INDEX IF EXISTS idx_task_reminders_pending;
DROP INDEX IF EXISTS idx_task_reminders_user;

-- Criar índices
CREATE INDEX idx_notifications_user_org ON notifications(user_id, organization_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, organization_id) WHERE read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_reference ON notifications(reference_type, reference_id);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

CREATE INDEX idx_comment_mentions_user ON comment_mentions(mentioned_user_id);
CREATE INDEX idx_comment_mentions_comment ON comment_mentions(comment_id);

CREATE INDEX idx_task_reminders_pending ON task_reminders(remind_at) WHERE sent = false;
CREATE INDEX idx_task_reminders_user ON task_reminders(user_id);

-- Habilitar RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;

-- Dropar policies existentes
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role can manage all notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can manage own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can view mentions they're involved in" ON comment_mentions;
DROP POLICY IF EXISTS "Service role can manage mentions" ON comment_mentions;
DROP POLICY IF EXISTS "Users can view own reminders" ON task_reminders;
DROP POLICY IF EXISTS "Users can manage own reminders" ON task_reminders;

-- Criar policies
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all notifications"
    ON notifications FOR ALL TO service_role
    USING (true);

CREATE POLICY "Users can view own preferences"
    ON notification_preferences FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can manage own preferences"
    ON notification_preferences FOR ALL TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can view mentions they're involved in"
    ON comment_mentions FOR SELECT TO authenticated
    USING (mentioned_user_id = auth.uid());

CREATE POLICY "Service role can manage mentions"
    ON comment_mentions FOR ALL TO service_role
    USING (true);

CREATE POLICY "Users can view own reminders"
    ON task_reminders FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can manage own reminders"
    ON task_reminders FOR ALL TO authenticated
    USING (user_id = auth.uid());

SELECT 'PARTE 2 CONCLUÍDA - Índices e RLS criados!' as status;
