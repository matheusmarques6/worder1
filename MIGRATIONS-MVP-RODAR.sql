-- ==================================================================
-- WORDER MVP — CONSOLIDATED MIGRATIONS
-- Rode tudo de uma vez no SQL Editor do Supabase
-- Ordem IMPORTA. Todos os blocos usam IF NOT EXISTS — seguro re-rodar.
-- ==================================================================

-- ==================================================================
-- FILE: 20260415_event_unification_and_indexes.sql
-- ==================================================================
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
ALTER TABLE customer_segments
  ADD COLUMN IF NOT EXISTS member_count  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_count_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS customer_segments_org_segment_type_idx
  ON customer_segments (organization_id, segment_type);

-- ==================================================================
-- FILE: 20260415_automation_workers_lock.sql
-- ==================================================================
-- =============================================
-- WORDER: Worker lock / optimistic concurrency for automation_runs
-- 20260415_automation_workers_lock.sql
-- =============================================

ALTER TABLE automation_runs
  ADD COLUMN IF NOT EXISTS lock_token   UUID,
  ADD COLUMN IF NOT EXISTS locked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by    TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_node_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error   TEXT;

-- Índice para busca de runs expirados (heartbeat stale)
CREATE INDEX IF NOT EXISTS automation_runs_locked_idx
  ON automation_runs (locked_at)
  WHERE lock_token IS NOT NULL;

-- Mesma lógica para automation_pending_steps (delays)
ALTER TABLE automation_pending_steps
  ADD COLUMN IF NOT EXISTS lock_token UUID,
  ADD COLUMN IF NOT EXISTS locked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by  TEXT;

CREATE INDEX IF NOT EXISTS automation_pending_steps_locked_idx
  ON automation_pending_steps (locked_at)
  WHERE lock_token IS NOT NULL;

