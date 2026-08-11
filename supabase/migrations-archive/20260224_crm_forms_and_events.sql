-- ============================================================
-- CRM FORMS, SUBMISSIONS, PIPELINE LEADS & AD EVENTS
-- Migration: 20260224_crm_forms_and_events.sql
-- ============================================================

-- 1. CRM FORMS - Formulários criados pelo usuário
CREATE TABLE IF NOT EXISTS crm_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  -- Configurações visuais
  theme JSONB DEFAULT '{"primaryColor": "#6366f1", "backgroundColor": "#ffffff", "textColor": "#1f2937", "borderRadius": 12, "fontFamily": "Inter"}',
  logo_url TEXT,
  success_message TEXT DEFAULT 'Obrigado! Sua resposta foi registrada com sucesso.',
  redirect_url TEXT,

  -- Configurações de tracking
  facebook_pixel_id TEXT,
  google_ads_id TEXT,
  google_analytics_id TEXT,

  -- Contagem
  submissions_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único para slug por organização
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_forms_org_slug ON crm_forms(organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_crm_forms_org ON crm_forms(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_pipeline ON crm_forms(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_status ON crm_forms(status);

-- RLS
ALTER TABLE crm_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_forms_org_policy" ON crm_forms
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- 2. CRM FORM FIELDS - Campos do formulário
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

  -- Configurações específicas do campo
  options JSONB DEFAULT '[]', -- Para select, radio, checkbox: [{"label": "Opção 1", "value": "opcao_1"}]
  validation JSONB DEFAULT '{}', -- {"min": 0, "max": 100, "pattern": "regex", "minLength": 1, "maxLength": 500}

  -- Mapeamento com contato CRM
  map_to_contact_field TEXT, -- "name", "email", "phone", "company", ou custom field ID

  -- Condição para exibir (lógica condicional)
  conditional JSONB DEFAULT NULL, -- {"field_id": "uuid", "operator": "equals", "value": "X"}

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_fields_form ON crm_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_fields_position ON crm_form_fields(form_id, position);

ALTER TABLE crm_form_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_form_fields_policy" ON crm_form_fields
  FOR ALL USING (
    form_id IN (SELECT id FROM crm_forms WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );

-- 3. CRM FORM SUBMISSIONS - Respostas submetidas
CREATE TABLE IF NOT EXISTS crm_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Dados do lead
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

  -- Respostas (JSON com todas as respostas)
  answers JSONB NOT NULL DEFAULT '{}', -- {"field_id": "value", ...}

  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),

  -- Eventos disparados
  events_fired JSONB DEFAULT '[]', -- [{"event": "Lead", "platform": "facebook", "fired_at": "2024-01-01T00:00:00Z"}]

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_form ON crm_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_org ON crm_form_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_contact ON crm_form_submissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_deal ON crm_form_submissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_status ON crm_form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_created ON crm_form_submissions(created_at DESC);

ALTER TABLE crm_form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_form_submissions_policy" ON crm_form_submissions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- 4. CRM FORM EVENTS - Eventos para Facebook/Google Ads
CREATE TABLE IF NOT EXISTS crm_form_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,

  name TEXT NOT NULL, -- "Lead", "Lead Qualificado", "Reunião Marcada", etc.
  event_name TEXT NOT NULL, -- Nome do evento enviado para as plataformas: "Lead", "CompleteRegistration", "Schedule", custom
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'on_submit',        -- Quando o formulário é submetido
    'on_condition',     -- Quando condições específicas são atendidas
    'on_page_view',     -- Quando lead visita a página de obrigado
    'on_stage_change',  -- Quando lead muda de estágio no pipeline
    'manual'            -- Disparado manualmente
  )),

  -- Plataformas para enviar
  send_to_facebook BOOLEAN DEFAULT false,
  send_to_google BOOLEAN DEFAULT false,

  -- Valor do evento (para otimização)
  event_value DECIMAL(10,2) DEFAULT NULL,
  event_currency TEXT DEFAULT 'BRL',

  -- Condições (para trigger_type = 'on_condition')
  conditions JSONB DEFAULT '[]',
  -- [{"field_id": "uuid", "operator": "equals|contains|greater_than|less_than|in", "value": "X"}]
  -- Se múltiplas condições: AND entre elas

  -- Para on_stage_change
  target_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  -- Controle
  is_active BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_events_form ON crm_form_events(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_events_active ON crm_form_events(form_id, is_active);

ALTER TABLE crm_form_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_form_events_policy" ON crm_form_events
  FOR ALL USING (
    form_id IN (SELECT id FROM crm_forms WHERE organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );

-- 5. CRM FORM EVENT LOG - Log de eventos disparados
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
CREATE POLICY "crm_form_event_logs_policy" ON crm_form_event_logs
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- 6. Funções auxiliares

-- Incrementar contador de submissions
CREATE OR REPLACE FUNCTION increment_form_submissions()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_forms
  SET submissions_count = submissions_count + 1,
      updated_at = NOW()
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_form_submissions ON crm_form_submissions;
CREATE TRIGGER trg_increment_form_submissions
  AFTER INSERT ON crm_form_submissions
  FOR EACH ROW EXECUTE FUNCTION increment_form_submissions();

-- Incrementar contador de views
CREATE OR REPLACE FUNCTION increment_form_views(p_form_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_forms
  SET views_count = views_count + 1
  WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Dados iniciais de exemplo (para facilitar testes)
-- Isso cria um template de formulário padrão que pode ser clonado

COMMENT ON TABLE crm_forms IS 'Formulários de captação de leads para CRM';
COMMENT ON TABLE crm_form_fields IS 'Campos configuráveis dos formulários';
COMMENT ON TABLE crm_form_submissions IS 'Respostas/submissões dos formulários';
COMMENT ON TABLE crm_form_events IS 'Regras de eventos para Facebook/Google Ads';
COMMENT ON TABLE crm_form_event_logs IS 'Log de eventos disparados para plataformas de ads';

-- 8. Google Ads integration config (se não existir)
CREATE TABLE IF NOT EXISTS google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  customer_id TEXT NOT NULL, -- Google Ads Customer ID
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
CREATE POLICY "google_ads_accounts_policy" ON google_ads_accounts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
