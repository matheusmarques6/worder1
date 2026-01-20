-- =============================================
-- Sprint 2: Migration para Signed URLs
-- Execute no Supabase SQL Editor
-- =============================================

-- Adicionar campo para armazenar path no Storage
-- Permite regenerar Signed URLs quando expirarem
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

-- Index para buscas
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_storage_path 
ON whatsapp_messages (media_storage_path) 
WHERE media_storage_path IS NOT NULL;

-- Verificar
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'whatsapp_messages' 
AND column_name = 'media_storage_path';
