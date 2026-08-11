-- ================================================
-- WhatsApp access_token encryption at-rest
-- Plan: Sprint 1 / Fase 2 (token encryption)
-- ================================================
--
-- Two-step rollout to avoid downtime:
--   1. Add nullable column. Backfill via scripts/encrypt-whatsapp-tokens.ts.
--   2. After cutover (next release), DROP COLUMN access_token (separate
--      migration 20260523_whatsapp_drop_legacy_token.sql NOT included here).
--
-- Format: iv:authTag:ciphertext (hex), AES-256-GCM, key from ENCRYPTION_KEY env.
-- Mirrors src/lib/tiktok/token-manager.ts:80-130.

ALTER TABLE whatsapp_business_accounts
  ADD COLUMN IF NOT EXISTS access_token_encrypted text;

COMMENT ON COLUMN whatsapp_business_accounts.access_token_encrypted IS
  'AES-256-GCM encrypted access token (iv:authTag:ciphertext hex format). Read via src/lib/whatsapp/account-loader.ts getAccessToken().';

-- Also covers Evolution-shared table if both schemas coexist.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_instances' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE whatsapp_instances
      ADD COLUMN IF NOT EXISTS access_token_encrypted text;
    COMMENT ON COLUMN whatsapp_instances.access_token_encrypted IS
      'AES-256-GCM encrypted access token. Read via account-loader.';
  END IF;
END $$;
