-- =====================================================
-- Conversion-guard query in action_email looks like:
--   SELECT id FROM contact_events
--   WHERE contact_id = ?
--     AND event_type IN ('placed_order','order_paid','checkout_completed')
--     AND occurred_at >= ?
--   ORDER BY occurred_at DESC LIMIT 1
--
-- The existing (organization_id, contact_id, occurred_at) index gets
-- close, but the planner has to read every event for the contact and
-- filter event_type in memory. For a contact with thousands of page
-- views / pixel events this turned into a 2-5s scan, which is most
-- of the per-step latency a merchant sees between trigger and the
-- first email going out.
--
-- CREATE INDEX CONCURRENTLY can't be used inside a transaction —
-- run this migration outside the regular `supabase db push` batch
-- (or via psql with autocommit) on production.
-- =====================================================

CREATE INDEX IF NOT EXISTS contact_events_contact_type_time_idx
  ON contact_events (contact_id, event_type, occurred_at DESC);
