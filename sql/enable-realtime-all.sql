-- =====================================================
-- SQL: VERIFICAR E HABILITAR REALTIME
-- Execute este SQL no Supabase
-- =====================================================

-- Verificar quais tabelas estão no Realtime
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Habilitar Realtime nas tabelas do WhatsApp (se não estiverem)
DO $$ 
BEGIN
  -- whatsapp_messages
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
    RAISE NOTICE 'Tabela whatsapp_messages adicionada ao Realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Tabela whatsapp_messages já está no Realtime';
  END;
  
  -- whatsapp_conversations
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
    RAISE NOTICE 'Tabela whatsapp_conversations adicionada ao Realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Tabela whatsapp_conversations já está no Realtime';
  END;
  
  -- whatsapp_instances
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
    RAISE NOTICE 'Tabela whatsapp_instances adicionada ao Realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Tabela whatsapp_instances já está no Realtime';
  END;
  
  -- whatsapp_contacts
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_contacts;
    RAISE NOTICE 'Tabela whatsapp_contacts adicionada ao Realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Tabela whatsapp_contacts já está no Realtime';
  END;
  
  -- notifications
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    RAISE NOTICE 'Tabela notifications adicionada ao Realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Tabela notifications já está no Realtime';
  END;
  
  -- contact_comments
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE contact_comments;
    RAISE NOTICE 'Tabela contact_comments adicionada ao Realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Tabela contact_comments já está no Realtime';
  END;
END $$;

-- Verificar novamente
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
