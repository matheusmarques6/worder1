-- =============================================
-- Migration: Enable Realtime for WhatsApp Cloud API inbox
-- Postgres Realtime NAO publica VIEWs (whatsapp_inbox_messages),
-- entao publicamos as tabelas BASE do Cloud API.
--
-- RLS: o Realtime usa a policy de SELECT de cada tabela para autorizar a
-- entrega de cada evento, e o client precisa de JWT autenticado
-- (realtime.setAuth) — ver endpoint /api/auth/realtime-token.
--
-- CORRECAO (2026-07-30): este cabecalho afirmava que as policies vinham de
-- 001_enable_rls.sql via auth.organization_id(). Nao vinham. Aquele arquivo
-- comeca criando `auth.organization_id()`, o Supabase nega DDL no schema
-- `auth` para o role do projeto, e a migration aborta ali — nenhuma das
-- policies dele existe em producao. As policies que estao nessas tabelas
-- tem origem desconhecida e conteudo nao auditado. Rode
-- supabase/audits/2026-07-30_rls_realtime_audit.sql antes de assumir que o
-- isolamento entre organizacoes esta correto.
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
