-- =====================================================
-- FASE 4: REALTIME + CACHE
-- Worder - Sistema de Notificações em Tempo Real
-- =====================================================

-- =====================================================
-- PASSO 1: VERIFICAR TABELAS NO REALTIME
-- =====================================================

-- Verificar quais tabelas já estão no realtime
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- =====================================================
-- PASSO 2: ADICIONAR TABELAS AO REALTIME
-- =====================================================

-- Mensagens WhatsApp (essencial para chat em tempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;

-- Conversas WhatsApp (para atualizar lista de conversas)
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;

-- Notificações (para sistema de notificações)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Tarefas (opcional - para atualizações de tarefas em tempo real)
-- ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- =====================================================
-- PASSO 3: HABILITAR REPLICA IDENTITY FULL
-- Necessário para que UPDATE retorne todos os campos
-- =====================================================

-- Mensagens - CRÍTICO para status updates
ALTER TABLE whatsapp_messages REPLICA IDENTITY FULL;

-- Conversas - CRÍTICO para unread_count, last_message, etc
ALTER TABLE whatsapp_conversations REPLICA IDENTITY FULL;

-- Notificações - para marcar como lida
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- =====================================================
-- PASSO 4: VERIFICAR SE FUNCIONOU
-- =====================================================

-- Deve retornar as tabelas adicionadas
SELECT 
  schemaname, 
  tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- =====================================================
-- PASSO 5: ÍNDICES PARA PERFORMANCE DO REALTIME
-- =====================================================

-- Índice para filtrar mensagens por conversa (usado no realtime)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_created 
ON whatsapp_messages(conversation_id, created_at DESC);

-- Índice para filtrar conversas por loja (usado no realtime)
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_store_updated
ON whatsapp_conversations(store_id, updated_at DESC);

-- Índice para filtrar conversas por organização
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org_updated
ON whatsapp_conversations(organization_id, updated_at DESC);

-- Índice para notificações por usuário (usado no realtime)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications(user_id, created_at DESC);

-- Índice para notificações não lidas
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- =====================================================
-- PASSO 6: RLS PARA REALTIME (IMPORTANTE!)
-- O Realtime respeita RLS, então precisa de políticas
-- =====================================================

-- Verificar se RLS está habilitado
SELECT 
  tablename,
  rowsecurity 
FROM pg_tables 
WHERE tablename IN ('whatsapp_messages', 'whatsapp_conversations', 'notifications');

-- Se não tiver RLS, habilitar:
-- ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PASSO 7: FUNÇÃO PARA ATUALIZAR LAST_MESSAGE
-- Trigger que atualiza a conversa quando chega mensagem
-- =====================================================

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar conversa com dados da última mensagem
  UPDATE whatsapp_conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(
      CASE 
        WHEN NEW.message_type = 'text' THEN COALESCE(NEW.content::text, '')
        WHEN NEW.message_type = 'image' THEN '📷 Imagem'
        WHEN NEW.message_type = 'video' THEN '🎥 Vídeo'
        WHEN NEW.message_type = 'audio' THEN '🎵 Áudio'
        WHEN NEW.message_type = 'document' THEN '📄 Documento'
        WHEN NEW.message_type = 'location' THEN '📍 Localização'
        WHEN NEW.message_type = 'contact' THEN '👤 Contato'
        WHEN NEW.message_type = 'sticker' THEN '🎭 Sticker'
        ELSE 'Mensagem'
      END, 
      100
    ),
    last_message_type = NEW.message_type,
    last_message_direction = NEW.direction,
    -- Incrementar unread_count se for mensagem recebida
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' 
      THEN COALESCE(unread_count, 0) + 1 
      ELSE unread_count 
    END,
    -- Atualizar total de mensagens
    total_messages = COALESCE(total_messages, 0) + 1,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON whatsapp_messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- =====================================================
-- PASSO 8: FUNÇÃO PARA ZERAR UNREAD_COUNT
-- Quando usuário abre a conversa
-- =====================================================

CREATE OR REPLACE FUNCTION mark_conversation_as_read(p_conversation_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET 
    unread_count = 0,
    updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASSO 9: FUNÇÃO PARA CRIAR NOTIFICAÇÃO AUTOMÁTICA
-- Quando chega mensagem nova (opcional)
-- =====================================================

CREATE OR REPLACE FUNCTION create_notification_on_message()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation RECORD;
  v_assigned_user_id UUID;
BEGIN
  -- Só criar notificação para mensagens recebidas
  IF NEW.direction != 'inbound' THEN
    RETURN NEW;
  END IF;
  
  -- Buscar dados da conversa
  SELECT * INTO v_conversation
  FROM whatsapp_conversations
  WHERE id = NEW.conversation_id;
  
  -- Se tem agente atribuído, notificar ele
  v_assigned_user_id := v_conversation.assigned_to;
  
  IF v_assigned_user_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id,
      organization_id,
      type,
      title,
      message,
      data,
      created_at
    ) VALUES (
      v_assigned_user_id,
      v_conversation.organization_id,
      'whatsapp_message',
      'Nova mensagem no WhatsApp',
      LEFT(COALESCE(NEW.content::text, 'Mídia recebida'), 100),
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id,
        'contact_name', v_conversation.contact_name
      ),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger (comentado por padrão - descomentar se quiser notificações automáticas)
-- DROP TRIGGER IF EXISTS trigger_notification_on_message ON whatsapp_messages;
-- CREATE TRIGGER trigger_notification_on_message
--   AFTER INSERT ON whatsapp_messages
--   FOR EACH ROW
--   EXECUTE FUNCTION create_notification_on_message();

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

-- Listar todas as tabelas no realtime
SELECT 'Tabelas no Realtime:' as info;
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Listar triggers criados
SELECT 'Triggers criados:' as info;
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%conversation%' OR trigger_name LIKE '%notification%';

-- =====================================================
-- DONE! 
-- Execute este SQL no Supabase SQL Editor
-- =====================================================
