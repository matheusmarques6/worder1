-- =============================================
-- Migration: Shopify Import Jobs
-- Data: 2026-01-11
-- 
-- Sistema de importação em background para
-- lidar com grandes volumes de clientes
-- =============================================

-- =============================================
-- TABELA: shopify_import_jobs
-- =============================================

CREATE TABLE IF NOT EXISTS shopify_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID NOT NULL,
  
  -- ========================================
  -- Configuração da Importação
  -- ========================================
  config JSONB DEFAULT '{}',
  -- Estrutura do config:
  -- {
  --   contactType: 'lead' | 'customer' | 'auto',
  --   createDeals: boolean,
  --   pipelineId: string | null,
  --   stageId: string | null,
  --   tags: string[],
  --   filterTags: string[] | null,
  --   filterEmailStatus: string[] | null
  -- }
  
  -- ========================================
  -- Status e Progresso
  -- ========================================
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
  
  -- Contagens
  total_customers INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  deals_created_count INTEGER DEFAULT 0,
  
  -- ========================================
  -- Paginação (cursor-based)
  -- ========================================
  -- Usado para continuar de onde parou
  last_cursor TEXT,              -- page_info cursor da Shopify
  current_page INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  
  -- ========================================
  -- Erros e Logs
  -- ========================================
  last_error TEXT,
  error_details JSONB DEFAULT '[]',
  processing_log JSONB DEFAULT '[]',
  -- Estrutura do log:
  -- [{ timestamp, message, page, processed, created, errors }]
  
  -- ========================================
  -- Timestamps
  -- ========================================
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_import_jobs_store ON shopify_import_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_org ON shopify_import_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON shopify_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_pending ON shopify_import_jobs(status, created_at) 
  WHERE status IN ('pending', 'running', 'paused');

-- =============================================
-- TRIGGER para updated_at
-- =============================================

DROP TRIGGER IF EXISTS update_shopify_import_jobs_updated_at ON shopify_import_jobs;
CREATE TRIGGER update_shopify_import_jobs_updated_at
  BEFORE UPDATE ON shopify_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE shopify_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_jobs_select" ON shopify_import_jobs;
CREATE POLICY "import_jobs_select" ON shopify_import_jobs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "import_jobs_insert" ON shopify_import_jobs;
CREATE POLICY "import_jobs_insert" ON shopify_import_jobs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "import_jobs_update" ON shopify_import_jobs;
CREATE POLICY "import_jobs_update" ON shopify_import_jobs
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "import_jobs_delete" ON shopify_import_jobs;
CREATE POLICY "import_jobs_delete" ON shopify_import_jobs
  FOR DELETE USING (true);

-- =============================================
-- COMENTÁRIOS
-- =============================================

COMMENT ON TABLE shopify_import_jobs IS 'Jobs de importação de clientes Shopify em background';
COMMENT ON COLUMN shopify_import_jobs.last_cursor IS 'Cursor para paginação - permite continuar de onde parou';
COMMENT ON COLUMN shopify_import_jobs.processing_log IS 'Log detalhado de cada lote processado';
