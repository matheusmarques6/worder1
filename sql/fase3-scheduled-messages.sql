-- =============================================
-- FASE 3: MENSAGENS AGENDADAS
-- Executar no Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  
  -- Instância WhatsApp
  instance_id UUID,
  instance_name VARCHAR(100),
  
  -- Destinatário
  contact_id UUID,
  conversation_id UUID,
  phone_number VARCHAR(20) NOT NULL,
  contact_name VARCHAR(255),
  
  -- Mensagem
  message_type VARCHAR(50) DEFAULT 'text', -- text, image, video, audio, document, template
  content TEXT NOT NULL,
  media_url TEXT,
  media_type VARCHAR(100),
  media_filename VARCHAR(255),
  template_name VARCHAR(255),
  template_params JSONB,
  
  -- Agendamento
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  
  -- Recorrência (null = sem recorrência)
  recurrence VARCHAR(20), -- daily, weekly, monthly
  recurrence_end_date DATE,
  recurrence_count INT DEFAULT 0, -- quantas vezes já foi enviada
  next_occurrence_at TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, cancelled
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  error_code VARCHAR(50),
  message_id VARCHAR(255), -- ID retornado pela API
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Quem criou
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_scheduled_org ON scheduled_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_pending ON scheduled_messages(scheduled_at, status) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_contact ON scheduled_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_instance ON scheduled_messages(instance_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(organization_id, status);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_scheduled_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_messages_updated_at ON scheduled_messages;
CREATE TRIGGER scheduled_messages_updated_at
  BEFORE UPDATE ON scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_messages_timestamp();

-- RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_select" ON scheduled_messages;
CREATE POLICY "scheduled_select" ON scheduled_messages 
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "scheduled_insert" ON scheduled_messages;
CREATE POLICY "scheduled_insert" ON scheduled_messages 
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "scheduled_update" ON scheduled_messages;
CREATE POLICY "scheduled_update" ON scheduled_messages 
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "scheduled_delete" ON scheduled_messages;
CREATE POLICY "scheduled_delete" ON scheduled_messages 
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Função para calcular próxima ocorrência
CREATE OR REPLACE FUNCTION calculate_next_occurrence(
  p_scheduled_at TIMESTAMPTZ,
  p_recurrence VARCHAR,
  p_recurrence_end_date DATE
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  next_at TIMESTAMPTZ;
BEGIN
  IF p_recurrence IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_recurrence
    WHEN 'daily' THEN next_at := p_scheduled_at + INTERVAL '1 day';
    WHEN 'weekly' THEN next_at := p_scheduled_at + INTERVAL '1 week';
    WHEN 'monthly' THEN next_at := p_scheduled_at + INTERVAL '1 month';
    ELSE RETURN NULL;
  END CASE;

  -- Verificar se passou da data limite
  IF p_recurrence_end_date IS NOT NULL AND next_at::DATE > p_recurrence_end_date THEN
    RETURN NULL;
  END IF;

  RETURN next_at;
END;
$$ LANGUAGE plpgsql;

-- Verificar se tabela foi criada
SELECT 'Tabela scheduled_messages criada com sucesso!' as status;
