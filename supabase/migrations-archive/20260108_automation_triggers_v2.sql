-- ============================================
-- AUTOMAÇÃO - SQL TRIGGERS V2
-- Disparam eventos automaticamente quando dados mudam
-- MULTI-TENANT: Cada organização só vê seus próprios dados
-- Execute no SQL Editor do Supabase
-- ============================================

-- ============================================
-- 1. TABELA DE EVENT LOGS (criar ou atualizar)
-- ============================================

-- Criar tabela se não existir
CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  contact_id UUID,
  deal_id UUID,
  payload JSONB DEFAULT '{}',
  source TEXT DEFAULT 'system',
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar colunas se não existirem
DO $$
BEGIN
  -- processed column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'processed') THEN
    ALTER TABLE event_logs ADD COLUMN processed BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- processed_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'processed_at') THEN
    ALTER TABLE event_logs ADD COLUMN processed_at TIMESTAMPTZ;
  END IF;
  
  -- error_message column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'error_message') THEN
    ALTER TABLE event_logs ADD COLUMN error_message TEXT;
  END IF;
  
  -- source column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_logs' AND column_name = 'source') THEN
    ALTER TABLE event_logs ADD COLUMN source TEXT DEFAULT 'system';
  END IF;
END $$;

-- Criar índices (ignorar se já existirem)
CREATE INDEX IF NOT EXISTS idx_event_logs_org ON event_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at DESC);

-- Índice parcial para eventos não processados (precisa drop primeiro se existir com definição diferente)
DROP INDEX IF EXISTS idx_event_logs_processed;
CREATE INDEX idx_event_logs_processed ON event_logs(processed) WHERE processed = FALSE;

-- ============================================
-- 2. MELHORAR TABELA DE AUTOMATION_RUNS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'trigger_event_id') THEN
    ALTER TABLE automation_runs ADD COLUMN trigger_event_id UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'retry_count') THEN
    ALTER TABLE automation_runs ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'last_error') THEN
    ALTER TABLE automation_runs ADD COLUMN last_error TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'waiting_until') THEN
    ALTER TABLE automation_runs ADD COLUMN waiting_until TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_runs' AND column_name = 'current_node_id') THEN
    ALTER TABLE automation_runs ADD COLUMN current_node_id TEXT;
  END IF;
END $$;

-- ============================================
-- 3. FUNÇÃO HELPER PARA EMITIR EVENTOS
-- Sempre inclui organization_id para isolamento
-- ============================================

