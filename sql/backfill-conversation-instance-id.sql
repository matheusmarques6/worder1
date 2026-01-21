-- =====================================================
-- BACKFILL: Vincular conversas legadas a instance_id
-- Objetivo: Corrigir conversas antigas que não têm instance_id
-- Isso evita o erro "Conversa não tem instância associada"
-- =====================================================

-- 1. Diagnóstico: Ver quantas conversas estão sem instance_id
SELECT 
  COUNT(*) as total_sem_instance,
  COUNT(DISTINCT organization_id) as orgs_afetadas
FROM whatsapp_conversations
WHERE instance_id IS NULL;

-- 2. Ver conversas problemáticas por organização
SELECT 
  wc.organization_id,
  o.name as org_name,
  COUNT(*) as conversas_sem_instance
FROM whatsapp_conversations wc
LEFT JOIN organizations o ON o.id = wc.organization_id
WHERE wc.instance_id IS NULL
GROUP BY wc.organization_id, o.name
ORDER BY conversas_sem_instance DESC;

-- =====================================================
-- BACKFILL AUTOMÁTICO: Baseado na última mensagem
-- =====================================================

-- 3. Criar tabela temporária com o instance_id mais recente de cada conversa
CREATE TEMP TABLE IF NOT EXISTS conversation_instance_mapping AS
SELECT DISTINCT ON (wm.conversation_id)
  wm.conversation_id,
  wm.instance_id,
  wi.store_id,
  wm.created_at as last_msg_at
FROM whatsapp_messages wm
JOIN whatsapp_instances wi ON wi.id = wm.instance_id
WHERE wm.instance_id IS NOT NULL
ORDER BY wm.conversation_id, wm.created_at DESC;

-- 4. Ver quantas conversas podem ser corrigidas
SELECT 
  COUNT(*) as conversas_que_podem_ser_corrigidas
FROM whatsapp_conversations wc
JOIN conversation_instance_mapping cim ON cim.conversation_id = wc.id
WHERE wc.instance_id IS NULL;

-- 5. EXECUTAR BACKFILL (atualizar conversas)
UPDATE whatsapp_conversations wc
SET 
  instance_id = cim.instance_id,
  store_id = COALESCE(wc.store_id, cim.store_id),
  updated_at = NOW()
FROM conversation_instance_mapping cim
WHERE wc.id = cim.conversation_id
AND wc.instance_id IS NULL;

-- 6. Verificar resultado
SELECT 
  COUNT(*) FILTER (WHERE instance_id IS NULL) as ainda_sem_instance,
  COUNT(*) FILTER (WHERE instance_id IS NOT NULL) as com_instance,
  COUNT(*) as total
FROM whatsapp_conversations;

-- =====================================================
-- BACKFILL ALTERNATIVO: Baseado na instância da org
-- Para conversas que não têm mensagens
-- ⚠️ VERSÃO SEGURA PARA MULTI-LOJA: Respeita store_id
-- =====================================================

-- 7. Para conversas sem mensagens, vincular à instância conectada da org
-- APENAS se a conversa tem store_id E a instância bate com esse store
-- OU se a conversa não tem store_id E a org tem apenas 1 instância conectada
UPDATE whatsapp_conversations wc
SET 
  instance_id = wi.id,
  store_id = COALESCE(wc.store_id, wi.store_id),
  updated_at = NOW()
FROM LATERAL (
  SELECT id, store_id
  FROM whatsapp_instances
  WHERE organization_id = wc.organization_id
    AND status IN ('connected', 'ACTIVE', 'open')
    -- SEGURANÇA MULTI-LOJA: Só vincular se store_id bate ou conversa não tem store_id
    AND (wc.store_id IS NULL OR store_id = wc.store_id)
  ORDER BY updated_at DESC
  LIMIT 1
) wi
WHERE wc.instance_id IS NULL
-- SEGURANÇA EXTRA: Só fazer se org tem apenas 1 instância conectada OU conversa tem store_id
AND (
  wc.store_id IS NOT NULL 
  OR (SELECT COUNT(*) FROM whatsapp_instances WHERE organization_id = wc.organization_id AND status IN ('connected', 'ACTIVE', 'open')) = 1
);

-- 8. Verificar resultado final
SELECT 
  COUNT(*) FILTER (WHERE instance_id IS NULL) as ainda_sem_instance,
  COUNT(*) FILTER (WHERE instance_id IS NOT NULL) as com_instance,
  COUNT(*) as total
FROM whatsapp_conversations;

-- =====================================================
-- OPCIONAL: Marcar conversas irrecuperáveis como arquivadas
-- =====================================================

-- 9. Conversas sem instance_id E sem instância conectada na org
-- Provavelmente são de instâncias removidas/desconectadas
UPDATE whatsapp_conversations
SET 
  status = 'archived',
  updated_at = NOW()
WHERE instance_id IS NULL
AND NOT EXISTS (
  SELECT 1 
  FROM whatsapp_instances wi 
  WHERE wi.organization_id = whatsapp_conversations.organization_id 
  AND wi.status IN ('connected', 'ACTIVE', 'open')
);

-- 10. Limpar tabela temporária
DROP TABLE IF EXISTS conversation_instance_mapping;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

SELECT 
  'Conversas totais' as metrica, COUNT(*)::text as valor FROM whatsapp_conversations
UNION ALL
SELECT 'Conversas com instance_id', COUNT(*)::text FROM whatsapp_conversations WHERE instance_id IS NOT NULL
UNION ALL
SELECT 'Conversas sem instance_id', COUNT(*)::text FROM whatsapp_conversations WHERE instance_id IS NULL
UNION ALL
SELECT 'Conversas arquivadas', COUNT(*)::text FROM whatsapp_conversations WHERE status = 'archived';
