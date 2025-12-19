-- =============================================
-- WHATSAPP INSTANCES - Sistema de Conexão Unificado
-- Suporta API Oficial (Meta Cloud) e QR Code (Evolution/Baileys)
-- =============================================

-- Tabela principal de instâncias
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Informações básicas
  title VARCHAR(100) NOT NULL DEFAULT 'WhatsApp Business',
  unique_id VARCHAR(100) UNIQUE NOT NULL,
  phone_number VARCHAR(20),
  phone_number_id VARCHAR(50),
  
  -- Status
  status VARCHAR(20) DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'GENERATING', 'connected', 'disconnected')),
  online_status VARCHAR(20) DEFAULT 'unavailable' CHECK (online_status IN ('available', 'unavailable', 'busy')),
  
  -- Tipo de API
  api_type VARCHAR(20) NOT NULL DEFAULT 'EVOLUTION' CHECK (api_type IN ('EVOLUTION', 'META_CLOUD', 'BAILEYS')),
  
  -- Credenciais Evolution/Baileys
  api_url VARCHAR(255),
  api_key VARCHAR(255),
  
  -- Credenciais Meta Cloud API
  access_token TEXT,
  waba_id VARCHAR(50),
  
  -- QR Code (temporário durante conexão)
  qr_code TEXT,
  qr_code_expires_at TIMESTAMPTZ,
  
  -- Webhook
  webhook_url VARCHAR(255),
  webhook_verify_token VARCHAR(100),
  webhook_verified BOOLEAN DEFAULT FALSE,
  
  -- Sessão (para Baileys/Evolution)
  session_data JSONB,
  session_expires_at TIMESTAMPTZ,
  
  -- Metadados
  other JSONB DEFAULT '{}',
  last_connected_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  messages_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org ON whatsapp_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status ON whatsapp_instances(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_unique_id ON whatsapp_instances(unique_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_phone ON whatsapp_instances(phone_number);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_whatsapp_instances_updated_at ON whatsapp_instances;
CREATE TRIGGER trigger_whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_instances_updated_at();

-- =============================================
-- WHATSAPP CONFIGS - Configurações da API Oficial
-- =============================================

CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Meta Cloud API
  phone_number_id VARCHAR(50) NOT NULL,
  waba_id VARCHAR(50),
  access_token TEXT NOT NULL,
  
  -- Informações do número
  business_name VARCHAR(255),
  phone_number VARCHAR(20),
  quality_rating VARCHAR(20),
  messaging_limit_tier VARCHAR(50),
  
  -- Webhook
  webhook_url VARCHAR(255),
  webhook_verify_token VARCHAR(100),
  webhook_verified BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_org ON whatsapp_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_phone_number_id ON whatsapp_configs(phone_number_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_whatsapp_configs_updated_at ON whatsapp_configs;
CREATE TRIGGER trigger_whatsapp_configs_updated_at
  BEFORE UPDATE ON whatsapp_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_configs_updated_at();

-- =============================================
-- WHATSAPP CONNECTION LOGS - Histórico de conexões
-- =============================================

CREATE TABLE IF NOT EXISTS whatsapp_connection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Evento
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'QR_GENERATED',
    'QR_SCANNED',
    'CONNECTED',
    'DISCONNECTED',
    'RECONNECTING',
    'ERROR',
    'SESSION_EXPIRED',
    'LOGGED_OUT'
  )),
  
  -- Detalhes
  details JSONB DEFAULT '{}',
  error_message TEXT,
  
  -- Informações de conexão
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_instance ON whatsapp_connection_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_org ON whatsapp_connection_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_event ON whatsapp_connection_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_created ON whatsapp_connection_logs(created_at DESC);

-- =============================================
-- RLS (Row Level Security)
-- =============================================

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_connection_logs ENABLE ROW LEVEL SECURITY;

-- Policies para whatsapp_instances
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

-- Policies para whatsapp_configs
DROP POLICY IF EXISTS "Users can view their org configs" ON whatsapp_configs;
CREATE POLICY "Users can view their org configs" ON whatsapp_configs
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage their org configs" ON whatsapp_configs;
CREATE POLICY "Users can manage their org configs" ON whatsapp_configs
  FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- =============================================
-- FUNÇÕES AUXILIARES
-- =============================================

-- Função para contar instâncias ativas de uma organização
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

-- Função para verificar se organização pode criar mais instâncias
CREATE OR REPLACE FUNCTION can_create_instance(org_id UUID, max_instances INTEGER DEFAULT 5)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN count_active_instances(org_id) < max_instances;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- VIEWS
-- =============================================

-- View para instâncias com status simplificado
CREATE OR REPLACE VIEW v_whatsapp_instances AS
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
-- COMENTÁRIOS
-- =============================================

COMMENT ON TABLE whatsapp_instances IS 'Instâncias de conexão WhatsApp (QR Code ou API Oficial)';
COMMENT ON TABLE whatsapp_configs IS 'Configurações da API Oficial do WhatsApp (Meta Cloud)';
COMMENT ON TABLE whatsapp_connection_logs IS 'Histórico de eventos de conexão WhatsApp';

COMMENT ON COLUMN whatsapp_instances.api_type IS 'Tipo de API: EVOLUTION (QR via Evolution API), META_CLOUD (API Oficial), BAILEYS (QR via Baileys direto)';
COMMENT ON COLUMN whatsapp_instances.status IS 'Status da conexão: ACTIVE, INACTIVE, GENERATING (gerando QR), connected, disconnected';
COMMENT ON COLUMN whatsapp_instances.online_status IS 'Status online: available (online), unavailable (offline), busy (ocupado)';
