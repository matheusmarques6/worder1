-- ============================================
-- FLOW BUILDER - HISTÓRICO DE EXECUÇÕES
-- Execute no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. TABELA: automation_executions (completa)
-- ============================================

-- Criar tabela se não existir
CREATE TABLE IF NOT EXISTS automation_executions (
  id VARCHAR(100) PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Status da execução
  status VARCHAR(20) NOT NULL DEFAULT 'running' 
    CHECK (status IN ('running', 'success', 'error', 'waiting', 'cancelled')),
  
  -- Dados do trigger
  trigger_type VARCHAR(100),
  trigger_data JSONB,
  
  -- Relacionamentos
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  
  -- Resultados por nó
  node_results JSONB DEFAULT '{}',
  
  -- Contexto final
  final_context JSONB,
  
  -- Erros
  error_message TEXT,
  error_node_id VARCHAR(100),
  
  -- Timing
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Execuções com delay
  wait_till TIMESTAMPTZ,
  resume_data JSONB,
  
  -- Retries
  retry_of VARCHAR(100),
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca eficiente
CREATE INDEX IF NOT EXISTS idx_automation_executions_automation ON automation_executions(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_org ON automation_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_status ON automation_executions(status);
CREATE INDEX IF NOT EXISTS idx_automation_executions_started ON automation_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_executions_contact ON automation_executions(contact_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_waiting ON automation_executions(wait_till) 
  WHERE status = 'waiting';

-- RLS
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org executions" ON automation_executions;
CREATE POLICY "Users can view org executions"
  ON automation_executions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert org executions" ON automation_executions;
CREATE POLICY "Users can insert org executions"
  ON automation_executions FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update org executions" ON automation_executions;
CREATE POLICY "Users can update org executions"
  ON automation_executions FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete org executions" ON automation_executions;
CREATE POLICY "Users can delete org executions"
  ON automation_executions FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ));


-- ============================================
-- 2. VIEWS ÚTEIS
-- ============================================

-- View de estatísticas de execução por automação
CREATE OR REPLACE VIEW automation_execution_stats AS
SELECT 
  automation_id,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE status = 'success') as success_count,
  COUNT(*) FILTER (WHERE status = 'error') as error_count,
  COUNT(*) FILTER (WHERE status = 'waiting') as waiting_count,
  AVG(duration_ms) as avg_duration_ms,
  MAX(started_at) as last_execution_at,
  MAX(started_at) FILTER (WHERE status = 'success') as last_success_at,
  MAX(started_at) FILTER (WHERE status = 'error') as last_error_at
FROM automation_executions
GROUP BY automation_id;


-- ============================================
-- 3. FUNÇÃO: Limpar execuções antigas
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_executions(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM automation_executions
  WHERE started_at < NOW() - (days_to_keep || ' days')::INTERVAL
    AND status IN ('success', 'error', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 4. TRIGGER: Atualizar estatísticas
-- ============================================

-- Função para atualizar counters na tabela automations
CREATE OR REPLACE FUNCTION update_automation_execution_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualiza somente se status mudou para success ou error
  IF NEW.status = 'success' AND (OLD IS NULL OR OLD.status != 'success') THEN
    UPDATE automations
    SET 
      success_count = COALESCE(success_count, 0) + 1,
      last_success_at = NOW()
    WHERE id = NEW.automation_id;
  ELSIF NEW.status = 'error' AND (OLD IS NULL OR OLD.status != 'error') THEN
    UPDATE automations
    SET error_count = COALESCE(error_count, 0) + 1
    WHERE id = NEW.automation_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS on_execution_complete ON automation_executions;
CREATE TRIGGER on_execution_complete
  AFTER INSERT OR UPDATE OF status ON automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_execution_stats();


-- ============================================
-- 5. FUNÇÃO: Resumir execuções em espera
-- ============================================

CREATE OR REPLACE FUNCTION get_executions_to_resume()
RETURNS TABLE (
  execution_id VARCHAR(100),
  automation_id UUID,
  resume_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as execution_id,
    e.automation_id,
    e.resume_data
  FROM automation_executions e
  WHERE e.status = 'waiting'
    AND e.wait_till <= NOW();
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 6. COLUNAS EXTRAS NA CREDENTIALS
-- ============================================

-- Adicionar coluna para tracking de automações usando a credencial
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'credentials' AND column_name = 'usage_count') THEN
    ALTER TABLE credentials ADD COLUMN usage_count INTEGER DEFAULT 0;
  END IF;
END $$;


-- ============================================
-- SUCESSO!
-- ============================================
SELECT 'Migração de histórico de execuções executada com sucesso!' as status;
