-- =====================================================
-- shopify_orders: add payment_gateway_names column
--
-- Both syncOrdersGraphQL (cursor sync) and mapOrderForUpsert (bulk
-- drain) were writing payment_gateway_names to shopify_orders, but
-- the column never existed. Every upsert batch failed with:
--   "Could not find the 'payment_gateway_names' column of
--    'shopify_orders' in the schema cache"
-- and the whole batch was rejected. Confirmed via shopify_import_jobs
-- rows that drained 1813 JSONL lines but landed 0 actual orders.
-- =====================================================

ALTER TABLE public.shopify_orders
  ADD COLUMN IF NOT EXISTS payment_gateway_names TEXT[];
