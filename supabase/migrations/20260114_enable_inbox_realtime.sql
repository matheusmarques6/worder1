-- =============================================
-- Migration: Enable Realtime for WhatsApp
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable realtime for whatsapp_conversations
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'whatsapp_conversations already in publication';
END $$;

-- Enable realtime for whatsapp_messages
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'whatsapp_messages already in publication';
END $$;

-- Enable realtime for whatsapp_instances (para status de conexão)
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'whatsapp_instances already in publication';
END $$;

-- Enable realtime for contacts
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'contacts already in publication';
END $$;

-- =============================================
-- VERIFICAR SE FUNCIONOU
-- =============================================
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
