-- =============================================
-- FASE 4: FILA DE ATENDIMENTO
-- Executar no Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. CONFIGURAÇÕES DA FILA
-- =============================================
CREATE TABLE IF NOT EXISTS queue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE,
  store_id UUID,
  
  -- Método de distribuição
  distribution_method VARCHAR(50) DEFAULT 'least_busy', -- round_robin, least_busy, skill_based, manual
  
  -- Limites
  max_conversations_per_agent INT DEFAULT 20,
  max_wait_time_minutes INT DEFAULT 5,
  
  -- Horário de atendimento
  business_hours JSONB DEFAULT '{
    "monday": {"start": "08:00", "end": "18:00", "enabled": true},
    "tuesday": {"start": "08:00", "end": "18:00", "enabled": true},
    "wednesday": {"start": "08:00", "end": "18:00", "enabled": true},
    "thursday": {"start": "08:00", "end": "18:00", "enabled": true},
    "friday": {"start": "08:00", "end": "18:00", "enabled": true},
    "saturday": {"start": "09:00", "end": "13:00", "enabled": false},
    "sunday": {"start": null, "end": null, "enabled": false}
  }',
  
  -- Mensagens automáticas
  out_of_hours_message TEXT DEFAULT 'Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve!',
  queue_full_message TEXT DEFAULT 'No momento todos os atendentes estão ocupados. Por favor, aguarde.',
  welcome_message TEXT DEFAULT 'Olá! Em instantes você será atendido.',
  
  -- Configurações
  auto_assign_enabled BOOLEAN DEFAULT TRUE,
  notify_on_new_conversation BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. STATUS DOS ATENDENTES
-- =============================================
CREATE TABLE IF NOT EXISTS agent_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- Status atual
  status VARCHAR(20) DEFAULT 'offline', -- online, busy, away, offline
  status_message TEXT,
  
  -- Conversas
  current_conversations INT DEFAULT 0,
  max_conversations INT DEFAULT 20,
  
  -- Atividade
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  went_online_at TIMESTAMPTZ,
  went_offline_at TIMESTAMPTZ,
  
  -- Skills para distribuição baseada em habilidade
  skills TEXT[] DEFAULT '{}',
  
  -- Métricas do dia
  last_assigned_at TIMESTAMPTZ,
  assignments_today INT DEFAULT 0,
  completed_today INT DEFAULT 0,
  
  -- Break/Pausa
  on_break BOOLEAN DEFAULT FALSE,
  break_started_at TIMESTAMPTZ,
  break_reason VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

-- =============================================
-- 3. FILA DE ESPERA
-- =============================================
CREATE TABLE IF NOT EXISTS queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  
  -- Conversa
  conversation_id UUID NOT NULL,
  contact_id UUID,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  instance_id UUID,
  
  -- Posição e timing
  position INT,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Atribuição
  assigned_at TIMESTAMPTZ,
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  
  -- Prioridade (maior = mais urgente)
  priority INT DEFAULT 0,
  priority_reason VARCHAR(100), -- vip, waiting_long, returning_customer
  
  -- Status
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, assigned, timeout, cancelled
  
  -- Preview da mensagem
  last_message_preview TEXT,
  
  -- Métricas
  wait_time_seconds INT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_queue_settings_org ON queue_settings(organization_id);

