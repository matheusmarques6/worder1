-- ============================================
-- MIGRATION: Pipeline Automation Rules
-- 
-- Sistema de automações por pipeline que permite
-- configurar quais eventos de cada integração
-- (Shopify, WhatsApp, etc) criam deals automaticamente
--
-- Executar no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. TABELA DE REGRAS DE AUTOMAÇÃO
-- ============================================
-- Cada pipeline pode ter múltiplas regras
-- Cada regra define: fonte, evento trigger, filtros e ação

CREATE TABLE IF NOT EXISTS pipeline_automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  
  -- Identificação da regra
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0, -- Para ordenação
  
  -- Fonte de dados (integração)
  -- Valores: 'shopify', 'whatsapp', 'form', 'webhook', 'hotmart', 'woocommerce', 'email'
  source_type TEXT NOT NULL,
  source_id TEXT, -- ID específico (ex: ID da loja Shopify, número WhatsApp)
  
  -- Evento que dispara a criação do deal
  -- Shopify: 'order_created', 'order_paid', 'order_fulfilled', 'order_delivered', 'order_cancelled', 'checkout_abandoned', 'customer_created'
  -- WhatsApp: 'conversation_started', 'message_received', 'contact_created'
  -- Form: 'form_submitted'
  -- Webhook: 'webhook_received'
  trigger_event TEXT NOT NULL,
  
  -- Filtros em formato JSON para flexibilidade
  -- Exemplos:
  -- Shopify: {"min_value": 500, "max_value": null, "customer_tags": ["vip"], "product_ids": []}
  -- WhatsApp: {"keywords": ["preço", "orçamento"], "business_hours_only": true, "phone_number": "+5511999999999"}
  -- Form: {"form_id": "xxx", "field_contains": {"interesse": "premium"}}
  filters JSONB DEFAULT '{}',
  
  -- Ação: qual estágio inicial
  initial_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  
  -- Atribuição automática
  assign_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Tags a adicionar no deal criado
  deal_tags TEXT[] DEFAULT '{}',
  
  -- Template para título do deal
  -- Variáveis: {{customer_name}}, {{order_number}}, {{product_name}}, {{value}}, {{phone}}
  deal_title_template TEXT,
  
  -- Opções de comportamento
  prevent_duplicates BOOLEAN DEFAULT true, -- Não criar deal se já existir para este contato
  duplicate_check_period_hours INTEGER DEFAULT 24, -- Período para verificar duplicatas (0 = sempre verificar)
  update_existing_deal BOOLEAN DEFAULT false, -- Se deal existe, atualizar ao invés de criar novo
  
  -- Estatísticas
  deals_created_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_automation_rules_org 
  ON pipeline_automation_rules(organization_id);
  
CREATE INDEX IF NOT EXISTS idx_automation_rules_pipeline 
  ON pipeline_automation_rules(pipeline_id);
  
CREATE INDEX IF NOT EXISTS idx_automation_rules_source 
  ON pipeline_automation_rules(source_type, trigger_event);
  
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled 
  ON pipeline_automation_rules(organization_id, source_type, trigger_event) 
  WHERE is_enabled = true;

-- Comentários
COMMENT ON TABLE pipeline_automation_rules IS 'Regras de automação que definem quais eventos criam deals em cada pipeline';
COMMENT ON COLUMN pipeline_automation_rules.source_type IS 'Tipo da integração: shopify, whatsapp, form, webhook, hotmart, woocommerce, email';
COMMENT ON COLUMN pipeline_automation_rules.trigger_event IS 'Evento que dispara a criação do deal';
COMMENT ON COLUMN pipeline_automation_rules.filters IS 'Filtros em JSON para condições adicionais';


-- ============================================
-- 2. TABELA DE TRANSIÇÕES AUTOMÁTICAS
-- ============================================
-- Define movimentações automáticas de deals entre estágios
-- baseadas em eventos das integrações

