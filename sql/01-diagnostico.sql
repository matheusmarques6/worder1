-- =====================================================
-- PASSO 1: DIAGNÓSTICO - Execute primeiro para ver o que existe
-- =====================================================

-- 1.1 Verificar se whatsapp_conversations existe
SELECT 'whatsapp_conversations existe?' as verificacao,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'whatsapp_conversations'
  ) as resultado;

-- 1.2 Ver colunas atuais de whatsapp_conversations
SELECT 'Colunas em whatsapp_conversations:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'whatsapp_conversations'
ORDER BY ordinal_position;

-- 1.3 Verificar se tabelas do inbox existem
SELECT 'Tabelas do Inbox:' as info;
SELECT table_name, 
  CASE WHEN table_name IS NOT NULL THEN '✅ Existe' ELSE '❌ Não existe' END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'whatsapp_contact_notes',
  'contact_activities', 
  'contact_comments',
  'whatsapp_agents',
  'contacts',
  'whatsapp_contacts'
)
ORDER BY table_name;

-- 1.4 Verificar colunas necessárias
SELECT 'Colunas necessárias em whatsapp_conversations:' as info;
SELECT 
  'ai_enabled' as coluna,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'ai_enabled') as existe
UNION ALL
SELECT 'is_bot_active', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'is_bot_active')
UNION ALL
SELECT 'assigned_to', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversations' AND column_name = 'assigned_to');
