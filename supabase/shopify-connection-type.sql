-- =============================================
-- Add connection_type to shopify_stores
-- Distinguishes OAuth (official public app) from Manual (Custom App).
-- Defaults to 'oauth' so existing rows remain consistent with historical
-- behavior. New Custom App connections mark themselves as 'manual'.
-- =============================================

ALTER TABLE shopify_stores
  ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'oauth';

-- Backfill: anything already in the table before this column existed
-- was necessarily OAuth (there was no Manual path).
UPDATE shopify_stores
  SET connection_type = 'oauth'
  WHERE connection_type IS NULL;

-- Lightweight constraint (unchecked by default so existing rows won't
-- conflict even if they predate the default).
ALTER TABLE shopify_stores
  DROP CONSTRAINT IF EXISTS shopify_stores_connection_type_check;
ALTER TABLE shopify_stores
  ADD CONSTRAINT shopify_stores_connection_type_check
  CHECK (connection_type IN ('oauth', 'manual'));

-- =============================================
-- Client Credentials Grant support
-- Manual-mode stores store the Client ID (to pair with Client Secret
-- kept in api_secret) so the token-refresh cron can mint a fresh
-- access_token every ~23h. token_expires_at drives which rows the
-- cron picks up.
-- =============================================
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shopify_stores_token_expires
  ON shopify_stores(token_expires_at)
  WHERE connection_type = 'manual' AND is_active = true;
