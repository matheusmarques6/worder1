-- =============================================================================
-- Worder WhatsApp — Onda 0 Fase D: Hotfix InnovaBay (v2 — colunas mínimas)
-- =============================================================================
--
-- v2: remove store_id e app_id (não existem no schema do banco atual).
-- Só colunas obrigatórias da migration canônica 01-cloud-api-schema.sql.
--
-- INSTRUÇÕES:
--   1. Substitui <COLAR_ACCESS_TOKEN> em UMA linha abaixo
--   2. Cola TUDO no SQL Editor → Run
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASSO 1 — Backup
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _backup_innovabay_instance_20260529 AS
  SELECT * FROM whatsapp_instances
  WHERE phone_number_id = '1163643483491728';


-- -----------------------------------------------------------------------------
-- PASSO 2 — INSERT do InnovaBay em whatsapp_business_accounts
-- -----------------------------------------------------------------------------
-- ⚠️ SUBSTITUI <COLAR_ACCESS_TOKEN> pelo token real ANTES de rodar.

INSERT INTO whatsapp_business_accounts (
  organization_id,
  phone_number_id,
  waba_id,
  phone_number,
  display_phone_number,
  verified_name,
  access_token,
  webhook_verify_token,
  webhook_configured,
  quality_rating,
  status
) VALUES (
  '425db1ba-99c0-4dbb-9434-27fe9cc03ec6',
  '1163643483491728',
  '1596316152501451',
  '+55 38 9825-8018',
  '+55 38 9825-8018',
  'InnovaBay',
  '<COLAR_ACCESS_TOKEN>',
  'worder_zd6m8410yxwujq0v9fka',
  false,
  'GREEN',
  'active'
)
ON CONFLICT (phone_number_id) DO UPDATE SET
  organization_id      = EXCLUDED.organization_id,
  waba_id              = EXCLUDED.waba_id,
  access_token         = EXCLUDED.access_token,
  webhook_verify_token = EXCLUDED.webhook_verify_token,
  status               = 'active';


-- -----------------------------------------------------------------------------
-- PASSO 3 — Confirma que entrou
-- -----------------------------------------------------------------------------
SELECT id, organization_id, phone_number_id, waba_id, status,
       (access_token IS NOT NULL) AS has_token,
       webhook_configured, webhook_verify_token
FROM whatsapp_business_accounts
WHERE phone_number_id = '1163643483491728';
