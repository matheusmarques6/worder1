-- ============================================
-- WORDER - ADD API SECRET COLUMN
-- ============================================
-- Execute este script no Supabase SQL Editor
-- Adiciona a coluna api_secret na tabela shopify_stores

-- Adicionar coluna api_secret
ALTER TABLE shopify_stores 
ADD COLUMN IF NOT EXISTS api_secret TEXT;

-- Comentário na coluna
COMMENT ON COLUMN shopify_stores.api_secret IS 'API Secret Key para validação de webhooks';

-- Atualizar schema para futuros deploys
-- (Esta coluna é opcional, usada para receber webhooks em tempo real)
