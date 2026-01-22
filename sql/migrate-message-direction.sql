-- =====================================================
-- SQL: MIGRAR direction PARA PADRÃO inbound/outbound
-- Execute este SQL no Supabase para corrigir mensagens antigas
-- =====================================================

-- Verificar quantas mensagens precisam ser migradas
SELECT 
  direction, 
  COUNT(*) as total 
FROM whatsapp_messages 
GROUP BY direction;

-- Migrar incoming -> inbound
UPDATE whatsapp_messages 
SET direction = 'inbound' 
WHERE direction = 'incoming';

-- Migrar outgoing -> outbound
UPDATE whatsapp_messages 
SET direction = 'outbound' 
WHERE direction = 'outgoing';

-- Verificar resultado
SELECT 
  direction, 
  COUNT(*) as total 
FROM whatsapp_messages 
GROUP BY direction;

-- =====================================================
-- MIGRAR last_message_direction nas conversas
-- =====================================================

UPDATE whatsapp_conversations 
SET last_message_direction = 'inbound' 
WHERE last_message_direction = 'incoming';

UPDATE whatsapp_conversations 
SET last_message_direction = 'outbound' 
WHERE last_message_direction = 'outgoing';

-- Log
DO $$ 
BEGIN
  RAISE NOTICE 'Migração de direction concluída!';
END $$;
