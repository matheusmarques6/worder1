-- =============================================
-- Onda 13 / hotfix — notifications.type CHECK rejeitava todos os tipos
-- de notificacao fora do CRM.
--
-- O CHECK original so permitia 10 tipos (mention, task_*, deal_*,
-- whatsapp_mention, reminder). TODO insert com type novo falhava com
-- 23514 — e os callers tratam insert de notificacao como best-effort,
-- entao a falha era 100% silenciosa. Resultado: nenhuma notificacao de
-- IA desativada / webhook morto / worker travado / automacao / pedido
-- chegou ao sino, nunca.
--
-- Esta migration recria o CHECK com a uniao: tipos originais + todos os
-- tipos efetivamente usados no codigo (grep "from('notifications')").
-- =============================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    -- originais (CRM)
    'mention'::text,
    'task_assigned'::text,
    'task_due_soon'::text,
    'task_overdue'::text,
    'task_completed'::text,
    'comment_reply'::text,
    'deal_assigned'::text,
    'deal_stage_changed'::text,
    'whatsapp_mention'::text,
    'reminder'::text,
    -- usados no codigo e bloqueados ate agora
    'automation'::text,
    'contact'::text,
    'order'::text,
    'shopify_abandoned_cart'::text,
    'whatsapp_ai_disabled'::text,
    'whatsapp_ai_gave_up'::text,
    'whatsapp_campaign_worker_stalled'::text,
    'whatsapp_webhook_dead'::text,
    'whatsapp_dead_events'::text
  ]));
