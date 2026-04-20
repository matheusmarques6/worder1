-- =============================================================
-- Enable sync_checkouts on ALL existing stores
--
-- The DB default is now 'true', but stores created before that
-- may still have sync_checkouts = false. This is the core feature
-- of the product — real-time capture of abandoned checkouts via
-- the checkouts/create + checkouts/update webhooks.
-- =============================================================

UPDATE shopify_stores
SET sync_checkouts = true
WHERE sync_checkouts IS DISTINCT FROM true;

-- Ensure the column default is 'true' (idempotent; harmless to re-run)
ALTER TABLE shopify_stores
  ALTER COLUMN sync_checkouts SET DEFAULT true;

-- Also default the other sync flags that the product relies on
ALTER TABLE shopify_stores
  ALTER COLUMN sync_orders SET DEFAULT true;
ALTER TABLE shopify_stores
  ALTER COLUMN sync_customers SET DEFAULT true;

UPDATE shopify_stores
SET sync_orders = true
WHERE sync_orders IS DISTINCT FROM true;

UPDATE shopify_stores
SET sync_customers = true
WHERE sync_customers IS DISTINCT FROM true;

NOTIFY pgrst, 'reload schema';
