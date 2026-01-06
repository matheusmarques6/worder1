-- =====================================================
-- MIGRAÇÃO: Adicionar store_id nas tabelas de integrações
-- Execute cada bloco separadamente no SQL Editor do Supabase
-- =====================================================

-- 1. KLAVIYO ACCOUNTS
ALTER TABLE klaviyo_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_accounts_store_id ON klaviyo_accounts(store_id);

-- 2. META AD ACCOUNTS (Facebook)
ALTER TABLE meta_ad_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_store_id ON meta_ad_accounts(store_id);

-- 3. GOOGLE AD ACCOUNTS
ALTER TABLE google_ad_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_google_ad_accounts_store_id ON google_ad_accounts(store_id);

-- 4. TIKTOK AD ACCOUNTS
ALTER TABLE tiktok_ad_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_store_id ON tiktok_ad_accounts(store_id);

-- 5. WHATSAPP CONFIGS
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_store_id ON whatsapp_configs(store_id);

-- 6. WHATSAPP ACCOUNTS (tabela alternativa)
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_store_id ON whatsapp_accounts(store_id);

-- 7. AGENTS (se ainda não fez)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_agents_store_id ON agents(store_id);

-- 8. WHATSAPP AGENTS (se ainda não fez)
ALTER TABLE whatsapp_agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_store_id ON whatsapp_agents(store_id);


-- =====================================================
-- MIGRAR DADOS EXISTENTES PARA OAK VINTAGE
-- Substitua pelo ID da sua loja Oak Vintage
-- =====================================================

UPDATE klaviyo_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE meta_ad_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE google_ad_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE tiktok_ad_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_configs SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
