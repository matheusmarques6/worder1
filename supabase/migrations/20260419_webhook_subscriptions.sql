-- ================================================
-- Outbound Webhooks: webhook_subscriptions
-- Spec: docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md §5
-- ================================================

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id                   uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  name                       text NOT NULL,
  url                        text NOT NULL,
  secret_encrypted           bytea NOT NULL,
  secret_previous_encrypted  bytea,
  secret_previous_expires_at timestamptz,
  events                     text[] NOT NULL,
  status                     text NOT NULL DEFAULT 'active',
  description                text,
  created_by                 uuid REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_not_empty CHECK (array_length(events, 1) > 0),
  CONSTRAINT status_valid CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT events_in_catalog CHECK (
    events <@ ARRAY[
      'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
      'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
      'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
    ]::text[]
  ),
  CONSTRAINT secret_rotation_consistent CHECK (
    (secret_previous_encrypted IS NULL) = (secret_previous_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_lookup
  ON webhook_subscriptions(store_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_webhook_subs_org
  ON webhook_subscriptions(organization_id);

-- RLS
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_subs" ON webhook_subscriptions
  FOR SELECT USING (auth.jwt() ->> 'organization_id' = organization_id::text);

CREATE POLICY "org_members_write_subs" ON webhook_subscriptions
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text)
  WITH CHECK (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Trigger pra updated_at
CREATE OR REPLACE FUNCTION update_webhook_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_subscriptions_updated_at
  BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_webhook_subscriptions_updated_at();
