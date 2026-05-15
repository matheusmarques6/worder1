-- =====================================================
-- shopify_customers: add columns the GraphQL sync was already
-- writing but the table never had. Every customer batch since
-- 2026-04-17 was failing in shopify_sync_logs with:
--   "Could not find the 'currency' column of 'shopify_customers'
--    in the schema cache"
-- which caused the whole batch to fail and drop downstream contact
-- upserts on the floor.
-- =====================================================

ALTER TABLE public.shopify_customers
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS verified_email BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_address JSONB;

-- =====================================================
-- contacts: replace partial unique with non-partial so PostgREST's
-- .upsert(... onConflict: 'organization_id,email') actually
-- matches. The previous WHERE email IS NOT NULL clause made the
-- index a "partial unique" which PostgREST silently won't use,
-- meaning every contact upsert through onConflict still failed
-- with "no unique or exclusion constraint matching the ON CONFLICT
-- specification" — same error sync_logs has been logging.
-- Multiple NULLs are still allowed (Postgres NULLS DISTINCT
-- default).
-- =====================================================

DROP INDEX IF EXISTS public.contacts_org_email_unique;

CREATE UNIQUE INDEX contacts_org_email_unique
  ON public.contacts (organization_id, email);
