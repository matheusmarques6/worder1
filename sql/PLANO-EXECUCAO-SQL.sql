-- ============================================================================
-- PLANO DE EXECUÇÃO: CORREÇÕES WORDER
-- Data: 21 de Janeiro de 2026
-- Autor: Claude (baseado na análise do Chatwoot)
-- ============================================================================
-- 
-- EXECUTE NA ORDEM! Cada fase depende da anterior.
-- Recomendo rodar uma fase por vez e verificar o resultado.
--
-- ============================================================================

-- ============================================================================
-- FASE 0: BACKUP (IMPORTANTE!)
-- ============================================================================
-- Antes de qualquer coisa, faça backup das tabelas que serão modificadas

-- Criar tabela de backup das conversas
CREATE TABLE IF NOT EXISTS _backup_whatsapp_conversations_20260121 AS 
SELECT * FROM whatsapp_conversations;

-- Criar tabela de backup das mensagens
CREATE TABLE IF NOT EXISTS _backup_whatsapp_messages_20260121 AS 
SELECT * FROM whatsapp_messages;

-- Verificar backups
SELECT 'conversations' as tabela, COUNT(*) as registros FROM _backup_whatsapp_conversations_20260121
UNION ALL
SELECT 'messages' as tabela, COUNT(*) as registros FROM _backup_whatsapp_messages_20260121;


-- ============================================================================
-- FASE 1: LIMPAR CONVERSAS DUPLICADAS
-- ============================================================================
-- Problema: Race condition criou 2 conversas para o mesmo telefone
-- Solução: Mover mensagens para a conversa mais antiga e deletar a duplicada

-- 1.1 Mover mensagens da conversa duplicada para a original
UPDATE whatsapp_messages
SET 
  conversation_id = '3661ee37-e313-47cb-988a-d7a9e9d365dc',
  updated_at = NOW()
WHERE conversation_id = 'b5dc3228-c03b-457e-94d9-8666fdaa8640';

-- 1.2 Deletar a conversa duplicada
DELETE FROM whatsapp_conversations 
WHERE id = 'b5dc3228-c03b-457e-94d9-8666fdaa8640';

-- 1.3 Verificar resultado
SELECT 
  id,
  contact_phone,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = c.id) as mensagens
FROM whatsapp_conversations c
WHERE contact_phone = '553198068077';


-- ============================================================================
-- FASE 2: SINCRONIZAR phone_number COM contact_phone
-- ============================================================================
-- Problema: Algumas conversas têm contact_phone mas phone_number é NULL
-- Solução: Sincronizar os campos

-- 2.1 Atualizar phone_number onde está NULL
UPDATE whatsapp_conversations
SET 
  phone_number = contact_phone,
  updated_at = NOW()
WHERE phone_number IS NULL 
  AND contact_phone IS NOT NULL;

-- 2.2 Verificar resultado
SELECT 
  COUNT(*) as total,
  COUNT(phone_number) as com_phone_number,
  COUNT(contact_phone) as com_contact_phone,
  COUNT(CASE WHEN phone_number IS NULL THEN 1 END) as phone_number_null
FROM whatsapp_conversations;


-- ============================================================================
-- FASE 3: ADICIONAR CONSTRAINT UNIQUE PARA EVITAR DUPLICATAS FUTURAS
-- ============================================================================
-- Isso previne race conditions no webhook