CREATE OR REPLACE FUNCTION emit_automation_event(
  p_organization_id UUID,
  p_event_type TEXT,
  p_contact_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Inserir evento com organization_id para isolamento multi-tenant
  INSERT INTO event_logs (organization_id, event_type, contact_id, deal_id, payload, source)
  VALUES (p_organization_id, p_event_type, p_contact_id, p_deal_id, p_payload, 'trigger')
  RETURNING id INTO v_event_id;
  
  -- Notificar via pg_notify para processamento em tempo real (opcional)
  PERFORM pg_notify('automation_events', json_build_object(
    'event_id', v_event_id,
    'organization_id', p_organization_id,
    'event_type', p_event_type,
    'contact_id', p_contact_id,
    'deal_id', p_deal_id
  )::text);
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. TRIGGER: CONTATO CRIADO
-- O organization_id vem do próprio contato
-- ============================================

CREATE OR REPLACE FUNCTION trigger_contact_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Emitir evento COM o organization_id do contato
  PERFORM emit_automation_event(
    NEW.organization_id,  -- ← Garante isolamento por organização
    'contact.created',
    NEW.id,
    NULL,
    jsonb_build_object(
      'email', NEW.email,
      'phone', NEW.phone,
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'source', NEW.source,
      'tags', NEW.tags
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_contact_created ON contacts;
CREATE TRIGGER on_contact_created
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_contact_created();

-- ============================================
-- 5. TRIGGER: TAG ADICIONADA
-- ============================================

CREATE OR REPLACE FUNCTION trigger_tag_added()
RETURNS TRIGGER AS $$
DECLARE
  v_new_tags TEXT[];
  v_old_tags TEXT[];
  v_added_tags TEXT[];
  v_tag TEXT;
BEGIN
  v_new_tags := COALESCE(NEW.tags, '{}');
  v_old_tags := COALESCE(OLD.tags, '{}');
  
  -- Encontrar tags que foram adicionadas
  SELECT array_agg(t) INTO v_added_tags
  FROM unnest(v_new_tags) t
  WHERE NOT (t = ANY(v_old_tags));
  
  -- Emitir evento para cada tag adicionada
  IF v_added_tags IS NOT NULL THEN
    FOREACH v_tag IN ARRAY v_added_tags LOOP
      PERFORM emit_automation_event(
        NEW.organization_id,  -- ← Garante isolamento por organização
        'tag.added',
        NEW.id,
        NULL,
        jsonb_build_object(
          'tag_name', v_tag,
          'contact_email', NEW.email,
          'all_tags', NEW.tags
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tag_added ON contacts;
CREATE TRIGGER on_tag_added
  AFTER UPDATE OF tags ON contacts
  FOR EACH ROW
  WHEN (OLD.tags IS DISTINCT FROM NEW.tags)
  EXECUTE FUNCTION trigger_tag_added();

-- ============================================
-- 6. TRIGGER: DEAL CRIADO
-- ============================================

CREATE OR REPLACE FUNCTION trigger_deal_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM emit_automation_event(
    NEW.organization_id,  -- ← Garante isolamento por organização
    'deal.created',
    NEW.contact_id,
    NEW.id,
    jsonb_build_object(
      'title', NEW.title,
      'value', NEW.value,
      'pipeline_id', NEW.pipeline_id,
      'stage_id', NEW.stage_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_deal_created ON deals;
CREATE TRIGGER on_deal_created
  AFTER INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_deal_created();

-- ============================================
-- 7. TRIGGER: DEAL MUDOU DE ESTÁGIO
-- ============================================

CREATE OR REPLACE FUNCTION trigger_deal_stage_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_from_stage_name TEXT;
  v_to_stage_name TEXT;
BEGIN
  -- Buscar nomes dos estágios
  SELECT name INTO v_from_stage_name FROM pipeline_stages WHERE id = OLD.stage_id;
  SELECT name INTO v_to_stage_name FROM pipeline_stages WHERE id = NEW.stage_id;
  
  PERFORM emit_automation_event(
    NEW.organization_id,  -- ← Garante isolamento por organização
    'deal.stage_changed',
    NEW.contact_id,
    NEW.id,
    jsonb_build_object(
      'title', NEW.title,
      'value', NEW.value,
      'pipeline_id', NEW.pipeline_id,
      'from_stage_id', OLD.stage_id,
      'to_stage_id', NEW.stage_id,
      'from_stage_name', v_from_stage_name,
      'to_stage_name', v_to_stage_name
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_deal_stage_changed ON deals;
CREATE TRIGGER on_deal_stage_changed
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION trigger_deal_stage_changed();

-- ============================================
-- 8. TRIGGER: DEAL GANHO
-- ============================================

CREATE OR REPLACE FUNCTION trigger_deal_won()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_type TEXT;
BEGIN
  -- Verificar se o novo estágio é de tipo 'won'
  SELECT stage_type INTO v_stage_type FROM pipeline_stages WHERE id = NEW.stage_id;
  
  IF v_stage_type = 'won' AND (OLD.stage_id IS NULL OR OLD.stage_id != NEW.stage_id) THEN
    PERFORM emit_automation_event(
      NEW.organization_id,  -- ← Garante isolamento por organização
      'deal.won',
      NEW.contact_id,
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'value', NEW.value,
        'pipeline_id', NEW.pipeline_id,
        'stage_id', NEW.stage_id,
        'won_at', NOW()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_deal_won ON deals;
CREATE TRIGGER on_deal_won
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_deal_won();

-- ============================================
-- 9. TRIGGER: DEAL PERDIDO
-- ============================================

CREATE OR REPLACE FUNCTION trigger_deal_lost()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_type TEXT;
BEGIN
  -- Verificar se o novo estágio é de tipo 'lost'
  SELECT stage_type INTO v_stage_type FROM pipeline_stages WHERE id = NEW.stage_id;
  
  IF v_stage_type = 'lost' AND (OLD.stage_id IS NULL OR OLD.stage_id != NEW.stage_id) THEN
    PERFORM emit_automation_event(
      NEW.organization_id,  -- ← Garante isolamento por organização
      'deal.lost',
      NEW.contact_id,
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'value', NEW.value,
        'pipeline_id', NEW.pipeline_id,
        'stage_id', NEW.stage_id,
        'lost_at', NOW(),
        'lost_reason', NEW.lost_reason
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_deal_lost ON deals;
CREATE TRIGGER on_deal_lost
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_deal_lost();

-- ============================================
-- 10. FUNÇÃO PARA ENCONTRAR AUTOMAÇÕES CORRESPONDENTES
-- CRÍTICO: Filtra por organization_id E status='active'
-- ============================================

CREATE OR REPLACE FUNCTION find_matching_automations(
  p_organization_id UUID,
  p_event_type TEXT,
  p_payload JSONB
) RETURNS TABLE (
  automation_id UUID,
  automation_name TEXT,
  trigger_type TEXT
) AS $$
DECLARE
  v_trigger_type TEXT;
BEGIN
  -- Mapear event_type para trigger_type
  v_trigger_type := CASE p_event_type
    WHEN 'contact.created' THEN 'trigger_signup'
    WHEN 'tag.added' THEN 'trigger_tag'
    WHEN 'deal.created' THEN 'trigger_deal_created'
    WHEN 'deal.stage_changed' THEN 'trigger_deal_stage'
    WHEN 'deal.won' THEN 'trigger_deal_won'
    WHEN 'deal.lost' THEN 'trigger_deal_lost'
    WHEN 'order.created' THEN 'trigger_order'
    WHEN 'order.paid' THEN 'trigger_order_paid'
    WHEN 'webhook.received' THEN 'trigger_webhook'
    ELSE NULL
  END;
  
  IF v_trigger_type IS NULL THEN
    RETURN;
  END IF;
  
  -- Buscar automações que correspondem ao trigger
  -- ⚠️ CRÍTICO: Filtra por organization_id E status='active'
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    v_trigger_type
  FROM automations a
  WHERE a.organization_id = p_organization_id  -- ← ISOLAMENTO POR ORGANIZAÇÃO
    AND a.status = 'active'                     -- ← SÓ AUTOMAÇÕES ATIVAS
    AND a.trigger_type = v_trigger_type
    -- Verificar condições adicionais do trigger_config
    -- ⚠️ Suporta tanto camelCase (do React) quanto snake_case
    AND (
      -- Tag específica (tagName ou tag_name)
      (v_trigger_type = 'trigger_tag' AND (
        a.trigger_config IS NULL 
        OR (
          COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') IS NULL 
          OR COALESCE(a.trigger_config->>'tagName', a.trigger_config->>'tag_name') = 
             COALESCE(p_payload->>'tagName', p_payload->>'tag_name')
        )
      ))
      OR
      -- Stage específico com suporte a fromStageId (de qual estágio) e stageId (para qual estágio)
      (v_trigger_type = 'trigger_deal_stage' AND (
        a.trigger_config IS NULL 
        OR (
          -- Verificar "para qual estágio" (stageId)
          (
            COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') IS NULL 
            OR COALESCE(a.trigger_config->>'stageId', a.trigger_config->>'stage_id') = 
               COALESCE(p_payload->>'to_stage_id', p_payload->>'toStageId')
          )
          AND
          -- Verificar "de qual estágio" (fromStageId) - opcional
          (
            COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') IS NULL 
            OR COALESCE(a.trigger_config->>'fromStageId', a.trigger_config->>'from_stage_id') = 
               COALESCE(p_payload->>'from_stage_id', p_payload->>'fromStageId')
          )
        )
      ))
      OR
      -- Pipeline específico (pipelineId ou pipeline_id)
      ((v_trigger_type IN ('trigger_deal_created', 'trigger_deal_stage', 'trigger_deal_won', 'trigger_deal_lost')) AND (
        a.trigger_config IS NULL 
        OR (
          COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') IS NULL 
          OR COALESCE(a.trigger_config->>'pipelineId', a.trigger_config->>'pipeline_id') = 
             COALESCE(p_payload->>'pipelineId', p_payload->>'pipeline_id')
        )
      ))
      OR
      -- Store específica para triggers de pedido
      ((v_trigger_type IN ('trigger_order', 'trigger_order_paid')) AND (
        a.trigger_config IS NULL 
        OR (
          COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') IS NULL 
          OR COALESCE(a.trigger_config->>'storeId', a.trigger_config->>'store_id') = 
             COALESCE(p_payload->>'storeId', p_payload->>'store_id')
        )
      ))
      OR
      -- Outros triggers sem condições especiais
      (v_trigger_type NOT IN ('trigger_tag', 'trigger_deal_stage', 'trigger_deal_created', 'trigger_deal_won', 'trigger_deal_lost', 'trigger_order', 'trigger_order_paid'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. RLS POLICIES - Isolamento Multi-Tenant
-- ============================================

-- Habilitar RLS
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;

-- Remover policy antiga se existir
DROP POLICY IF EXISTS "event_logs_org_access" ON event_logs;

-- Criar policy: cada organização só vê seus próprios eventos
CREATE POLICY "event_logs_org_access" ON event_logs
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy para service role (backend) - acesso total
DROP POLICY IF EXISTS "event_logs_service_role" ON event_logs;

CREATE POLICY "event_logs_service_role" ON event_logs
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 12. VERIFICAÇÃO FINAL
-- ============================================

-- Mostrar triggers criados
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname LIKE 'on_%'
ORDER BY table_name, trigger_name;

-- Mostrar colunas da tabela event_logs
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'event_logs'
ORDER BY ordinal_position;
