-- ================================================
-- Outbound Webhooks: webhook_deliveries
-- Spec: docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md §5
-- ================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  event_type       text NOT NULL,
  event_id         text NOT NULL,
  payload          jsonb NOT NULL,
  url              text NOT NULL,

  status           text NOT NULL DEFAULT 'pending',
  attempt_count    int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 5,
  in_flight_until  timestamptz,

  response_code    int,
  response_body    text,
  error_message    text,

  next_retry_at    timestamptz,
  delivered_at     timestamptz,
  last_attempt_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT status_valid CHECK (status IN ('pending', 'in_flight', 'delivered', 'failed', 'retrying')),
  CONSTRAINT event_type_in_catalog CHECK (event_type IN (
    'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
    'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
    'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
  )),
  CONSTRAINT unique_delivery_per_event UNIQUE (subscription_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliv_sub
  ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_status
  ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_org
  ON webhook_deliveries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_stuck
  ON webhook_deliveries(last_attempt_at NULLS FIRST)
  WHERE status IN ('pending', 'retrying', 'in_flight');

-- RLS — padrão do repo: organization_id vem de profiles.
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_deliveries" ON webhook_deliveries
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT/UPDATE só via service role; sem policy de write
