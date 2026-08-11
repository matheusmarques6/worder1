-- ============================================================
-- Fix: trigger update_conversation_on_message() quebrava TODO
-- insert em whatsapp_messages por referenciar colunas inexistentes
-- (total_messages, last_message_type) em whatsapp_conversations.
--
-- Sintoma em produção: whatsapp_messages permanentemente vazia —
-- qualquer INSERT (Evolution, Meta, message-service) abortava com
-- "column total_messages does not exist".
--
-- Aplicada em produção via Supabase MCP em 2026-07-20
-- (migration: fix_conversation_trigger_missing_columns).
-- Idempotente.
-- ============================================================

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_type TEXT;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS total_messages INTEGER DEFAULT 0;
