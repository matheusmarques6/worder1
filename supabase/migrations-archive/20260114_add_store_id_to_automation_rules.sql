-- =============================================
-- MIGRAÇÃO: Adicionar store_id em automation_rules
-- Execute no Supabase SQL Editor
-- Data: 14/01/2026
-- Motivo: Bug #4 - Automações aparecendo em lojas erradas
-- =============================================

-- 1. Adicionar coluna store_id
ALTER TABLE automation_rules 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

-- 2. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_automation_rules_store 
ON automation_rules(store_id);

-- 3. Comentário explicativo
COMMENT ON COLUMN automation_rules.store_id IS 'Loja específica desta regra (multi-tenant). NULL = todas as lojas da organização.';

-- 4. Atualizar regras existentes para vincular à loja correta (baseado no pipeline)
-- Isso pega o store_id do pipeline associado à regra
UPDATE automation_rules ar
SET store_id = p.store_id
FROM pipelines p
WHERE ar.pipeline_id = p.id
  AND ar.store_id IS NULL
  AND p.store_id IS NOT NULL;

-- 5. Verificar resultado
SELECT 
  'automation_rules' as tabela,
  COUNT(*) as total_regras,
  COUNT(store_id) as com_store_id,
  COUNT(*) - COUNT(store_id) as sem_store_id
FROM automation_rules;
