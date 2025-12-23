-- =============================================
-- CRIAR VIEW (executar DEPOIS de adicionar colunas)
-- =============================================

DROP VIEW IF EXISTS v_integration_status;

CREATE VIEW v_integration_status AS

-- Shopify
SELECT 
  s.organization_id,
  'shopify' AS integration_type,
  s.id AS integration_id,
  COALESCE(s.shop_name, s.shop_domain) AS name,
  s.shop_domain AS identifier,
  COALESCE(s.connection_status, 
    CASE WHEN s.status = 'active' THEN 'active' ELSE 'disconnected' END
  ) AS status,
  s.status_message,
  s.health_checked_at,
  s.consecutive_failures,
  s.created_at,
  s.updated_at
FROM shopify_stores s
WHERE s.status = 'active' OR s.status IS NULL

UNION ALL

-- WhatsApp
SELECT 
  w.organization_id,
  'whatsapp' AS integration_type,
  w.id AS integration_id,
  COALESCE(w.business_name, 'WhatsApp Business') AS name,
  w.phone_number AS identifier,
  COALESCE(w.connection_status, 
    CASE WHEN w.is_active THEN 'active' ELSE 'disconnected' END
  ) AS status,
  w.status_message,
  w.health_checked_at,
  w.consecutive_failures,
  w.created_at,
  w.updated_at
FROM whatsapp_configs w
WHERE w.is_active = true;

-- Verificar
SELECT '✅ VIEW criada!' as resultado;
