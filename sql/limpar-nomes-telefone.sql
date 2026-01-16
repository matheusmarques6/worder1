-- =============================================
-- SQL: Limpar contact_name que são números de telefone
-- Execute no Supabase SQL Editor
-- =============================================

-- Verificar quantos registros têm telefone como nome
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN contact_name ~ '^\d{10,15}$' OR contact_name ~ '^\+?\d{10,15}$' THEN 1 END) as com_telefone_como_nome
FROM whatsapp_conversations;

-- Limpar contact_name que são apenas números (telefone)
-- Isso vai permitir que o frontend mostre o telefone formatado
UPDATE whatsapp_conversations 
SET contact_name = NULL 
WHERE contact_name ~ '^\d{10,15}$' 
   OR contact_name ~ '^\+?\d{10,15}$'
   OR contact_name = contact_phone;

-- Verificar resultado
SELECT 
  id, 
  contact_phone, 
  contact_name,
  CASE WHEN contact_name IS NULL THEN 'Vai mostrar telefone' ELSE 'Tem nome' END as status
FROM whatsapp_conversations 
ORDER BY updated_at DESC 
LIMIT 20;
