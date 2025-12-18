-- =====================================================
-- CAMPANHAS WHATSAPP - SCHEMA COMPLETO
-- =====================================================
-- Executar no Supabase SQL Editor
-- =====================================================

-- 1. TEMPLATES HSM
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  instance_id UUID,
  
  -- Meta info
  meta_template_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  language VARCHAR(10) DEFAULT 'pt_BR',
  
  -- Categoria
  category VARCHAR(50) DEFAULT 'MARKETING', -- MARKETING, UTILITY, AUTHENTICATION
  
  -- Status na Meta
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, paused, disabled
  rejection_reason TEXT,
  
  -- Componentes
  header_type VARCHAR(20), -- none, text, image, video, document
  header_text TEXT,
  header_media_url TEXT,
  
  body_text TEXT NOT NULL,
  body_variables INTEGER DEFAULT 0,
  
  footer_text TEXT,
  
  -- Botões
  buttons JSONB DEFAULT '[]',
  
  -- Uso
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SEGMENTOS DE AUDIÊNCIA
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  filters JSONB NOT NULL DEFAULT '{}',
  
  contact_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  
  is_dynamic BOOLEAN DEFAULT true,
  
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CAMPANHAS
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  instance_id UUID,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(20) DEFAULT 'broadcast',
  
  status VARCHAR(20) DEFAULT 'draft',
  
  template_id UUID REFERENCES whatsapp_templates(id),
  template_name VARCHAR(255),
  template_variables JSONB DEFAULT '{}',
  
  media_url TEXT,
  media_type VARCHAR(20),
  
  audience_type VARCHAR(20) DEFAULT 'all',
  audience_tags TEXT[],
  audience_segment_id UUID REFERENCES whatsapp_segments(id),
  audience_filters JSONB DEFAULT '{}',
  audience_count INTEGER DEFAULT 0,
  
  imported_contacts JSONB,
  
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  
  messages_per_second INTEGER DEFAULT 10,
  batch_size INTEGER DEFAULT 100,
  delay_between_batches INTEGER DEFAULT 1000,
  
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_read INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_opted_out INTEGER DEFAULT 0,
  
  attributed_revenue DECIMAL(12,2) DEFAULT 0,
  attributed_orders INTEGER DEFAULT 0,
  attribution_window_hours INTEGER DEFAULT 72,
  
  cost_per_message DECIMAL(6,4) DEFAULT 0.05,
  total_cost DECIMAL(12,2) DEFAULT 0,
  
  created_by UUID,
  created_by_name VARCHAR(255),
  updated_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DESTINATÁRIOS DA CAMPANHA
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id UUID,
  
  phone_number VARCHAR(20) NOT NULL,
  contact_name VARCHAR(255),
  
  status VARCHAR(20) DEFAULT 'pending',
  
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  
  error_code VARCHAR(50),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  message_id UUID,
  meta_message_id VARCHAR(255),
  
  resolved_variables JSONB DEFAULT '{}',
  
  conversion_value DECIMAL(12,2),
  conversion_order_id VARCHAR(255),
  converted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LOGS DE EXECUÇÃO
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  
  log_type VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_templates_org ON whatsapp_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_status ON whatsapp_templates(status);
CREATE INDEX IF NOT EXISTS idx_segments_org ON whatsapp_segments(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON whatsapp_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON whatsapp_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON whatsapp_campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON whatsapp_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON whatsapp_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status ON whatsapp_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_recipients_meta_msg ON whatsapp_campaign_recipients(meta_message_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON whatsapp_campaign_logs(campaign_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Função para atualizar métricas da campanha
CREATE OR REPLACE FUNCTION update_campaign_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE whatsapp_campaigns
  SET
    total_sent = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status IN ('sent', 'delivered', 'read', 'clicked', 'replied')),
    total_delivered = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status IN ('delivered', 'read', 'clicked', 'replied')),
    total_read = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status IN ('read', 'clicked', 'replied')),
    total_clicked = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status IN ('clicked', 'replied')),
    total_replied = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status = 'replied'),
    total_failed = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
    total_opted_out = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = NEW.campaign_id AND status = 'opted_out'),
    updated_at = NOW()
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_campaign_metrics ON whatsapp_campaign_recipients;
CREATE TRIGGER trigger_update_campaign_metrics
  AFTER UPDATE OF status ON whatsapp_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION update_campaign_metrics();

-- Função para logar ação da campanha
CREATE OR REPLACE FUNCTION log_campaign_action(
  p_campaign_id UUID,
  p_log_type VARCHAR(20),
  p_message TEXT,
  p_details JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_log_id UUID;
BEGIN
  INSERT INTO whatsapp_campaign_logs (campaign_id, log_type, message, details)
  VALUES (p_campaign_id, p_log_type, p_message, p_details)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_org_access" ON whatsapp_templates;
CREATE POLICY "templates_org_access" ON whatsapp_templates FOR ALL USING (true);

DROP POLICY IF EXISTS "segments_org_access" ON whatsapp_segments;
CREATE POLICY "segments_org_access" ON whatsapp_segments FOR ALL USING (true);

DROP POLICY IF EXISTS "campaigns_org_access" ON whatsapp_campaigns;
CREATE POLICY "campaigns_org_access" ON whatsapp_campaigns FOR ALL USING (true);

DROP POLICY IF EXISTS "recipients_campaign_access" ON whatsapp_campaign_recipients;
CREATE POLICY "recipients_campaign_access" ON whatsapp_campaign_recipients FOR ALL USING (true);

DROP POLICY IF EXISTS "logs_campaign_access" ON whatsapp_campaign_logs;
CREATE POLICY "logs_campaign_access" ON whatsapp_campaign_logs FOR ALL USING (true);

-- =====================================================
-- DADOS DE EXEMPLO
-- =====================================================
INSERT INTO whatsapp_templates (organization_id, name, category, status, body_text, body_variables, buttons)
VALUES 
  ('00000000-0000-0000-0000-000000000000', 'welcome_message', 'UTILITY', 'approved',
   'Olá {{1}}! 👋 Bem-vindo à nossa loja!', 1, '[]'),
  ('00000000-0000-0000-0000-000000000000', 'order_confirmation', 'UTILITY', 'approved',
   'Olá {{1}}! ✅ Pedido #{{2}} confirmado. Valor: R$ {{3}}', 3,
   '[{"type": "URL", "text": "Acompanhar", "url": "https://loja.com/pedido/{{2}}"}]'),
  ('00000000-0000-0000-0000-000000000000', 'promo_blackfriday', 'MARKETING', 'approved',
   '🔥 BLACK FRIDAY! {{1}}, {{2}}% OFF! Cupom: {{3}}', 3,
   '[{"type": "URL", "text": "🛒 Comprar", "url": "https://loja.com/bf"}]'),
  ('00000000-0000-0000-0000-000000000000', 'abandoned_cart', 'MARKETING', 'approved',
   'Oi {{1}}! 🛒 Itens no carrinho esperando. Frete grátis!', 1,
   '[{"type": "URL", "text": "Finalizar", "url": "https://loja.com/cart"}]'),
  ('00000000-0000-0000-0000-000000000000', 'feedback_request', 'MARKETING', 'approved',
   'Olá {{1}}! 😊 Como foi sua experiência?', 1,
   '[{"type": "QUICK_REPLY", "text": "😍 Ótima!"}, {"type": "QUICK_REPLY", "text": "😐 Regular"}]')
ON CONFLICT DO NOTHING;
