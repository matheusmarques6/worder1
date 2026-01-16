-- =============================================
-- FASE 2: SISTEMA DE TAREFAS
-- Executar no Supabase SQL Editor
-- =============================================

-- Tabela principal de tarefas
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  
  -- Vinculações
  contact_id UUID,
  deal_id UUID,
  conversation_id UUID,
  ticket_id UUID,
  
  -- Dados da tarefa
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'task', -- call, email, whatsapp, meeting, task, followup, payment
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  
  -- Agendamento
  due_date DATE NOT NULL,
  due_time TIME,
  all_day BOOLEAN DEFAULT FALSE,
  
  -- Lembrete
  reminder_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT FALSE,
  
  -- Atribuição
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  created_by UUID,
  created_by_name VARCHAR(255),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  completed_by_name VARCHAR(255),
  
  -- Resultado
  outcome TEXT,
  outcome_type VARCHAR(50), -- success, no_answer, rescheduled, cancelled
  
  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deal ON tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(reminder_at, reminder_sent) 
  WHERE reminder_sent = FALSE AND reminder_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(organization_id, type);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_tasks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_tasks_timestamp();

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "tasks_delete" ON tasks;
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- =============================================
-- FUNÇÃO: Estatísticas de Tarefas
-- =============================================
CREATE OR REPLACE FUNCTION get_tasks_stats(p_organization_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  total BIGINT,
  pending BIGINT,
  in_progress BIGINT,
  completed BIGINT,
  overdue BIGINT,
  due_today BIGINT,
  due_tomorrow BIGINT,
  due_this_week BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT as pending,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT as in_progress,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed,
    COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND due_date < CURRENT_DATE)::BIGINT as overdue,
    COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND due_date = CURRENT_DATE)::BIGINT as due_today,
    COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND due_date = CURRENT_DATE + 1)::BIGINT as due_tomorrow,
    COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::BIGINT as due_this_week
  FROM tasks
  WHERE organization_id = p_organization_id
    AND (p_user_id IS NULL OR assigned_to = p_user_id);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FUNÇÃO: Buscar Tarefas com Contexto
-- =============================================
CREATE OR REPLACE FUNCTION get_tasks_with_context(
  p_organization_id UUID,
  p_status VARCHAR DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_due_date_start DATE DEFAULT NULL,
  p_due_date_end DATE DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  description TEXT,
  type VARCHAR,
  priority VARCHAR,
  due_date DATE,
  due_time TIME,
  status VARCHAR,
  assigned_to UUID,
  assigned_to_name VARCHAR,
  contact_id UUID,
  contact_name VARCHAR,
  contact_phone VARCHAR,
  deal_id UUID,
  deal_title VARCHAR,
  deal_value NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.description,
    t.type,
    t.priority,
    t.due_date,
    t.due_time,
    t.status,
    t.assigned_to,
    t.assigned_to_name,
    t.contact_id,
    c.name::VARCHAR as contact_name,
    c.phone_number::VARCHAR as contact_phone,
    t.deal_id,
    d.title::VARCHAR as deal_title,
    d.value as deal_value,
    t.created_at,
    t.updated_at
  FROM tasks t
  LEFT JOIN whatsapp_contacts c ON c.id = t.contact_id
  LEFT JOIN deals d ON d.id = t.deal_id
  WHERE t.organization_id = p_organization_id
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
    AND (p_contact_id IS NULL OR t.contact_id = p_contact_id)
    AND (p_deal_id IS NULL OR t.deal_id = p_deal_id)
    AND (p_due_date_start IS NULL OR t.due_date >= p_due_date_start)
    AND (p_due_date_end IS NULL OR t.due_date <= p_due_date_end)
  ORDER BY 
    CASE WHEN t.status IN ('pending', 'in_progress') AND t.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
    t.due_date ASC,
    CASE t.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      ELSE 4 
    END
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Verificar criação
SELECT 'Tabela tasks e funções criadas com sucesso!' as status;
