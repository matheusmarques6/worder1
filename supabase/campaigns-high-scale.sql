-- =====================================================
-- WHATSAPP CAMPAIGNS - HIGH SCALE MIGRATIONS
-- Execute no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. FUNÇÃO PARA INCREMENTO ATÔMICO DE MÉTRICAS
-- =====================================================

CREATE OR REPLACE FUNCTION increment_campaign_sent(
  p_campaign_id UUID,
  p_sent INTEGER DEFAULT 0,
  p_failed INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_campaigns
  SET 
    total_sent = COALESCE(total_sent, 0) + p_sent,
    total_failed = COALESCE(total_failed, 0) + p_failed,
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant para service role
GRANT EXECUTE ON FUNCTION increment_campaign_sent TO service_role;

-- =====================================================
-- 2. FUNÇÃO PARA INCREMENTO DE CHAT COUNT DO AGENTE
-- =====================================================

CREATE OR REPLACE FUNCTION increment_agent_chat_count(
  p_agent_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_agents
  SET 
    current_chat_count = COALESCE(current_chat_count, 0) + 1,
    updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_agent_chat_count(
  p_agent_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE whatsapp_agents
  SET 
    current_chat_count = GREATEST(0, COALESCE(current_chat_count, 0) - 1),
    updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_agent_chat_count TO service_role;
GRANT EXECUTE ON FUNCTION decrement_agent_chat_count TO service_role;

-- =====================================================
-- 3. ADICIONAR COLUNAS FALTANTES NA TABELA CAMPAIGNS
-- =====================================================

-- Coluna para tracking de tier da instância
DO $$ BEGIN
  ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS messaging_tier INTEGER DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Coluna para paused_at
DO $$ BEGIN
  ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================
-- 4. ADICIONAR COLUNA messaging_tier NAS INSTANCES
-- =====================================================

DO $$ BEGIN
  ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS messaging_tier INTEGER DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================
-- 5. ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================

-- Índice para buscar recipients pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_recipients_pending 
ON whatsapp_campaign_recipients(campaign_id, status) 
WHERE status IN ('pending', 'queued');

-- Índice para buscar recipients por meta_message_id (webhooks)
CREATE INDEX IF NOT EXISTS idx_recipients_meta_msg_id 
ON whatsapp_campaign_recipients(meta_message_id) 
WHERE meta_message_id IS NOT NULL;

-- Índice para campanhas scheduled
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_time 
ON whatsapp_campaigns(scheduled_at) 
WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

-- Índice para campanhas running (para verificação de status)
CREATE INDEX IF NOT EXISTS idx_campaigns_running 
ON whatsapp_campaigns(organization_id, status) 
WHERE status = 'running';

-- =====================================================
-- 6. TABELA DE AGENTES (SE NÃO EXISTIR)
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  -- Perfil
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  avatar_url TEXT,
  phone VARCHAR(20),
  
  -- Status
  status VARCHAR(20) DEFAULT 'offline', -- online, offline, away, busy
  is_active BOOLEAN DEFAULT true,
  
  -- Capacidade
  max_concurrent_chats INTEGER DEFAULT 5,
  current_chat_count INTEGER DEFAULT 0,
  
  -- Permissões
  permissions JSONB DEFAULT '{"send_templates": true, "send_media": true, "transfer": true, "close": true}',
  
  -- Métricas
  total_chats_handled INTEGER DEFAULT 0,
  total_messages_sent INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER,
  avg_handling_time_seconds INTEGER,
  csat_score DECIMAL(3,2),
  
  -- Activity tracking
  last_activity_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, email)
);

-- Índices para agentes
CREATE INDEX IF NOT EXISTS idx_agents_org ON whatsapp_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON whatsapp_agents(organization_id, status) WHERE is_active = true;

-- RLS
ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_org_access" ON whatsapp_agents;
CREATE POLICY "agents_org_access" ON whatsapp_agents FOR ALL USING (
  EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = whatsapp_agents.organization_id 
    AND user_id = auth.uid()
  )
);

GRANT ALL ON whatsapp_agents TO service_role;

