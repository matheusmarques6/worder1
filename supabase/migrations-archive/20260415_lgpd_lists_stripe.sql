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
