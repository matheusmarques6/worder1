-- =============================================
-- Onda 11 / C5
-- Surface token-invalid errors (Meta codes 190 / 102 / 200).
--
-- Antes: quando a Meta retornava token expirado, o route POST
-- /api/whatsapp/cloud/messages marcava status='auth_error' e morria —
-- nenhuma rastreabilidade, nenhum alerta automatico. Re-auth virava
-- "descobrir quebrado em producao".
--
-- Estas tres colunas dao um sinal duradouro:
--   - token_invalid_at      → quando observamos a falha
--   - token_invalid_code    → codigo da Meta (190 / 102 / 200)
--   - token_invalid_message → texto cru pro suporte ler
--
-- O route usa para disparar sendAlert (severity=critical) +
-- wlog.error('whatsapp.token.expired'). A UI pode ler as colunas para
-- mostrar badge de "reconectar conta" no inbox/integrations.
-- =============================================

DO $$ BEGIN
  ALTER TABLE whatsapp_business_accounts
    ADD COLUMN IF NOT EXISTS token_invalid_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_business_accounts
    ADD COLUMN IF NOT EXISTS token_invalid_code INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_business_accounts
    ADD COLUMN IF NOT EXISTS token_invalid_message TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
