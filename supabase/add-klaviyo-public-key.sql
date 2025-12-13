-- Adicionar coluna public_key na tabela klaviyo_accounts
ALTER TABLE klaviyo_accounts 
ADD COLUMN IF NOT EXISTS public_key TEXT;

-- Comentário explicativo
COMMENT ON COLUMN klaviyo_accounts.public_key IS 'Klaviyo Public API Key / Site ID para tracking de eventos';

-- Verificar
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'klaviyo_accounts';
