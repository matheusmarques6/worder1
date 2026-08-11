-- =====================================================
-- shopify_stores.shop_domain_aliases
--
-- Shopify assigns a permanent myshopifyDomain when a shop is created
-- (e.g. lojalaclode.myshopify.com). The merchant can later rename the
-- admin slug, add custom domains, or even create additional myshopify
-- subdomains via expansion stores. But Shopify ALWAYS sends webhooks
-- with the original/canonical domain in the X-Shopify-Shop-Domain
-- header, regardless of what the admin slug or custom domain is.
--
-- Before this migration, getStoreConfig() did a strict equality match
-- on shop_domain. Webhooks for any store whose canonical domain
-- differed from what the merchant typed during manual connection
-- (e.g. typed "sourosa.myshopify.com" but Shopify sends
-- "lojalaclode.myshopify.com") returned 410 Gone — events silently
-- dropped, no UI hint that anything was wrong.
--
-- shop_domain_aliases is a TEXT[] of additional domains that should
-- resolve to the same store row. Resolution order:
--   1. shop_domain exact match
--   2. ANY alias in shop_domain_aliases
--
-- Populated automatically on manual reconnect (via GraphQL
-- shop.myshopifyDomain query) AND editable from the diagnostic
-- dashboard for cases where the canonical domain differs from what
-- was originally entered.
-- =====================================================

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS shop_domain_aliases TEXT[] DEFAULT '{}';

-- GIN index for fast ANY() matching in getStoreConfig
CREATE INDEX IF NOT EXISTS idx_shopify_stores_domain_aliases
  ON shopify_stores USING GIN (shop_domain_aliases);