-- =====================================================
-- 7. TABELA DE ASSIGNMENTS (SE NÃO EXISTIR)
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_chat_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES whatsapp_agents(id) ON DELETE CASCADE,
  
  assigned_by UUID,
  assigned_by_type VARCHAR(20) DEFAULT 'system', -- system, user, agent
  
  status VARCHAR(20) DEFAULT 'active', -- active, transferred, closed
  
  -- Métricas deste assignment
  first_response_at TIMESTAMPTZ,
  messages_sent INTEGER DEFAULT 0,
  
  -- Transfer
  transfer_notes TEXT,
  transferred_to UUID REFERENCES whatsapp_agents(id),
  
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_assignments_agent ON whatsapp_chat_assignments(agent_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_assignments_conv ON whatsapp_chat_assignments(conversation_id) WHERE status = 'active';

-- RLS
ALTER TABLE whatsapp_chat_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_access" ON whatsapp_chat_assignments;
CREATE POLICY "assignments_access" ON whatsapp_chat_assignments FOR ALL USING (true);

GRANT ALL ON whatsapp_chat_assignments TO service_role;

-- =====================================================
-- 8. FUNÇÃO PARA AUTO-ASSIGNMENT ROUND ROBIN
-- =====================================================

CREATE OR REPLACE FUNCTION auto_assign_conversation(
  p_organization_id UUID,
  p_conversation_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Buscar agente online com menor carga
  SELECT id INTO v_agent_id
  FROM whatsapp_agents
  WHERE organization_id = p_organization_id
    AND status = 'online'
    AND is_active = true
    AND current_chat_count < max_concurrent_chats
  ORDER BY current_chat_count ASC, last_activity_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED; -- Evitar race condition

  IF v_agent_id IS NULL THEN
    RETURN NULL; -- Sem agentes disponíveis
  END IF;

  -- Criar assignment
  INSERT INTO whatsapp_chat_assignments (conversation_id, agent_id, assigned_by_type)
  VALUES (p_conversation_id, v_agent_id, 'system');

  -- Atualizar conversa
  UPDATE whatsapp_conversations
  SET assigned_agent_id = v_agent_id, updated_at = NOW()
  WHERE id = p_conversation_id;

  -- Incrementar contador do agente
  UPDATE whatsapp_agents
  SET current_chat_count = current_chat_count + 1, last_activity_at = NOW()
  WHERE id = v_agent_id;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION auto_assign_conversation TO service_role;

-- =====================================================
-- 9. FUNÇÃO PARA ATUALIZAR STATUS DO RECIPIENT VIA WEBHOOK
-- =====================================================

CREATE OR REPLACE FUNCTION update_recipient_status_from_webhook(
  p_meta_message_id VARCHAR(255),
  p_new_status VARCHAR(20),
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_recipient_id UUID;
  v_campaign_id UUID;
BEGIN
  -- Buscar recipient
  SELECT id, campaign_id INTO v_recipient_id, v_campaign_id
  FROM whatsapp_campaign_recipients
  WHERE meta_message_id = p_meta_message_id
  LIMIT 1;

  IF v_recipient_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Atualizar status
  UPDATE whatsapp_campaign_recipients
  SET 
    status = CASE 
      WHEN p_new_status IN ('delivered', 'read') AND status = 'sent' THEN p_new_status
      WHEN p_new_status = 'read' AND status = 'delivered' THEN p_new_status
      WHEN p_new_status = 'failed' THEN p_new_status
      ELSE status
    END,
    delivered_at = CASE WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN p_timestamp ELSE delivered_at END,
    read_at = CASE WHEN p_new_status = 'read' AND read_at IS NULL THEN p_timestamp ELSE read_at END,
    failed_at = CASE WHEN p_new_status = 'failed' AND failed_at IS NULL THEN p_timestamp ELSE failed_at END
  WHERE id = v_recipient_id;

  -- Atualizar métricas da campanha
  -- (Já tem trigger, mas pode otimizar aqui se necessário)

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_recipient_status_from_webhook TO service_role;

-- =====================================================
-- 10. VIEW PARA MÉTRICAS DE CAMPANHA EM TEMPO REAL
-- =====================================================

CREATE OR REPLACE VIEW campaign_metrics_realtime AS
SELECT 
  c.id,
  c.name,
  c.status,
  c.organization_id,
  c.total_recipients,
  COUNT(*) FILTER (WHERE r.status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE r.status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE r.status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE r.status = 'read') as read_count,
  COUNT(*) FILTER (WHERE r.status = 'failed') as failed_count,
  ROUND(COUNT(*) FILTER (WHERE r.status IN ('sent', 'delivered', 'read'))::NUMERIC / NULLIF(c.total_recipients, 0) * 100, 2) as progress_percent,
  ROUND(COUNT(*) FILTER (WHERE r.status = 'delivered')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE r.status IN ('sent', 'delivered', 'read')), 0) * 100, 2) as delivery_rate,
  ROUND(COUNT(*) FILTER (WHERE r.status = 'read')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE r.status = 'delivered'), 0) * 100, 2) as read_rate,
  c.started_at,
  c.completed_at,
  EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at))::INTEGER as duration_seconds
FROM whatsapp_campaigns c
LEFT JOIN whatsapp_campaign_recipients r ON r.campaign_id = c.id
GROUP BY c.id, c.name, c.status, c.organization_id, c.total_recipients, c.started_at, c.completed_at;

-- Grant
GRANT SELECT ON campaign_metrics_realtime TO service_role;

-- =====================================================
-- SUCESSO!
-- =====================================================

SELECT '✅ High-scale campaign migrations applied!' AS resultado;
