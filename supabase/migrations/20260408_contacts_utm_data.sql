-- ============================================================
-- MIGRATION: Contact UTM data column for popup "Store UTM on consent"
-- Stores utm_source/medium/campaign/term/content + metadata
-- ============================================================

-- Part 1: Add utm_data JSONB column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_data JSONB DEFAULT '{}';

-- Part 2: Index for querying contacts by first-touch source
CREATE INDEX IF NOT EXISTS idx_contacts_utm_source
  ON contacts ((utm_data->>'utm_source'))
  WHERE utm_data IS NOT NULL AND utm_data != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_contacts_utm_campaign
  ON contacts ((utm_data->>'utm_campaign'))
  WHERE utm_data IS NOT NULL AND utm_data != '{}'::jsonb;

-- Part 3: Comment
COMMENT ON COLUMN contacts.utm_data IS
  'UTM attribution data captured from popup forms when behavior.utm.storeOnConsent is enabled. Structure: { utm_source, utm_medium, utm_campaign, utm_term, utm_content, captured_at, form_id }';
