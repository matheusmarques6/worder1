-- =============================================
-- WORDER: Event unification + performance indexes
-- 20260415_event_unification_and_indexes.sql
--
-- 1. Unifica pipelines: contact_events é a fonte de verdade.
--    customer_events vira view de compatibilidade apontando pra contact_events.
-- 2. Adiciona índices que estavam faltando em tabelas de analytics.
-- 3. RPC increment_campaign_clicks (contraparte do increment_campaign_opens).
-- =============================================

-- -----------------------------------------------------------------
-- 1. Garantir colunas obrigatórias em contact_events
-- -----------------------------------------------------------------
ALTER TABLE contact_events
  ADD COLUMN IF NOT EXISTS store_id          UUID,
  ADD COLUMN IF NOT EXISTS monetary_value    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS session_id        TEXT,
  ADD COLUMN IF NOT EXISTS anonymous_id      TEXT,
  ADD COLUMN IF NOT EXISTS visitor_id        TEXT,
  ADD COLUMN IF NOT EXISTS received_at       TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS page_url          TEXT,
  ADD COLUMN IF NOT EXISTS referrer_url      TEXT,
  ADD COLUMN IF NOT EXISTS device_type       TEXT,
  ADD COLUMN IF NOT EXISTS browser           TEXT,
  ADD COLUMN IF NOT EXISTS os                TEXT,
  ADD COLUMN IF NOT EXISTS ip_address        TEXT,
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS product_id        TEXT,
  ADD COLUMN IF NOT EXISTS product_name      TEXT,
  ADD COLUMN IF NOT EXISTS product_price     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS product_quantity  INT,
  ADD COLUMN IF NOT EXISTS product_category  TEXT,
  ADD COLUMN IF NOT EXISTS order_id          TEXT,
  ADD COLUMN IF NOT EXISTS order_total       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_resource_id   TEXT,
  ADD COLUMN IF NOT EXISTS shopify_resource_type TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key   TEXT,
  ADD COLUMN IF NOT EXISTS event_source      TEXT,
  ADD COLUMN IF NOT EXISTS properties        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at       TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS contact_events_idempotency_key_uniq
  ON contact_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------
-- 2. Migrar dados antigos de customer_events para contact_events
--    (apenas onde não existir um contact_events equivalente)
-- -----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_events'
  ) THEN
    -- Backfill best-effort, ignora duplicatas via ON CONFLICT
    INSERT INTO contact_events (
      organization_id, contact_id, store_id,
      event_type, event_source, properties,
      monetary_value, currency, session_id, anonymous_id,
      visitor_id, occurred_at, received_at,
      page_url, referrer_url, device_type, browser, os, ip_address,
      utm_source, utm_medium, utm_campaign,
      product_id, product_name, product_price, product_quantity, product_category,
      order_id, order_total, shopify_customer_id, idempotency_key
    )
    SELECT
      ce.organization_id, ce.contact_id, NULL::uuid as store_id,
      ce.event_type, COALESCE(ce.event_source, 'customer_events_migration'),
      COALESCE(ce.event_data, '{}'::jsonb),
      ce.order_total, 'BRL', ce.session_id, NULL,
      ce.visitor_id, COALESCE(ce.event_timestamp, NOW()), NOW(),
      ce.page_url, ce.referrer_url, ce.device_type, ce.browser, NULL, ce.ip_address,
      ce.utm_source, ce.utm_medium, ce.utm_campaign,
      ce.product_id, ce.product_name, ce.product_price, ce.product_quantity, ce.product_category,
      ce.order_id, ce.order_total, ce.shopify_customer_id,
      -- Idempotency key para não duplicar se rodar de novo
      concat('migrated:', ce.id::text)
    FROM customer_events ce
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Renomeia tabela antiga pra deixar claro que é legacy. View abaixo mantém leitura.
    EXECUTE 'ALTER TABLE customer_events RENAME TO customer_events_legacy';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'customer_events migration skipped: %', SQLERRM;
END $$;

