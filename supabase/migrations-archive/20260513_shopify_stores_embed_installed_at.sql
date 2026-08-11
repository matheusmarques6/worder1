-- =====================================================
-- shopify_stores.embed_installed_at
--
-- Stamped by /api/storefront/embed-ping the first time
-- worder.js (the Theme App Embed script) phones home.
-- Shopify doesn't fire a webhook when the merchant flips
-- the "App embeds" toggle in the theme editor, so we use
-- the side effect of the script running on a real
-- storefront as the activation signal.
--
-- The boolean `embed_installed` already exists; this just
-- captures WHEN to drive the dashboard prompt ("we last
-- saw your tracking script on May 13 — looking good").
--
-- Idempotent.
-- =====================================================

ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS embed_installed_at TIMESTAMPTZ;

COMMENT ON COLUMN shopify_stores.embed_installed_at IS
  'When worder-theme-ext first phoned home. Stamped by /api/storefront/embed-ping the first time the merchant''s storefront loads worder.js.';
