-- ============================================================
-- CRM FORMS - MIGRATION COMPLETA E IDEMPOTENTE
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. TABELA: crm_forms
CREATE TABLE IF NOT EXISTS crm_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  -- Visual / Theme (JSONB com todas as propriedades do Design tab)
  theme JSONB DEFAULT '{
    "primaryColor": "#6366f1",
    "backgroundColor": "#ffffff",
    "textColor": "#1f2937",
    "borderRadius": 12,
    "fontFamily": "Inter",
    "fontSize": 14,
    "hideLabels": false,
    "hideTitle": false,
    "inputBackgroundColor": "#ffffff",
    "inputBorderColor": "#e5e7eb",
    "headline": "",
    "subheadline": "",
    "buttonText": "Enviar"
  }'::jsonb,
  logo_url TEXT,
  success_message TEXT DEFAULT 'Obrigado! Sua resposta foi registrada com sucesso.',
  redirect_url TEXT,

  -- Tracking
  facebook_pixel_id TEXT,
  google_ads_id TEXT,
  google_analytics_id TEXT,

  -- Contadores
  submissions_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_forms_org_slug ON crm_forms(organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_crm_forms_org ON crm_forms(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_pipeline ON crm_forms(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_status ON crm_forms(status);

-- RLS
ALTER TABLE crm_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_forms_org_policy" ON crm_forms;
CREATE POLICY "crm_forms_org_policy" ON crm_forms
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );


-- 2. TABELA: crm_form_fields
CREATE TABLE IF NOT EXISTS crm_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,

  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'email', 'phone', 'number', 'textarea',
    'select', 'multi_select', 'radio', 'checkbox',
    'date', 'url', 'cpf', 'cnpj', 'cep', 'hidden'
  )),
  label TEXT NOT NULL,
  placeholder TEXT,
  description TEXT,
  required BOOLEAN DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,

  options JSONB DEFAULT '[]',
  validation JSONB DEFAULT '{}',
  map_to_contact_field TEXT,
  conditional JSONB DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_fields_form ON crm_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_fields_position ON crm_form_fields(form_id, position);

