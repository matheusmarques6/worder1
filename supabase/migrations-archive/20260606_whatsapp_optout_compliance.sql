-- Onda 10 — Fast Lane Compliance (opt-out + handler STOP)
--
-- Reforca whatsapp_opt_status com evidencia de consentimento (LGPD art. 8 par. 5)
-- e enum estrito de opt_in_source. Migration additive — defaults preservam
-- comportamento atual (row ausente continua significando "permite envio").

-- 1. Coluna de evidencia (timestamp + texto + message_id quando STOP veio)
ALTER TABLE whatsapp_opt_status
  ADD COLUMN IF NOT EXISTS consent_evidence jsonb DEFAULT '{}'::jsonb;

-- 2. Backfill defensivo — rows com source 'manual' ou NULL viram 'imported'
-- antes da CHECK constraint ser aplicada
UPDATE whatsapp_opt_status
  SET opt_in_source = 'imported'
  WHERE opt_in_source IS NULL OR opt_in_source = 'manual';

-- 3. CHECK constraint do enum
ALTER TABLE whatsapp_opt_status
  DROP CONSTRAINT IF EXISTS whatsapp_opt_status_source_chk;

ALTER TABLE whatsapp_opt_status
  ADD CONSTRAINT whatsapp_opt_status_source_chk
  CHECK (opt_in_source IN (
    'form_optin',
    'checkout',
    'whatsapp_button',
    'keyword',
    'organic',
    'imported'
  ));

-- 4. Index para hot-path do guard (lookup por org + phone + status)
CREATE INDEX IF NOT EXISTS idx_whatsapp_opt_status_lookup
  ON whatsapp_opt_status(organization_id, phone, status);
