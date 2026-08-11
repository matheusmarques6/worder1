-- =============================================
-- Task 6 (ai-media-understanding) — notifications.type CHECK bloqueava
-- 'whatsapp_ai_media_handoff'.
--
-- runMediaFallback() (cloud-runner.ts) insere esse tipo quando a mídia
-- inbound (áudio/imagem) não pôde ser interpretada e o agente foi pausado
-- (media_fallback.mode='handoff'). Sem esta migration, o INSERT falha com
-- 23514 e o erro é engolido (o insert de notificação é best-effort) — a
-- conversa fica pausada (ai_enabled=false) mas NINGUÉM é avisado.
--
-- Recria o CHECK (mesmo padrão de 20260612_notifications_type_check_expand.sql):
-- lista completa anterior + o tipo novo. Idempotente (DROP IF EXISTS + ADD).
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
    -- expandidos em 20260612 (usados no codigo e antes bloqueados)
    'automation'::text,
    'contact'::text,
    'order'::text,
    'shopify_abandoned_cart'::text,
    'whatsapp_ai_disabled'::text,
    'whatsapp_ai_gave_up'::text,
    'whatsapp_campaign_worker_stalled'::text,
    'whatsapp_webhook_dead'::text,
    'whatsapp_dead_events'::text,
    -- novo (Task 6 / ai-media-understanding): handoff de midia nao interpretada
    'whatsapp_ai_media_handoff'::text
  ]));
