-- =============================================
-- WORDER AUTOMATIONS: SISTEMA DE EXECUÇÃO E VARIÁVEIS
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. TABELA: automation_runs (Execuções)
-- =============================================
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Contexto inicial
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  trigger_node_id TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'running' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  
  -- Resumo de execução
  nodes_total INTEGER DEFAULT 0,
  nodes_executed INTEGER DEFAULT 0,
  nodes_failed INTEGER DEFAULT 0,
  nodes_skipped INTEGER DEFAULT 0,
  
  -- Erro principal (se houver)
  error_node_id TEXT,
  error_type TEXT CHECK (error_type IN ('validation', 'execution', 'timeout', 'integration', 'data', 'configuration')),
  error_message TEXT,
  error_suggestion TEXT,
  
  -- Performance
  duration_ms INTEGER,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Retenção (TTL baseado no plano)
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para automation_runs
CREATE INDEX IF NOT EXISTS idx_runs_automation ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_runs_org_status ON automation_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_org_created ON automation_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_contact ON automation_runs(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runs_status ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_expires ON automation_runs(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================
-- 2. TABELA: automation_run_steps (Passos)
-- =============================================
CREATE TABLE IF NOT EXISTS automation_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  
  -- Identificação do nó
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_label TEXT,
  
  -- Ordem e dependências
  step_order INTEGER NOT NULL,
  parent_step_id UUID REFERENCES automation_run_steps(id) ON DELETE SET NULL,
  branch_path TEXT, -- 'true', 'false', 'A', 'B', null para linear
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped', 'timeout')),
  
  -- Dados de entrada (com limite)
  input_data JSONB DEFAULT '{}',
  input_truncated BOOLEAN DEFAULT false,
  
  -- Dados de saída (com limite)
  output_data JSONB DEFAULT '{}',
  output_truncated BOOLEAN DEFAULT false,
  
  -- Config usada após interpolação
  config_used JSONB DEFAULT '{}',
  
  -- Variáveis que foram resolvidas neste step
  variables_resolved JSONB DEFAULT '{}',
  
  -- Erro detalhado
  error_type TEXT,
  error_message TEXT,
  error_stack TEXT,
  error_context JSONB,
  
  -- Performance
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para automation_run_steps
CREATE INDEX IF NOT EXISTS idx_steps_run ON automation_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_steps_run_order ON automation_run_steps(run_id, step_order);
CREATE INDEX IF NOT EXISTS idx_steps_node ON automation_run_steps(node_id);
CREATE INDEX IF NOT EXISTS idx_steps_status ON automation_run_steps(status);

-- =============================================
-- 3. TABELA: node_schemas (Catálogo de Variáveis)
-- =============================================
CREATE TABLE IF NOT EXISTS node_schemas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_type TEXT UNIQUE NOT NULL,
  
  -- Categoria do nó
  category TEXT NOT NULL CHECK (category IN ('trigger', 'action', 'logic')),
  
  -- Schema de input esperado (JSON Schema)
  input_schema JSONB NOT NULL DEFAULT '{}',
  
  -- Schema de output produzido (JSON Schema)
  output_schema JSONB NOT NULL DEFAULT '{}',
  
  -- Metadados
  display_name TEXT,
  description TEXT,
  icon TEXT,
  version INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schemas_type ON node_schemas(node_type);
CREATE INDEX IF NOT EXISTS idx_schemas_category ON node_schemas(category);

-- =============================================
-- 4. POPULAR SCHEMAS DOS NÓS
-- =============================================

-- Limpar dados existentes (se houver)
DELETE FROM node_schemas;

-- TRIGGERS
INSERT INTO node_schemas (node_type, category, display_name, icon, output_schema) VALUES
('trigger_order', 'trigger', 'Pedido Realizado', 'ShoppingCart', '{
  "type": "object",
  "properties": {
    "order_id": {"type": "string", "label": "ID do Pedido", "example": "ORD-12345"},
    "order_value": {"type": "number", "label": "Valor do Pedido", "format": "currency", "example": 299.90},
    "order_status": {"type": "string", "label": "Status do Pedido", "example": "paid"},
    "order_date": {"type": "string", "label": "Data do Pedido", "format": "date-time"},
    "products": {"type": "array", "label": "Produtos", "items": {"type": "object", "properties": {"id": {"type": "string"}, "name": {"type": "string"}, "quantity": {"type": "number"}, "price": {"type": "number"}}}},
    "shipping_address": {"type": "object", "label": "Endereço de Entrega", "properties": {"street": {"type": "string"}, "city": {"type": "string"}, "state": {"type": "string"}, "zip": {"type": "string"}}}
  }
}'),

('trigger_abandon', 'trigger', 'Carrinho Abandonado', 'ShoppingBag', '{
  "type": "object",
  "properties": {
    "cart_id": {"type": "string", "label": "ID do Carrinho", "example": "CART-789"},
    "cart_value": {"type": "number", "label": "Valor do Carrinho", "format": "currency", "example": 450.00},
    "cart_url": {"type": "string", "label": "URL do Carrinho", "example": "https://loja.com/cart/abc"},
    "abandoned_at": {"type": "string", "label": "Abandonado em", "format": "date-time"},
    "products": {"type": "array", "label": "Produtos no Carrinho", "items": {"type": "object"}}
  }
}'),

('trigger_signup', 'trigger', 'Novo Cadastro', 'UserPlus', '{
  "type": "object",
  "properties": {
    "signup_source": {"type": "string", "label": "Origem do Cadastro", "example": "landing_page"},
    "signup_at": {"type": "string", "label": "Data do Cadastro", "format": "date-time"},
    "form_data": {"type": "object", "label": "Dados do Formulário"}
  }
}'),

('trigger_tag', 'trigger', 'Tag Adicionada/Removida', 'Tag', '{
  "type": "object",
  "properties": {
    "tag_name": {"type": "string", "label": "Nome da Tag", "example": "cliente-vip"},
    "tag_action": {"type": "string", "label": "Ação", "example": "added"},
    "previous_tags": {"type": "array", "label": "Tags Anteriores", "items": {"type": "string"}}
  }
}'),

('trigger_deal_created', 'trigger', 'Deal Criado', 'Plus', '{
  "type": "object",
  "properties": {
    "deal_id": {"type": "string", "label": "ID do Deal"},
    "deal_title": {"type": "string", "label": "Título do Deal"},
    "deal_value": {"type": "number", "label": "Valor do Deal", "format": "currency"},
    "pipeline_id": {"type": "string", "label": "ID da Pipeline"},
    "pipeline_name": {"type": "string", "label": "Nome da Pipeline"},
    "stage_id": {"type": "string", "label": "ID do Estágio"},
    "stage_name": {"type": "string", "label": "Nome do Estágio"}
  }
}'),

('trigger_deal_moved', 'trigger', 'Deal Movido de Estágio', 'ArrowRight', '{
  "type": "object",
  "properties": {
    "deal_id": {"type": "string", "label": "ID do Deal"},
    "deal_title": {"type": "string", "label": "Título do Deal"},
    "previous_stage_id": {"type": "string", "label": "Estágio Anterior"},
    "previous_stage_name": {"type": "string", "label": "Nome do Estágio Anterior"},
    "new_stage_id": {"type": "string", "label": "Novo Estágio"},
    "new_stage_name": {"type": "string", "label": "Nome do Novo Estágio"}
  }
}'),

('trigger_date', 'trigger', 'Data Específica', 'Calendar', '{
  "type": "object",
  "properties": {
    "triggered_date": {"type": "string", "label": "Data do Disparo", "format": "date"},
    "field_matched": {"type": "string", "label": "Campo que Coincidiu"},
    "field_value": {"type": "string", "label": "Valor do Campo"}
  }
}'),

('trigger_segment', 'trigger', 'Entrou em Segmento', 'Users', '{
  "type": "object",
  "properties": {
    "segment_id": {"type": "string", "label": "ID do Segmento"},
    "segment_name": {"type": "string", "label": "Nome do Segmento"},
    "entered_at": {"type": "string", "label": "Entrou em", "format": "date-time"}
  }
}'),

('trigger_webhook', 'trigger', 'Webhook Recebido', 'Globe', '{
  "type": "object",
  "properties": {
    "webhook_id": {"type": "string", "label": "ID do Webhook"},
    "payload": {"type": "object", "label": "Dados Recebidos"},
    "headers": {"type": "object", "label": "Headers"},
    "received_at": {"type": "string", "label": "Recebido em", "format": "date-time"}
  }
}');

-- ACTIONS
INSERT INTO node_schemas (node_type, category, display_name, icon, input_schema, output_schema) VALUES
('action_email', 'action', 'Enviar Email', 'Mail', '{
  "type": "object",
  "properties": {
    "to": {"type": "string", "label": "Para", "default": "{{contact.email}}"},
    "subject": {"type": "string", "label": "Assunto"},
    "template": {"type": "string", "label": "Template"}
  }
}', '{
  "type": "object",
  "properties": {
    "email_sent": {"type": "boolean", "label": "Email Enviado"},
    "message_id": {"type": "string", "label": "ID da Mensagem"},
    "provider_response": {"type": "object", "label": "Resposta do Provedor"}
  }
}'),

('action_whatsapp', 'action', 'Enviar WhatsApp', 'MessageCircle', '{
  "type": "object",
  "properties": {
    "to": {"type": "string", "label": "Para", "default": "{{contact.phone}}"},
    "message_type": {"type": "string", "label": "Tipo", "enum": ["template", "text"]},
    "template_name": {"type": "string", "label": "Nome do Template"},
    "message": {"type": "string", "label": "Mensagem"}
  }
}', '{
  "type": "object",
  "properties": {
    "whatsapp_sent": {"type": "boolean", "label": "WhatsApp Enviado"},
    "message_id": {"type": "string", "label": "ID da Mensagem"},
    "status": {"type": "string", "label": "Status"}
  }
}'),

('action_sms', 'action', 'Enviar SMS', 'Smartphone', '{
  "type": "object",
  "properties": {
    "to": {"type": "string", "label": "Para", "default": "{{contact.phone}}"},
    "message": {"type": "string", "label": "Mensagem"}
  }
}', '{
  "type": "object",
  "properties": {
    "sms_sent": {"type": "boolean", "label": "SMS Enviado"},
    "message_sid": {"type": "string", "label": "SID da Mensagem"}
  }
}'),

('action_tag', 'action', 'Adicionar/Remover Tag', 'Tag', '{
  "type": "object",
  "properties": {
    "action": {"type": "string", "label": "Ação", "enum": ["add", "remove"]},
    "tags": {"type": "array", "label": "Tags", "items": {"type": "string"}}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "tags_added": {"type": "array", "label": "Tags Adicionadas", "items": {"type": "string"}},
    "tags_removed": {"type": "array", "label": "Tags Removidas", "items": {"type": "string"}},
    "current_tags": {"type": "array", "label": "Tags Atuais", "items": {"type": "string"}}
  }
}'),

('action_update', 'action', 'Atualizar Contato', 'UserCog', '{
  "type": "object",
  "properties": {
    "fields": {"type": "object", "label": "Campos a Atualizar"}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "fields_updated": {"type": "array", "label": "Campos Atualizados", "items": {"type": "string"}}
  }
}'),

('action_create_deal', 'action', 'Criar Deal', 'Plus', '{
  "type": "object",
  "properties": {
    "title": {"type": "string", "label": "Título"},
    "value": {"type": "number", "label": "Valor"},
    "pipeline_id": {"type": "string", "label": "Pipeline"},
    "stage_id": {"type": "string", "label": "Estágio"}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "deal_id": {"type": "string", "label": "ID do Deal Criado"},
    "deal_title": {"type": "string", "label": "Título do Deal"}
  }
}'),

('action_move_deal', 'action', 'Mover Deal', 'ArrowRight', '{
  "type": "object",
  "properties": {
    "deal_id": {"type": "string", "label": "ID do Deal", "default": "{{deal.id}}"},
    "stage_id": {"type": "string", "label": "Novo Estágio"}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "previous_stage_id": {"type": "string", "label": "Estágio Anterior"},
    "new_stage_id": {"type": "string", "label": "Novo Estágio"}
  }
}'),

('action_assign_deal', 'action', 'Atribuir Deal', 'UserCheck', '{
  "type": "object",
  "properties": {
    "deal_id": {"type": "string", "label": "ID do Deal", "default": "{{deal.id}}"},
    "assignment_type": {"type": "string", "label": "Tipo", "enum": ["specific", "round_robin"]},
    "user_email": {"type": "string", "label": "Email do Usuário"}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "assigned_to_id": {"type": "string", "label": "ID do Usuário"},
    "assigned_to_name": {"type": "string", "label": "Nome do Usuário"},
    "assigned_to_email": {"type": "string", "label": "Email do Usuário"}
  }
}'),

('action_notify', 'action', 'Notificar Equipe', 'Bell', '{
  "type": "object",
  "properties": {
    "notify_type": {"type": "string", "label": "Notificar", "enum": ["all", "owner", "specific"]},
    "user_email": {"type": "string", "label": "Email do Usuário"},
    "title": {"type": "string", "label": "Título"},
    "message": {"type": "string", "label": "Mensagem"}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "notifications_sent": {"type": "number", "label": "Notificações Enviadas"},
    "notified_users": {"type": "array", "label": "Usuários Notificados", "items": {"type": "string"}}
  }
}'),

('action_webhook', 'action', 'Chamar Webhook', 'Globe', '{
  "type": "object",
  "properties": {
    "url": {"type": "string", "label": "URL"},
    "method": {"type": "string", "label": "Método", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
    "headers": {"type": "object", "label": "Headers"},
    "body": {"type": "object", "label": "Body"}
  }
}', '{
  "type": "object",
  "properties": {
    "success": {"type": "boolean", "label": "Sucesso"},
    "status_code": {"type": "number", "label": "Status Code"},
    "response_body": {"type": "object", "label": "Resposta"}
  }
}');

-- LOGIC
INSERT INTO node_schemas (node_type, category, display_name, icon, input_schema, output_schema) VALUES
('logic_condition', 'logic', 'Condição If/Else', 'GitBranch', '{
  "type": "object",
  "properties": {
    "field": {"type": "string", "label": "Campo"},
    "operator": {"type": "string", "label": "Operador"},
    "value": {"type": "string", "label": "Valor"}
  }
}', '{
  "type": "object",
  "properties": {
    "condition_result": {"type": "boolean", "label": "Resultado da Condição"},
    "branch_taken": {"type": "string", "label": "Caminho Tomado", "example": "true"}
  }
}'),

('logic_delay', 'logic', 'Aguardar', 'Clock', '{
  "type": "object",
  "properties": {
    "delay_value": {"type": "number", "label": "Valor"},
    "delay_unit": {"type": "string", "label": "Unidade", "enum": ["minutes", "hours", "days"]}
  }
}', '{
  "type": "object",
  "properties": {
    "waited_ms": {"type": "number", "label": "Tempo Aguardado (ms)"},
    "completed_at": {"type": "string", "label": "Completado em", "format": "date-time"}
  }
}'),

('logic_split', 'logic', 'Teste A/B', 'Shuffle', '{
  "type": "object",
  "properties": {
    "split_percentage": {"type": "number", "label": "Porcentagem A", "example": 50}
  }
}', '{
  "type": "object",
  "properties": {
    "variant": {"type": "string", "label": "Variante Escolhida", "example": "A"},
    "random_value": {"type": "number", "label": "Valor Aleatório"}
  }
}'),

('logic_filter', 'logic', 'Filtrar', 'Filter', '{
  "type": "object",
  "properties": {
    "conditions": {"type": "array", "label": "Condições"}
  }
}', '{
  "type": "object",
  "properties": {
    "passed_filter": {"type": "boolean", "label": "Passou no Filtro"},
    "filter_reason": {"type": "string", "label": "Motivo"}
  }
}');

-- =============================================
-- 5. RLS (Row Level Security)
-- =============================================

-- Habilitar RLS
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_schemas ENABLE ROW LEVEL SECURITY;

-- Policies para automation_runs
CREATE POLICY "Users can view runs of their organization" ON automation_runs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert runs for their organization" ON automation_runs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update runs of their organization" ON automation_runs
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policies para automation_run_steps
CREATE POLICY "Users can view steps of their runs" ON automation_run_steps
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM automation_runs WHERE organization_id IN (
        SELECT organization_id FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert steps for their runs" ON automation_run_steps
  FOR INSERT WITH CHECK (
    run_id IN (
      SELECT id FROM automation_runs WHERE organization_id IN (
        SELECT organization_id FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update steps of their runs" ON automation_run_steps
  FOR UPDATE USING (
    run_id IN (
      SELECT id FROM automation_runs WHERE organization_id IN (
        SELECT organization_id FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- node_schemas é público (apenas leitura)
CREATE POLICY "Anyone can read node schemas" ON node_schemas
  FOR SELECT USING (true);

-- =============================================
-- 6. FUNÇÃO: Limpar execuções expiradas
-- =============================================
CREATE OR REPLACE FUNCTION cleanup_expired_runs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM automation_runs 
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. FUNÇÃO: Obter estatísticas de automação
-- =============================================
CREATE OR REPLACE FUNCTION get_automation_stats(p_automation_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_runs', COUNT(*),
    'successful_runs', COUNT(*) FILTER (WHERE status = 'completed'),
    'failed_runs', COUNT(*) FILTER (WHERE status = 'failed'),
    'avg_duration_ms', AVG(duration_ms),
    'last_run_at', MAX(started_at)
  ) INTO result
  FROM automation_runs
  WHERE automation_id = p_automation_id
    AND started_at > NOW() - (p_days || ' days')::INTERVAL;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 8. VIEW: Execuções recentes com detalhes
-- =============================================
CREATE OR REPLACE VIEW automation_runs_detailed AS
SELECT 
  ar.*,
  a.name as automation_name,
  c.email as contact_email,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  (
    SELECT json_agg(json_build_object(
      'id', ars.id,
      'node_id', ars.node_id,
      'node_type', ars.node_type,
      'node_label', ars.node_label,
      'status', ars.status,
      'duration_ms', ars.duration_ms
    ) ORDER BY ars.step_order)
    FROM automation_run_steps ars
    WHERE ars.run_id = ar.id
  ) as steps_summary
FROM automation_runs ar
LEFT JOIN automations a ON ar.automation_id = a.id
LEFT JOIN contacts c ON ar.contact_id = c.id;

-- =============================================
-- DONE!
-- =============================================
-- Tabelas criadas:
-- - automation_runs: Registro de cada execução
-- - automation_run_steps: Cada passo da execução
-- - node_schemas: Catálogo de variáveis por tipo de nó
--
-- Para verificar:
-- SELECT * FROM node_schemas;
-- SELECT * FROM automation_runs LIMIT 5;
-- SELECT * FROM automation_run_steps LIMIT 5;
