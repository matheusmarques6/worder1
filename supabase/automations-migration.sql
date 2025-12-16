-- ============================================
-- MIGRAÇÕES PARA SISTEMA DE AUTOMAÇÕES
-- WORDER V45 - Sistema de Automações com Pipeline
-- Execute este SQL no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. TABELA DE LOG DE EVENTOS
-- Registra todos os eventos para auditoria
-- ============================================
CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  payload JSONB DEFAULT '{}',
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_event_logs_org ON event_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_contact ON event_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_deal ON event_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at DESC);

-- ============================================
-- 2. TABELA DE CARRINHOS ABANDONADOS
-- Para trigger de carrinho abandonado
-- ============================================
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  cart_data JSONB DEFAULT '{}',
  total_value DECIMAL(12, 2) DEFAULT 0,
  detected_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  recovery_automation_id UUID REFERENCES automations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Constraint único por session
CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_session ON abandoned_carts(session_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_org ON abandoned_carts(organization_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_detected ON abandoned_carts(detected_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_not_detected ON abandoned_carts(organization_id) 
  WHERE detected_at IS NULL AND recovered_at IS NULL;

-- ============================================
-- 3. TABELA DE WEBHOOKS CUSTOMIZADOS
-- Para trigger de webhook
-- ============================================
CREATE TABLE IF NOT EXISTS automation_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  webhook_path TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_webhooks_path ON automation_webhooks(webhook_path);
CREATE INDEX IF NOT EXISTS idx_automation_webhooks_automation ON automation_webhooks(automation_id);

-- ============================================
-- 4. TABELA DE STEPS PENDENTES (para delays)
-- Armazena steps agendados para execução futura
-- ============================================
CREATE TABLE IF NOT EXISTS automation_pending_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  context JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  qstash_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_steps_scheduled ON automation_pending_steps(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_pending_steps_status ON automation_pending_steps(status);
CREATE INDEX IF NOT EXISTS idx_pending_steps_run ON automation_pending_steps(run_id);

-- ============================================
-- 5. TABELA DE NOTIFICAÇÕES
-- Para action de notificação interna
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(organization_id, user_id) WHERE is_read = false;

-- ============================================
-- 6. ADICIONAR COLUNAS FALTANTES EM AUTOMATIONS
-- ============================================
DO $$ 
BEGIN
  -- Adicionar trigger_config se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'trigger_config') THEN
    ALTER TABLE automations ADD COLUMN trigger_config JSONB DEFAULT '{}';
  END IF;

  -- Adicionar nodes se não existir (formato novo)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'nodes') THEN
    ALTER TABLE automations ADD COLUMN nodes JSONB DEFAULT '[]';
  END IF;

  -- Adicionar edges se não existir (formato novo)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'edges') THEN
    ALTER TABLE automations ADD COLUMN edges JSONB DEFAULT '[]';
  END IF;
END $$;

-- ============================================
-- 7. ADICIONAR COLUNAS FALTANTES EM AUTOMATION_RUNS
-- ============================================
DO $$ 
BEGIN
  -- Adicionar current_node_id se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automation_runs' AND column_name = 'current_node_id') THEN
    ALTER TABLE automation_runs ADD COLUMN current_node_id TEXT;
  END IF;

  -- Adicionar error_message se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automation_runs' AND column_name = 'error_message') THEN
    ALTER TABLE automation_runs ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- ============================================
-- 8. CRIAR TABELA AUTOMATION_RUN_STEPS SE NÃO EXISTIR
-- ============================================
CREATE TABLE IF NOT EXISTS automation_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run ON automation_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_run_steps_node ON automation_run_steps(node_id);

-- ============================================
-- 9. FUNÇÃO PARA INCREMENTAR STATS
-- ============================================
CREATE OR REPLACE FUNCTION increment_automation_stats(
  p_automation_id UUID,
  p_success BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  UPDATE automations
  SET 
    total_runs = COALESCE(total_runs, 0) + 1,
    successful_runs = CASE 
      WHEN p_success THEN COALESCE(successful_runs, 0) + 1 
      ELSE COALESCE(successful_runs, 0) 
    END,
    failed_runs = CASE 
      WHEN NOT p_success THEN COALESCE(failed_runs, 0) + 1 
      ELSE COALESCE(failed_runs, 0) 
    END,
    last_run_at = NOW(),
    updated_at = NOW()
  WHERE id = p_automation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. FUNÇÃO PARA DETECTAR CARRINHOS ABANDONADOS
-- Executar via cron a cada 15 minutos
-- ============================================
CREATE OR REPLACE FUNCTION detect_abandoned_carts()
RETURNS INTEGER AS $$
DECLARE
  abandoned_count INTEGER := 0;
BEGIN
  -- Marcar carrinhos não detectados criados há mais de 30 minutos
  -- e que não foram recuperados
  UPDATE abandoned_carts
  SET 
    detected_at = NOW(),
    updated_at = NOW()
  WHERE 
    detected_at IS NULL
    AND recovered_at IS NULL
    AND created_at < NOW() - INTERVAL '30 minutes'
    AND email IS NOT NULL;
  
  GET DIAGNOSTICS abandoned_count = ROW_COUNT;
  
  RETURN abandoned_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 11. ADICIONAR STATUS 'waiting' EM AUTOMATION_RUNS
-- ============================================
DO $$ 
BEGIN
  -- Verificar e atualizar constraint de status
  ALTER TABLE automation_runs 
    DROP CONSTRAINT IF EXISTS automation_runs_status_check;
    
  ALTER TABLE automation_runs 
    ADD CONSTRAINT automation_runs_status_check 
    CHECK (status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled'));
EXCEPTION WHEN OTHERS THEN
  -- Ignorar se já existe
  NULL;
END $$;

-- ============================================
-- 12. CRIAR VIEW PARA MÉTRICAS DE AUTOMAÇÕES
-- ============================================
CREATE OR REPLACE VIEW automation_metrics AS
SELECT 
  a.id,
  a.organization_id,
  a.name,
  a.status,
  a.trigger_type,
  COALESCE(a.total_runs, 0) as total_runs,
  COALESCE(a.successful_runs, 0) as successful_runs,
  COALESCE(a.failed_runs, 0) as failed_runs,
  CASE 
    WHEN COALESCE(a.total_runs, 0) > 0 
    THEN ROUND((COALESCE(a.successful_runs, 0)::DECIMAL / a.total_runs) * 100, 2)
    ELSE 0 
  END as success_rate,
  a.last_run_at,
  a.created_at,
  (
    SELECT COUNT(*) 
    FROM automation_runs ar 
    WHERE ar.automation_id = a.id 
    AND ar.status = 'running'
  ) as running_count,
  (
    SELECT COUNT(*) 
    FROM automation_runs ar 
    WHERE ar.automation_id = a.id 
    AND ar.status = 'waiting'
  ) as waiting_count
FROM automations a;

-- ============================================
-- 13. POLÍTICA RLS PARA EVENT_LOGS
-- ============================================
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's event logs"
  ON event_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- 14. POLÍTICA RLS PARA NOTIFICATIONS
-- ============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
  ON notifications FOR SELECT
  USING (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================
-- 15. POLÍTICA RLS PARA ABANDONED_CARTS
-- ============================================
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's abandoned carts"
  ON abandoned_carts FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- 16. ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ============================================

-- Índice para buscar automações ativas por trigger_type
CREATE INDEX IF NOT EXISTS idx_automations_active_trigger 
  ON automations(organization_id, trigger_type) 
  WHERE status = 'active';

-- Índice para buscar runs recentes
CREATE INDEX IF NOT EXISTS idx_automation_runs_recent 
  ON automation_runs(automation_id, created_at DESC);

-- Índice para buscar contatos por email
CREATE INDEX IF NOT EXISTS idx_contacts_email 
  ON contacts(organization_id, email);

-- Índice para buscar contatos por shopify_customer_id
CREATE INDEX IF NOT EXISTS idx_contacts_shopify 
  ON contacts(organization_id, shopify_customer_id) 
  WHERE shopify_customer_id IS NOT NULL;

-- ============================================
-- FIM DAS MIGRAÇÕES
-- ============================================

-- Verificar se tudo foi criado corretamente
SELECT 
  'event_logs' as table_name, 
  COUNT(*) as row_count 
FROM event_logs
UNION ALL
SELECT 'abandoned_carts', COUNT(*) FROM abandoned_carts
UNION ALL
SELECT 'automation_webhooks', COUNT(*) FROM automation_webhooks
UNION ALL
SELECT 'automation_pending_steps', COUNT(*) FROM automation_pending_steps
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'automation_run_steps', COUNT(*) FROM automation_run_steps;
