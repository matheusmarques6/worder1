-- ============================================================
-- MIGRATION: CDP Tracking Enhancement
-- Date: 2026-04-01
-- Description: Adds visitor tracking, fingerprint support,
--              and missing columns for full CDP functionality.
-- ============================================================

-- 1. Add missing columns to contact_events
ALTER TABLE contact_events ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE contact_events ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_ce_visitor ON contact_events(visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ce_fingerprint ON contact_events(fingerprint) WHERE fingerprint IS NOT NULL;

-- 2. Visitor Sessions table (for cookieless tracking)
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  fingerprint TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  landing_page TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  gclid TEXT,
  fbclid TEXT,
  ttclid TEXT,

  device_type TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  email TEXT,
  phone TEXT,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS idx_vs_fingerprint ON visitor_sessions(store_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vs_visitor ON visitor_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_vs_contact ON visitor_sessions(contact_id) WHERE contact_id IS NOT NULL;

-- 3. Add tracking columns to contacts (if not exist)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_event_type TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_events INT DEFAULT 0;
