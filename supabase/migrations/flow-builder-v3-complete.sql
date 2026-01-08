-- ============================================
-- FLOW BUILDER V3 - COMPLETE MIGRATION
-- ============================================
-- Execute este script no Supabase SQL Editor
-- Este script garante que todas as colunas necessárias existem

-- ============================================
-- 1. GARANTIR COLUNAS NA TABELA AUTOMATIONS
-- ============================================

DO $$ 
BEGIN
  -- Adicionar coluna nodes se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'nodes') THEN
    ALTER TABLE automations ADD COLUMN nodes JSONB DEFAULT '[]';
    RAISE NOTICE 'Coluna nodes adicionada';
  END IF;

  -- Adicionar coluna edges se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'edges') THEN
    ALTER TABLE automations ADD COLUMN edges JSONB DEFAULT '[]';
    RAISE NOTICE 'Coluna edges adicionada';
  END IF;

  -- Adicionar coluna status se não existir (com tipo enum)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'status') THEN
    ALTER TABLE automations ADD COLUMN status TEXT DEFAULT 'draft';
    RAISE NOTICE 'Coluna status adicionada';
  END IF;

  -- Adicionar coluna trigger_type se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'trigger_type') THEN
    ALTER TABLE automations ADD COLUMN trigger_type TEXT DEFAULT 'manual';
    RAISE NOTICE 'Coluna trigger_type adicionada';
  END IF;

  -- Adicionar coluna trigger_config se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'trigger_config') THEN
    ALTER TABLE automations ADD COLUMN trigger_config JSONB DEFAULT '{}';
    RAISE NOTICE 'Coluna trigger_config adicionada';
  END IF;

  -- Adicionar coluna activated_at se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'activated_at') THEN
    ALTER TABLE automations ADD COLUMN activated_at TIMESTAMPTZ;
    RAISE NOTICE 'Coluna activated_at adicionada';
  END IF;

  -- Adicionar coluna paused_at se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'paused_at') THEN
    ALTER TABLE automations ADD COLUMN paused_at TIMESTAMPTZ;
    RAISE NOTICE 'Coluna paused_at adicionada';
  END IF;

  -- Adicionar coluna total_runs se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'total_runs') THEN
    ALTER TABLE automations ADD COLUMN total_runs INTEGER DEFAULT 0;
    RAISE NOTICE 'Coluna total_runs adicionada';
  END IF;

  -- Adicionar coluna successful_runs se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'successful_runs') THEN
    ALTER TABLE automations ADD COLUMN successful_runs INTEGER DEFAULT 0;
    RAISE NOTICE 'Coluna successful_runs adicionada';
  END IF;

  -- Adicionar coluna failed_runs se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'failed_runs') THEN
    ALTER TABLE automations ADD COLUMN failed_runs INTEGER DEFAULT 0;
    RAISE NOTICE 'Coluna failed_runs adicionada';
  END IF;

  -- Adicionar coluna last_run_at se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'last_run_at') THEN
    ALTER TABLE automations ADD COLUMN last_run_at TIMESTAMPTZ;
    RAISE NOTICE 'Coluna last_run_at adicionada';
  END IF;

  -- Adicionar coluna created_by se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'automations' AND column_name = 'created_by') THEN
    ALTER TABLE automations ADD COLUMN created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
    RAISE NOTICE 'Coluna created_by adicionada';
  END IF;
END $$;

-- ============================================
-- 2. CRIAR TABELA AUTOMATION_RUNS SE NÃO EXISTIR
-- ============================================

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error', 'waiting', 'cancelled')),
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Context
  trigger_data JSONB DEFAULT '{}',
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  
  -- Results
  node_results JSONB DEFAULT '{}',
  error_message TEXT,
  error_node_id TEXT,
  
  -- Resume data (for waiting status)
  resume_data JSONB,
  resume_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. CRIAR TABELA AUTOMATION_RUN_STEPS SE NÃO EXISTIR
-- ============================================

CREATE TABLE IF NOT EXISTS automation_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped', 'waiting')),
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Data
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  
  -- Branch info
  branch_taken TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. CRIAR TABELA CREDENTIALS SE NÃO EXISTIR
-- ============================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- whatsappCloud, whatsappEvolution, emailSendgrid, emailResend, etc
  
  -- Encrypted data
  encrypted_data TEXT NOT NULL,
  
  -- Validation
  is_valid BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_automations_org_status ON automations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON automations(trigger_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_run_steps_run ON automation_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_credentials_org ON credentials(organization_id);

-- ============================================
-- 6. RLS POLICIES
-- ============================================

-- Automations
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automations_select" ON automations;
CREATE POLICY "automations_select" ON automations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "automations_insert" ON automations;
CREATE POLICY "automations_insert" ON automations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "automations_update" ON automations;
CREATE POLICY "automations_update" ON automations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "automations_delete" ON automations;
CREATE POLICY "automations_delete" ON automations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Automation Runs
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_runs_select" ON automation_runs;
CREATE POLICY "automation_runs_select" ON automation_runs
  FOR SELECT USING (
    automation_id IN (
      SELECT id FROM automations WHERE organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Automation Run Steps
ALTER TABLE automation_run_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_run_steps_select" ON automation_run_steps;
CREATE POLICY "automation_run_steps_select" ON automation_run_steps
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM automation_runs WHERE automation_id IN (
        SELECT id FROM automations WHERE organization_id IN (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- Credentials
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credentials_select" ON credentials;
CREATE POLICY "credentials_select" ON credentials
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "credentials_insert" ON credentials;
CREATE POLICY "credentials_insert" ON credentials
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "credentials_update" ON credentials;
CREATE POLICY "credentials_update" ON credentials
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "credentials_delete" ON credentials;
CREATE POLICY "credentials_delete" ON credentials
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- 7. SERVICE ROLE POLICIES (para workers)
-- ============================================

-- Permitir service_role acessar tudo
DROP POLICY IF EXISTS "service_role_automations" ON automations;
CREATE POLICY "service_role_automations" ON automations
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "service_role_automation_runs" ON automation_runs;
CREATE POLICY "service_role_automation_runs" ON automation_runs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "service_role_automation_run_steps" ON automation_run_steps;
CREATE POLICY "service_role_automation_run_steps" ON automation_run_steps
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "service_role_credentials" ON credentials;
CREATE POLICY "service_role_credentials" ON credentials
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- 8. FUNÇÃO PARA ATUALIZAR STATS
-- ============================================

CREATE OR REPLACE FUNCTION update_automation_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('success', 'error') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE automations
    SET 
      total_runs = total_runs + 1,
      successful_runs = successful_runs + CASE WHEN NEW.status = 'success' THEN 1 ELSE 0 END,
      failed_runs = failed_runs + CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END,
      last_run_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.automation_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para atualizar stats
DROP TRIGGER IF EXISTS trigger_update_automation_stats ON automation_runs;
CREATE TRIGGER trigger_update_automation_stats
  AFTER UPDATE ON automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_stats();

-- ============================================
-- PRONTO!
-- ============================================

SELECT 'Migration Flow Builder V3 executada com sucesso!' AS resultado;