ALTER TABLE crm_form_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_form_fields_policy" ON crm_form_fields;
CREATE POLICY "crm_form_fields_policy" ON crm_form_fields
  FOR ALL USING (
    form_id IN (SELECT id FROM crm_forms WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    form_id IN (SELECT id FROM crm_forms WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );


-- 3. TABELA: crm_form_submissions
CREATE TABLE IF NOT EXISTS crm_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

  answers JSONB NOT NULL DEFAULT '{}',

  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  events_fired JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_form ON crm_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_org ON crm_form_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_contact ON crm_form_submissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_deal ON crm_form_submissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_status ON crm_form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_created ON crm_form_submissions(created_at DESC);

ALTER TABLE crm_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_form_submissions_policy" ON crm_form_submissions;
CREATE POLICY "crm_form_submissions_policy" ON crm_form_submissions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );


-- 4. TABELA: crm_form_events
CREATE TABLE IF NOT EXISTS crm_form_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'on_submit', 'on_condition', 'on_page_view', 'on_stage_change', 'manual'
  )),

  send_to_facebook BOOLEAN DEFAULT false,
  send_to_google BOOLEAN DEFAULT false,

  event_value DECIMAL(10,2) DEFAULT NULL,
  event_currency TEXT DEFAULT 'BRL',

  conditions JSONB DEFAULT '[]',
  target_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  is_active BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_events_form ON crm_form_events(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_events_active ON crm_form_events(form_id, is_active);

ALTER TABLE crm_form_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_form_events_policy" ON crm_form_events;
CREATE POLICY "crm_form_events_policy" ON crm_form_events
  FOR ALL USING (
    form_id IN (SELECT id FROM crm_forms WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    form_id IN (SELECT id FROM crm_forms WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );


-- 5. TABELA: crm_form_event_logs
CREATE TABLE IF NOT EXISTS crm_form_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES crm_form_events(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES crm_form_submissions(id) ON DELETE SET NULL,
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'google')),
  event_name TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  response_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_event_logs_event ON crm_form_event_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_event_logs_form ON crm_form_event_logs(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_event_logs_org ON crm_form_event_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_event_logs_status ON crm_form_event_logs(status);

ALTER TABLE crm_form_event_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_form_event_logs_policy" ON crm_form_event_logs;
CREATE POLICY "crm_form_event_logs_policy" ON crm_form_event_logs
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );


-- 6. TABELA: google_ads_accounts
CREATE TABLE IF NOT EXISTS google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  customer_id TEXT NOT NULL,
  name TEXT,
  access_token TEXT,
  refresh_token TEXT,

  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'connected',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_accounts_org ON google_ads_accounts(organization_id);

ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "google_ads_accounts_policy" ON google_ads_accounts;
CREATE POLICY "google_ads_accounts_policy" ON google_ads_accounts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- 7. FUNCOES E TRIGGERS
-- ============================================================

-- Incrementar submissions_count automaticamente
CREATE OR REPLACE FUNCTION increment_form_submissions()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_forms
  SET submissions_count = submissions_count + 1,
      updated_at = NOW()
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_increment_form_submissions ON crm_form_submissions;
CREATE TRIGGER trg_increment_form_submissions
  AFTER INSERT ON crm_form_submissions
  FOR EACH ROW EXECUTE FUNCTION increment_form_submissions();

-- Incrementar views_count (chamado via RPC)
CREATE OR REPLACE FUNCTION increment_form_views(p_form_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_forms
  SET views_count = views_count + 1
  WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para updated_at automatico
CREATE OR REPLACE FUNCTION update_crm_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_forms_updated_at ON crm_forms;
CREATE TRIGGER trg_crm_forms_updated_at
  BEFORE UPDATE ON crm_forms
  FOR EACH ROW EXECUTE FUNCTION update_crm_forms_updated_at();

DROP TRIGGER IF EXISTS trg_crm_form_events_updated_at ON crm_form_events;
CREATE TRIGGER trg_crm_form_events_updated_at
  BEFORE UPDATE ON crm_form_events
  FOR EACH ROW EXECUTE FUNCTION update_crm_forms_updated_at();


-- ============================================================
-- 8. GRANTS para service_role e anon (necessario para APIs publicas)
-- ============================================================

-- O service_role ja tem acesso total, mas garantir grants explicitamente
GRANT ALL ON crm_forms TO service_role;
GRANT ALL ON crm_form_fields TO service_role;
GRANT ALL ON crm_form_submissions TO service_role;
GRANT ALL ON crm_form_events TO service_role;
GRANT ALL ON crm_form_event_logs TO service_role;
GRANT ALL ON google_ads_accounts TO service_role;

-- Anon precisa ler forms publicados e submeter respostas
GRANT SELECT ON crm_forms TO anon;
GRANT SELECT ON crm_form_fields TO anon;
GRANT INSERT ON crm_form_submissions TO anon;

-- Garantir que o anon pode executar a funcao de views
GRANT EXECUTE ON FUNCTION increment_form_views(UUID) TO anon;
GRANT EXECUTE ON FUNCTION increment_form_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_form_submissions() TO anon;
GRANT EXECUTE ON FUNCTION increment_form_submissions() TO authenticated;


-- ============================================================
-- 9. COMENTARIOS
-- ============================================================

COMMENT ON TABLE crm_forms IS 'Formularios de captacao de leads para CRM';
COMMENT ON TABLE crm_form_fields IS 'Campos configuraveis dos formularios';
COMMENT ON TABLE crm_form_submissions IS 'Respostas/submissoes dos formularios';
COMMENT ON TABLE crm_form_events IS 'Regras de eventos para Facebook/Google Ads';
COMMENT ON TABLE crm_form_event_logs IS 'Log de eventos disparados para plataformas de ads';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
