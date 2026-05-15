-- =====================================================
-- refresh_contact_order_metrics: aggregate shopify_orders per email,
-- update contacts in ONE pass. Replaces a per-contact N+1 loop that
-- did 2 round-trips × 22k+ contacts for Dr. Melaxin, killing the
-- function before sync_logs could finalize.
--
-- Side effects:
--   - contacts.total_orders  ← count of paid/refunded orders for this email in this store
--   - contacts.total_spent   ← sum of total_price for those orders
--   - contacts.average_order_value
--   - contacts.first_order_at / last_order_at
--   - contacts.days_since_last_order
--   - contacts.lifecycle_stage (vip / repeat / customer / subscriber)
--   - contacts.updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_contact_order_metrics(
  p_store_id UUID,
  p_organization_id UUID
) RETURNS INT AS $$
DECLARE
  v_updated INT;
BEGIN
  WITH stats AS (
    SELECT
      LOWER(o.email) AS norm_email,
      COUNT(*) FILTER (WHERE o.financial_status IN ('paid','partially_paid','refunded','partially_refunded')) AS paid_count,
      COALESCE(SUM(o.total_price::numeric) FILTER (WHERE o.financial_status IN ('paid','partially_paid','refunded','partially_refunded')), 0) AS paid_sum,
      MIN(o.created_at) AS first_at,
      MAX(o.created_at) AS last_at
    FROM shopify_orders o
    WHERE o.store_id = p_store_id
      AND o.email IS NOT NULL
      AND o.email <> ''
    GROUP BY LOWER(o.email)
  )
  UPDATE contacts c SET
    total_orders        = stats.paid_count,
    total_spent         = stats.paid_sum,
    average_order_value = CASE WHEN stats.paid_count > 0 THEN stats.paid_sum / stats.paid_count ELSE 0 END,
    first_order_at      = stats.first_at,
    last_order_at       = stats.last_at,
    days_since_last_order = CASE WHEN stats.last_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - stats.last_at))::int / 86400
      ELSE NULL END,
    lifecycle_stage     = CASE
      WHEN stats.paid_count >= 5 THEN 'vip'
      WHEN stats.paid_count >= 2 THEN 'repeat_customer'
      WHEN stats.paid_count >= 1 THEN 'customer'
      ELSE COALESCE(c.lifecycle_stage, 'subscriber')
    END,
    updated_at          = NOW()
  FROM stats
  WHERE LOWER(c.email) = stats.norm_email
    AND c.organization_id = p_organization_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_contact_order_metrics(UUID, UUID) TO service_role;
