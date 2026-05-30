-- =============================================
-- Idempotent migration for whatsapp_quick_replies (Onda 7)
--
-- Use this file instead of supabase/inbox-schema.sql when parts of
-- the inbox schema were already applied (otherwise CREATE INDEX
-- without IF NOT EXISTS will fail with 42P07).
--
-- Safe to re-run any number of times.
-- =============================================

CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  shortcut VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type VARCHAR(50),
  media_filename VARCHAR(255),
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  use_count INT DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_org
  ON whatsapp_quick_replies(organization_id);

CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut
  ON whatsapp_quick_replies(organization_id, shortcut);

CREATE INDEX IF NOT EXISTS idx_quick_replies_category
  ON whatsapp_quick_replies(category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quick_replies_active
  ON whatsapp_quick_replies(is_active)
  WHERE is_active = true;
