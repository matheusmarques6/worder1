-- =============================================
-- 09: whatsapp_alerts table
-- Dedicated table for WhatsApp operational alerts.
-- Replaces broken inserts into non-existent `notifications` columns.
-- =============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  waba_id         UUID REFERENCES whatsapp_business_accounts(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'quality_drop',
                    'frequency_cap',
                    'template_rejected',
                    'template_paused',
                    'template_disabled',
                    'account_restricted',
                    'webhook_dead',
                    'window_expiry_bulk',
                    'low_messaging_limit'
                  )),
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title           TEXT NOT NULL,
  body            TEXT,
  metadata        JSONB DEFAULT '{}',
  dedup_key       TEXT,
  acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_org_ack_created
  ON whatsapp_alerts (organization_id, acknowledged, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_type_created
  ON whatsapp_alerts (type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_alerts_dedup
  ON whatsapp_alerts (organization_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND acknowledged = FALSE;

-- 3. RLS
ALTER TABLE whatsapp_alerts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read alerts scoped to their organization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_alerts' AND policyname = 'whatsapp_alerts_org_read'
  ) THEN
    CREATE POLICY whatsapp_alerts_org_read ON whatsapp_alerts
      FOR SELECT
      TO authenticated
      USING (organization_id IN (
        SELECT organization_id
        FROM public.profiles
        WHERE id = auth.uid()
      ));
  END IF;
END
$$;

-- service_role bypasses RLS (full access for server-side inserts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_alerts' AND policyname = 'whatsapp_alerts_service_role_all'
  ) THEN
    CREATE POLICY whatsapp_alerts_service_role_all ON whatsapp_alerts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
