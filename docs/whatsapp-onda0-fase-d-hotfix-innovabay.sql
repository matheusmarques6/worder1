-- =============================================================================
-- Worder WhatsApp — Onda 0 Fase D: Hotfix InnovaBay (SQL puro)
-- =============================================================================
--
-- INSTRUÇÕES:
--   1. Substitui <COLAR_ACCESS_TOKEN> em UMA linha abaixo pelo token que
--      apareceu em A.4.2 (começa com EAATKIRO...)
--   2. Cola TUDO no SQL Editor do Supabase
--   3. Clica Run
--
-- Tudo SELECT/INSERT — sem DROP, sem DELETE. Backup antes da escrita.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASSO 1 — Backup defensivo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _backup_innovabay_instance_20260529 AS
  SELECT * FROM whatsapp_instances
  WHERE phone_number_id = '1163643483491728';

SELECT count(*) AS backup_linhas FROM _backup_innovabay_instance_20260529;
-- esperado: 1


-- -----------------------------------------------------------------------------
-- PASSO 2 — INSERT do InnovaBay em whatsapp_business_accounts
-- -----------------------------------------------------------------------------
-- ⚠️ SUBSTITUI <COLAR_ACCESS_TOKEN> pelo token real ANTES de rodar.

INSERT INTO whatsapp_business_accounts (
  organization_id,
  store_id,
  phone_number_id,
  waba_id,
  app_id,
  phone_number,
  display_phone_number,
  verified_name,
  access_token,
  webhook_verify_token,
  webhook_configured,
  quality_rating,
  status,
  created_at,
  updated_at
) VALUES (
  '425db1ba-99c0-4dbb-9434-27fe9cc03ec6',
  'd5dfd5dd-1d77-425e-a099-850338078999',
  '1163643483491728',
  '1596316152501451',
  '1348143317160374',
  '+55 38 9825-8018',
  '+55 38 9825-8018',
  'InnovaBay',
  '<COLAR_ACCESS_TOKEN>',
  'worder_zd6m8410yxwujq0v9fka',
  false,
  'GREEN',
  'active',
  now(),
  now()
)
ON CONFLICT (phone_number_id) DO UPDATE SET
  organization_id      = EXCLUDED.organization_id,
  store_id             = EXCLUDED.store_id,
  waba_id              = EXCLUDED.waba_id,
  app_id               = EXCLUDED.app_id,
  access_token         = EXCLUDED.access_token,
  webhook_verify_token = EXCLUDED.webhook_verify_token,
  status               = 'active',
  updated_at           = now();


-- -----------------------------------------------------------------------------
-- PASSO 3 — Confirma que o InnovaBay entrou em business_accounts
-- -----------------------------------------------------------------------------
SELECT id, organization_id, store_id, phone_number_id, waba_id, status,
       (access_token IS NOT NULL) AS has_token,
       webhook_configured, webhook_verify_token
FROM whatsapp_business_accounts
WHERE phone_number_id = '1163643483491728';
-- esperado: 1 linha com status=active, has_token=true, waba_id=1596316152501451
