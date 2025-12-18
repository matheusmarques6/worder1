-- ============================================
-- WORDER - WhatsApp Instances Cloud API Support
-- Adiciona colunas para suportar Meta Cloud API
-- ============================================

-- Adicionar colunas para Cloud API
DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(100);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS access_token TEXT;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS waba_id VARCHAR(100);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS messaging_tier INTEGER DEFAULT 1;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS quality_rating VARCHAR(20) DEFAULT 'UNKNOWN';
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Índice para busca por phone_number_id
CREATE INDEX IF NOT EXISTS idx_instances_phone_number_id 
ON whatsapp_instances(phone_number_id) 
WHERE phone_number_id IS NOT NULL;

-- Índice para busca por organization e status
CREATE INDEX IF NOT EXISTS idx_instances_org_status 
ON whatsapp_instances(organization_id, status);

-- ============================================
-- Função para buscar instância da organização
-- ============================================
CREATE OR REPLACE FUNCTION get_whatsapp_instance(p_organization_id UUID)
RETURNS TABLE (
  id UUID,
  phone_number_id VARCHAR(100),
  access_token TEXT,
  phone_number VARCHAR(50),
  title VARCHAR(255),
  status VARCHAR(50),
  messaging_tier INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wi.id,
    wi.phone_number_id,
    wi.access_token,
    wi.phone_number,
    wi.title,
    wi.status,
    wi.messaging_tier
  FROM whatsapp_instances wi
  WHERE wi.organization_id = p_organization_id
    AND wi.status = 'connected'
  ORDER BY wi.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_whatsapp_instance TO service_role;

-- ============================================
-- SUCESSO!
-- ============================================
SELECT '✅ WhatsApp instances Cloud API support added!' AS resultado;
