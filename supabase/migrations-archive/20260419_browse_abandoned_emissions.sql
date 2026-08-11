-- ================================================
-- Outbound Webhooks: browse_abandoned_emissions
-- Spec: docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md §6 + T22
-- ================================================

CREATE TABLE IF NOT EXISTS browse_abandoned_emissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       uuid NOT NULL,
  product_id       text NOT NULL,
  view_event_id    uuid NOT NULL,
  emitted_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_browse_abandoned_emission
    UNIQUE (contact_id, product_id, view_event_id)
);

CREATE INDEX IF NOT EXISTS idx_browse_aband_org_emitted
  ON browse_abandoned_emissions(organization_id, emitted_at DESC);

ALTER TABLE browse_abandoned_emissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_browse_emissions" ON browse_abandoned_emissions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
