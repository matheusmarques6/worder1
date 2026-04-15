-- =============================================
-- PASSO 3: VINCULAR CONTATOS ÀS LOJAS
-- Usa shopify_customer_id para identificar de qual loja veio
-- =============================================

-- 3.1 Primeiro, ver quais lojas existem
SELECT id, shop_name, shop_domain FROM shopify_stores;

-- 3.2 Criar tabela temporária para mapear customer_id -> store_id
-- (Isso precisa ser feito via API buscando no Shopify, ou manualmente se souber)

-- 3.3 OPÇÃO MANUAL: Se você sabe qual loja tem quais contatos
-- Exemplo: Oak Vintage = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a'
-- Exemplo: San Martin = 'b5723ed8-a49d-4ae8-8150-b078d924b3f3'

-- Atualizar contatos que vieram da Oak Vintage (os 1835 que estavam na org demo)
-- UPDATE contacts 
-- SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a'
-- WHERE shopify_customer_id IS NOT NULL 
--   AND store_id IS NULL
--   AND organization_id = '6cb9721c-fc7c-490e-b9a6-8393f0717648'
--   AND created_at < '2025-01-01'; -- ajustar data conforme necessário

-- 3.4 Verificar distribuição de contatos por loja
SELECT 
  s.shop_name,
  COUNT(c.id) as total_contatos
FROM contacts c
LEFT JOIN shopify_stores s ON s.id = c.store_id
WHERE c.organization_id = '6cb9721c-fc7c-490e-b9a6-8393f0717648'
GROUP BY s.shop_name;
