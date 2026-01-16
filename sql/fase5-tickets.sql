-- =============================================
-- FASE 5: SISTEMA DE TICKETS
-- Executar no Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. TABELA PRINCIPAL DE TICKETS
-- =============================================
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  
  -- Identificador único legível
  ticket_number SERIAL,
  
  -- Dados básicos
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Categorização
  category VARCHAR(50) DEFAULT 'question', -- delivery, payment, product, refund, question, bug, feature, other
  subcategory VARCHAR(50),
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  
  -- Status
  status VARCHAR(30) DEFAULT 'open', -- open, in_progress, waiting_customer, waiting_internal, resolved, closed
  
  -- Vinculações
  contact_id UUID,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  order_id UUID,
  order_number VARCHAR(50),
  conversation_id UUID,
  deal_id UUID,
  
  -- Atribuição
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  assigned_at TIMESTAMPTZ,
  
  -- Equipe/Departamento
  team_id UUID,
  team_name VARCHAR(100),
  
  -- SLA
  sla_due_at TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT FALSE,
  first_response_at TIMESTAMPTZ,
  first_response_sla_met BOOLEAN,
  
  -- Resolução
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_by_name VARCHAR(255),
  resolution_notes TEXT,
  resolution_time_minutes INT,
  
  -- Satisfação
  satisfaction_rating INT, -- 1-5
  satisfaction_comment TEXT,
  satisfaction_submitted_at TIMESTAMPTZ,
  
  -- Metadata
  tags TEXT[],
  custom_fields JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  -- Source
  source VARCHAR(50) DEFAULT 'manual', -- manual, whatsapp, email, api, automation
  source_message_id VARCHAR(255),
  
  -- Criação
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. TABELA DE COMENTÁRIOS
-- =============================================
CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Conteúdo
  content TEXT NOT NULL,
  content_html TEXT,
  
  -- Tipo
  is_internal BOOLEAN DEFAULT FALSE, -- Nota interna vs resposta ao cliente
  is_system BOOLEAN DEFAULT FALSE, -- Gerado pelo sistema
  
  -- Anexos
  attachments JSONB DEFAULT '[]', -- [{name, url, type, size}]
  
  -- Autor
  user_id UUID,
  user_name VARCHAR(255),
  user_email VARCHAR(255),
  user_avatar_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. TABELA DE HISTÓRICO DE MUDANÇAS
-- =============================================
CREATE TABLE IF NOT EXISTS ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Mudança
  field_changed VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  
  -- Quem mudou
  changed_by UUID,
  changed_by_name VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES
-- =============================================

-- Tickets
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(organization_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tickets_contact ON tickets(contact_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON tickets(sla_due_at, sla_breached) 
  WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(organization_id, created_at DESC);

-- Comments
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON ticket_comments(user_id);

-- History
CREATE INDEX IF NOT EXISTS idx_history_ticket ON ticket_history(ticket_id);

-- =============================================
-- TRIGGER: updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_tickets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;
CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_tickets_timestamp();

-- =============================================
-- TRIGGER: Log de mudanças automático
-- =============================================
CREATE OR REPLACE FUNCTION log_ticket_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Status
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO ticket_history (organization_id, ticket_id, field_changed, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.organization_id, NEW.id, 'status', OLD.status, NEW.status, NEW.assigned_to, NEW.assigned_to_name);
  END IF;
  
  -- Priority
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO ticket_history (organization_id, ticket_id, field_changed, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.organization_id, NEW.id, 'priority', OLD.priority, NEW.priority, NEW.assigned_to, NEW.assigned_to_name);
  END IF;
  
  -- Assigned
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO ticket_history (organization_id, ticket_id, field_changed, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.organization_id, NEW.id, 'assigned_to', OLD.assigned_to_name, NEW.assigned_to_name, NEW.assigned_to, NEW.assigned_to_name);
  END IF;
  
  -- Category
  IF OLD.category IS DISTINCT FROM NEW.category THEN
    INSERT INTO ticket_history (organization_id, ticket_id, field_changed, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.organization_id, NEW.id, 'category', OLD.category, NEW.category, NEW.assigned_to, NEW.assigned_to_name);
  END IF;
  
  -- Auto-calcular resolution_time quando resolver
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at = NOW();
    NEW.resolution_time_minutes = EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 60;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_changes_log ON tickets;
CREATE TRIGGER ticket_changes_log
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_changes();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_history ENABLE ROW LEVEL SECURITY;

-- Tickets
DROP POLICY IF EXISTS "tickets_all" ON tickets;
CREATE POLICY "tickets_all" ON tickets FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- Comments
DROP POLICY IF EXISTS "comments_all" ON ticket_comments;
CREATE POLICY "comments_all" ON ticket_comments FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- History
DROP POLICY IF EXISTS "history_select" ON ticket_history;
CREATE POLICY "history_select" ON ticket_history FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- =============================================
-- FUNÇÃO: Estatísticas de Tickets
-- =============================================
CREATE OR REPLACE FUNCTION get_ticket_stats(p_organization_id UUID)
RETURNS TABLE (
  total BIGINT,
  open BIGINT,
  in_progress BIGINT,
  waiting_customer BIGINT,
  waiting_internal BIGINT,
  resolved BIGINT,
  closed BIGINT,
  sla_breached BIGINT,
  avg_resolution_minutes NUMERIC,
  avg_first_response_minutes NUMERIC,
  avg_satisfaction NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total,
    COUNT(*) FILTER (WHERE status = 'open')::BIGINT as open,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT as in_progress,
    COUNT(*) FILTER (WHERE status = 'waiting_customer')::BIGINT as waiting_customer,
    COUNT(*) FILTER (WHERE status = 'waiting_internal')::BIGINT as waiting_internal,
    COUNT(*) FILTER (WHERE status = 'resolved')::BIGINT as resolved,
    COUNT(*) FILTER (WHERE status = 'closed')::BIGINT as closed,
    COUNT(*) FILTER (WHERE sla_breached = TRUE)::BIGINT as sla_breached,
    COALESCE(AVG(resolution_time_minutes) FILTER (WHERE status IN ('resolved', 'closed')), 0)::NUMERIC as avg_resolution_minutes,
    COALESCE(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) FILTER (WHERE first_response_at IS NOT NULL), 0)::NUMERIC as avg_first_response_minutes,
    COALESCE(AVG(satisfaction_rating) FILTER (WHERE satisfaction_rating IS NOT NULL), 0)::NUMERIC as avg_satisfaction
  FROM tickets
  WHERE organization_id = p_organization_id;
END;
$$ LANGUAGE plpgsql;

-- Verificar
SELECT 'Tabelas de tickets criadas com sucesso!' as status;
