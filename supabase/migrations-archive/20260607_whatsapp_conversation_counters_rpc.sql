-- =============================================
-- Onda 11 / B1 + N1
-- Counters atomicos pro hot path do webhook inbound.
--
-- Antes: webhook-processor.ts fazia
--   UPDATE ... SET unread_count = (conversation.unread_count || 0) + 1
-- com o valor lido em outro SELECT. Duas webhooks concorrentes pro mesmo
-- contato perdiam um increment. O mesmo vale pros counters da conta.
--
-- Estas duas functions SQL trocam o read-modify-write por um UPDATE atomico
-- usando COALESCE(col,0)+1 — o increment acontece num unico statement, sob
-- lock de row, entao concorrencia preserva a contagem real.
-- =============================================

CREATE OR REPLACE FUNCTION increment_conversation_inbound(
  p_conversation_id UUID,
  p_preview TEXT,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE whatsapp_cloud_conversations
     SET status                   = 'open',
         is_window_open           = TRUE,
         window_expires_at        = p_now + INTERVAL '24 hours',
         last_customer_message_at = p_now,
         last_message_at          = p_now,
         last_message_preview     = p_preview,
         last_message_direction   = 'inbound',
         unread_count             = COALESCE(unread_count, 0) + 1,
         updated_at               = p_now
   WHERE id = p_conversation_id;
$$;

CREATE OR REPLACE FUNCTION increment_account_inbound(
  p_account_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE whatsapp_business_accounts
     SET messages_received_today = COALESCE(messages_received_today, 0) + 1,
         total_messages_received = COALESCE(total_messages_received, 0) + 1,
         last_message_at         = p_now,
         last_webhook_at         = p_now,
         updated_at              = p_now
   WHERE id = p_account_id;
$$;

GRANT EXECUTE ON FUNCTION increment_conversation_inbound(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION increment_account_inbound(UUID, TIMESTAMPTZ) TO service_role;
