-- =====================================================
-- shopify_orders.order_number INTEGER → TEXT
--
-- Shopify lets merchants customize order numbering with arbitrary
-- prefixes ("CB21190", "DR-501", ...). order_number was INTEGER,
-- which crashed every order upsert with:
--   "invalid input syntax for type integer: \"CB21190\""
-- Confirmed via shopify_import_jobs.last_error on 5 separate bulk
-- drain jobs that pulled 1813 JSONL lines each but persisted 0
-- rows. order_number is identity, not arithmetic — TEXT.
-- =====================================================

ALTER TABLE public.shopify_orders
  ALTER COLUMN order_number TYPE TEXT;
