-- ============================================================
-- MIGRATION: Popup/Form Builder Enhancement
-- Evolve crm_forms for Omnisend-style popup builder
-- ============================================================

-- Add popup-specific columns to crm_forms
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS form_type TEXT DEFAULT 'embed';
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS design_json JSONB DEFAULT '{}';
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS behavior JSONB DEFAULT '{}';
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS audience JSONB DEFAULT '{}';
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS list_id UUID;
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS is_ab_test BOOLEAN DEFAULT false;
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS ab_variant TEXT DEFAULT 'A';
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS ab_parent_id UUID;
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS impressions_count INTEGER DEFAULT 0;
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS conversion_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE crm_forms ADD COLUMN IF NOT EXISTS store_id UUID;

CREATE INDEX IF NOT EXISTS idx_crm_forms_type ON crm_forms(form_type);
CREATE INDEX IF NOT EXISTS idx_crm_forms_store ON crm_forms(store_id) WHERE store_id IS NOT NULL;
