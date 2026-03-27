-- =====================================================
-- SQL COMPLETO — Tabelas para o sistema funcionar 100%
-- Branch: claude/flows-email-analytics-setup-ghs4z
-- Execute no Supabase SQL Editor (em ordem)
-- =====================================================

-- =====================================================
-- 1. COLUNAS NOVAS NA TABELA organizations
-- (tabela já existe, adicionamos colunas faltantes)
-- =====================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cnpj VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state VARCHAR(2);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

-- =====================================================
-- 2. COLUNAS NOVAS NA TABELA organization_members
-- (tabela já existe, adicionamos colunas faltantes)
-- =====================================================

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- =====================================================
-- 3. COLUNAS NOVAS NA TABELA profiles
-- (tabela já existe, adicionamos colunas faltantes)
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- =====================================================
-- 4. TABELA: coupons (CRUD completo de cupons)
-- =====================================================

CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_purchase NUMERIC(10,2),
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

-- Colunas que podem faltar se tabela já existia de execução anterior
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS type VARCHAR(20);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_purchase NUMERIC(10,2);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS uses_count INTEGER DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_coupons_org ON coupons(organization_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(organization_id, is_active);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupons_all" ON coupons;
CREATE POLICY "coupons_all" ON coupons FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 5. TABELA: media_files (biblioteca de mídia)
-- =====================================================

CREATE TABLE IF NOT EXISTS media_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  url TEXT DEFAULT '',
  size BIGINT DEFAULT 0,
  type VARCHAR(50) DEFAULT 'image',
  mime_type VARCHAR(100),
  base64_data TEXT,
  width INTEGER,
  height INTEGER,
  alt_text VARCHAR(500),
  folder VARCHAR(255) DEFAULT '',
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem faltar se tabela já existia
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS name VARCHAR(500);
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS url TEXT DEFAULT '';
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS size BIGINT DEFAULT 0;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'image';
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS base64_data TEXT;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS alt_text VARCHAR(500);
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS folder VARCHAR(255) DEFAULT '';
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS uploaded_by UUID;

CREATE INDEX IF NOT EXISTS idx_media_files_org ON media_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_files_type ON media_files(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_media_files_folder ON media_files(organization_id, folder);

ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "media_files_all" ON media_files;
CREATE POLICY "media_files_all" ON media_files FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 6. TABELA: email_campaigns (campanhas de email)
-- =====================================================

CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  from_name VARCHAR(255),
  from_email VARCHAR(255),
  reply_to VARCHAR(255),
  html_content TEXT,
  text_content TEXT,
  template_id UUID,
  list_id UUID,
  segment_id UUID,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  total_complained INTEGER DEFAULT 0,
  open_rate NUMERIC(5,2) DEFAULT 0,
  click_rate NUMERIC(5,2) DEFAULT 0,
  bounce_rate NUMERIC(5,2) DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem faltar se tabela já existia
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS subject VARCHAR(500);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_name VARCHAR(255);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_email VARCHAR(255);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS reply_to VARCHAR(255);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS text_content TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS list_id UUID;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS segment_id UUID;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_recipients INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_sent INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_delivered INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_opened INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_clicked INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_bounced INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_unsubscribed INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS total_complained INTEGER DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS open_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS click_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS bounce_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_org ON email_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent ON email_campaigns(sent_at DESC);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_campaigns_all" ON email_campaigns;
CREATE POLICY "email_campaigns_all" ON email_campaigns FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 7. TABELA: email_sends (envios individuais de email)
-- =====================================================

CREATE TABLE IF NOT EXISTS email_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  contact_id UUID,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  from_email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'complained')),
  -- Timestamps de tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  complained_at TIMESTAMPTZ,
  -- Dados extras
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  bounce_type VARCHAR(50),
  bounce_message TEXT,
  error_message TEXT,
  provider VARCHAR(50),
  provider_message_id VARCHAR(255),
  ip_address VARCHAR(50),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem faltar se tabela já existia
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS campaign_id UUID;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS subject VARCHAR(500);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS from_email VARCHAR(255);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'queued';
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(50);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS bounce_message TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_email_sends_org ON email_sends(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_email_sends_created ON email_sends(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_sends_email ON email_sends(email);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_sends_all" ON email_sends;
CREATE POLICY "email_sends_all" ON email_sends FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 8. TABELA: api_keys (chaves de API)
-- Se já existe, apenas adicionar colunas faltantes
-- =====================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  name VARCHAR(255) NOT NULL DEFAULT 'API Key',
  key VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(20),
  scopes JSONB DEFAULT '["read", "write"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem faltar se tabela já existia
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key TEXT DEFAULT '';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(20);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT 'API Key';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '["read", "write"]'::jsonb;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_all" ON api_keys;
CREATE POLICY "api_keys_all" ON api_keys FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 9. TABELA: audit_logs (log de atividades)
-- Se já existe, ok. Se não, criar.
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  user_email VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem faltar se tabela já existia
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_all" ON audit_logs;
CREATE POLICY "audit_logs_all" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 10. TABELA: form_submissions (caso não exista)
-- Usada pelo /api/public/forms/[id]/submit
-- =====================================================

CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id UUID NOT NULL,
  contact_id UUID,
  email VARCHAR(255),
  name VARCHAR(255),
  phone VARCHAR(50),
  custom_fields JSONB DEFAULT '{}'::jsonb,
  source VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem faltar se tabela já existia
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS form_id UUID;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS referrer TEXT;

CREATE INDEX IF NOT EXISTS idx_form_submissions_org ON form_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_contact ON form_submissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created ON form_submissions(created_at DESC);

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form_submissions_all" ON form_submissions;
CREATE POLICY "form_submissions_all" ON form_submissions FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 11. FUNCTIONS ÚTEIS
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at para tabelas novas
DROP TRIGGER IF EXISTS set_updated_at ON coupons;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON media_files;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON media_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON email_campaigns;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON email_sends;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_sends
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 12. GRANT PERMISSIONS (Supabase service role)
-- =====================================================

GRANT ALL ON coupons TO authenticated, service_role;
GRANT ALL ON media_files TO authenticated, service_role;
GRANT ALL ON email_campaigns TO authenticated, service_role;
GRANT ALL ON email_sends TO authenticated, service_role;
GRANT ALL ON api_keys TO authenticated, service_role;
GRANT ALL ON audit_logs TO authenticated, service_role;
GRANT ALL ON form_submissions TO authenticated, service_role;

-- =====================================================
-- PRONTO! Execute este SQL no Supabase SQL Editor.
-- Todas as tabelas e colunas necessárias para o sistema
-- funcionar 100% serão criadas/atualizadas.
-- =====================================================
