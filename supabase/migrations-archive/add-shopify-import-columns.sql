-- =============================================
-- Migration: Add Import Columns to Shopify Stores
-- supabase/migrations/add-shopify-import-columns.sql
-- =============================================

-- Adicionar colunas de configuração do CRM
ALTER TABLE shopify_stores 
ADD COLUMN IF NOT EXISTS is_configured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS default_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS sync_orders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_customers BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_checkouts BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_refunds BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_tags TEXT[] DEFAULT ARRAY['shopify'],
ADD COLUMN IF NOT EXISTS stage_mapping JSONB DEFAULT '{}';

-- Adicionar colunas de importação
ALTER TABLE shopify_stores 
ADD COLUMN IF NOT EXISTS total_customers_imported INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_orders_imported INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMPTZ;

-- Adicionar coluna de métricas (JSONB para flexibilidade)
ALTER TABLE shopify_stores 
ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}';

-- Adicionar colunas de health check
ALTER TABLE shopify_stores 
ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status_message TEXT;

-- Comentários nas colunas
COMMENT ON COLUMN shopify_stores.is_configured IS 'Se a loja foi configurada pelo usuário';
COMMENT ON COLUMN shopify_stores.connection_status IS 'Status da conexão: active, warning, error, expired, reconnect_required';
COMMENT ON COLUMN shopify_stores.default_pipeline_id IS 'Pipeline padrão para criar deals';
COMMENT ON COLUMN shopify_stores.default_stage_id IS 'Estágio padrão para novos deals';
COMMENT ON COLUMN shopify_stores.contact_type IS 'Tipo de contato: lead, customer, auto';
COMMENT ON COLUMN shopify_stores.sync_orders IS 'Sincronizar pedidos do Shopify';
COMMENT ON COLUMN shopify_stores.sync_customers IS 'Sincronizar clientes do Shopify';
COMMENT ON COLUMN shopify_stores.sync_checkouts IS 'Sincronizar checkouts abandonados';
COMMENT ON COLUMN shopify_stores.sync_refunds IS 'Sincronizar reembolsos';
COMMENT ON COLUMN shopify_stores.auto_tags IS 'Tags aplicadas automaticamente aos contatos';
COMMENT ON COLUMN shopify_stores.stage_mapping IS 'Mapeamento de status do pedido para estágios';
COMMENT ON COLUMN shopify_stores.total_customers_imported IS 'Total de clientes importados';
COMMENT ON COLUMN shopify_stores.total_orders_imported IS 'Total de pedidos importados';
COMMENT ON COLUMN shopify_stores.last_import_at IS 'Data da última importação';

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_shopify_stores_org_active 
ON shopify_stores(organization_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_shopify_stores_connection_status 
ON shopify_stores(connection_status);
