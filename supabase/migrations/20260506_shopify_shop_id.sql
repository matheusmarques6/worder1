-- =====================================================
-- shopify_stores.shopify_shop_id
--
-- Canonical Shopify Shop GID (gid://shopify/Shop/70623002898 — but we
-- store just the numeric portion as TEXT). This is THE permanent
-- identifier of a Shopify shop. Unlike shop_domain (which can change
-- when the merchant renames or adds custom domains) and unlike
-- myshopifyDomain (which can shift in expansion-store setups), the
-- shop ID is assigned at shop creation and never changes.
--
-- Use case: when a merchant reconnects Shopify with a different
-- domain or different credentials, we look up the existing
-- shopify_stores row by (organization_id, shopify_shop_id) and
-- UPDATE it instead of creating a duplicate. Without this, every
-- reconnection produced a new row, orphaning all the merchant's
-- automations, contacts, segments, and analytics on the old row.
-- =====================================================

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS shopify_shop_id TEXT;

CREATE INDEX IF NOT EXISTS idx_shopify_stores_shop_id
  ON shopify_stores(organization_id, shopify_shop_id)
  WHERE shopify_shop_id IS NOT NULL;
