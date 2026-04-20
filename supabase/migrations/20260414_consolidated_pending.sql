-- ============================================================
-- WORDER: Consolidated Migration — All Pending Schema Changes
-- Run this in Supabase SQL Editor
-- Date: 2026-04-14
-- ============================================================

-- =============================================================
-- PART 1: Contact profile fields (for popup Map-to-profile-field)
-- =============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Indexes for segmentation queries
CREATE INDEX IF NOT EXISTS idx_contacts_birthday ON contacts(birthday) WHERE birthday IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(organization_id, city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_state ON contacts(organization_id, state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(organization_id, country) WHERE country IS NOT NULL;

-- =============================================================
-- PART 2: Contact UTM attribution data
-- =============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_data JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contacts_utm_source
  ON contacts ((utm_data->>'utm_source'))
  WHERE utm_data IS NOT NULL AND utm_data != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_contacts_utm_campaign
  ON contacts ((utm_data->>'utm_campaign'))
  WHERE utm_data IS NOT NULL AND utm_data != '{}'::jsonb;

-- =============================================================
-- PART 3: Saved / Universal Blocks (for reusable email blocks)
-- =============================================================
CREATE TABLE IF NOT EXISTS saved_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'custom',
  block_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_blocks_org ON saved_blocks(organization_id);
CREATE INDEX IF NOT EXISTS idx_saved_blocks_category ON saved_blocks(organization_id, category);

-- Row Level Security for saved_blocks
ALTER TABLE saved_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org saved blocks" ON saved_blocks;
CREATE POLICY "Users can view their org saved blocks" ON saved_blocks
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their org saved blocks" ON saved_blocks;
CREATE POLICY "Users can insert their org saved blocks" ON saved_blocks
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their org saved blocks" ON saved_blocks;
CREATE POLICY "Users can update their org saved blocks" ON saved_blocks
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their org saved blocks" ON saved_blocks;
CREATE POLICY "Users can delete their org saved blocks" ON saved_blocks
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- =============================================================
-- PART 4: Media files tracking (for per-store media library)
-- Already uses Supabase Storage directly — no table needed
-- File paths: {org_id}/store_{store_id}/{filename}
-- =============================================================

-- =============================================================
-- PART 5: Comments for documentation
-- =============================================================
COMMENT ON COLUMN contacts.birthday IS 'Contact date of birth, from popup input mapping';
COMMENT ON COLUMN contacts.gender IS 'Contact gender (free text), from popup input';
COMMENT ON COLUMN contacts.city IS 'Contact city';
COMMENT ON COLUMN contacts.state IS 'Contact state/province';
COMMENT ON COLUMN contacts.country IS 'Contact country';
COMMENT ON COLUMN contacts.zip IS 'Contact ZIP/postal code';
COMMENT ON COLUMN contacts.address IS 'Contact street address';
COMMENT ON COLUMN contacts.utm_data IS 'UTM attribution JSON: { utm_source, utm_medium, utm_campaign, utm_term, utm_content, captured_at, form_id }';
COMMENT ON TABLE saved_blocks IS 'Reusable/universal email editor blocks. Referenced by EmailBlock._savedBlockId. Edits propagate to all emails using the block.';

-- ============================================================
-- DONE — Verify results:
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'contacts'
-- AND column_name IN ('birthday','gender','city','state','country','zip','address','custom_fields','utm_data');
--
-- SELECT * FROM pg_tables WHERE tablename = 'saved_blocks';
