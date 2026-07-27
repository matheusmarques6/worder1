-- =============================================
-- Migration: Enable Realtime for WhatsApp Cloud API inbox
-- Postgres Realtime NAO publica VIEWs (whatsapp_inbox_messages),
-- entao publicamos as tabelas BASE do Cloud API.
--
-- RLS: as policies de SELECT org-scoped nessas tabelas ja existem
-- (supabase/migrations/001_enable_rls.sql, via auth.organization_id())
-- e sao exatamente o que o Realtime usa para autorizar entrega de eventos.
-- O client precisa de JWT autenticado (realtime.setAuth) — ver
-- endpoint /api/auth/realtime-token.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'whatsapp_cloud_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_cloud_conversations;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'whatsapp_cloud_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_cloud_messages;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: sem isso, eventos UPDATE carregam apenas a PK
-- em `old` e o Realtime pode falhar o check de RLS/filtro em updates
-- parciais (ex.: status de mensagem delivered -> read).
ALTER TABLE whatsapp_cloud_conversations REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_cloud_messages       REPLICA IDENTITY FULL;

-- Verificacao
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('whatsapp_cloud_conversations', 'whatsapp_cloud_messages');
