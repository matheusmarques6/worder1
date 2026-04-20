-- ============================================================
-- WORDER WhatsApp — ADDITIVE MIGRATION (compatible com schema existente)
-- ============================================================
-- Este SQL APENAS ADICIONA o que falta. Preserva dados e estrutura existente.
-- Rode no Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. TABELAS EXISTENTES: adicionar colunas novas (sem remover nada)
-- ============================================================

-- whatsapp_conversations: novos campos para multi-atendimento, IA e service window
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS queue_id UUID;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ai_agent_id UUID;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS service_window_expires_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS is_contact_initiated BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'organic';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ad_referral JSONB;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS store_id UUID;

-- Campos alias para compatibilidade com novo codigo (sem perder campos antigos)
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS assigned_agent_id UUID;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS bot_active BOOLEAN DEFAULT true;

-- Backfill: preenche novas colunas com valores das colunas antigas existentes
UPDATE whatsapp_conversations
SET contact_phone = COALESCE(contact_phone, REPLACE(REPLACE(remote_jid, '@s.whatsapp.net', ''), '@c.us', ''))
WHERE contact_phone IS NULL AND remote_jid IS NOT NULL;

UPDATE whatsapp_conversations
SET contact_name = COALESCE(contact_name, push_name)
WHERE contact_name IS NULL AND push_name IS NOT NULL;

UPDATE whatsapp_conversations
SET contact_avatar_url = COALESCE(contact_avatar_url, profile_picture_url)
WHERE contact_avatar_url IS NULL AND profile_picture_url IS NOT NULL;

UPDATE whatsapp_conversations
SET assigned_agent_id = COALESCE(assigned_agent_id, assigned_to)
WHERE assigned_agent_id IS NULL AND assigned_to IS NOT NULL;

UPDATE whatsapp_conversations
SET bot_active = COALESCE(bot_active, chatbot_enabled)
WHERE bot_active IS NULL AND chatbot_enabled IS NOT NULL;

