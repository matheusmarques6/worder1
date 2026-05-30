-- =============================================
-- Onda 6 — account health columns
--
-- Adds 4 columns to whatsapp_business_accounts to persist the most
-- recent token health check, so the Settings UI can render a status
-- badge on first paint without re-probing Meta on every page load.
--
-- Idempotent — safe to re-run.
--
-- HOW TO APPLY:
--   Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =============================================

ALTER TABLE whatsapp_business_accounts
  ADD COLUMN IF NOT EXISTS last_health_check_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_status     TEXT,        -- 'healthy' | 'expired' | 'invalid' | 'error'
  ADD COLUMN IF NOT EXISTS last_health_error_code INTEGER,     -- Meta API error.code (e.g. 190)
  ADD COLUMN IF NOT EXISTS last_health_expires_at TIMESTAMPTZ; -- from /debug_token; NULL = never expires

-- Quick lookup for "show me all degraded accounts" admin dashboards.
CREATE INDEX IF NOT EXISTS idx_wba_health_status
  ON whatsapp_business_accounts(last_health_status)
  WHERE last_health_status IS NOT NULL;