-- 3.1 Criar índice único (previne duplicatas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_conversation_per_store_instance 
ON whatsapp_conversations (store_id, instance_id, contact_phone)
WHERE store_id IS NOT NULL AND instance_id IS NOT NULL;

-- 3.2 Verificar índice criado
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'whatsapp_conversations' 
AND indexname LIKE '%unique%';


-- ============================================================================
-- FASE 4: CRIAR FUNÇÃO PARA UPSERT DE CONVERSA (EVITA RACE CONDITION)
-- ============================================================================
-- Webhook vai usar essa função ao invés de INSERT direto

CREATE OR REPLACE FUNCTION upsert_whatsapp_conversation(
  p_organization_id UUID,
  p_store_id UUID,
  p_instance_id UUID,
  p_contact_phone TEXT,
  p_chat_id TEXT,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_unified_contact_id UUID DEFAULT NULL
)
RETURNS whatsapp_conversations
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation whatsapp_conversations;
BEGIN
  -- Tentar encontrar conversa existente
  SELECT * INTO v_conversation
  FROM whatsapp_conversations
  WHERE organization_id = p_organization_id
    AND instance_id = p_instance_id
    AND contact_phone = p_contact_phone
  LIMIT 1
  FOR UPDATE;  -- Lock para evitar race condition
  
  -- Se não existe, criar
  IF v_conversation.id IS NULL THEN
    INSERT INTO whatsapp_conversations (
      organization_id,
      store_id,
      instance_id,
      contact_phone,
      phone_number,
      chat_id,
      contact_name,
      contact_id,
      unified_contact_id,
      status,
      unread_count,
      ai_enabled,
      created_at,
      updated_at
    ) VALUES (
      p_organization_id,
      p_store_id,
      p_instance_id,
      p_contact_phone,
      p_contact_phone,  -- Sincronizar phone_number
      p_chat_id,
      p_contact_name,
      p_contact_id,
      p_unified_contact_id,
      'open',
      1,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (store_id, instance_id, contact_phone) 
      WHERE store_id IS NOT NULL AND instance_id IS NOT NULL
    DO UPDATE SET
      updated_at = NOW(),
      contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
      unified_contact_id = COALESCE(EXCLUDED.unified_contact_id, whatsapp_conversations.unified_contact_id)
    RETURNING * INTO v_conversation;
  END IF;
  
  RETURN v_conversation;
END;
$$;

-- 4.1 Testar a função (não vai criar duplicata)
-- SELECT * FROM upsert_whatsapp_conversation(
--   '6cb9721c-fc7c-490e-b9a6-8393f0717648',  -- org_id
--   'b5723ed8-a49d-4ae8-8150-b078d924b3f3',  -- store_id
--   '35a75bd0-e9f8-4d4c-9346-9bae1830ab7c',  -- instance_id
--   '553198068077',                           -- contact_phone
--   '553198068077@s.whatsapp.net',            -- chat_id
--   'Teste'                                   -- contact_name
-- );


-- ============================================================================
-- FASE 5: ÍNDICES DE PERFORMANCE
-- ============================================================================
-- Melhorar performance das queries mais comuns

-- 5.1 Índice para buscar conversas por store
CREATE INDEX IF NOT EXISTS idx_conversations_store_id 
ON whatsapp_conversations (store_id) 
WHERE store_id IS NOT NULL;

-- 5.2 Índice para buscar mensagens por conversa (já deve existir, mas garantir)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
ON whatsapp_messages (conversation_id);

-- 5.3 Índice para buscar conversas por instância
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id 
ON whatsapp_conversations (instance_id)
WHERE instance_id IS NOT NULL;

-- 5.4 Índice para ordenação por última mensagem
CREATE INDEX IF NOT EXISTS idx_conversations_last_message 
ON whatsapp_conversations (organization_id, last_message_at DESC NULLS LAST);


-- ============================================================================
-- FASE 6: TRIGGER PARA SINCRONIZAR phone_number (FUTURO)
-- ============================================================================
-- Garante que phone_number sempre seja igual a contact_phone

CREATE OR REPLACE FUNCTION sync_phone_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sincronizar phone_number com contact_phone
  IF NEW.phone_number IS NULL OR NEW.phone_number != NEW.contact_phone THEN
    NEW.phone_number := NEW.contact_phone;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trg_sync_phone_number ON whatsapp_conversations;
CREATE TRIGGER trg_sync_phone_number
  BEFORE INSERT OR UPDATE ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION sync_phone_number();


-- ============================================================================
-- FASE 7: VERIFICAÇÃO FINAL
-- ============================================================================

-- 7.1 Verificar se não há mais duplicatas
SELECT 
  store_id,
  instance_id,
  contact_phone,
  COUNT(*) as total
FROM whatsapp_conversations
WHERE store_id IS NOT NULL
GROUP BY store_id, instance_id, contact_phone
HAVING COUNT(*) > 1;
-- Esperado: 0 registros

-- 7.2 Verificar se phone_number está sincronizado
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN phone_number = contact_phone THEN 1 END) as sincronizados,
  COUNT(CASE WHEN phone_number != contact_phone OR phone_number IS NULL THEN 1 END) as dessincronizados
FROM whatsapp_conversations
WHERE contact_phone IS NOT NULL;
-- Esperado: sincronizados = total, dessincronizados = 0

-- 7.3 Verificar índices criados
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'whatsapp_conversations'
ORDER BY indexname;


-- ============================================================================
-- ROLLBACK (SE NECESSÁRIO)
-- ============================================================================
-- Se algo der errado, restaurar dos backups:

-- DROP TABLE whatsapp_conversations;
-- CREATE TABLE whatsapp_conversations AS SELECT * FROM _backup_whatsapp_conversations_20260121;

-- DROP TABLE whatsapp_messages;
-- CREATE TABLE whatsapp_messages AS SELECT * FROM _backup_whatsapp_messages_20260121;


-- ============================================================================
-- LIMPEZA (APÓS CONFIRMAR QUE TUDO FUNCIONA)
-- ============================================================================
-- Depois de 1 semana funcionando, remover backups:

-- DROP TABLE IF EXISTS _backup_whatsapp_conversations_20260121;
-- DROP TABLE IF EXISTS _backup_whatsapp_messages_20260121;
