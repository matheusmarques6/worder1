-- =============================================
-- Migration: Pipeline Automation Rules
-- Tabela para armazenar regras de automação por pipeline
-- =============================================

-- Criar tabela de regras de automação
CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Configuração da regra
  source_type TEXT NOT NULL CHECK (source_type IN ('shopify', 'whatsapp', 'hotmart', 'webhook', 'form')),
  trigger_event TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'create_deal' CHECK (action_type IN ('create_deal', 'move_deal', 'update_contact')),
  target_stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE CASCADE,
  
  -- Configurações adicionais
  auto_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(pipeline_id, source_type, trigger_event)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_automation_rules_pipeline ON crm_automation_rules(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON crm_automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_source ON crm_automation_rules(source_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON crm_automation_rules(is_active) WHERE is_active = true;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_automation_rules_updated_at ON crm_automation_rules;
CREATE TRIGGER trigger_update_automation_rules_updated_at
  BEFORE UPDATE ON crm_automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_rules_updated_at();

-- RLS Policies
ALTER TABLE crm_automation_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários podem ver regras da sua organização
DROP POLICY IF EXISTS "Users can view own organization automation rules" ON crm_automation_rules;
CREATE POLICY "Users can view own organization automation rules"
  ON crm_automation_rules FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Policy: Usuários podem criar regras na sua organização
DROP POLICY IF EXISTS "Users can create automation rules in own organization" ON crm_automation_rules;
CREATE POLICY "Users can create automation rules in own organization"
  ON crm_automation_rules FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Policy: Usuários podem atualizar regras da sua organização
DROP POLICY IF EXISTS "Users can update own organization automation rules" ON crm_automation_rules;
CREATE POLICY "Users can update own organization automation rules"
  ON crm_automation_rules FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Policy: Usuários podem deletar regras da sua organização
DROP POLICY IF EXISTS "Users can delete own organization automation rules" ON crm_automation_rules;
CREATE POLICY "Users can delete own organization automation rules"
  ON crm_automation_rules FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Comentários
COMMENT ON TABLE crm_automation_rules IS 'Regras de automação para criação/movimentação de deals por pipeline';
COMMENT ON COLUMN crm_automation_rules.source_type IS 'Origem do evento: shopify, whatsapp, hotmart, webhook, form';
COMMENT ON COLUMN crm_automation_rules.trigger_event IS 'Evento que dispara a automação: order_created, order_paid, etc';
COMMENT ON COLUMN crm_automation_rules.action_type IS 'Ação a ser executada: create_deal, move_deal, update_contact';
COMMENT ON COLUMN crm_automation_rules.target_stage_id IS 'Estágio de destino para o deal';
COMMENT ON COLUMN crm_automation_rules.auto_tags IS 'Tags a serem adicionadas automaticamente ao contato';
