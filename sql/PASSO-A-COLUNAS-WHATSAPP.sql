-- =============================================
-- ADICIONAR COLUNAS DE HEALTH CHECK
-- na tabela whatsapp_configs
-- =============================================

ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'pending';
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS status_message TEXT;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ;

-- Verificar
SELECT 'Colunas adicionadas!' as resultado;

SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'whatsapp_configs' 
AND column_name IN ('connection_status', 'status_message', 'health_checked_at', 'consecutive_failures');
