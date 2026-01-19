-- ============================================
-- RESET COMPLETO - SISTEMA DE NOTIFICAÇÕES
-- ATENÇÃO: Isso apaga todos os dados existentes!
-- ============================================

-- Dropar triggers primeiro
DROP TRIGGER IF EXISTS trigger_process_comment_mentions ON contact_comments;
DROP TRIGGER IF EXISTS trigger_notify_task_assigned ON tasks;
DROP TRIGGER IF EXISTS trigger_notify_task_completed ON tasks;
DROP TRIGGER IF EXISTS trigger_notify_deal_assigned ON deals;
DROP TRIGGER IF EXISTS trigger_notify_deal_stage_changed ON deals;

-- Dropar funções
DROP FUNCTION IF EXISTS create_notification CASCADE;
DROP FUNCTION IF EXISTS extract_mentions CASCADE;
DROP FUNCTION IF EXISTS process_comment_mentions CASCADE;
DROP FUNCTION IF EXISTS notify_task_assigned CASCADE;
DROP FUNCTION IF EXISTS notify_task_completed CASCADE;
DROP FUNCTION IF EXISTS notify_deal_assigned CASCADE;
DROP FUNCTION IF EXISTS notify_deal_stage_changed CASCADE;
DROP FUNCTION IF EXISTS check_tasks_due_soon CASCADE;
DROP FUNCTION IF EXISTS check_tasks_overdue CASCADE;

-- Dropar tabelas (ordem importa por causa das FKs)
DROP TABLE IF EXISTS task_reminders CASCADE;
DROP TABLE IF EXISTS comment_mentions CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

SELECT 'Tabelas antigas removidas!' as status;
