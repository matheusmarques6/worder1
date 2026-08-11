-- =====================================================
-- shopify_products.description + collections
--
-- Worder synced products lacked the body_html (HTML description)
-- and the collection memberships. Without these, downstream cart-
-- recovery email blocks couldn't include product copy or category
-- context the way Omnisend / Klaviyo do.
--
-- Both fields are JSONB-backed so the webhook handler can drop
-- whatever shape Shopify ships without us having to track sub-fields.
-- =====================================================

ALTER TABLE shopify_products
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS collections JSONB DEFAULT '[]'::jsonb;

-- Refresh PostgREST schema cache so the new columns are reachable
-- without a server restart.
NOTIFY pgrst, 'reload schema';
