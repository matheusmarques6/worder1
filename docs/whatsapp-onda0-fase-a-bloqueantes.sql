-- =============================================================================
-- Worder WhatsApp — Onda 0 Fase A: queries BLOQUEANTES do hotfix InnovaBay
-- =============================================================================
--
-- Roda as 5 queries abaixo (uma por vez ou todas juntas — funciona) e me manda
-- o output. Com elas eu monto a Fase D adaptada ao schema real.
--
-- Tudo SELECT. Read-only. Não altera nada.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A.3 — Colunas REAIS de whatsapp_business_accounts
-- (esta é a tabela onde o InnovaBay PRECISA estar pra envio funcionar)
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name   = 'whatsapp_business_accounts'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.3c — Colunas REAIS de whatsapp_instances
-- (origem dos dados do InnovaBay; daqui vou copiar pra business_accounts)
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name   = 'whatsapp_instances'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.4.1 — InnovaBay em whatsapp_configs
-- -----------------------------------------------------------------------------
SELECT *
FROM whatsapp_configs
WHERE phone_number_id = '1163643483491728';


-- -----------------------------------------------------------------------------
-- A.4.2 — InnovaBay em whatsapp_instances
-- -----------------------------------------------------------------------------
SELECT *
FROM whatsapp_instances
WHERE phone_number_id = '1163643483491728';


-- -----------------------------------------------------------------------------
-- A.4.3 — InnovaBay em whatsapp_business_accounts (esperado: 0 linhas)
-- -----------------------------------------------------------------------------
SELECT *
FROM whatsapp_business_accounts
WHERE phone_number_id = '1163643483491728';
