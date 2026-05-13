-- =====================================================
-- email_domains: per-store custom + worder.email global
--
-- Default for every merchant is the shared, pre-warmed
-- worder.email domain (is_system=true). Custom domains
-- are scoped to a single store via store_id so a merchant
-- with two storefronts on the same org (Dr. Melaxin +
-- Based) doesn't see the other shop's sender configuration
-- when they open settings.
--
-- Schema changes:
--   1. organization_id NOT NULL constraint relaxed (system rows have it NULL).
--   2. store_id UUID NULL — scopes a custom domain to one store.
--   3. is_system BOOLEAN — flags the platform-wide shared domain.
--   4. Indexes for the GET path that unions system + org+store scope.
--
-- Backfill:
--   - The previously-org-owned worder.email row is upgraded to a
--     system row (organization_id NULL, is_system true). Existing
--     references continue to work because the row id is preserved.
--
-- Idempotent.
-- =====================================================

ALTER TABLE email_domains ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

UPDATE email_domains
SET is_system = true, organization_id = NULL
WHERE domain = 'worder.email';

CREATE INDEX IF NOT EXISTS email_domains_is_system_idx
  ON email_domains (is_system) WHERE is_system = true;
CREATE INDEX IF NOT EXISTS email_domains_store_idx
  ON email_domains (store_id) WHERE store_id IS NOT NULL;
