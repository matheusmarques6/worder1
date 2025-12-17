-- =====================================================
-- SISTEMA DE EXECUÇÃO DE AUTOMAÇÕES - WORDER
-- =====================================================

-- 1. TABELA: Fila de automações a processar
-- =====================================================
CREATE TABLE IF NOT EXISTS automation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Índices inline
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_automation_queue_status ON automation_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_queue_org ON automation_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_queue_created ON automation_queue(created_at DESC);

-- 2. TABELA: Registro de execuções
-- =====================================================
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  queue_item_id UUID REFERENCES automation_queue(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  failed_steps INTEGER DEFAULT 0,
  
  error_message TEXT,
  error_node_id TEXT,
  
  -- Metadados
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_org ON automation_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_contact ON automation_runs(contact_id);

-- 3. TABELA: Steps de cada execução
-- =====================================================
CREATE TABLE IF NOT EXISTS automation_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_label TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped')),
  
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  config_used JSONB DEFAULT '{}',
  variables_resolved JSONB DEFAULT '{}',
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  error_message TEXT,
  error_details JSONB,
  
  step_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run ON automation_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_run_steps_status ON automation_run_steps(status);

-- 4. TABELA: Jobs agendados (para delays)
-- =====================================================
CREATE TABLE IF NOT EXISTS scheduled_automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  run_id UUID REFERENCES automation_runs(id) ON DELETE CASCADE,
  
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  
  -- Qual nó continuar a partir
  continue_from_node_id TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  
  -- Quando executar
  execute_at TIMESTAMPTZ NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_execute ON scheduled_automation_jobs(execute_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_org ON scheduled_automation_jobs(organization_id);

-- 5. RLS Policies
-- =====================================================

ALTER TABLE automation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_automation_jobs ENABLE ROW LEVEL SECURITY;

-- Policies para automation_queue
CREATE POLICY "Users can view own org queue" ON automation_queue
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policies para automation_runs
CREATE POLICY "Users can view own org runs" ON automation_runs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policies para automation_run_steps
CREATE POLICY "Users can view own org steps" ON automation_run_steps
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM automation_runs WHERE organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Policies para scheduled_automation_jobs
CREATE POLICY "Users can view own org scheduled jobs" ON scheduled_automation_jobs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 6. TRIGGERS: Capturar eventos para automação
-- =====================================================

-- Função genérica para enfileirar automação
CREATE OR REPLACE FUNCTION enqueue_automation_trigger()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type_name TEXT;
  trigger_payload JSONB;
  v_contact_id UUID;
  v_deal_id UUID;
BEGIN
  -- Determina o tipo de trigger baseado na tabela e operação
  CASE TG_TABLE_NAME
    WHEN 'deals' THEN
      IF TG_OP = 'INSERT' THEN
        trigger_type_name := 'deal_created';
      ELSIF TG_OP = 'UPDATE' THEN
        -- Verifica se mudou de estágio
        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
          trigger_type_name := 'deal_stage';
        -- Verifica se foi ganho
        ELSIF NEW.status = 'won' AND OLD.status != 'won' THEN
          trigger_type_name := 'deal_won';
        -- Verifica se foi perdido
        ELSIF NEW.status = 'lost' AND OLD.status != 'lost' THEN
          trigger_type_name := 'deal_lost';
        ELSE
          RETURN NEW; -- Nenhuma mudança relevante
        END IF;
      END IF;
      
      v_contact_id := NEW.contact_id;
      v_deal_id := NEW.id;
      
      trigger_payload := jsonb_build_object(
        'deal_id', NEW.id,
        'deal_title', NEW.title,
        'deal_value', NEW.value,
        'pipeline_id', NEW.pipeline_id,
        'stage_id', NEW.stage_id,
        'old_stage_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage_id ELSE NULL END,
        'status', NEW.status,
        'contact_id', NEW.contact_id,
        'assigned_to', NEW.assigned_to
      );
      
    WHEN 'contacts' THEN
      IF TG_OP = 'INSERT' THEN
        trigger_type_name := 'signup';
        v_contact_id := NEW.id;
        
        trigger_payload := jsonb_build_object(
          'contact_id', NEW.id,
          'email', NEW.email,
          'phone', NEW.phone,
          'first_name', NEW.first_name,
          'source', NEW.source
        );
      ELSE
        RETURN NEW;
      END IF;
      
    WHEN 'contact_tags' THEN
      IF TG_OP = 'INSERT' THEN
        trigger_type_name := 'tag';
        v_contact_id := NEW.contact_id;
        
        trigger_payload := jsonb_build_object(
          'contact_id', NEW.contact_id,
          'tag_id', NEW.tag_id,
          'tag_name', (SELECT name FROM tags WHERE id = NEW.tag_id)
        );
      ELSE
        RETURN NEW;
      END IF;
      
    ELSE
      RETURN NEW;
  END CASE;
  
  -- Só enfileira se encontrou um tipo de trigger válido
  IF trigger_type_name IS NOT NULL THEN
    INSERT INTO automation_queue (
      organization_id,
      trigger_type,
      trigger_data,
      contact_id,
      deal_id
    ) VALUES (
      NEW.organization_id,
      trigger_type_name,
      trigger_payload,
      v_contact_id,
      v_deal_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para deals
DROP TRIGGER IF EXISTS trigger_deal_automation ON deals;
CREATE TRIGGER trigger_deal_automation
AFTER INSERT OR UPDATE ON deals
FOR EACH ROW
EXECUTE FUNCTION enqueue_automation_trigger();

-- Trigger para contacts (novo cadastro)
DROP TRIGGER IF EXISTS trigger_contact_automation ON contacts;
CREATE TRIGGER trigger_contact_automation
AFTER INSERT ON contacts
FOR EACH ROW
EXECUTE FUNCTION enqueue_automation_trigger();

-- Trigger para contact_tags (tag adicionada)
DROP TRIGGER IF EXISTS trigger_tag_automation ON contact_tags;
CREATE TRIGGER trigger_tag_automation
AFTER INSERT ON contact_tags
FOR EACH ROW
EXECUTE FUNCTION enqueue_automation_trigger();

-- 7. FUNÇÕES AUXILIARES
-- =====================================================

-- Função para buscar automações que devem ser disparadas por um trigger
CREATE OR REPLACE FUNCTION get_automations_for_trigger(
  p_organization_id UUID,
  p_trigger_type TEXT,
  p_trigger_data JSONB
)
RETURNS TABLE (
  automation_id UUID,
  automation_name TEXT,
  nodes JSONB,
  edges JSONB,
  trigger_config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as automation_id,
    a.name as automation_name,
    a.nodes,
    a.edges,
    a.trigger_config
  FROM automations a
  WHERE a.organization_id = p_organization_id
    AND a.status = 'active'
    AND a.trigger_type = p_trigger_type
    -- Verifica configurações específicas do trigger
    AND (
      -- Deal stage: verifica pipeline e stage específico se configurado
      (p_trigger_type = 'deal_stage' AND (
        a.trigger_config->>'pipelineId' IS NULL 
        OR a.trigger_config->>'pipelineId' = p_trigger_data->>'pipeline_id'
      ) AND (
        a.trigger_config->>'stageId' IS NULL 
        OR a.trigger_config->>'stageId' = p_trigger_data->>'stage_id'
      ))
      -- Tag: verifica tag específica se configurada
      OR (p_trigger_type = 'tag' AND (
        a.trigger_config->>'tagId' IS NULL 
        OR a.trigger_config->>'tagId' = p_trigger_data->>'tag_id'
        OR a.trigger_config->>'tagName' IS NULL
        OR a.trigger_config->>'tagName' = p_trigger_data->>'tag_name'
      ))
      -- Outros triggers sem filtro específico
      OR p_trigger_type NOT IN ('deal_stage', 'tag')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para limpar execuções antigas
CREATE OR REPLACE FUNCTION cleanup_old_automation_data(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Remove runs antigos
  WITH deleted AS (
    DELETE FROM automation_runs
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  -- Remove queue items antigos processados
  DELETE FROM automation_queue
  WHERE status IN ('completed', 'failed')
    AND created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  -- Remove scheduled jobs antigos
  DELETE FROM scheduled_automation_jobs
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. VIEWS ÚTEIS
-- =====================================================

-- View com resumo de execuções
CREATE OR REPLACE VIEW automation_runs_summary AS
SELECT 
  ar.id,
  ar.organization_id,
  ar.automation_id,
  a.name as automation_name,
  ar.status,
  ar.trigger_type,
  ar.started_at,
  ar.completed_at,
  ar.duration_ms,
  ar.total_steps,
  ar.completed_steps,
  ar.failed_steps,
  ar.error_message,
  c.email as contact_email,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  d.title as deal_title,
  d.value as deal_value
FROM automation_runs ar
LEFT JOIN automations a ON ar.automation_id = a.id
LEFT JOIN contacts c ON ar.contact_id = c.id
LEFT JOIN deals d ON ar.deal_id = d.id;

-- 9. GRANTS (para service role)
-- =====================================================
GRANT ALL ON automation_queue TO service_role;
GRANT ALL ON automation_runs TO service_role;
GRANT ALL ON automation_run_steps TO service_role;
GRANT ALL ON scheduled_automation_jobs TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_automation_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION get_automations_for_trigger(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_automation_data(INTEGER) TO service_role;
