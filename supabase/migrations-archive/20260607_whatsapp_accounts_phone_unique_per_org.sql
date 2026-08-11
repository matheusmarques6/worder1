-- =============================================
-- Onda 11 / B4 + N5
-- WhatsApp accounts: UNIQUE por (organization_id, phone_number_id) e UNIQUE global de waba_id.
--
-- Antes desta migration, idx_wba_phone_number_id era UNIQUE global em phone_number_id,
-- o que viola tenancy multi-WABA: duas orgs nao podiam compartilhar phone_number_id
-- (impossivel hoje pq cada WABA tem seu numero, mas a unicidade certa e per-org)
-- e o webhook-processor confiava nisso pra resolver conta — abrindo brecha de
-- vazamento cross-tenant em colisao futura.
--
-- A partir daqui o lookup do webhook usa (phone_number_id, waba_id) juntos, e o
-- DB garante:
--   - unicidade por (organization_id, phone_number_id) → cada org so registra
--     o mesmo phone_number_id 1x
--   - unicidade global de waba_id → o WABA da Meta e unico no mundo, entao
--     duas linhas com o mesmo waba_id sao bug em qualquer hipotese
-- =============================================

DROP INDEX IF EXISTS idx_wba_phone_number_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wba_org_phone_number_id
  ON whatsapp_business_accounts (organization_id, phone_number_id);

-- waba_id pode ser NULL em rows legadas; o UNIQUE so se aplica quando NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_wba_waba_id_unique
  ON whatsapp_business_accounts (waba_id)
  WHERE waba_id IS NOT NULL;
