-- ============================================================
-- Índices únicos exigidos pelos upserts do fluxo unificado:
--
-- 1) whatsapp_messages.wamid: o índice parcial anterior
--    (WHERE wamid IS NOT NULL) não é inferível por
--    ON CONFLICT (wamid) via PostgREST (erro 42P10).
--    Troca por índice único FULL — múltiplos NULLs continuam
--    permitidos (NULLS DISTINCT, default do Postgres).
--
-- 2) whatsapp_conversations (instance_id, contact_phone):
--    conversation-service usa ON CONFLICT (instance_id,
--    contact_phone), que exige índice único FULL correspondente.
--
-- Aplicada em produção via Supabase MCP em 2026-07-20
-- (migration: unified_inbox_unique_indexes).
-- Idempotente.
-- ============================================================

DROP INDEX IF EXISTS idx_whatsapp_messages_wamid;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wamid_unique
  ON public.whatsapp_messages (wamid);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_instance_phone_unique
  ON public.whatsapp_conversations (instance_id, contact_phone);
