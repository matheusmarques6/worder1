-- =====================================================================
-- INTEGRAÇÃO INBOX WHATSAPP ↔ CRM - MIGRAÇÃO COMPLETA
-- =====================================================================
-- Execute este script no Supabase SQL Editor
-- ATENÇÃO: Faça backup antes de executar!
-- =====================================================================

-- =====================================================================
-- PARTE 1: ADICIONAR COLUNAS WHATSAPP NA TABELA CONTACTS
-- =====================================================================

-- 1.1 Colunas de perfil WhatsApp
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_id TEXT; -- ID original do whatsapp_contacts

-- 1.2 Colunas de status
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_by UUID;

-- 1.3 Colunas de métricas de conversa
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_conversations INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_messages_received INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_messages_sent INT DEFAULT 0;

-- 1.4 Colunas de origem/campanha
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_campaign_id UUID;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_contact_channel VARCHAR(50); -- 'whatsapp', 'shopify', 'manual', etc.

-- 1.5 Colunas de endereço (se não existir)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}';

-- 1.6 Coluna para vincular à loja (multi-store)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS store_id UUID;

-- Índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp ON contacts(whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_blocked ON contacts(is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON contacts(last_message_at DESC) WHERE last_message_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_store ON contacts(store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_id ON contacts(whatsapp_id) WHERE whatsapp_id IS NOT NULL;

SELECT '✅ Parte 1 concluída: Colunas adicionadas em contacts' as status;

-- =====================================================================
-- PARTE 2: MIGRAR DADOS DE WHATSAPP_CONTACTS → CONTACTS
-- =====================================================================

-- 2.1 Atualizar contatos existentes que têm match por telefone
UPDATE contacts c
SET 
  profile_picture_url = COALESCE(c.profile_picture_url, wc.profile_picture_url),
  profile_name = COALESCE(c.profile_name, wc.profile_name),
  whatsapp_id = wc.id::text,
  is_blocked = COALESCE(wc.is_blocked, false),
  blocked_reason = wc.blocked_reason,
  blocked_at = wc.blocked_at,
  first_message_at = COALESCE(c.first_message_at, wc.first_message_at),
  last_message_at = GREATEST(c.last_message_at, wc.last_message_at),
  total_conversations = COALESCE(wc.total_conversations, 0),
  total_messages_received = COALESCE(wc.total_messages_received, 0),
  total_messages_sent = COALESCE(wc.total_messages_sent, 0),
  address = COALESCE(c.address, wc.address, '{}'),
  -- Merge tags
  tags = ARRAY(
    SELECT DISTINCT unnest 
    FROM unnest(COALESCE(c.tags, '{}') || COALESCE(wc.tags, '{}'))
  ),
  -- Atualizar whatsapp se não tiver
  whatsapp = COALESCE(c.whatsapp, wc.phone_number),
  -- Atualizar nome se não tiver
  first_name = COALESCE(c.first_name, SPLIT_PART(COALESCE(wc.name, wc.profile_name), ' ', 1)),
  -- Atualizar avatar se não tiver
  avatar_url = COALESCE(c.avatar_url, wc.profile_picture_url),
  -- Atualizar métricas Shopify
  total_orders = GREATEST(c.total_orders, COALESCE(wc.total_orders, 0)),
  total_spent = GREATEST(c.total_spent, COALESCE(wc.total_spent, 0)),
  last_order_at = GREATEST(c.last_order_at, wc.last_order_at),
  shopify_customer_id = COALESCE(c.shopify_customer_id, wc.shopify_customer_id),
  updated_at = NOW()
FROM whatsapp_contacts wc
WHERE c.organization_id = wc.organization_id
  AND (
    c.phone = wc.phone_number 
    OR c.whatsapp = wc.phone_number
    OR REPLACE(REPLACE(c.phone, '+', ''), ' ', '') = REPLACE(REPLACE(wc.phone_number, '+', ''), ' ', '')
  );

SELECT '✅ Parte 2.1 concluída: Contatos existentes atualizados' as status;

-- 2.2 Inserir contatos do WhatsApp que não existem no CRM
INSERT INTO contacts (
  organization_id,
  phone,
  whatsapp,
  first_name,
  last_name,
  avatar_url,
  profile_picture_url,
  profile_name,
  whatsapp_id,
  email,
  source,
  first_contact_channel,
  tags,
  custom_fields,
  address,
  shopify_customer_id,
  total_orders,
  total_spent,
  last_order_at,
  is_blocked,
  blocked_reason,
  blocked_at,
  first_message_at,
  last_message_at,
  total_conversations,
  total_messages_received,
  total_messages_sent,
  created_at,
  updated_at
)
SELECT 
  wc.organization_id,
  wc.phone_number,
  wc.phone_number,
  COALESCE(SPLIT_PART(COALESCE(wc.name, wc.profile_name, wc.phone_number), ' ', 1), wc.phone_number),
  NULLIF(TRIM(SUBSTRING(COALESCE(wc.name, wc.profile_name, '') FROM POSITION(' ' IN COALESCE(wc.name, wc.profile_name, '')) + 1)), ''),
  wc.profile_picture_url,
  wc.profile_picture_url,
  wc.profile_name,
  wc.id::text,
  wc.email,
  COALESCE(wc.source, 'whatsapp'),
  'whatsapp',
  COALESCE(wc.tags, '{}'),
  COALESCE(wc.custom_fields, '{}'),
  COALESCE(wc.address, '{}'),
  wc.shopify_customer_id,
  COALESCE(wc.total_orders, 0),
  COALESCE(wc.total_spent, 0),
  wc.last_order_at,
  COALESCE(wc.is_blocked, false),
  wc.blocked_reason,
  wc.blocked_at,
  wc.first_message_at,
  wc.last_message_at,
  COALESCE(wc.total_conversations, 0),
  COALESCE(wc.total_messages_received, 0),
  COALESCE(wc.total_messages_sent, 0),
  wc.created_at,
  NOW()
FROM whatsapp_contacts wc
WHERE NOT EXISTS (
  SELECT 1 FROM contacts c 
  WHERE c.organization_id = wc.organization_id 
  AND (
    c.phone = wc.phone_number 
    OR c.whatsapp = wc.phone_number
    OR REPLACE(REPLACE(c.phone, '+', ''), ' ', '') = REPLACE(REPLACE(wc.phone_number, '+', ''), ' ', '')
    OR c.whatsapp_id = wc.id::text
  )
);

SELECT '✅ Parte 2.2 concluída: Novos contatos inseridos' as status;

-- =====================================================================
-- PARTE 3: ATUALIZAR WHATSAPP_CONVERSATIONS PARA APONTAR PARA CONTACTS
-- =====================================================================

-- 3.1 Adicionar coluna para novo contact_id (da tabela contacts)
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS unified_contact_id UUID;

-- 3.2 Preencher unified_contact_id com o ID correto da tabela contacts
UPDATE whatsapp_conversations wconv
SET unified_contact_id = c.id
FROM contacts c
WHERE wconv.organization_id = c.organization_id
  AND (
    wconv.phone_number = c.phone 
    OR wconv.phone_number = c.whatsapp
    OR REPLACE(REPLACE(wconv.phone_number, '+', ''), ' ', '') = REPLACE(REPLACE(c.whatsapp, '+', ''), ' ', '')
  )
  AND wconv.unified_contact_id IS NULL;

-- 3.3 Criar índice para o novo campo
CREATE INDEX IF NOT EXISTS idx_conversations_unified_contact 
ON whatsapp_conversations(unified_contact_id) 
WHERE unified_contact_id IS NOT NULL;

SELECT '✅ Parte 3 concluída: Conversas vinculadas a contacts' as status;

-- =====================================================================
-- PARTE 4: CRIAR TABELA CONTACT_ACTIVITIES (UNIFICADA)
-- =====================================================================

CREATE TABLE IF NOT EXISTS contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Contexto opcional
  conversation_id UUID,
  deal_id UUID,
  task_id UUID,
  order_id TEXT,
  invoice_id UUID,
  
  -- Dados da atividade
  activity_type VARCHAR(50) NOT NULL,
  -- Tipos possíveis:
  -- Conversas: 'conversation_started', 'conversation_closed', 'message_sent', 'message_received'
  -- Bot: 'bot_interaction', 'bot_enabled', 'bot_disabled'
  -- Agentes: 'agent_assigned', 'agent_removed'
  -- Tags: 'tag_added', 'tag_removed'
  -- Deals: 'deal_created', 'deal_updated', 'deal_won', 'deal_lost', 'deal_stage_changed'
  -- Pedidos: 'order_placed', 'order_fulfilled', 'order_cancelled', 'cart_abandoned', 'cart_recovered'
  -- Tarefas: 'task_created', 'task_completed', 'task_assigned'
  -- NFs: 'invoice_uploaded', 'invoice_sent'
  -- Contato: 'contact_created', 'contact_updated', 'blocked', 'unblocked'
  -- Campanhas: 'campaign_sent', 'campaign_replied', 'campaign_clicked'
  -- Notas: 'note_added', 'comment_added'
  -- Avaliações: 'rating_received'
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Quem fez
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contact_activities
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact ON contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_org ON contact_activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_type ON contact_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_contact_activities_created ON contact_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_deal ON contact_activities(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_activities_conversation ON contact_activities(conversation_id) WHERE conversation_id IS NOT NULL;

-- RLS para contact_activities
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_activities_select" ON contact_activities;
CREATE POLICY "contact_activities_select" ON contact_activities FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_activities_insert" ON contact_activities;
CREATE POLICY "contact_activities_insert" ON contact_activities FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

SELECT '✅ Parte 4 concluída: Tabela contact_activities criada' as status;

-- =====================================================================
-- PARTE 5: CRIAR TABELA CONTACT_COMMENTS (NOTAS/COMENTÁRIOS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS contact_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Contexto opcional
  conversation_id UUID,
  deal_id UUID,
  task_id UUID,
  
  -- Conteúdo
  content TEXT NOT NULL,
  comment_type VARCHAR(50) DEFAULT 'note', -- 'note', 'call_log', 'meeting_note', 'important', 'follow_up'
  
  -- Destaque
  is_pinned BOOLEAN DEFAULT false,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID,
  
  -- Menções (@usuario)
  mentions UUID[] DEFAULT '{}',
  
  -- Quem criou
  created_by UUID NOT NULL,
  created_by_name VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contact_comments
CREATE INDEX IF NOT EXISTS idx_contact_comments_contact ON contact_comments(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_comments_org ON contact_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_comments_pinned ON contact_comments(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_contact_comments_created ON contact_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_comments_type ON contact_comments(comment_type);
CREATE INDEX IF NOT EXISTS idx_contact_comments_deal ON contact_comments(deal_id) WHERE deal_id IS NOT NULL;

-- RLS para contact_comments
ALTER TABLE contact_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_comments_select" ON contact_comments;
CREATE POLICY "contact_comments_select" ON contact_comments FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_comments_insert" ON contact_comments;
CREATE POLICY "contact_comments_insert" ON contact_comments FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_comments_update" ON contact_comments;
CREATE POLICY "contact_comments_update" ON contact_comments FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_comments_delete" ON contact_comments;
CREATE POLICY "contact_comments_delete" ON contact_comments FOR DELETE USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  AND created_by = auth.uid()
);

SELECT '✅ Parte 5 concluída: Tabela contact_comments criada' as status;

-- =====================================================================
-- PARTE 6: CRIAR TABELA CONTACT_INVOICES (NOTAS FISCAIS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS contact_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Contexto
  deal_id UUID,
  order_id TEXT, -- ID do pedido Shopify
  
  -- Dados da NF
  invoice_number VARCHAR(100),
  invoice_type VARCHAR(20) DEFAULT 'nfe', -- 'nfe', 'nfce', 'nfse', 'outros'
  invoice_series VARCHAR(10),
  invoice_key VARCHAR(50), -- Chave de acesso da NF
  
  -- Valores
  total_value DECIMAL(12, 2),
  tax_value DECIMAL(12, 2),
  discount_value DECIMAL(12, 2),
  
  -- Datas
  issue_date DATE,
  due_date DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'issued', 'cancelled', 'rejected'
  
  -- Arquivos
  pdf_url TEXT,
  xml_url TEXT,
  
  -- Dados parseados do XML
  parsed_data JSONB DEFAULT '{}',
  -- Estrutura esperada:
  -- {
  --   "emitente": { "cnpj": "...", "nome": "...", "endereco": "..." },
  --   "destinatario": { "cpf_cnpj": "...", "nome": "...", "endereco": "..." },
  --   "itens": [{ "descricao": "...", "quantidade": 1, "valor_unitario": 10.00, "valor_total": 10.00 }],
  --   "impostos": { "icms": 0, "ipi": 0, "pis": 0, "cofins": 0 }
  -- }
  
  -- Metadados
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Quem enviou
  uploaded_by UUID,
  uploaded_by_name VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para contact_invoices
CREATE INDEX IF NOT EXISTS idx_contact_invoices_contact ON contact_invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_org ON contact_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_number ON contact_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_key ON contact_invoices(invoice_key) WHERE invoice_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_invoices_deal ON contact_invoices(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_invoices_order ON contact_invoices(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_invoices_status ON contact_invoices(status);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_issue_date ON contact_invoices(issue_date DESC);

-- RLS para contact_invoices
ALTER TABLE contact_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_invoices_select" ON contact_invoices;
CREATE POLICY "contact_invoices_select" ON contact_invoices FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_invoices_insert" ON contact_invoices;
CREATE POLICY "contact_invoices_insert" ON contact_invoices FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_invoices_update" ON contact_invoices;
CREATE POLICY "contact_invoices_update" ON contact_invoices FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "contact_invoices_delete" ON contact_invoices;
CREATE POLICY "contact_invoices_delete" ON contact_invoices FOR DELETE USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

SELECT '✅ Parte 6 concluída: Tabela contact_invoices criada' as status;

-- =====================================================================
-- PARTE 7: MIGRAR DADOS DE WHATSAPP_CONTACT_ACTIVITIES → CONTACT_ACTIVITIES
-- =====================================================================

INSERT INTO contact_activities (
  organization_id,
  contact_id,
  conversation_id,
  deal_id,
  activity_type,
  title,
  description,
  metadata,
  created_by,
  created_by_name,
  created_at
)
SELECT 
  wca.organization_id,
  c.id as contact_id,
  wca.conversation_id,
  wca.related_deal_id,
  wca.activity_type,
  wca.title,
  wca.description,
  COALESCE(wca.metadata, '{}') || 
    CASE WHEN wca.related_order_id IS NOT NULL 
         THEN jsonb_build_object('order_id', wca.related_order_id) 
         ELSE '{}'::jsonb 
    END ||
    CASE WHEN wca.related_campaign_id IS NOT NULL 
         THEN jsonb_build_object('campaign_id', wca.related_campaign_id) 
         ELSE '{}'::jsonb 
    END,
  wca.created_by,
  wca.created_by_name,
  wca.created_at
FROM whatsapp_contact_activities wca
JOIN contacts c ON c.whatsapp_id = wca.contact_id::text
WHERE NOT EXISTS (
  SELECT 1 FROM contact_activities ca 
  WHERE ca.contact_id = c.id 
    AND ca.created_at = wca.created_at 
    AND ca.activity_type = wca.activity_type
);

SELECT '✅ Parte 7 concluída: Atividades migradas' as status;

-- =====================================================================
-- PARTE 8: MIGRAR DADOS DE WHATSAPP_CONTACT_NOTES → CONTACT_COMMENTS
-- =====================================================================

INSERT INTO contact_comments (
  organization_id,
  contact_id,
  conversation_id,
  content,
  comment_type,
  is_pinned,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
SELECT 
  wcn.organization_id,
  c.id as contact_id,
  wcn.conversation_id,
  wcn.content,
  COALESCE(wcn.note_type, 'note'),
  COALESCE(wcn.is_pinned, false),
  wcn.created_by,
  wcn.created_by_name,
  wcn.created_at,
  wcn.updated_at
FROM whatsapp_contact_notes wcn
JOIN contacts c ON c.whatsapp_id = wcn.contact_id::text
WHERE NOT EXISTS (
  SELECT 1 FROM contact_comments cc 
  WHERE cc.contact_id = c.id 
    AND cc.created_at = wcn.created_at 
    AND cc.content = wcn.content
);

SELECT '✅ Parte 8 concluída: Notas migradas para comments' as status;

-- =====================================================================
-- PARTE 9: ATUALIZAR TABELA TASKS PARA USAR CONTACTS
-- =====================================================================

-- 9.1 Adicionar coluna unified_contact_id se não existir
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unified_contact_id UUID;

-- 9.2 Preencher com o contact_id correto
UPDATE tasks t
SET unified_contact_id = c.id
FROM contacts c
WHERE c.whatsapp_id = t.contact_id::text
  AND t.unified_contact_id IS NULL
  AND t.contact_id IS NOT NULL;

-- 9.3 Criar índice
CREATE INDEX IF NOT EXISTS idx_tasks_unified_contact ON tasks(unified_contact_id) WHERE unified_contact_id IS NOT NULL;

SELECT '✅ Parte 9 concluída: Tasks atualizadas' as status;

-- =====================================================================
-- PARTE 10: FUNÇÕES AUXILIARES
-- =====================================================================

-- 10.1 Função para registrar atividade
CREATE OR REPLACE FUNCTION log_contact_activity_unified(
  p_org_id UUID,
  p_contact_id UUID,
  p_activity_type VARCHAR(50),
  p_title VARCHAR(255),
  p_description TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_task_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_created_by UUID DEFAULT NULL,
  p_created_by_name VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO contact_activities (
    organization_id, contact_id, activity_type, title, description,
    conversation_id, deal_id, task_id, metadata, created_by, created_by_name
  )
  VALUES (
    p_org_id, p_contact_id, p_activity_type, p_title, p_description,
    p_conversation_id, p_deal_id, p_task_id, p_metadata, p_created_by, p_created_by_name
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- 10.2 Função para buscar contato completo (para API)
CREATE OR REPLACE FUNCTION get_contact_full(p_contact_id UUID)
RETURNS TABLE (
  -- Dados básicos
  id UUID,
  organization_id UUID,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  company TEXT,
  "position" TEXT,
  avatar_url TEXT,
  
  -- WhatsApp
  profile_picture_url TEXT,
  profile_name TEXT,
  is_blocked BOOLEAN,
  blocked_reason TEXT,
  
  -- Métricas WhatsApp
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  total_conversations INT,
  total_messages_received INT,
  total_messages_sent INT,
  
  -- Métricas Shopify
  shopify_customer_id TEXT,
  total_orders INT,
  total_spent DECIMAL,
  lifetime_value DECIMAL,
  last_order_at TIMESTAMPTZ,
  
  -- Outros
  source TEXT,
  tags TEXT[],
  custom_fields JSONB,
  address JSONB,
  created_at TIMESTAMPTZ,
  
  -- Contagens relacionadas
  deals_count BIGINT,
  deals_won_count BIGINT,
  deals_total_value DECIMAL,
  tasks_pending_count BIGINT,
  invoices_count BIGINT,
  comments_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.organization_id,
    c.email,
    c.phone,
    c.whatsapp,
    c.first_name,
    c.last_name,
    c.full_name,
    c.company,
    c."position",
    c.avatar_url,
    c.profile_picture_url,
    c.profile_name,
    c.is_blocked,
    c.blocked_reason,
    c.first_message_at,
    c.last_message_at,
    c.total_conversations,
    c.total_messages_received,
    c.total_messages_sent,
    c.shopify_customer_id,
    c.total_orders,
    c.total_spent,
    c.lifetime_value,
    c.last_order_at,
    c.source,
    c.tags,
    c.custom_fields,
    c.address,
    c.created_at,
    -- Contagens
    (SELECT COUNT(*) FROM deals d WHERE d.contact_id = c.id)::BIGINT,
    (SELECT COUNT(*) FROM deals d WHERE d.contact_id = c.id AND d.status = 'won')::BIGINT,
    (SELECT COALESCE(SUM(d.value), 0) FROM deals d WHERE d.contact_id = c.id AND d.status = 'won'),
    (SELECT COUNT(*) FROM tasks t WHERE t.unified_contact_id = c.id AND t.status IN ('pending', 'in_progress'))::BIGINT,
    (SELECT COUNT(*) FROM contact_invoices ci WHERE ci.contact_id = c.id)::BIGINT,
    (SELECT COUNT(*) FROM contact_comments cc WHERE cc.contact_id = c.id)::BIGINT
  FROM contacts c
  WHERE c.id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

-- 10.3 Função para buscar contato por telefone (útil para webhook WhatsApp)
CREATE OR REPLACE FUNCTION find_or_create_contact(
  p_org_id UUID,
  p_phone VARCHAR(50),
  p_name VARCHAR(255) DEFAULT NULL,
  p_profile_picture TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
  v_clean_phone VARCHAR(50);
BEGIN
  -- Limpar telefone
  v_clean_phone := REGEXP_REPLACE(p_phone, '[^0-9+]', '', 'g');
  
  -- Buscar contato existente
  SELECT id INTO v_contact_id
  FROM contacts
  WHERE organization_id = p_org_id
    AND (
      phone = v_clean_phone 
      OR whatsapp = v_clean_phone
      OR phone = p_phone
      OR whatsapp = p_phone
    )
  LIMIT 1;
  
  -- Se não encontrou, criar novo
  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (
      organization_id,
      phone,
      whatsapp,
      first_name,
      profile_name,
      profile_picture_url,
      avatar_url,
      source,
      first_contact_channel,
      first_message_at
    )
    VALUES (
      p_org_id,
      v_clean_phone,
      v_clean_phone,
      COALESCE(SPLIT_PART(p_name, ' ', 1), v_clean_phone),
      p_name,
      p_profile_picture,
      p_profile_picture,
      'whatsapp',
      'whatsapp',
      NOW()
    )
    RETURNING id INTO v_contact_id;
  ELSE
    -- Atualizar dados se necessário
    UPDATE contacts
    SET 
      profile_picture_url = COALESCE(profile_picture_url, p_profile_picture),
      avatar_url = COALESCE(avatar_url, p_profile_picture),
      profile_name = COALESCE(profile_name, p_name),
      first_name = COALESCE(NULLIF(first_name, ''), SPLIT_PART(p_name, ' ', 1)),
      last_message_at = NOW(),
      updated_at = NOW()
    WHERE id = v_contact_id;
  END IF;
  
  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

SELECT '✅ Parte 10 concluída: Funções auxiliares criadas' as status;

-- =====================================================================
-- PARTE 11: VIEW PARA COMPATIBILIDADE (whatsapp_contacts_view)
-- =====================================================================

-- View para manter compatibilidade com código que ainda usa whatsapp_contacts
CREATE OR REPLACE VIEW whatsapp_contacts_unified AS
SELECT 
  c.id,
  c.organization_id,
  c.whatsapp as phone_number,
  COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), c.first_name, c.profile_name, c.whatsapp) as name,
  c.email,
  c.profile_picture_url,
  c.profile_name,
  c.address,
  c.custom_fields,
  c.tags,
  c.shopify_customer_id,
  c.total_orders,
  c.total_spent,
  c.last_order_at,
  c.is_blocked,
  c.blocked_reason,
  c.blocked_at,
  c.source,
  c.source_campaign_id,
  c.first_message_at,
  c.last_message_at,
  c.total_conversations,
  c.total_messages_received,
  c.total_messages_sent,
  c.created_at,
  c.updated_at,
  -- Campos extras do CRM
  c.company,
  c."position",
  c.lifetime_value,
  c.klaviyo_profile_id
FROM contacts c
WHERE c.whatsapp IS NOT NULL OR c.first_message_at IS NOT NULL;

SELECT '✅ Parte 11 concluída: View de compatibilidade criada' as status;

-- =====================================================================
-- PARTE 12: HABILITAR REALTIME NAS NOVAS TABELAS
-- =====================================================================

-- Habilitar realtime para as novas tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE contact_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE contact_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE contact_invoices;

SELECT '✅ Parte 12 concluída: Realtime habilitado' as status;

-- =====================================================================
-- PARTE 13: TRIGGERS PARA MANTER SINCRONIZAÇÃO
-- =====================================================================

-- 13.1 Trigger para atualizar last_message_at quando receber mensagem
CREATE OR REPLACE FUNCTION update_contact_on_message()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- Buscar o contact_id unificado
  SELECT unified_contact_id INTO v_contact_id
  FROM whatsapp_conversations
  WHERE id = NEW.conversation_id;
  
  IF v_contact_id IS NOT NULL THEN
    UPDATE contacts
    SET 
      last_message_at = NEW.created_at,
      total_messages_received = total_messages_received + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
      total_messages_sent = total_messages_sent + CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE id = v_contact_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_contact_on_new_message_unified ON whatsapp_messages;
CREATE TRIGGER update_contact_on_new_message_unified
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_on_message();

-- 13.2 Trigger para registrar atividade quando deal mudar de status
CREATE OR REPLACE FUNCTION log_deal_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status mudou
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO contact_activities (
      organization_id, contact_id, deal_id, activity_type, title, metadata
    )
    VALUES (
      NEW.organization_id,
      NEW.contact_id,
      NEW.id,
      CASE 
        WHEN NEW.status = 'won' THEN 'deal_won'
        WHEN NEW.status = 'lost' THEN 'deal_lost'
        ELSE 'deal_updated'
      END,
      CASE 
        WHEN NEW.status = 'won' THEN 'Deal ganho: ' || NEW.title
        WHEN NEW.status = 'lost' THEN 'Deal perdido: ' || NEW.title
        ELSE 'Deal atualizado: ' || NEW.title
      END,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'value', NEW.value
      )
    );
  END IF;
  
  -- Se stage mudou
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO contact_activities (
      organization_id, contact_id, deal_id, activity_type, title, metadata
    )
    VALUES (
      NEW.organization_id,
      NEW.contact_id,
      NEW.id,
      'deal_stage_changed',
      'Deal movido: ' || NEW.title,
      jsonb_build_object(
        'old_stage_id', OLD.stage_id,
        'new_stage_id', NEW.stage_id,
        'value', NEW.value
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_deal_activity_trigger ON deals;
CREATE TRIGGER log_deal_activity_trigger
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION log_deal_activity();

-- 13.3 Trigger para registrar atividade quando task for concluída
CREATE OR REPLACE FUNCTION log_task_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status mudou para completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO contact_activities (
      organization_id, contact_id, task_id, activity_type, title, 
      created_by, created_by_name, metadata
    )
    VALUES (
      NEW.organization_id,
      NEW.unified_contact_id,
      NEW.id,
      'task_completed',
      'Tarefa concluída: ' || NEW.title,
      NEW.completed_by,
      NEW.completed_by_name,
      jsonb_build_object(
        'task_type', NEW.type,
        'outcome', NEW.outcome
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_task_activity_trigger ON tasks;
CREATE TRIGGER log_task_activity_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_activity();

SELECT '✅ Parte 13 concluída: Triggers de sincronização criados' as status;

-- =====================================================================
-- VERIFICAÇÃO FINAL
-- =====================================================================

SELECT '🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!' as status;

-- Estatísticas da migração
SELECT 
  (SELECT COUNT(*) FROM contacts WHERE whatsapp IS NOT NULL) as contacts_with_whatsapp,
  (SELECT COUNT(*) FROM contacts WHERE first_message_at IS NOT NULL) as contacts_from_whatsapp,
  (SELECT COUNT(*) FROM whatsapp_conversations WHERE unified_contact_id IS NOT NULL) as conversations_linked,
  (SELECT COUNT(*) FROM contact_activities) as activities_migrated,
  (SELECT COUNT(*) FROM contact_comments) as comments_migrated;
