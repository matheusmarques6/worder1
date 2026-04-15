-- ============================================
-- FIX: Sincronizar organization_id do Klaviyo com a loja
-- Execute este script no Supabase SQL Editor
-- ============================================

-- 1. Verificar estado atual
SELECT 
  ka.id as klaviyo_id,
  ka.account_name,
  ka.organization_id as klaviyo_org_id,
  ss.id as store_id,
  ss.shop_name,
  ss.organization_id as store_org_id,
  CASE 
    WHEN ka.organization_id = ss.organization_id THEN '✅ OK'
    ELSE '❌ DIFERENTE'
  END as status
FROM klaviyo_accounts ka
CROSS JOIN shopify_stores ss
WHERE ka.is_active = true;

-- 2. Atualizar organization_id do Klaviyo para match com a loja principal
-- (Execute apenas se necessário)
/*
UPDATE klaviyo_accounts 
SET organization_id = (
  SELECT organization_id 
  FROM shopify_stores 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE is_active = true;
*/

-- 3. Ou se você sabe o organization_id correto:
/*
UPDATE klaviyo_accounts 
SET organization_id = 'SEU_ORGANIZATION_ID_AQUI'
WHERE is_active = true;
*/
