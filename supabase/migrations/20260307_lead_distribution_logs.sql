-- =============================================
-- Lead Distribution Logs Table
-- =============================================

-- Create lead_distribution_logs table
CREATE TABLE IF NOT EXISTS lead_distribution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES lead_distribution_rules(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  distribution_type VARCHAR(50) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_distribution_logs_rule_id ON lead_distribution_logs(rule_id);
CREATE INDEX idx_distribution_logs_assigned_to ON lead_distribution_logs(assigned_to);
CREATE INDEX idx_distribution_logs_created_at ON lead_distribution_logs(created_at DESC);
CREATE INDEX idx_distribution_logs_lead_id ON lead_distribution_logs(lead_id);

-- Enable RLS
ALTER TABLE lead_distribution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_distribution_logs
CREATE POLICY "Users can view distribution logs for their org rules"
  ON lead_distribution_logs FOR SELECT
  USING (
    rule_id IN (
      SELECT id FROM lead_distribution_rules
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert distribution logs"
  ON lead_distribution_logs FOR INSERT
  WITH CHECK (true);
