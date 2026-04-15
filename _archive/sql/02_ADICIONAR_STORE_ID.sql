-- =============================================
-- PASSO 2: ADICIONAR STORE_ID PARA MULTI-LOJA
-- Execute DEPOIS de migrar os dados
-- =============================================

-- 2.1 Adicionar coluna store_id na tabela contacts
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

-- 2.2 Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_contacts_store_id ON contacts(store_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_store ON contacts(organization_id, store_id);

-- 2.3 Adicionar store_id em deals (opcional, para vincular deals a lojas)
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_store_id ON deals(store_id);

-- 2.4 Verificar estrutura
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contacts' AND column_name = 'store_id';
