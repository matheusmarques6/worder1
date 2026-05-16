-- =====================================================
-- shopify_orders.total_refunded
--
-- Shopify's "Total Sales" = gross - refunds. Our query was summing
-- total_price across all status (including 'refunded' rows at full
-- value), so the dashboard always overstated by the refund amount.
-- Confirmed on Dr. Melaxin: $35,038 (ours) - $575 (refunds) =
-- $34,462.99 (Shopify Admin). Add the column; bulk + cursor syncs
-- both already query totalRefundedSet from GraphQL but never wrote
-- it. Now they do.
-- =====================================================

ALTER TABLE public.shopify_orders
  ADD COLUMN IF NOT EXISTS total_refunded NUMERIC(12,2) DEFAULT 0;

-- Backfill existing 'refunded' rows: full value was refunded.
-- 'partially_refunded' rows stay at 0 until the next sync (we
-- can't infer the partial amount without re-pulling from Shopify).
UPDATE public.shopify_orders
SET total_refunded = total_price
WHERE financial_status = 'refunded'
  AND (total_refunded IS NULL OR total_refunded = 0);
