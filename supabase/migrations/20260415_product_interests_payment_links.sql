-- =============================================
-- WORDER: WhatsApp product interests + payment links
-- 20260415_product_interests_payment_links.sql
--
-- Tabelas de apoio para:
-- - action_back_in_stock_notify (registro de interesse em produto)
-- - action_whatsapp_payment (link de pagamento gerado)
-- - check-back-in-stock cron (notificação quando produto volta ao estoque)
-- =============================================

-- Product interests — contato pediu aviso de volta ao estoque
CREATE TABLE IF NOT EXISTS whatsapp_product_interests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL,
  contact_id        UUID,
  phone             TEXT,
  product_id        TEXT NOT NULL,
  variant_id        TEXT,
  product_title     TEXT,
  notified          BOOLEAN DEFAULT FALSE,
  notified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_product_interests_org_notified_idx
  ON whatsapp_product_interests (organization_id, notified);

CREATE INDEX IF NOT EXISTS whatsapp_product_interests_product_idx
  ON whatsapp_product_interests (product_id, notified);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_product_interests_unique
  ON whatsapp_product_interests (organization_id, contact_id, product_id, COALESCE(variant_id, ''))
  WHERE contact_id IS NOT NULL;

ALTER TABLE whatsapp_product_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON whatsapp_product_interests;
CREATE POLICY "Service role full access" ON whatsapp_product_interests
  FOR ALL USING (true);

-- Payment links gerados via action_whatsapp_payment
CREATE TABLE IF NOT EXISTS whatsapp_payment_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL,
  conversation_id   UUID,
  contact_id        UUID,
  amount            NUMERIC(12,2) NOT NULL,
  currency          TEXT DEFAULT 'BRL',
  description       TEXT,
  payment_url       TEXT NOT NULL,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  external_id       TEXT,
  metadata          JSONB DEFAULT '{}'::jsonb,
  expires_at        TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_payment_links_org_status_idx
  ON whatsapp_payment_links (organization_id, status);

CREATE INDEX IF NOT EXISTS whatsapp_payment_links_contact_idx
  ON whatsapp_payment_links (contact_id);

ALTER TABLE whatsapp_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON whatsapp_payment_links;
CREATE POLICY "Service role full access" ON whatsapp_payment_links
  FOR ALL USING (true);
