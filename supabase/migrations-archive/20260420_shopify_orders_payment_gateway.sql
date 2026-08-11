-- =============================================================
-- Add payment_gateway_names to shopify_orders so the recovery page
-- can show PIX / Boleto / Cartão pending-payment tabs.
-- =============================================================

ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS payment_gateway_names TEXT[] DEFAULT '{}';

-- Index to speed up "pending payment by gateway" filter on recovery page
CREATE INDEX IF NOT EXISTS idx_shopify_orders_financial_status
  ON shopify_orders(organization_id, financial_status, shopify_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_payment_gateway
  ON shopify_orders USING GIN (payment_gateway_names);

NOTIFY pgrst, 'reload schema';
