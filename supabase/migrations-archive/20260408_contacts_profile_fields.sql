-- ============================================================
-- MIGRATION: Contact profile fields for popup input mapping
-- Adds all fields supported by the popup input node "Map to profile field"
-- ============================================================

-- Part 1: Add new columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;

-- Part 2: Create indexes for segmentation queries
CREATE INDEX IF NOT EXISTS idx_contacts_birthday ON contacts(birthday) WHERE birthday IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(organization_id, city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_state ON contacts(organization_id, state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(organization_id, country) WHERE country IS NOT NULL;

-- Part 3: Ensure custom_fields exists (already in complete-schema.sql but safe to re-add)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Part 4: Comment for documentation
COMMENT ON COLUMN contacts.birthday IS 'Contact date of birth, mapped from popup input';
COMMENT ON COLUMN contacts.gender IS 'Contact gender (free text), mapped from popup input';
COMMENT ON COLUMN contacts.city IS 'Contact city, mapped from popup input';
COMMENT ON COLUMN contacts.state IS 'Contact state/province, mapped from popup input';
COMMENT ON COLUMN contacts.country IS 'Contact country, mapped from popup input';
COMMENT ON COLUMN contacts.zip IS 'Contact ZIP/postal code, mapped from popup input';
COMMENT ON COLUMN contacts.address IS 'Contact street address, mapped from popup input';
