-- Fix Klaviyo accounts table to be more flexible
-- Run this if you're having issues saving Klaviyo connections

-- Drop existing table if needed (WARNING: this will delete existing data)
-- DROP TABLE IF EXISTS klaviyo_accounts CASCADE;

-- Create table without strict foreign key
CREATE TABLE IF NOT EXISTS klaviyo_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID, -- Made nullable, no foreign key
  api_key TEXT NOT NULL,
  public_api_key TEXT,
  account_id TEXT,
  account_name TEXT,
  is_active BOOLEAN DEFAULT true,
  total_profiles INTEGER DEFAULT 0,
  total_lists INTEGER DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_klaviyo_accounts_active ON klaviyo_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_klaviyo_accounts_org ON klaviyo_accounts(organization_id);

-- Disable RLS for now (enable later with proper policies)
ALTER TABLE klaviyo_accounts DISABLE ROW LEVEL SECURITY;

-- If table already exists with different structure, try altering it:
-- ALTER TABLE klaviyo_accounts ALTER COLUMN organization_id DROP NOT NULL;
-- ALTER TABLE klaviyo_accounts DROP CONSTRAINT IF EXISTS klaviyo_accounts_organization_id_fkey;
