-- ============================================
-- WORDER CRM - ADVANCED FEATURES MIGRATION
-- LTV, CAC, Lead Scoring, NPS, Templates, SLA
-- ============================================

-- ============================================
-- 1. LEAD SCORING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lead_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

  -- Scores (0-100)
  engagement_score INTEGER DEFAULT 0,
  intent_score INTEGER DEFAULT 0,
  fit_score INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,

  -- AI Analysis
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  purchase_intent TEXT CHECK (purchase_intent IN ('high', 'medium', 'low', 'none')),
  urgency_level TEXT CHECK (urgency_level IN ('urgent', 'high', 'medium', 'low')),

  -- Behavior signals
  signals JSONB DEFAULT '[]',
  last_activity_at TIMESTAMPTZ,

  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_org ON lead_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_contact ON lead_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_total ON lead_scores(total_score DESC);

-- ============================================
-- 2. CHAT TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  content TEXT NOT NULL,

  -- Variables support (e.g., {{nome}}, {{produto}})
  variables TEXT[] DEFAULT '{}',

  -- Media attachment
  media_url TEXT,
  media_type TEXT,

  -- WhatsApp template sync
  whatsapp_template_id TEXT,
  whatsapp_status TEXT DEFAULT 'local',

  -- Usage stats
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Config
  is_favorite BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_templates_org ON chat_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_templates_category ON chat_templates(category);

-- ============================================
-- 3. NPS SURVEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS nps_surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT 'Em uma escala de 0 a 10, o quanto você recomendaria nossa empresa?',
  follow_up_question TEXT DEFAULT 'O que motivou sua nota?',

  -- Trigger config
  trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'after_purchase', 'after_close', 'scheduled')),
  trigger_delay_hours INTEGER DEFAULT 24,

  -- Channel
  channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'sms', 'in_app')),

  -- Stats
  total_sent INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  promoters_count INTEGER DEFAULT 0,  -- 9-10
  passives_count INTEGER DEFAULT 0,   -- 7-8
  detractors_count INTEGER DEFAULT 0, -- 0-6
  nps_score DECIMAL(5,2) DEFAULT 0,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. NPS RESPONSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES nps_surveys(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  category TEXT GENERATED ALWAYS AS (
    CASE
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      ELSE 'detractor'
    END
  ) STORED,

  feedback TEXT,
  sentiment TEXT,

  -- Source
  channel TEXT,
  conversation_id UUID,

  responded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_responses_survey ON nps_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_org ON nps_responses(organization_id);

-- ============================================
-- 5. SLA CONFIGURATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sla_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,

  name TEXT NOT NULL,

  -- Response time SLAs (in minutes)
  first_response_time INTEGER DEFAULT 15,
  resolution_time INTEGER DEFAULT 480,

  -- Priority-based SLAs
  urgent_first_response INTEGER DEFAULT 5,
  urgent_resolution INTEGER DEFAULT 120,
  high_first_response INTEGER DEFAULT 15,
  high_resolution INTEGER DEFAULT 240,
  normal_first_response INTEGER DEFAULT 30,
  normal_resolution INTEGER DEFAULT 480,
  low_first_response INTEGER DEFAULT 60,
  low_resolution INTEGER DEFAULT 1440,

  -- Working hours
  working_hours_start TIME DEFAULT '09:00',
  working_hours_end TIME DEFAULT '18:00',
  working_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- Mon-Fri
  timezone TEXT DEFAULT 'America/Sao_Paulo',

  -- Escalation
  escalation_enabled BOOLEAN DEFAULT true,
  escalation_after_minutes INTEGER DEFAULT 30,
  escalation_to UUID REFERENCES profiles(id),

  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. SLA METRICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sla_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  sla_config_id UUID REFERENCES sla_configs(id) ON DELETE SET NULL,

  -- Times
  created_at TIMESTAMPTZ NOT NULL,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Calculations (in minutes)
  first_response_time INTEGER,
  resolution_time INTEGER,

  -- SLA Status
  first_response_breached BOOLEAN DEFAULT false,
  resolution_breached BOOLEAN DEFAULT false,

  -- Agent info
  assigned_to UUID REFERENCES profiles(id),
  resolved_by UUID REFERENCES profiles(id),

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_metrics_org ON sla_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_sla_metrics_conversation ON sla_metrics(conversation_id);

-- ============================================
-- 7. LEAD DISTRIBUTION RULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lead_distribution_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,

  name TEXT NOT NULL,

  -- Distribution method
  method TEXT DEFAULT 'round_robin' CHECK (method IN ('round_robin', 'weighted', 'availability', 'skill_based', 'manual')),

  -- Agents in rotation
  agents JSONB DEFAULT '[]', -- [{user_id, weight, max_leads, skills}]

  -- Current position for round robin
  current_position INTEGER DEFAULT 0,

  -- Filters
  conditions JSONB DEFAULT '{}', -- {source, tags, value_min, value_max}

  -- Stats
  total_distributed INTEGER DEFAULT 0,
  last_distribution_at TIMESTAMPTZ,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. DEAL STAGE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  -- Time tracking
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  time_in_stage_seconds INTEGER,

  -- Who changed
  changed_by UUID REFERENCES profiles(id),
  change_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_org ON deal_stage_history(organization_id);

-- ============================================
-- 9. CRM ANALYTICS CACHE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS crm_analytics_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  period TEXT DEFAULT 'daily' CHECK (period IN ('daily', 'weekly', 'monthly')),

  -- Pipeline metrics
  total_deals INTEGER DEFAULT 0,
  total_value DECIMAL(12,2) DEFAULT 0,
  won_deals INTEGER DEFAULT 0,
  won_value DECIMAL(12,2) DEFAULT 0,
  lost_deals INTEGER DEFAULT 0,
  lost_value DECIMAL(12,2) DEFAULT 0,

  -- Conversion metrics
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  avg_deal_value DECIMAL(12,2) DEFAULT 0,
  avg_time_to_close_hours INTEGER DEFAULT 0,

  -- Stage metrics (JSON array)
  stage_metrics JSONB DEFAULT '[]',

  -- Agent metrics (JSON array)
  agent_metrics JSONB DEFAULT '[]',

  -- Source metrics (JSON array)
  source_metrics JSONB DEFAULT '[]',

  -- LTV/CAC
  ltv DECIMAL(12,2) DEFAULT 0,
  cac DECIMAL(12,2) DEFAULT 0,
  ltv_cac_ratio DECIMAL(5,2) DEFAULT 0,

  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, pipeline_id, date, period)
);