CREATE TABLE IF NOT EXISTS pipeline_stage_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  
  -- Identificação
  name TEXT,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  
  -- Trigger
  source_type TEXT NOT NULL, -- 'shopify', 'whatsapp', etc.
  trigger_event TEXT NOT NULL, -- 'order_fulfilled', 'message_read', etc.
  
  -- Filtros opcionais (mesmo formato da tabela de rules)
  filters JSONB DEFAULT '{}',
  
  -- De qual estágio (NULL = qualquer estágio)
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  
  -- Para qual estágio
  to_stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  
  -- Ações especiais
  mark_as_won BOOLEAN DEFAULT false,
  mark_as_lost BOOLEAN DEFAULT false,
  
  -- Estatísticas
  transitions_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_stage_transitions_org 
  ON pipeline_stage_transitions(organization_id);
  
CREATE INDEX IF NOT EXISTS idx_stage_transitions_pipeline 
  ON pipeline_stage_transitions(pipeline_id);
  
CREATE INDEX IF NOT EXISTS idx_stage_transitions_source 
  ON pipeline_stage_transitions(source_type, trigger_event);
  
CREATE INDEX IF NOT EXISTS idx_stage_transitions_enabled 
  ON pipeline_stage_transitions(organization_id, source_type, trigger_event) 
  WHERE is_enabled = true;

COMMENT ON TABLE pipeline_stage_transitions IS 'Regras de movimentação automática de deals entre estágios';


-- ============================================
-- 3. TABELA DE LOG DE AUTOMAÇÕES
-- ============================================
-- Registro de todas as execuções de automação para debug

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Referência à regra executada
  rule_id UUID REFERENCES pipeline_automation_rules(id) ON DELETE SET NULL,
  transition_id UUID REFERENCES pipeline_stage_transitions(id) ON DELETE SET NULL,
  
  -- Tipo de ação
  action_type TEXT NOT NULL, -- 'deal_created', 'deal_moved', 'deal_updated', 'skipped', 'error'
  
  -- Referências
  source_type TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Dados do evento que disparou
  event_data JSONB DEFAULT '{}',
  
  -- Resultado
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Detalhes
  details JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar logs recentes