-- -----------------------------------------------------------------
-- 3. View de compatibilidade `customer_events` apontando pra contact_events
--    Writers novos devem SEMPRE usar contact_events.
--    Leitores antigos que ainda referenciam customer_events continuam funcionando.
-- -----------------------------------------------------------------
DROP VIEW IF EXISTS customer_events CASCADE;
CREATE OR REPLACE VIEW customer_events AS
SELECT
  id,
  organization_id,
  contact_id,
  visitor_id,
  event_type,
  event_source,
  properties             AS event_data,
  product_id,
  product_name,
  product_price,
  product_quantity,
  product_category,
  order_id,
  order_total,
  session_id,
  page_url,
  referrer_url,
  utm_source,
  utm_medium,
  utm_campaign,
  device_type,
  browser,
  ip_address,
  occurred_at            AS event_timestamp,
  shopify_customer_id,
  occurred_at            AS created_at
FROM contact_events;

-- -----------------------------------------------------------------
-- 4. Índices de performance
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS contact_events_org_type_time_idx
  ON contact_events (organization_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS contact_events_org_contact_time_idx
  ON contact_events (organization_id, contact_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS contact_events_store_time_idx
  ON contact_events (store_id, occurred_at DESC)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_events_visitor_idx
  ON contact_events (visitor_id)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_events_session_idx
  ON contact_events (session_id)
  WHERE session_id IS NOT NULL;

-- Shopify orders
CREATE INDEX IF NOT EXISTS shopify_orders_store_customer_idx
  ON shopify_orders (store_id, customer_shopify_id);

CREATE INDEX IF NOT EXISTS shopify_orders_store_created_idx
  ON shopify_orders (store_id, shopify_created_at DESC);

CREATE INDEX IF NOT EXISTS shopify_orders_org_created_idx
  ON shopify_orders (organization_id, shopify_created_at DESC);

-- Shopify products
CREATE INDEX IF NOT EXISTS shopify_products_store_idx
  ON shopify_products (store_id);

-- Contacts
CREATE INDEX IF NOT EXISTS contacts_org_email_lower_idx
  ON contacts (organization_id, lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_org_phone_idx
  ON contacts (organization_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_org_shopify_cust_idx
  ON contacts (organization_id, shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL;

-- Email sends
CREATE INDEX IF NOT EXISTS email_sends_campaign_idx
  ON email_sends (campaign_id);

CREATE INDEX IF NOT EXISTS email_sends_contact_idx
  ON email_sends (contact_id);

CREATE INDEX IF NOT EXISTS email_sends_status_created_idx
  ON email_sends (status, created_at DESC);

-- Automation runs
CREATE INDEX IF NOT EXISTS automation_runs_status_created_idx
  ON automation_runs (status, created_at);

CREATE INDEX IF NOT EXISTS automation_runs_automation_status_idx
  ON automation_runs (automation_id, status);

-- -----------------------------------------------------------------
-- 5. RPCs increment_campaign_* (idempotent creates)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_campaign_opens(campaign_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE email_campaigns
     SET total_opens = COALESCE(total_opens, 0) + 1
   WHERE id = campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_clicks(campaign_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE email_campaigns
     SET total_clicks = COALESCE(total_clicks, 0) + 1
   WHERE id = campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_contact_events(contact_id_input UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE contacts
     SET total_events = COALESCE(total_events, 0) + 1
   WHERE id = contact_id_input;
END;
$$;

CREATE OR REPLACE FUNCTION increment_contact_revenue(p_contact_id UUID, p_amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE contacts
     SET total_revenue = COALESCE(total_revenue, 0) + p_amount,
         total_orders  = COALESCE(total_orders, 0) + 1,
         last_order_date = NOW()
   WHERE id = p_contact_id;
END;
$$;

-- -----------------------------------------------------------------
-- 6. automation_runs: limpar redundância metadata vs result
--    Garantimos coluna result e populamos a partir de metadata se vazia.
-- -----------------------------------------------------------------
ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS result JSONB DEFAULT '{}'::jsonb;

UPDATE automation_runs
   SET result = metadata
 WHERE result = '{}'::jsonb
   AND metadata IS NOT NULL
   AND metadata != '{}'::jsonb;

-- -----------------------------------------------------------------
-- 7. Segmentos: colunas member_count + last_count_at
-- -----------------------------------------------------------------
ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS member_count  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS segments_org_type_idx
  ON segments (organization_id, type);
