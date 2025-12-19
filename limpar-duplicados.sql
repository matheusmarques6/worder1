-- =====================================================
-- PASSO 1: Limpar conversas duplicadas (manter a mais recente)
-- =====================================================
DELETE FROM whatsapp_messages 
WHERE conversation_id IN (
  SELECT id FROM whatsapp_conversations
  WHERE id NOT IN (
    SELECT DISTINCT ON (phone_number, organization_id) id
    FROM whatsapp_conversations
    ORDER BY phone_number, organization_id, created_at DESC
  )
);

DELETE FROM whatsapp_conversations
WHERE id NOT IN (
  SELECT DISTINCT ON (phone_number, organization_id) id
  FROM whatsapp_conversations
  ORDER BY phone_number, organization_id, created_at DESC
);

-- =====================================================
-- PASSO 2: Limpar contatos duplicados (manter o mais recente)
-- =====================================================
DELETE FROM whatsapp_contacts
WHERE id NOT IN (
  SELECT DISTINCT ON (phone_number, organization_id) id
  FROM whatsapp_contacts
  ORDER BY phone_number, organization_id, created_at DESC
);

-- =====================================================
-- PASSO 3: Verificar - deve mostrar 0 duplicados
-- =====================================================
SELECT phone_number, organization_id, COUNT(*) as total
FROM whatsapp_conversations
GROUP BY phone_number, organization_id
HAVING COUNT(*) > 1;

SELECT phone_number, organization_id, COUNT(*) as total
FROM whatsapp_contacts
GROUP BY phone_number, organization_id
HAVING COUNT(*) > 1;
