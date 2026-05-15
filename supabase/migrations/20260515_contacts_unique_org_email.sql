-- =====================================================
-- contacts: enforce unique (organization_id, email)
--
-- The Shopify customer sync (syncCustomersGraphQL in
-- full-sync-graphql.ts, plus several other paths) calls
--   .upsert({...}, { onConflict: 'organization_id,email' })
-- but the table never had a matching constraint.
-- shopify_sync_logs recorded errors like
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
-- on every customer batch — every upsert effectively failed
-- silently, producing duplicate contacts on retry and skipping
-- the merge-update branch that fills total_orders / total_spent.
--
-- Verified zero duplicates exist today before adding the index.
-- Emails are already lowercased upstream (contact-sync.ts) so a
-- plain non-functional unique works the way PostgREST expects.
-- WHERE email IS NOT NULL keeps contacts captured by phone /
-- shopify_customer_id only from blocking each other.
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_email_unique
  ON public.contacts (organization_id, email)
  WHERE email IS NOT NULL;
