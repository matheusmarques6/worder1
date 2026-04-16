-- =============================================
-- WORDER: Deliverability, Smart Sending, Warm-up
-- 20260416_deliverability_smart_sending.sql
-- =============================================

-- contacts: timezone + engagement tracking
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS timezone          TEXT,
  ADD COLUMN IF NOT EXISTS best_send_hour    INT,
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engagement_score  INT DEFAULT 50;

CREATE INDEX IF NOT EXISTS contacts_timezone_idx
  ON contacts (organization_id, timezone)
  WHERE timezone IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_engagement_idx
  ON contacts (organization_id, engagement_score);

-- email_domains: warm-up tracking
ALTER TABLE email_domains
  ADD COLUMN IF NOT EXISTS warmup_enabled     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warmup_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warmup_day         INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_daily_limit INT DEFAULT 200,
  ADD COLUMN IF NOT EXISTS total_sent_today   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_date     DATE;

-- email_campaigns: smart sending + engagement filter
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS smart_sending_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS smart_sending_hours   INT DEFAULT 16,
  ADD COLUMN IF NOT EXISTS skip_unengaged        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skip_unengaged_days   INT DEFAULT 120,
  ADD COLUMN IF NOT EXISTS send_time_optimization BOOLEAN DEFAULT FALSE;

-- email_sends: ISP tracking
ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS isp_domain TEXT;

CREATE INDEX IF NOT EXISTS email_sends_isp_idx
  ON email_sends (organization_id, isp_domain, status)
  WHERE isp_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_sends_contact_recent_idx
  ON email_sends (contact_id, sent_at DESC)
  WHERE status = 'sent';