-- Indices novos (nao colidem com existentes pois nomes sao diferentes)
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_queue ON whatsapp_conversations(queue_id) WHERE queue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_ai_agent ON whatsapp_conversations(ai_agent_id) WHERE ai_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_store ON whatsapp_conversations(organization_id, store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_contact_phone ON whatsapp_conversations(organization_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_assigned_agent ON whatsapp_conversations(assigned_agent_id);

-- ============================================================
-- whatsapp_messages: novos campos para Meta API, IA e sistema
-- ============================================================
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS wamid TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS interactive_data JSONB;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'agent';
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS is_internal_note BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS template_data JSONB;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS context_wamid TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_id TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS is_from_me BOOLEAN DEFAULT false;

-- Backfill wamid a partir de message_id (id do WhatsApp)
UPDATE whatsapp_messages SET wamid = message_id WHERE wamid IS NULL AND message_id IS NOT NULL;
UPDATE whatsapp_messages SET is_from_me = from_me WHERE is_from_me IS NULL AND from_me IS NOT NULL;

-- Indice unico em wamid (dedup Meta webhook)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid
  ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;

-- ============================================================
-- whatsapp_instances: novos campos para Meta Cloud API
-- ============================================================
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS display_phone TEXT;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS webhook_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS daily_limit INTEGER NOT NULL DEFAULT 250;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS api_version TEXT NOT NULL DEFAULT 'v21.0';
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS quality_rating TEXT DEFAULT 'GREEN';
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS store_id UUID;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_phone_number_id
  ON whatsapp_instances(phone_number_id) WHERE phone_number_id IS NOT NULL;

-- ============================================================
-- 2. NOVAS TABELAS (nao existiam antes)
-- ============================================================

-- Queues / Filas de atendimento
CREATE TABLE IF NOT EXISTS whatsapp_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  greeting_message TEXT,
  out_of_hours_message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queues_org ON whatsapp_queues(organization_id);

-- Queue agents (relacionamento agente <-> fila)
CREATE TABLE IF NOT EXISTS whatsapp_queue_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES whatsapp_queues(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_queue_agents_unique
  ON whatsapp_queue_agents(queue_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_agents_agent
  ON whatsapp_queue_agents(agent_id);

-- Notas internas (apenas agentes)
CREATE TABLE IF NOT EXISTS whatsapp_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  agent_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notes_conversation
  ON whatsapp_notes(conversation_id, created_at DESC);

-- Log de transferencias
CREATE TABLE IF NOT EXISTS whatsapp_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  from_agent_id UUID,
  from_agent_name TEXT,
  to_agent_id UUID,
  to_agent_name TEXT,
  from_queue_id UUID,
  to_queue_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_transfers_conversation
  ON whatsapp_transfers(conversation_id);

-- Quick Replies (respostas rapidas /slash)
CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  shortcut TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_quick_replies_shortcut
  ON whatsapp_quick_replies(organization_id, shortcut);

-- Agentes IA
CREATE TABLE IF NOT EXISTS whatsapp_ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'support',
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt TEXT NOT NULL DEFAULT '',
  knowledge_base TEXT DEFAULT '',
  temperature NUMERIC(2,1) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 500,
  handoff_keywords TEXT[] DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'auto',
  max_interactions INTEGER DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_conversations INTEGER NOT NULL DEFAULT 0,
  total_messages INTEGER NOT NULL DEFAULT 0,
  avg_satisfaction NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_agents_org ON whatsapp_ai_agents(organization_id);

-- Opt-in / Opt-out
CREATE TABLE IF NOT EXISTS whatsapp_opt_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  contact_id UUID,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'opted_in',
  opted_in_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  opt_in_source TEXT DEFAULT 'manual',
  opt_out_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_opt_status_phone
  ON whatsapp_opt_status(organization_id, phone);

-- Horario de atendimento
CREATE TABLE IF NOT EXISTS whatsapp_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  out_of_hours_message TEXT,
  out_of_hours_bot_id UUID,
  enable_auto_reply BOOLEAN NOT NULL DEFAULT true,
  enable_bot_outside_hours BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_business_hours_day
  ON whatsapp_business_hours(organization_id, store_id, day_of_week);

-- CSAT ratings
CREATE TABLE IF NOT EXISTS whatsapp_csat_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id UUID,
  agent_id UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_csat_conversation
  ON whatsapp_csat_ratings(conversation_id);

-- RFM scores
CREATE TABLE IF NOT EXISTS contact_rfm_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID NOT NULL,
  recency_score INTEGER NOT NULL DEFAULT 1,
  frequency_score INTEGER NOT NULL DEFAULT 1,
  monetary_score INTEGER NOT NULL DEFAULT 1,
  rfm_segment TEXT NOT NULL DEFAULT 'new',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  days_since_last_order INTEGER,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rfm_contact
  ON contact_rfm_scores(organization_id, contact_id);

-- Product interests (back-in-stock)
CREATE TABLE IF NOT EXISTS whatsapp_product_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  contact_id UUID,
  phone TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT,
  variant_id TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_product_interests
  ON whatsapp_product_interests(organization_id, product_id, notified);

-- Widget config
CREATE TABLE IF NOT EXISTS whatsapp_widget_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  store_id UUID,
  instance_id UUID,
  phone_number TEXT NOT NULL,
  welcome_message TEXT DEFAULT 'Ola! Como posso ajudar?',
  position TEXT NOT NULL DEFAULT 'right',
  color TEXT NOT NULL DEFAULT '#25D366',
  delay_seconds INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_widget_org_store
  ON whatsapp_widget_config(organization_id, store_id);

-- Payment links
CREATE TABLE IF NOT EXISTS whatsapp_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  contact_id UUID,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  description TEXT,
  payment_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_payment_conversation
  ON whatsapp_payment_links(conversation_id);

-- Agent status (online/away/offline)
CREATE TABLE IF NOT EXISTS whatsapp_agent_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  active_conversations INTEGER NOT NULL DEFAULT 0,
  max_conversations INTEGER NOT NULL DEFAULT 10,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_agent_status_unique
  ON whatsapp_agent_status(agent_id, organization_id);

-- ============================================================
-- 3. RLS basico nas NOVAS tabelas apenas
-- ============================================================

ALTER TABLE whatsapp_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_queue_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_opt_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_csat_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_rfm_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_product_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_widget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agent_status ENABLE ROW LEVEL SECURITY;

-- Helper (cria se nao existir)
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
$$;

-- Policies nas NOVAS tabelas
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_queues','whatsapp_queue_agents','whatsapp_notes',
    'whatsapp_transfers','whatsapp_quick_replies','whatsapp_ai_agents',
    'whatsapp_opt_status','whatsapp_business_hours','whatsapp_csat_ratings',
    'contact_rfm_scores','whatsapp_product_interests','whatsapp_widget_config',
    'whatsapp_payment_links','whatsapp_agent_status'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I FOR ALL USING (organization_id IN (SELECT user_org_ids()))',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- 4. Realtime nas tabelas novas
-- ============================================================
ALTER TABLE whatsapp_notes REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_agent_status REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='whatsapp_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_notes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='whatsapp_agent_status') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_agent_status;
  END IF;
END $$;

-- ============================================================
-- 5. Triggers updated_at (apenas em tabelas novas)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'whatsapp_queues','whatsapp_notes','whatsapp_quick_replies',
    'whatsapp_ai_agents','whatsapp_opt_status','whatsapp_business_hours',
    'whatsapp_widget_config','whatsapp_agent_status','contact_rfm_scores'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()', tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- 6. Funcao round-robin
-- ============================================================
CREATE OR REPLACE FUNCTION assign_agent_round_robin(
  p_organization_id UUID,
  p_queue_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_agent_id UUID;
BEGIN
  SELECT qa.agent_id INTO v_agent_id
  FROM whatsapp_agent_status ast
  JOIN whatsapp_queue_agents qa ON qa.agent_id = ast.agent_id
  WHERE ast.organization_id = p_organization_id
    AND ast.status IN ('online','away')
    AND ast.active_conversations < ast.max_conversations
    AND (p_queue_id IS NULL OR qa.queue_id = p_queue_id)
    AND qa.is_active = true
  ORDER BY ast.active_conversations ASC, ast.last_seen_at DESC
  LIMIT 1;

  IF v_agent_id IS NOT NULL THEN
    UPDATE whatsapp_agent_status
    SET active_conversations = active_conversations + 1
    WHERE agent_id = v_agent_id AND organization_id = p_organization_id;
  END IF;

  RETURN v_agent_id;
END;
$$;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Migracao WhatsApp aplicada com sucesso.' as status;
