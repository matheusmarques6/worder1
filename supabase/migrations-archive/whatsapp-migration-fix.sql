-- =============================================
-- MIGRAÇÃO: Adicionar colunas faltantes em whatsapp_instances
-- Execute este SQL se a tabela já existir
-- =============================================

-- Adicionar coluna api_type se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'api_type'
  ) THEN
    ALTER TABLE whatsapp_instances 
    ADD COLUMN api_type VARCHAR(20) DEFAULT 'EVOLUTION' 
    CHECK (api_type IN ('EVOLUTION', 'META_CLOUD', 'BAILEYS'));
  END IF;
END $$;

-- Adicionar coluna online_status se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'online_status'
  ) THEN
    ALTER TABLE whatsapp_instances 
    ADD COLUMN online_status VARCHAR(20) DEFAULT 'unavailable' 
    CHECK (online_status IN ('available', 'unavailable', 'busy'));
  END IF;
END $$;

-- Adicionar coluna title se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'title'
  ) THEN
    ALTER TABLE whatsapp_instances 
    ADD COLUMN title VARCHAR(100) DEFAULT 'WhatsApp Business';
  END IF;
END $$;

-- Adicionar coluna unique_id se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'unique_id'
  ) THEN
    ALTER TABLE whatsapp_instances 
    ADD COLUMN unique_id VARCHAR(100);
    
    -- Gerar unique_id para registros existentes
    UPDATE whatsapp_instances 
    SET unique_id = 'instance_' || id::text 
    WHERE unique_id IS NULL;
    
    -- Tornar NOT NULL e UNIQUE depois de preencher
    ALTER TABLE whatsapp_instances 
    ALTER COLUMN unique_id SET NOT NULL;
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_unique_id 
    ON whatsapp_instances(unique_id);
  END IF;
END $$;

-- Adicionar coluna qr_code se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'qr_code'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN qr_code TEXT;
  END IF;
END $$;

-- Adicionar coluna qr_code_expires_at se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'qr_code_expires_at'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN qr_code_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Adicionar coluna session_data se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'session_data'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN session_data JSONB;
  END IF;
END $$;

-- Adicionar coluna session_expires_at se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'session_expires_at'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN session_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Adicionar coluna api_url se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'api_url'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN api_url VARCHAR(255);
  END IF;
END $$;

-- Adicionar coluna api_key se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'api_key'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN api_key VARCHAR(255);
  END IF;
END $$;

-- Adicionar coluna access_token se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN access_token TEXT;
  END IF;
END $$;

-- Adicionar coluna waba_id se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'waba_id'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN waba_id VARCHAR(50);
  END IF;
END $$;

-- Adicionar coluna webhook_url se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'webhook_url'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN webhook_url VARCHAR(255);
  END IF;
END $$;

-- Adicionar coluna webhook_verify_token se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'webhook_verify_token'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN webhook_verify_token VARCHAR(100);
  END IF;
END $$;

-- Adicionar coluna webhook_verified se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'webhook_verified'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN webhook_verified BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Adicionar coluna last_connected_at se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'last_connected_at'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN last_connected_at TIMESTAMPTZ;
  END IF;
END $$;

-- Adicionar coluna last_message_at se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'last_message_at'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
END $$;

-- Adicionar coluna messages_count se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'messages_count'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN messages_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Adicionar coluna other (metadados) se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_instances' AND column_name = 'other'
  ) THEN
    ALTER TABLE whatsapp_instances ADD COLUMN other JSONB DEFAULT '{}';
  END IF;
END $$;

-- =============================================
-- Criar índices se não existirem
-- =============================================

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org ON whatsapp_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status ON whatsapp_instances(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_phone ON whatsapp_instances(phone_number);

-- =============================================
-- Função auxiliar
-- =============================================

CREATE OR REPLACE FUNCTION count_active_instances(org_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM whatsapp_instances
    WHERE organization_id = org_id
    AND status IN ('ACTIVE', 'connected')
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Recriar VIEW (dropar e criar novamente)
-- =============================================

DROP VIEW IF EXISTS v_whatsapp_instances;

CREATE VIEW v_whatsapp_instances AS
SELECT 
  wi.*,
  CASE 
    WHEN wi.status IN ('ACTIVE', 'connected') AND wi.online_status = 'available' THEN 'online'
    WHEN wi.status IN ('ACTIVE', 'connected') THEN 'connected'
    WHEN wi.status = 'GENERATING' THEN 'connecting'
    ELSE 'offline'
  END AS connection_status,
  count_active_instances(wi.organization_id) AS org_active_instances
FROM whatsapp_instances wi;

-- =============================================
-- Criar tabelas auxiliares se não existirem
-- =============================================

-- Tabela de logs de conexão
CREATE TABLE IF NOT EXISTS whatsapp_connection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  details JSONB DEFAULT '{}',
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_instance ON whatsapp_connection_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_org ON whatsapp_connection_logs(organization_id);

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org instances" ON whatsapp_instances;
CREATE POLICY "Users can view their org instances" ON whatsapp_instances
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert their org instances" ON whatsapp_instances;
CREATE POLICY "Users can insert their org instances" ON whatsapp_instances
  FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update their org instances" ON whatsapp_instances;
CREATE POLICY "Users can update their org instances" ON whatsapp_instances
  FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete their org instances" ON whatsapp_instances;
CREATE POLICY "Users can delete their org instances" ON whatsapp_instances
  FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- =============================================
-- SUCESSO!
-- =============================================

SELECT 'Migração concluída com sucesso!' AS resultado;
