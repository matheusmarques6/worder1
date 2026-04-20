-- ================================================
-- WORDER: Email Production Schema
-- Missing tables, columns, and RPC functions
-- ================================================

-- 1. Tabela email_domains (referenciada pela API mas nunca criada)
CREATE TABLE IF NOT EXISTS email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  resend_domain_id TEXT,
  status TEXT DEFAULT 'pending', -- pending, verified, failed
  dns_records JSONB DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_email_domains_org ON email_domains(organization_id);
ALTER TABLE email_domains ENABLE ROW LEVEL SECURITY;

-- 2. Tabela email_clicks (referenciada pelo click tracker)
CREATE TABLE IF NOT EXISTS email_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id UUID REFERENCES email_sends(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_clicks_send ON email_clicks(email_send_id);
CREATE INDEX IF NOT EXISTS idx_email_clicks_at ON email_clicks(clicked_at);

-- 3. Colunas faltando em email_sends
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS email_template_id UUID;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS flow_id UUID;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS automation_run_id UUID;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(12,2) DEFAULT 0;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_sends_resend ON email_sends(resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_sends_org_created ON email_sends(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_sends_contact_sent ON email_sends(contact_id, sent_at) WHERE sent_at IS NOT NULL;

-- 4. Colunas de revenue em email_campaigns
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS revenue NUMERIC(12,2) DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS conversions INT DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 5. RPC: increment_campaign_stats (atomic, concurrency-safe)
CREATE OR REPLACE FUNCTION increment_campaign_stats(
  p_campaign_id UUID,
  p_sent INT DEFAULT 0,
  p_failed INT DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  UPDATE email_campaigns SET
    total_sent = COALESCE(total_sent, 0) + p_sent,
    total_failed = COALESCE(total_failed, 0) + p_failed
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_campaign_stats TO service_role;

-- 6. RPC: increment_campaign_opens (atomic)
CREATE OR REPLACE FUNCTION increment_campaign_opens(
  campaign_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE email_campaigns SET
    opens = COALESCE(opens, 0) + 1
  WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_campaign_opens TO service_role;

-- 7. RPC: increment_campaign_clicks (atomic)
CREATE OR REPLACE FUNCTION increment_campaign_clicks(
  p_campaign_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE email_campaigns SET
    clicks = COALESCE(clicks, 0) + 1
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_campaign_clicks TO service_role;

-- 8. RPC: attribute_email_conversion
-- Chamada quando um pedido Shopify chega, busca o último email aberto/clicado
-- dentro da janela de atribuição e registra a conversão
CREATE OR REPLACE FUNCTION attribute_email_conversion(
  p_contact_id UUID,
  p_organization_id UUID,
  p_order_id TEXT,
  p_order_value NUMERIC,
  p_attribution_window_days INT DEFAULT 5
) RETURNS UUID AS $$
DECLARE
  v_email_send_id UUID;
  v_campaign_id UUID;
BEGIN
  -- Busca o email mais recente aberto ou clicado dentro da janela
  SELECT es.id, es.campaign_id INTO v_email_send_id, v_campaign_id
  FROM email_sends es
  WHERE es.contact_id = p_contact_id
    AND es.organization_id = p_organization_id
    AND es.sent_at >= NOW() - (p_attribution_window_days || ' days')::INTERVAL
    AND (es.opened_at IS NOT NULL OR es.clicked_at IS NOT NULL)
  ORDER BY COALESCE(es.clicked_at, es.opened_at) DESC
  LIMIT 1;

  IF v_email_send_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Atualiza email_send com conversão
  UPDATE email_sends SET
    conversion_value = p_order_value,
    converted_at = NOW(),
    order_id = p_order_id
  WHERE id = v_email_send_id;

  -- Atualiza campaign revenue
  IF v_campaign_id IS NOT NULL THEN
    UPDATE email_campaigns SET
      revenue = COALESCE(revenue, 0) + p_order_value,
      conversions = COALESCE(conversions, 0) + 1
    WHERE id = v_campaign_id;
  END IF;

  RETURN v_email_send_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION attribute_email_conversion TO service_role;

-- 9. RLS policies para email_domains
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_domains' AND policyname = 'email_domains_org_isolation') THEN
    CREATE POLICY email_domains_org_isolation ON email_domains
      FOR ALL USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
  END IF;
END
$$;

-- 10. RPC: increment_campaign_bounces (atomic) — used by Resend webhook
CREATE OR REPLACE FUNCTION increment_campaign_bounces(
  p_campaign_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE email_campaigns SET
    bounces = COALESCE(bounces, 0) + 1
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_campaign_bounces TO service_role;