CREATE INDEX IF NOT EXISTS idx_automation_logs_org_date 
  ON automation_logs(organization_id, created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule 
  ON automation_logs(rule_id) WHERE rule_id IS NOT NULL;

-- Limpar logs antigos (mais de 30 dias) - pode ser ajustado
-- Comentado por padrão, descomentar se quiser auto-limpeza
-- CREATE OR REPLACE FUNCTION cleanup_old_automation_logs()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM automation_logs WHERE created_at < NOW() - INTERVAL '30 days';
-- END;
-- $$ LANGUAGE plpgsql;

COMMENT ON TABLE automation_logs IS 'Log de execuções de automações para auditoria e debug';


-- ============================================
-- 4. ADICIONAR CAMPOS NA TABELA PIPELINES
-- ============================================
-- Campo para indicar se pipeline tem automações ativas

ALTER TABLE pipelines 
ADD COLUMN IF NOT EXISTS has_active_automations BOOLEAN DEFAULT false;

ALTER TABLE pipelines 
ADD COLUMN IF NOT EXISTS automation_rules_count INTEGER DEFAULT 0;

COMMENT ON COLUMN pipelines.has_active_automations IS 'Indica se a pipeline tem regras de automação ativas';
COMMENT ON COLUMN pipelines.automation_rules_count IS 'Contador de regras de automação';


-- ============================================
-- 5. FUNÇÃO PARA ATUALIZAR CONTADORES
-- ============================================

CREATE OR REPLACE FUNCTION update_pipeline_automation_counts()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar contadores na pipeline
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE pipelines SET
      automation_rules_count = (
        SELECT COUNT(*) 
        FROM pipeline_automation_rules 
        WHERE pipeline_id = NEW.pipeline_id
      ),
      has_active_automations = (
        SELECT EXISTS(
          SELECT 1 
          FROM pipeline_automation_rules 
          WHERE pipeline_id = NEW.pipeline_id AND is_enabled = true
        )
      ),
      updated_at = NOW()
    WHERE id = NEW.pipeline_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE pipelines SET
      automation_rules_count = (
        SELECT COUNT(*) 
        FROM pipeline_automation_rules 
        WHERE pipeline_id = OLD.pipeline_id
      ),
      has_active_automations = (
        SELECT EXISTS(
          SELECT 1 
          FROM pipeline_automation_rules 
          WHERE pipeline_id = OLD.pipeline_id AND is_enabled = true
        )
      ),
      updated_at = NOW()
    WHERE id = OLD.pipeline_id;
    
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger para manter contadores atualizados
DROP TRIGGER IF EXISTS trigger_update_pipeline_automation_counts ON pipeline_automation_rules;

CREATE TRIGGER trigger_update_pipeline_automation_counts
AFTER INSERT OR UPDATE OR DELETE ON pipeline_automation_rules
FOR EACH ROW EXECUTE FUNCTION update_pipeline_automation_counts();


-- ============================================
-- 6. FUNÇÃO PARA BUSCAR REGRAS ATIVAS
-- ============================================
-- Usada pelo webhook para encontrar quais regras aplicar

CREATE OR REPLACE FUNCTION get_active_automation_rules(
  p_organization_id UUID,
  p_source_type TEXT,
  p_trigger_event TEXT
)
RETURNS TABLE (
  rule_id UUID,
  pipeline_id UUID,
  pipeline_name TEXT,
  rule_name TEXT,
  filters JSONB,
  initial_stage_id UUID,
  initial_stage_name TEXT,
  assign_to_user_id UUID,
  deal_tags TEXT[],
  deal_title_template TEXT,
  prevent_duplicates BOOLEAN,
  duplicate_check_period_hours INTEGER,
  update_existing_deal BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as rule_id,
    r.pipeline_id,
    p.name as pipeline_name,
    r.name as rule_name,
    r.filters,
    r.initial_stage_id,
    s.name as initial_stage_name,
    r.assign_to_user_id,
    r.deal_tags,
    r.deal_title_template,
    r.prevent_duplicates,
    r.duplicate_check_period_hours,
    r.update_existing_deal
  FROM pipeline_automation_rules r
  JOIN pipelines p ON p.id = r.pipeline_id
  LEFT JOIN pipeline_stages s ON s.id = r.initial_stage_id
  WHERE r.organization_id = p_organization_id
    AND r.source_type = p_source_type
    AND r.trigger_event = p_trigger_event
    AND r.is_enabled = true
  ORDER BY r.position ASC, r.created_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_automation_rules IS 'Retorna regras de automação ativas para um evento específico';


-- ============================================
-- 7. FUNÇÃO PARA BUSCAR TRANSIÇÕES ATIVAS
-- ============================================

CREATE OR REPLACE FUNCTION get_active_stage_transitions(
  p_organization_id UUID,
  p_source_type TEXT,
  p_trigger_event TEXT,
  p_current_stage_id UUID DEFAULT NULL
)
RETURNS TABLE (
  transition_id UUID,
  pipeline_id UUID,
  transition_name TEXT,
  filters JSONB,
  from_stage_id UUID,
  to_stage_id UUID,
  to_stage_name TEXT,
  mark_as_won BOOLEAN,
  mark_as_lost BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as transition_id,
    t.pipeline_id,
    t.name as transition_name,
    t.filters,
    t.from_stage_id,
    t.to_stage_id,
    s.name as to_stage_name,
    t.mark_as_won,
    t.mark_as_lost
  FROM pipeline_stage_transitions t
  JOIN pipeline_stages s ON s.id = t.to_stage_id
  WHERE t.organization_id = p_organization_id
    AND t.source_type = p_source_type
    AND t.trigger_event = p_trigger_event
    AND t.is_enabled = true
    AND (t.from_stage_id IS NULL OR t.from_stage_id = p_current_stage_id)
  ORDER BY t.position ASC, t.created_at ASC;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 8. FUNÇÃO PARA INCREMENTAR CONTADOR
-- ============================================

CREATE OR REPLACE FUNCTION increment_automation_rule_counter(
  p_rule_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE pipeline_automation_rules
  SET 
    deals_created_count = deals_created_count + 1,
    last_triggered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION increment_transition_counter(
  p_transition_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE pipeline_stage_transitions
  SET 
    transitions_count = transitions_count + 1,
    last_triggered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transition_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 9. RLS POLICIES
-- ============================================

-- Pipeline Automation Rules
ALTER TABLE pipeline_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view automation rules of their organization" ON pipeline_automation_rules;
CREATE POLICY "Users can view automation rules of their organization"
  ON pipeline_automation_rules FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert automation rules in their organization" ON pipeline_automation_rules;
CREATE POLICY "Users can insert automation rules in their organization"
  ON pipeline_automation_rules FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update automation rules of their organization" ON pipeline_automation_rules;
CREATE POLICY "Users can update automation rules of their organization"
  ON pipeline_automation_rules FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete automation rules of their organization" ON pipeline_automation_rules;
CREATE POLICY "Users can delete automation rules of their organization"
  ON pipeline_automation_rules FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Pipeline Stage Transitions
ALTER TABLE pipeline_stage_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view stage transitions of their organization" ON pipeline_stage_transitions;
CREATE POLICY "Users can view stage transitions of their organization"
  ON pipeline_stage_transitions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert stage transitions in their organization" ON pipeline_stage_transitions;
CREATE POLICY "Users can insert stage transitions in their organization"
  ON pipeline_stage_transitions FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update stage transitions of their organization" ON pipeline_stage_transitions;
CREATE POLICY "Users can update stage transitions of their organization"
  ON pipeline_stage_transitions FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete stage transitions of their organization" ON pipeline_stage_transitions;
CREATE POLICY "Users can delete stage transitions of their organization"
  ON pipeline_stage_transitions FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Automation Logs
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view automation logs of their organization" ON automation_logs;
CREATE POLICY "Users can view automation logs of their organization"
  ON automation_logs FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Service role pode inserir logs (webhooks rodam com service role)
DROP POLICY IF EXISTS "Service role can insert automation logs" ON automation_logs;
CREATE POLICY "Service role can insert automation logs"
  ON automation_logs FOR INSERT
  WITH CHECK (true);


-- ============================================
-- 10. DADOS DE EXEMPLO (OPCIONAL)
-- ============================================
-- Descomente se quiser criar exemplos para teste

/*
-- Exemplo: Regra para pedidos pagos do Shopify
INSERT INTO pipeline_automation_rules (
  organization_id,
  pipeline_id,
  name,
  source_type,
  trigger_event,
  filters,
  initial_stage_id,
  deal_title_template,
  is_enabled
) VALUES (
  'SEU_ORGANIZATION_ID',
  'SEU_PIPELINE_ID',
  'Pedidos Pagos > R$100',
  'shopify',
  'order_paid',
  '{"min_value": 100}',
  'SEU_STAGE_ID',
  'Pedido #{{order_number}} - {{customer_name}}',
  true
);

-- Exemplo: Transição quando pedido é enviado
INSERT INTO pipeline_stage_transitions (
  organization_id,
  pipeline_id,
  name,
  source_type,
  trigger_event,
  from_stage_id,
  to_stage_id,
  is_enabled
) VALUES (
  'SEU_ORGANIZATION_ID',
  'SEU_PIPELINE_ID',
  'Mover para Enviado',
  'shopify',
  'order_fulfilled',
  'STAGE_PAGO_ID',
  'STAGE_ENVIADO_ID',
  true
);
*/


-- ============================================
-- VERIFICAÇÃO FINAL
-- ============================================

DO $$
BEGIN
  -- Verificar se as tabelas foram criadas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_automation_rules') THEN
    RAISE NOTICE '✅ Tabela pipeline_automation_rules criada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Erro ao criar tabela pipeline_automation_rules';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_stage_transitions') THEN
    RAISE NOTICE '✅ Tabela pipeline_stage_transitions criada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Erro ao criar tabela pipeline_stage_transitions';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automation_logs') THEN
    RAISE NOTICE '✅ Tabela automation_logs criada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Erro ao criar tabela automation_logs';
  END IF;
  
  -- Verificar colunas adicionadas
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipelines' AND column_name = 'has_active_automations') THEN
    RAISE NOTICE '✅ Coluna has_active_automations adicionada em pipelines';
  ELSE
    RAISE NOTICE '⚠️ Coluna has_active_automations pode já existir ou houve erro';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Migration concluída com sucesso!';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximos passos:';
  RAISE NOTICE '1. Criar as APIs de CRUD para as regras';
  RAISE NOTICE '2. Modificar os webhooks para usar get_active_automation_rules()';
  RAISE NOTICE '3. Criar a interface de configuração nas pipelines';
END;
$$;