CREATE INDEX IF NOT EXISTS idx_crm_analytics_org_date ON crm_analytics_cache(organization_id, date);

-- ============================================
-- 10. ADD COLUMNS TO EXISTING TABLES
-- ============================================

-- Add score and intent to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_intent TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id);

-- Add time tracking to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS time_in_current_stage_seconds INTEGER DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- Add SLA fields to inbox conversations
-- (If table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inbox_conversations') THEN
    ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS sla_config_id UUID REFERENCES sla_configs(id);
    ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
    ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false;
    ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
  END IF;
END $$;

-- ============================================
-- 11. FUNCTIONS
-- ============================================

-- Function to calculate deal time in stage
CREATE OR REPLACE FUNCTION calculate_deal_stage_time()
RETURNS TRIGGER AS $$
BEGIN
  -- If stage changed
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Record history
    INSERT INTO deal_stage_history (
      organization_id,
      deal_id,
      from_stage_id,
      to_stage_id,
      entered_at,
      exited_at,
      time_in_stage_seconds
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      OLD.stage_entered_at,
      NOW(),
      EXTRACT(EPOCH FROM (NOW() - COALESCE(OLD.stage_entered_at, OLD.created_at)))::INTEGER
    );

    -- Reset stage timer
    NEW.stage_entered_at := NOW();
    NEW.time_in_current_stage_seconds := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_deal_stage_changes ON deals;
CREATE TRIGGER track_deal_stage_changes
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION calculate_deal_stage_time();

-- Function to update NPS stats
CREATE OR REPLACE FUNCTION update_nps_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE nps_surveys
  SET
    total_responses = total_responses + 1,
    promoters_count = promoters_count + CASE WHEN NEW.score >= 9 THEN 1 ELSE 0 END,
    passives_count = passives_count + CASE WHEN NEW.score >= 7 AND NEW.score < 9 THEN 1 ELSE 0 END,
    detractors_count = detractors_count + CASE WHEN NEW.score < 7 THEN 1 ELSE 0 END,
    nps_score = (
      (promoters_count + CASE WHEN NEW.score >= 9 THEN 1 ELSE 0 END)::DECIMAL /
      NULLIF(total_responses + 1, 0) * 100
    ) - (
      (detractors_count + CASE WHEN NEW.score < 7 THEN 1 ELSE 0 END)::DECIMAL /
      NULLIF(total_responses + 1, 0) * 100
    ),
    updated_at = NOW()
  WHERE id = NEW.survey_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_nps_on_response ON nps_responses;
CREATE TRIGGER update_nps_on_response
  AFTER INSERT ON nps_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_nps_stats();

-- Function to distribute leads (round robin)
CREATE OR REPLACE FUNCTION distribute_lead_round_robin(
  p_organization_id UUID,
  p_pipeline_id UUID,
  p_deal_id UUID
) RETURNS UUID AS $$
DECLARE
  v_rule RECORD;
  v_agents JSONB;
  v_agent JSONB;
  v_next_position INTEGER;
  v_assigned_to UUID;
BEGIN
  -- Find active distribution rule
  SELECT * INTO v_rule
  FROM lead_distribution_rules
  WHERE organization_id = p_organization_id
    AND pipeline_id = p_pipeline_id
    AND is_active = true
    AND method = 'round_robin'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_agents := v_rule.agents;

  IF jsonb_array_length(v_agents) = 0 THEN
    RETURN NULL;
  END IF;

  -- Get next agent
  v_next_position := (v_rule.current_position + 1) % jsonb_array_length(v_agents);
  v_agent := v_agents->v_next_position;
  v_assigned_to := (v_agent->>'user_id')::UUID;

  -- Update deal
  UPDATE deals SET assigned_to = v_assigned_to WHERE id = p_deal_id;

  -- Update rule position
  UPDATE lead_distribution_rules
  SET
    current_position = v_next_position,
    total_distributed = total_distributed + 1,
    last_distribution_at = NOW()
  WHERE id = v_rule.id;

  RETURN v_assigned_to;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 12. RLS POLICIES
-- ============================================

ALTER TABLE lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_distribution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_analytics_cache ENABLE ROW LEVEL SECURITY;

-- Generic policies for new tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'lead_scores', 'chat_templates', 'nps_surveys', 'nps_responses',
    'sla_configs', 'sla_metrics', 'lead_distribution_rules',
    'deal_stage_history', 'crm_analytics_cache'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Select policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can view %I in their org" ON %I;
      CREATE POLICY "Users can view %I in their org" ON %I
      FOR SELECT USING (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);

    -- Insert policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can insert %I in their org" ON %I;
      CREATE POLICY "Users can insert %I in their org" ON %I
      FOR INSERT WITH CHECK (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);

    -- Update policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can update %I in their org" ON %I;
      CREATE POLICY "Users can update %I in their org" ON %I
      FOR UPDATE USING (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);

    -- Delete policy
    EXECUTE format('
      DROP POLICY IF EXISTS "Users can delete %I in their org" ON %I;
      CREATE POLICY "Users can delete %I in their org" ON %I
      FOR DELETE USING (organization_id = get_user_organization_id())
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ============================================
-- 13. UPDATED_AT TRIGGERS
-- ============================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'lead_scores', 'chat_templates', 'nps_surveys',
    'sla_configs', 'lead_distribution_rules'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at()
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ============================================
-- DONE!
-- ============================================
