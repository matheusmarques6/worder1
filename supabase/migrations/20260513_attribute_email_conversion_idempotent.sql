-- =====================================================
-- Make attribute_email_conversion idempotent on (order_id, contact).
--
-- The active webhook router calls this from processOrderPaid, and
-- we're about to start calling it from processOrderCreated too so
-- stores that never fire orders/paid (instant-capture gateways) still
-- get attribution. Without idempotency, a Shopify order that triggers
-- both webhooks would have its revenue counted twice on
-- email_campaigns.revenue.
--
-- Strategy: short-circuit when email_sends.order_id already matches
-- the incoming p_order_id — the order was previously attributed, no
-- new email_send should grab the credit and no campaign revenue
-- counter should advance. Idempotency is by-order, not by-time, so
-- duplicate Shopify webhooks from the same order are safe regardless
-- of how many times they retry.
-- =====================================================

CREATE OR REPLACE FUNCTION attribute_email_conversion(
  p_contact_id UUID,
  p_organization_id UUID,
  p_order_id TEXT,
  p_order_value NUMERIC,
  p_attribution_window_days INT DEFAULT 5
) RETURNS UUID AS $$
DECLARE
  v_email_send_id UUID;
  v_campaign_id UUID;
  v_existing UUID;
BEGIN
  -- Idempotency guard: was this exact order already attributed?
  -- Returning the previous attribution lets callers log "attributed"
  -- consistently across replays without rolling revenue again.
  SELECT es.id INTO v_existing
  FROM email_sends es
  WHERE es.order_id = p_order_id
    AND es.organization_id = p_organization_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Most recent email this contact actually engaged with inside the
  -- attribution window. Mirrors Klaviyo's last-touch-with-engagement
  -- model: receiving the email isn't enough — there must be an
  -- opened_at or clicked_at. We tiebreak on clicked_at (stronger
  -- signal) before falling back to opened_at.
  SELECT es.id, es.campaign_id INTO v_email_send_id, v_campaign_id
  FROM email_sends es
  WHERE es.contact_id = p_contact_id
    AND es.organization_id = p_organization_id
    AND es.sent_at >= NOW() - (p_attribution_window_days || ' days')::INTERVAL
    AND (es.opened_at IS NOT NULL OR es.clicked_at IS NOT NULL)
  ORDER BY COALESCE(es.clicked_at, es.opened_at) DESC
  LIMIT 1;

  IF v_email_send_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE email_sends SET
    conversion_value = p_order_value,
    converted_at = NOW(),
    order_id = p_order_id
  WHERE id = v_email_send_id;

  IF v_campaign_id IS NOT NULL THEN
    UPDATE email_campaigns SET
      revenue = COALESCE(revenue, 0) + p_order_value,
      conversions = COALESCE(conversions, 0) + 1
    WHERE id = v_campaign_id;
  END IF;

  RETURN v_email_send_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION attribute_email_conversion TO service_role;
