-- ============================================================
-- WORDER — Solution Partner Billing Schema (Fase 7)
--
-- Prepara o schema de billing para o modelo Solution Partner:
--   1. ALTER organizations — colunas de billing model
--   2. CREATE TABLE billing_invoices — faturas mensais
--   3. CREATE TABLE billing_line_items — itens por categoria
--   4. CREATE TABLE billing_credits — controle de créditos Meta
--   5. Functions para geração mensal de faturas
--   6. RLS policies
--
-- Idempotent: uses IF NOT EXISTS / DO $$ blocks throughout.
-- ============================================================


-- ============================================================
-- 1. ALTER organizations — Billing model columns
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'flat'
    CHECK (billing_model IN ('flat', 'markup', 'hybrid', 'custom'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS message_markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credit_limit_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credit_used_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_currency TEXT NOT NULL DEFAULT 'BRL'
    CHECK (billing_currency IN ('BRL', 'USD', 'MXN', 'COP'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_email TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- Constraint: credit_used cannot exceed limit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_credit_within_limit'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT chk_credit_within_limit
      CHECK (credit_used_usd <= credit_limit_usd + 100);  -- USD 100 buffer para race conditions
  END IF;
END $$;


-- ============================================================
-- 2. billing_invoices — Faturas mensais por organização
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Período
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  invoice_number  TEXT UNIQUE,

  -- Valores
  subtotal_usd    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tax_usd         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_usd       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_applied  NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount_due_usd  NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  -- Conversão para moeda local
  exchange_rate   NUMERIC(10,4),
  total_local     NUMERIC(12,2),
  currency        TEXT NOT NULL DEFAULT 'BRL',

  -- Status
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),

  -- Pagamento
  paid_at         TIMESTAMPTZ,
  payment_method  TEXT,
  payment_ref     TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date        DATE,

  -- Metadata
  notes           TEXT,
  metadata        JSONB DEFAULT '{}'::JSONB
);

-- Ensure critical columns exist if table was from a partial prior run
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS period_start DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS period_end DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS subtotal_usd NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS amount_due_usd NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS total_local NUMERIC(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org
  ON billing_invoices(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_period
  ON billing_invoices(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
  ON billing_invoices(status);

-- Updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_billing_invoices_updated_at'
  ) THEN
    CREATE TRIGGER trg_billing_invoices_updated_at
      BEFORE UPDATE ON billing_invoices
      FOR EACH ROW
      EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;


-- ============================================================
-- 3. billing_line_items — Itens de cobrança por categoria
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Categoria de mensagem (alinha com pricing Meta)
  category        TEXT NOT NULL
    CHECK (category IN (
      'marketing',
      'utility',
      'authentication',
      'service',
      'platform_fee',
      'flows',
      'ai_usage',
      'overage',
      'addon',
      'discount',
      'other'
    )),

  -- Descrição legível
  description     TEXT NOT NULL,

  -- Quantidades
  quantity        INT NOT NULL DEFAULT 0,
  unit_cost_usd   NUMERIC(10,6) NOT NULL DEFAULT 0.000000,
  meta_cost_usd   NUMERIC(12,2) NOT NULL DEFAULT 0.00,  -- custo Meta puro
  markup_pct      NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  total_usd       NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  -- Período de referência
  period_start    DATE,
  period_end      DATE,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_invoice
  ON billing_line_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_org
  ON billing_line_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_category
  ON billing_line_items(category);


-- ============================================================
-- 4. billing_credits — Controle de créditos Meta
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Tipo de crédito
  credit_type     TEXT NOT NULL DEFAULT 'meta_partner'
    CHECK (credit_type IN ('meta_partner', 'promotional', 'refund', 'manual')),

  -- Valores
  amount_usd      NUMERIC(12,2) NOT NULL,
  remaining_usd   NUMERIC(12,2) NOT NULL,

  -- Validade
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,

  -- Referência
  description     TEXT,
  granted_by      UUID,  -- user_id que concedeu
  invoice_id      UUID REFERENCES billing_invoices(id),

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_credits_org
  ON billing_credits(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_credits_expires
  ON billing_credits(expires_at)
  WHERE remaining_usd > 0;


-- ============================================================
-- 5. FUNCTIONS — Geração mensal de faturas
-- ============================================================

-- 5a. Gerar número de invoice sequencial
CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id UUID, p_period DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_short TEXT;
  v_seq INT;
BEGIN
  -- Pegar primeiras 4 letras do nome da org (uppercase)
  SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 4))
  INTO v_org_short
  FROM organizations
  WHERE id = p_org_id;

  -- Contar invoices existentes para esta org
  SELECT COUNT(*) + 1
  INTO v_seq
  FROM billing_invoices
  WHERE organization_id = p_org_id;

  RETURN 'WDR-' || COALESCE(v_org_short, 'UNKN') || '-'
    || TO_CHAR(p_period, 'YYYYMM') || '-'
    || LPAD(v_seq::TEXT, 4, '0');
END;
$$;


-- 5b. Calcular custo de mensagens por categoria para um período
CREATE OR REPLACE FUNCTION calculate_message_costs(
  p_org_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE (
  category TEXT,
  quantity BIGINT,
  meta_cost_usd NUMERIC,
  markup_pct NUMERIC,
  total_usd NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_markup NUMERIC;
BEGIN
  -- Pegar markup da organização
  SELECT COALESCE(o.message_markup_pct, 0)
  INTO v_markup
  FROM organizations o
  WHERE o.id = p_org_id;

  RETURN QUERY
  SELECT
    COALESCE(wcm.conversation_category, 'service')::TEXT AS category,
    COUNT(*)::BIGINT AS quantity,
    -- Custo Meta estimado por categoria (BR pricing 2026)
    ROUND(
      COUNT(*) * CASE COALESCE(wcm.conversation_category, 'service')
        WHEN 'marketing'       THEN 0.0625  -- ~USD 0.0625 por conversa marketing BR
        WHEN 'utility'         THEN 0.0080  -- ~USD 0.008
        WHEN 'authentication'  THEN 0.0340  -- ~USD 0.034
        WHEN 'service'         THEN 0.0300  -- ~USD 0.030
        ELSE 0.0300
      END,
      2
    )::NUMERIC AS meta_cost_usd,
    v_markup AS markup_pct,
    ROUND(
      COUNT(*) * CASE COALESCE(wcm.conversation_category, 'service')
        WHEN 'marketing'       THEN 0.0625
        WHEN 'utility'         THEN 0.0080
        WHEN 'authentication'  THEN 0.0340
        WHEN 'service'         THEN 0.0300
        ELSE 0.0300
      END * (1 + v_markup / 100.0),
      2
    )::NUMERIC AS total_usd
  FROM whatsapp_cloud_messages wcm
  JOIN whatsapp_business_accounts wba ON wcm.waba_id = wba.id
  WHERE wba.organization_id = p_org_id
    AND wcm.direction = 'outbound'
    AND wcm.created_at >= p_start::TIMESTAMPTZ
    AND wcm.created_at < (p_end + INTERVAL '1 day')::TIMESTAMPTZ
  GROUP BY wcm.conversation_category;
END;
$$;


-- 5c. Gerar fatura mensal para uma organização
CREATE OR REPLACE FUNCTION generate_monthly_invoice(
  p_org_id UUID,
  p_year INT DEFAULT EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM NOW() - INTERVAL '1 month')::INT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id UUID;
  v_period_start DATE;
  v_period_end DATE;
  v_invoice_number TEXT;
  v_subtotal NUMERIC := 0;
  v_credit_applied NUMERIC := 0;
  v_org_currency TEXT;
  v_exchange_rate NUMERIC;
  rec RECORD;
BEGIN
  -- Calcular período
  v_period_start := MAKE_DATE(p_year, p_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Verificar se já existe fatura para este período
  IF EXISTS (
    SELECT 1 FROM billing_invoices
    WHERE organization_id = p_org_id
      AND period_start = v_period_start
      AND status != 'cancelled'
  ) THEN
    RAISE NOTICE 'Invoice already exists for org % period %', p_org_id, v_period_start;
    SELECT id INTO v_invoice_id
    FROM billing_invoices
    WHERE organization_id = p_org_id
      AND period_start = v_period_start
      AND status != 'cancelled'
    LIMIT 1;
    RETURN v_invoice_id;
  END IF;

  -- Gerar número
  v_invoice_number := generate_invoice_number(p_org_id, v_period_start);

  -- Buscar moeda da org
  SELECT billing_currency INTO v_org_currency
  FROM organizations WHERE id = p_org_id;

  -- Exchange rate estimado (para exibição)
  v_exchange_rate := CASE v_org_currency
    WHEN 'BRL' THEN 5.20
    WHEN 'MXN' THEN 17.50
    WHEN 'COP' THEN 4200.00
    ELSE 1.00
  END;

  -- Criar invoice
  INSERT INTO billing_invoices (
    organization_id, period_start, period_end,
    invoice_number, currency, exchange_rate,
    status, due_date
  ) VALUES (
    p_org_id, v_period_start, v_period_end,
    v_invoice_number, v_org_currency, v_exchange_rate,
    'draft', v_period_end + INTERVAL '15 days'
  )
  RETURNING id INTO v_invoice_id;

  -- Inserir line items por categoria
  FOR rec IN
    SELECT * FROM calculate_message_costs(p_org_id, v_period_start, v_period_end)
  LOOP
    INSERT INTO billing_line_items (
      invoice_id, organization_id, category, description,
      quantity, unit_cost_usd, meta_cost_usd, markup_pct, total_usd,
      period_start, period_end
    ) VALUES (
      v_invoice_id, p_org_id, rec.category,
      'WhatsApp ' || INITCAP(rec.category) || ' messages',
      rec.quantity,
      CASE WHEN rec.quantity > 0 THEN rec.meta_cost_usd / rec.quantity ELSE 0 END,
      rec.meta_cost_usd,
      rec.markup_pct,
      rec.total_usd,
      v_period_start, v_period_end
    );
    v_subtotal := v_subtotal + rec.total_usd;
  END LOOP;

  -- Aplicar créditos disponíveis
  SELECT LEAST(v_subtotal, COALESCE(SUM(remaining_usd), 0))
  INTO v_credit_applied
  FROM billing_credits
  WHERE organization_id = p_org_id
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > NOW());

  -- Debitar créditos (FIFO por data de concessão)
  IF v_credit_applied > 0 THEN
    DECLARE
      v_remaining_to_apply NUMERIC := v_credit_applied;
      credit_rec RECORD;
    BEGIN
      FOR credit_rec IN
        SELECT id, remaining_usd
        FROM billing_credits
        WHERE organization_id = p_org_id
          AND remaining_usd > 0
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY granted_at ASC
      LOOP
        EXIT WHEN v_remaining_to_apply <= 0;

        IF credit_rec.remaining_usd <= v_remaining_to_apply THEN
          UPDATE billing_credits
            SET remaining_usd = 0
            WHERE id = credit_rec.id;
          v_remaining_to_apply := v_remaining_to_apply - credit_rec.remaining_usd;
        ELSE
          UPDATE billing_credits
            SET remaining_usd = remaining_usd - v_remaining_to_apply
            WHERE id = credit_rec.id;
          v_remaining_to_apply := 0;
        END IF;
      END LOOP;
    END;

    -- Adicionar line item de crédito
    INSERT INTO billing_line_items (
      invoice_id, organization_id, category, description,
      quantity, total_usd, period_start, period_end
    ) VALUES (
      v_invoice_id, p_org_id, 'discount',
      'Meta Partner credit applied',
      1, -v_credit_applied,
      v_period_start, v_period_end
    );
  END IF;

  -- Atualizar totais da fatura
  UPDATE billing_invoices SET
    subtotal_usd = v_subtotal,
    tax_usd = 0,  -- impostos calculados separadamente (NF-e)
    total_usd = v_subtotal,
    credit_applied = v_credit_applied,
    amount_due_usd = GREATEST(v_subtotal - v_credit_applied, 0),
    total_local = ROUND(GREATEST(v_subtotal - v_credit_applied, 0) * v_exchange_rate, 2),
    status = CASE
      WHEN GREATEST(v_subtotal - v_credit_applied, 0) = 0 THEN 'paid'
      ELSE 'pending'
    END
  WHERE id = v_invoice_id;

  -- Atualizar credit_used na org
  UPDATE organizations SET
    credit_used_usd = credit_used_usd + v_credit_applied
  WHERE id = p_org_id;

  RETURN v_invoice_id;
END;
$$;


-- 5d. Gerar faturas para TODAS as orgs com billing_model = 'markup'
CREATE OR REPLACE FUNCTION generate_all_monthly_invoices(
  p_year INT DEFAULT EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM NOW() - INTERVAL '1 month')::INT
)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  invoice_id UUID,
  amount_due NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  org_rec RECORD;
  v_invoice_id UUID;
BEGIN
  FOR org_rec IN
    SELECT o.id, o.name
    FROM organizations o
    WHERE o.status = 'active'
      AND o.billing_model IN ('markup', 'hybrid')
    ORDER BY o.name
  LOOP
    v_invoice_id := generate_monthly_invoice(org_rec.id, p_year, p_month);

    RETURN QUERY
    SELECT
      org_rec.id,
      org_rec.name,
      v_invoice_id,
      bi.amount_due_usd
    FROM billing_invoices bi
    WHERE bi.id = v_invoice_id;
  END LOOP;
END;
$$;


-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- billing_invoices: org members can read their own invoices
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_invoices_org_read'
  ) THEN
    CREATE POLICY billing_invoices_org_read ON billing_invoices
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- service_role bypass
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_invoices_service'
  ) THEN
    CREATE POLICY billing_invoices_service ON billing_invoices
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- billing_line_items: org members can read
ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_line_items_org_read'
  ) THEN
    CREATE POLICY billing_line_items_org_read ON billing_line_items
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_line_items_service'
  ) THEN
    CREATE POLICY billing_line_items_service ON billing_line_items
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- billing_credits: org members can read
ALTER TABLE billing_credits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_credits_org_read'
  ) THEN
    CREATE POLICY billing_credits_org_read ON billing_credits
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'billing_credits_service'
  ) THEN
    CREATE POLICY billing_credits_service ON billing_credits
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- 7. COMMENTS (documentação inline)
-- ============================================================

COMMENT ON TABLE billing_invoices IS 'Faturas mensais por organização — modelo Solution Partner';
COMMENT ON TABLE billing_line_items IS 'Itens de cobrança por categoria de mensagem WhatsApp';
COMMENT ON TABLE billing_credits IS 'Créditos Meta Partner e promocionais por organização';
COMMENT ON FUNCTION generate_monthly_invoice IS 'Gera fatura mensal para uma organização com line items por categoria';
COMMENT ON FUNCTION generate_all_monthly_invoices IS 'Gera faturas para todas as orgs com billing markup/hybrid';
COMMENT ON FUNCTION calculate_message_costs IS 'Calcula custo de mensagens por categoria para um período';
