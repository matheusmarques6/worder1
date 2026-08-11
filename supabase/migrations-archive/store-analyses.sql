-- =====================================================
-- MIGRAÇÃO: STORE ANALYSES
-- Tabela para armazenar análises de lojas Shopify
-- =====================================================

-- Criar tabela
CREATE TABLE IF NOT EXISTS store_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shopify_store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Garantir uma análise por loja
  CONSTRAINT store_analyses_shopify_store_id_key UNIQUE (shopify_store_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_store_analyses_org ON store_analyses(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_analyses_store ON store_analyses(shopify_store_id);
CREATE INDEX IF NOT EXISTS idx_store_analyses_created ON store_analyses(created_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_store_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_store_analyses_updated_at ON store_analyses;
CREATE TRIGGER trigger_update_store_analyses_updated_at
  BEFORE UPDATE ON store_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_store_analyses_updated_at();

-- RLS Policies
ALTER TABLE store_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver análises da própria organização
DROP POLICY IF EXISTS "Users can view own org analyses" ON store_analyses;
CREATE POLICY "Users can view own org analyses" ON store_analyses
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Usuários podem gerenciar análises da própria organização
DROP POLICY IF EXISTS "Users can manage own org analyses" ON store_analyses;
CREATE POLICY "Users can manage own org analyses" ON store_analyses
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Comentários
COMMENT ON TABLE store_analyses IS 'Armazena análises de lojas Shopify geradas por IA';
COMMENT ON COLUMN store_analyses.analysis_data IS 'Dados completos da análise em formato JSON';