CREATE INDEX IF NOT EXISTS idx_agent_status_org ON agent_status(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_online ON agent_status(organization_id, status) 
  WHERE status = 'online';
CREATE INDEX IF NOT EXISTS idx_agent_status_user ON agent_status(user_id);

CREATE INDEX IF NOT EXISTS idx_queue_items_waiting ON queue_items(organization_id, status, entered_at) 
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_queue_items_conv ON queue_items(conversation_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Updated_at para queue_settings
CREATE OR REPLACE FUNCTION update_queue_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS queue_settings_updated_at ON queue_settings;
CREATE TRIGGER queue_settings_updated_at
  BEFORE UPDATE ON queue_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_queue_settings_timestamp();

-- Updated_at para agent_status
CREATE OR REPLACE FUNCTION update_agent_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Atualizar went_online_at/went_offline_at
  IF OLD.status != NEW.status THEN
    IF NEW.status = 'online' THEN
      NEW.went_online_at = NOW();
    ELSIF NEW.status = 'offline' THEN
      NEW.went_offline_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_status_updated_at ON agent_status;
CREATE TRIGGER agent_status_updated_at
  BEFORE UPDATE ON agent_status
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_status_timestamp();

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE queue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_items ENABLE ROW LEVEL SECURITY;

-- Policies para queue_settings
DROP POLICY IF EXISTS "queue_settings_all" ON queue_settings;
CREATE POLICY "queue_settings_all" ON queue_settings FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- Policies para agent_status
DROP POLICY IF EXISTS "agent_status_all" ON agent_status;
CREATE POLICY "agent_status_all" ON agent_status FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- Policies para queue_items
DROP POLICY IF EXISTS "queue_items_all" ON queue_items;
CREATE POLICY "queue_items_all" ON queue_items FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- =============================================
-- FUNÇÃO: Atribuir próxima conversa
-- =============================================
CREATE OR REPLACE FUNCTION assign_next_conversation(p_organization_id UUID)
RETURNS TABLE (
  queue_item_id UUID,
  conversation_id UUID,
  assigned_to UUID,
  agent_name VARCHAR
) AS $$
DECLARE
  v_queue_item RECORD;
  v_agent RECORD;
  v_settings RECORD;
BEGIN
  -- Buscar configurações
  SELECT * INTO v_settings FROM queue_settings 
  WHERE organization_id = p_organization_id 
  LIMIT 1;

  IF NOT FOUND OR v_settings.auto_assign_enabled = FALSE THEN
    RETURN;
  END IF;

  -- Buscar próximo item da fila
  SELECT * INTO v_queue_item FROM queue_items
  WHERE organization_id = p_organization_id 
    AND status = 'waiting'
  ORDER BY priority DESC, entered_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Buscar agente disponível (com base no método de distribuição)
  IF v_settings.distribution_method = 'least_busy' THEN
    -- Menos ocupado
    SELECT ags.user_id, p.full_name as name INTO v_agent
    FROM agent_status ags
    LEFT JOIN profiles p ON p.id = ags.user_id
    WHERE ags.organization_id = p_organization_id
      AND ags.status = 'online'
      AND ags.on_break = FALSE
      AND ags.current_conversations < ags.max_conversations
    ORDER BY ags.current_conversations ASC, ags.last_assigned_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  ELSE
    -- Round robin (por último atribuído)
    SELECT ags.user_id, p.full_name as name INTO v_agent
    FROM agent_status ags
    LEFT JOIN profiles p ON p.id = ags.user_id
    WHERE ags.organization_id = p_organization_id
      AND ags.status = 'online'
      AND ags.on_break = FALSE
      AND ags.current_conversations < ags.max_conversations
    ORDER BY ags.last_assigned_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF NOT FOUND THEN
    -- Nenhum agente disponível
    RETURN;
  END IF;

  -- Atribuir conversa ao agente
  UPDATE queue_items SET 
    status = 'assigned',
    assigned_at = NOW(),
    assigned_to = v_agent.user_id,
    assigned_to_name = v_agent.name,
    wait_time_seconds = EXTRACT(EPOCH FROM (NOW() - entered_at))::INT
  WHERE id = v_queue_item.id;

  -- Atualizar contadores do agente
  UPDATE agent_status SET 
    current_conversations = current_conversations + 1,
    last_assigned_at = NOW(),
    assignments_today = assignments_today + 1,
    last_activity_at = NOW()
  WHERE user_id = v_agent.user_id 
    AND organization_id = p_organization_id;

  -- Atualizar conversa original
  UPDATE whatsapp_conversations SET 
    assigned_agent_id = v_agent.user_id,
    assigned_at = NOW()
  WHERE id = v_queue_item.conversation_id;

  RETURN QUERY SELECT v_queue_item.id, v_queue_item.conversation_id, v_agent.user_id, v_agent.name;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FUNÇÃO: Estatísticas da Fila
-- =============================================
CREATE OR REPLACE FUNCTION get_queue_stats(p_organization_id UUID)
RETURNS TABLE (
  waiting_count BIGINT,
  assigned_count BIGINT,
  online_agents BIGINT,
  busy_agents BIGINT,
  offline_agents BIGINT,
  avg_wait_time_seconds NUMERIC,
  max_wait_time_seconds INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM queue_items WHERE organization_id = p_organization_id AND status = 'waiting')::BIGINT,
    (SELECT COUNT(*) FROM queue_items WHERE organization_id = p_organization_id AND status = 'assigned' AND assigned_at > NOW() - INTERVAL '1 hour')::BIGINT,
    (SELECT COUNT(*) FROM agent_status WHERE organization_id = p_organization_id AND status = 'online')::BIGINT,
    (SELECT COUNT(*) FROM agent_status WHERE organization_id = p_organization_id AND status = 'busy')::BIGINT,
    (SELECT COUNT(*) FROM agent_status WHERE organization_id = p_organization_id AND status = 'offline')::BIGINT,
    (SELECT COALESCE(AVG(wait_time_seconds), 0) FROM queue_items WHERE organization_id = p_organization_id AND status = 'assigned' AND assigned_at > NOW() - INTERVAL '1 day'),
    (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - entered_at))::INT), 0) FROM queue_items WHERE organization_id = p_organization_id AND status = 'waiting');
END;
$$ LANGUAGE plpgsql;

-- Verificar criação
SELECT 'Tabelas da fila de atendimento criadas com sucesso!' as status;
