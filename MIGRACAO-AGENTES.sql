-- =====================================================
-- MIGRAÇÃO: Adicionar store_id nas tabelas de agentes
-- =====================================================

-- 1. Adicionar coluna store_id na tabela agents (nova)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- 2. Adicionar coluna store_id na tabela whatsapp_agents (antiga)
ALTER TABLE whatsapp_agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_agents_store_id ON agents(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_store_id ON whatsapp_agents(store_id);

-- =====================================================
-- MIGRAR DADOS EXISTENTES PARA OAK VINTAGE
-- =====================================================
-- Substitua pelo ID da sua loja Oak Vintage

-- Para tabela agents
UPDATE agents 
SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' 
WHERE store_id IS NULL;

-- Para tabela whatsapp_agents
UPDATE whatsapp_agents 
SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' 
WHERE store_id IS NULL;

-- =====================================================
-- VERIFICAR
-- =====================================================
-- SELECT * FROM agents WHERE store_id IS NULL;
-- SELECT * FROM whatsapp_agents WHERE store_id IS NULL;