-- Função para adquirir lock de run (atomic):
-- 1. Só pega se status é 'pending' OU (lock expirado há > 5min)
-- 2. Seta lock_token, locked_at, locked_by, status='running'
CREATE OR REPLACE FUNCTION claim_automation_run(
  p_run_id UUID,
  p_worker_id TEXT,
  p_new_token UUID,
  p_stale_lock_minutes INT DEFAULT 5
) RETURNS TABLE (
  id UUID,
  automation_id UUID,
  contact_id UUID,
  deal_id UUID,
  metadata JSONB,
  status TEXT,
  lock_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE automation_runs r
     SET status = 'running',
         lock_token = p_new_token,
         locked_at = NOW(),
         locked_by = p_worker_id,
         last_heartbeat_at = NOW(),
         started_at = COALESCE(r.started_at, NOW())
   WHERE r.id = p_run_id
     AND (
       r.status IN ('pending', 'waiting')
       OR (r.lock_token IS NOT NULL
           AND r.locked_at < NOW() - (p_stale_lock_minutes || ' minutes')::INTERVAL)
     )
  RETURNING r.id, r.automation_id, r.contact_id, r.deal_id, r.metadata, r.status, r.lock_token;
END;
$$;

-- Heartbeat: renova locked_at para evitar que outro worker pense que está stale
CREATE OR REPLACE FUNCTION heartbeat_automation_run(
  p_run_id UUID,
  p_token UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ok BOOLEAN := false;
BEGIN
  UPDATE automation_runs
     SET last_heartbeat_at = NOW()
   WHERE id = p_run_id AND lock_token = p_token
   RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

-- Release lock ao concluir/pausar
CREATE OR REPLACE FUNCTION release_automation_run(
  p_run_id UUID,
  p_token UUID,
  p_new_status TEXT,
  p_error TEXT DEFAULT NULL,
  p_result JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ok BOOLEAN := false;
BEGIN
  UPDATE automation_runs
     SET status = p_new_status,
         lock_token = NULL,
         locked_at = NULL,
         locked_by = NULL,
         completed_at = CASE WHEN p_new_status IN ('completed', 'failed', 'cancelled')
                             THEN NOW() ELSE completed_at END,
         last_error = COALESCE(p_error, last_error),
         result = COALESCE(p_result, result)
   WHERE id = p_run_id AND lock_token = p_token
   RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

-- Cron cleanup: solta runs cujo heartbeat está stale (worker crashou)
CREATE OR REPLACE FUNCTION reclaim_stale_automation_runs(
  p_minutes INT DEFAULT 10
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_reclaimed INT;
BEGIN
  UPDATE automation_runs
     SET status = 'pending',
         lock_token = NULL,
         locked_at = NULL,
         locked_by = NULL,
         last_error = CONCAT('reclaimed: heartbeat stale >', p_minutes, 'min')
   WHERE lock_token IS NOT NULL
     AND last_heartbeat_at < NOW() - (p_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS count_reclaimed = ROW_COUNT;
  RETURN count_reclaimed;
END;
$$;

-- ==================================================================
-- FILE: 20260415_product_interests_payment_links.sql
-- ==================================================================
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

-- ==================================================================
-- FILE: 20260415_segment_snapshots.sql
-- ==================================================================
-- =============================================
-- WORDER: Segment membership snapshots
-- 20260415_segment_snapshots.sql
-- Usado por /api/cron/detect-segment-changes
-- =============================================

CREATE TABLE IF NOT EXISTS segment_memberships_snapshot (
  segment_id       UUID PRIMARY KEY,
  organization_id  UUID NOT NULL,
  contact_ids      UUID[] NOT NULL DEFAULT '{}',
  snapshotted_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS segment_snapshot_org_idx
  ON segment_memberships_snapshot (organization_id);

ALTER TABLE segment_memberships_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON segment_memberships_snapshot;
CREATE POLICY "Service role full access" ON segment_memberships_snapshot
  FOR ALL USING (true);

-- ==================================================================
-- FILE: 20260415_email_features.sql
-- ==================================================================
-- =============================================
-- WORDER: Email features — A/B test, scheduled, versioning
-- 20260415_email_features.sql
-- =============================================

-- 1. A/B testing em email_campaigns
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS ab_test_enabled  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ab_test_percent  INT DEFAULT 50 CHECK (ab_test_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS ab_variant_b     JSONB, -- { subject, preheader, template_id, design_json }
  ADD COLUMN IF NOT EXISTS ab_winner_metric TEXT DEFAULT 'open_rate' CHECK (ab_winner_metric IN ('open_rate','click_rate','conversion_rate')),
  ADD COLUMN IF NOT EXISTS ab_duration_hours INT DEFAULT 4,
  ADD COLUMN IF NOT EXISTS ab_winner        TEXT CHECK (ab_winner IN ('a','b') OR ab_winner IS NULL),
  ADD COLUMN IF NOT EXISTS ab_resolved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_opens      INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_clicks     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_delivered  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_bounced    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_complained INT DEFAULT 0;

-- Index for scheduled campaigns cron
CREATE INDEX IF NOT EXISTS email_campaigns_scheduled_idx
  ON email_campaigns (status, scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'scheduled';

-- Email sends: registrar qual variant foi enviada
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS ab_variant TEXT CHECK (ab_variant IN ('a','b') OR ab_variant IS NULL);

-- 2. Saved blocks versioning
CREATE TABLE IF NOT EXISTS saved_block_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id         UUID NOT NULL,
  organization_id  UUID NOT NULL,
  version          INT NOT NULL,
  block_json       JSONB NOT NULL,
  created_by       UUID,
  comment          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_block_versions_unique
  ON saved_block_versions (block_id, version);

CREATE INDEX IF NOT EXISTS saved_block_versions_org_idx
  ON saved_block_versions (organization_id, block_id, created_at DESC);

ALTER TABLE saved_block_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_block_versions select" ON saved_block_versions;
CREATE POLICY "saved_block_versions select" ON saved_block_versions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "saved_block_versions insert" ON saved_block_versions;
CREATE POLICY "saved_block_versions insert" ON saved_block_versions
  FOR INSERT WITH CHECK (true);

-- Trigger para incrementar versão no saved_blocks
CREATE OR REPLACE FUNCTION bump_saved_block_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_version INT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.block_json IS DISTINCT FROM NEW.block_json THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
      FROM saved_block_versions
     WHERE block_id = NEW.id;
    INSERT INTO saved_block_versions (block_id, organization_id, version, block_json, comment)
    VALUES (NEW.id, NEW.organization_id, next_version, OLD.block_json, 'auto-snapshot before update');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_saved_block_version ON saved_blocks;
CREATE TRIGGER trg_bump_saved_block_version
  BEFORE UPDATE ON saved_blocks
  FOR EACH ROW
  EXECUTE FUNCTION bump_saved_block_version();

-- 3. Segmentação avançada: suporte a grupos com AND/OR
-- Estrutura esperada em segments.conditions:
-- {
--   "operator": "and" | "or",
--   "rules": [
--     { "field": "email", "operator": "equals", "value": "foo" },
--     {
--       "operator": "or",
--       "rules": [...]
--     }
--   ]
-- }
-- Nada a alterar no schema além de garantir JSONB. Já é JSONB.

-- 4. RPC para resolver conditions hierárquicas (alternativa server-side)
-- Não implementamos aqui — resolvido no TS em src/lib/segments/resolver.ts

-- ==================================================================
-- FILE: 20260415_lgpd_lists_stripe.sql
-- ==================================================================
-- =============================================
-- WORDER: LGPD compliance + lists + Stripe scaffolding
-- 20260415_lgpd_lists_stripe.sql
-- =============================================

-- LGPD: consentimentos explícitos
CREATE TABLE IF NOT EXISTS lgpd_consents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID,
  visitor_id       TEXT,
  consent_type     TEXT NOT NULL CHECK (consent_type IN (
    'marketing','analytics','tracking','profiling','data_sharing','cookies'
  )),
  granted          BOOLEAN NOT NULL,
  source           TEXT,                 -- 'banner', 'form', 'api', 'admin'
  ip_address       TEXT,
  user_agent       TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  granted_at       TIMESTAMPTZ DEFAULT NOW(),
  revoked_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS lgpd_consents_org_contact_idx
  ON lgpd_consents (organization_id, contact_id, consent_type, granted_at DESC);

CREATE INDEX IF NOT EXISTS lgpd_consents_visitor_idx
  ON lgpd_consents (visitor_id)
  WHERE visitor_id IS NOT NULL;

ALTER TABLE lgpd_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_consents org access" ON lgpd_consents;
CREATE POLICY "lgpd_consents org access" ON lgpd_consents
  FOR ALL USING (true);

-- LGPD: pedidos de dados (exclusão, exportação, retificação)
CREATE TABLE IF NOT EXISTS lgpd_data_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID,
  requester_email  TEXT NOT NULL,
  request_type     TEXT NOT NULL CHECK (request_type IN (
    'export','delete','rectification','portability','object','restrict'
  )),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','processing','completed','rejected','cancelled'
  )),
  reason           TEXT,
  payload          JSONB DEFAULT '{}'::jsonb,
  response         JSONB,
  token            TEXT UNIQUE,   -- para verificação via link de email
  verified_at      TIMESTAMPTZ,
  processed_at     TIMESTAMPTZ,
  processed_by     UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lgpd_data_requests_org_status_idx
  ON lgpd_data_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS lgpd_data_requests_email_idx
  ON lgpd_data_requests (requester_email);

ALTER TABLE lgpd_data_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_data_requests org access" ON lgpd_data_requests;
CREATE POLICY "lgpd_data_requests org access" ON lgpd_data_requests
  FOR ALL USING (true);

-- LGPD: policy de retenção por tabela
CREATE TABLE IF NOT EXISTS lgpd_retention_policies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  resource         TEXT NOT NULL,        -- 'contacts', 'contact_events', 'email_sends', etc.
  retention_days   INT NOT NULL,         -- após esse tempo, dado deve ser deletado/anonimizado
  anonymize_only   BOOLEAN DEFAULT FALSE,
  enabled          BOOLEAN DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, resource)
);

ALTER TABLE lgpd_retention_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lgpd_retention org access" ON lgpd_retention_policies;
CREATE POLICY "lgpd_retention org access" ON lgpd_retention_policies
  FOR ALL USING (true);

-- =============================================
-- LISTS: completar CRUD com membros
-- =============================================

-- Garantir tabela `lists` existe
CREATE TABLE IF NOT EXISTS lists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  color            TEXT DEFAULT '#F97316',
  member_count     INT DEFAULT 0,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lists_org_idx ON lists (organization_id);

-- list_contacts (membership)
CREATE TABLE IF NOT EXISTS list_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  list_id          UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL,
  added_at         TIMESTAMPTZ DEFAULT NOW(),
  added_by         UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS list_contacts_unique
  ON list_contacts (list_id, contact_id);
CREATE INDEX IF NOT EXISTS list_contacts_contact_idx
  ON list_contacts (contact_id);
CREATE INDEX IF NOT EXISTS list_contacts_list_idx
  ON list_contacts (list_id);

-- Função para incrementar/decrementar member_count
CREATE OR REPLACE FUNCTION update_list_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lists SET member_count = COALESCE(member_count, 0) + 1,
                     updated_at = NOW()
     WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lists SET member_count = GREATEST(0, COALESCE(member_count, 0) - 1),
                     updated_at = NOW()
     WHERE id = OLD.list_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_list_count ON list_contacts;
CREATE TRIGGER trg_list_count
  AFTER INSERT OR DELETE ON list_contacts
  FOR EACH ROW EXECUTE FUNCTION update_list_member_count();

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lists org access" ON lists;
CREATE POLICY "lists org access" ON lists FOR ALL USING (true);
DROP POLICY IF EXISTS "list_contacts org access" ON list_contacts;
CREATE POLICY "list_contacts org access" ON list_contacts FOR ALL USING (true);

-- =============================================
-- STRIPE scaffolding (item 56)
-- =============================================
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id  TEXT,
  plan             TEXT NOT NULL DEFAULT 'free' CHECK (plan IN (
    'free','starter','pro','business','enterprise'
  )),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'trialing','active','past_due','canceled','incomplete','unpaid'
  )),
  trial_ends_at    TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_org_idx
  ON billing_subscriptions (organization_id);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  stripe_invoice_id TEXT UNIQUE,
  amount_cents     INT,
  currency         TEXT DEFAULT 'brl',
  status           TEXT,
  hosted_invoice_url TEXT,
  pdf_url          TEXT,
  paid_at          TIMESTAMPTZ,
  due_at           TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_invoices_org_idx
  ON billing_invoices (organization_id, created_at DESC);

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing subs org access" ON billing_subscriptions;
CREATE POLICY "billing subs org access" ON billing_subscriptions FOR ALL USING (true);
DROP POLICY IF EXISTS "billing inv org access" ON billing_invoices;
CREATE POLICY "billing inv org access" ON billing_invoices FOR ALL USING (true);

-- ==================================================================
-- FILE: 20260416_ai_costs_attribution.sql
-- ==================================================================
-- =============================================
-- WORDER: AI usage cost tracking + attribution helpers
-- 20260416_ai_costs_attribution.sql
-- =============================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  provider         TEXT NOT NULL,        -- 'openai', 'anthropic', 'google'
  model            TEXT NOT NULL,
  feature          TEXT NOT NULL,        -- 'whatsapp_agent', 'email_generation', 'segment_suggest', etc.
  agent_id         UUID,                 -- AI agent (se aplicável)
  conversation_id  UUID,                 -- WhatsApp conversation (se aplicável)
  prompt_tokens    INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens     INT GENERATED ALWAYS AS (COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) STORED,
  cost_usd         NUMERIC(10,6) DEFAULT 0,
  duration_ms      INT,
  success          BOOLEAN DEFAULT TRUE,
  error            TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_created_idx
  ON ai_usage_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_feature_idx
  ON ai_usage_logs (organization_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_model_idx
  ON ai_usage_logs (organization_id, provider, model);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_usage_logs org access" ON ai_usage_logs;
CREATE POLICY "ai_usage_logs org access" ON ai_usage_logs FOR ALL USING (true);

-- =============================================
-- Atribuição de conversão ads → orders (item 55)
-- Link entre um evento de compra e o click/visit inicial com utm_* / click_ids
-- =============================================

CREATE TABLE IF NOT EXISTS attribution_touchpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  contact_id       UUID,
  visitor_id       TEXT,
  session_id       TEXT,
  touchpoint_type  TEXT NOT NULL CHECK (touchpoint_type IN ('first', 'last', 'assist')),
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_term         TEXT,
  utm_content      TEXT,
  gclid            TEXT,
  fbclid           TEXT,
  ttclid           TEXT,
  occurred_at      TIMESTAMPTZ DEFAULT NOW(),
  order_id         TEXT,            -- preenchido quando converte
  revenue          NUMERIC(12,2),
  currency         TEXT DEFAULT 'BRL'
);

CREATE INDEX IF NOT EXISTS attribution_touchpoints_contact_idx
  ON attribution_touchpoints (contact_id, touchpoint_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS attribution_touchpoints_visitor_idx
  ON attribution_touchpoints (visitor_id, touchpoint_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS attribution_touchpoints_org_utm_idx
  ON attribution_touchpoints (organization_id, utm_source, utm_campaign, occurred_at DESC);

ALTER TABLE attribution_touchpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attribution org access" ON attribution_touchpoints;
CREATE POLICY "attribution org access" ON attribution_touchpoints FOR ALL USING (true);
