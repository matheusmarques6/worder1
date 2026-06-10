-- =============================================
-- WORDER: AI budget controls + usage reconciliation
-- 20260616_ai_budgets.sql
--
-- P1 Task 14: tabela ai_budgets (limite mensal por org) +
-- reconciliacao de ai_usage_logs (colunas legadas → schema correto).
-- =============================================

-- =============================================
-- 1. ai_budgets — limite mensal por organização
-- =============================================

CREATE TABLE IF NOT EXISTS ai_budgets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL,
  -- Limite mensal em USD (NULL = sem limite)
  monthly_limit_usd  NUMERIC(10,4),
  -- Alertas: percentual do limite (0-100) que dispara notificacao
  alert_threshold_pct INT DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 0 AND 100),
  -- Controle de soft-block (bloqueia LLM quando orcamento excedido)
  soft_block         BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_budgets_org_unique UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS ai_budgets_org_idx
  ON ai_budgets (organization_id);

ALTER TABLE ai_budgets ENABLE ROW LEVEL SECURITY;

-- Apenas service role pode escrever; usuarios autenticados da org podem ler
DROP POLICY IF EXISTS "ai_budgets service write" ON ai_budgets;
CREATE POLICY "ai_budgets service write"
  ON ai_budgets FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "ai_budgets org read" ON ai_budgets;
CREATE POLICY "ai_budgets org read"
  ON ai_budgets FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- 2. Reconciliacao de ai_usage_logs
-- Colunas legadas do engine.ts (input_tokens, output_tokens,
-- estimated_cost_cents, chunks_used, sources_used, actions_triggered,
-- error_message) podem existir em ambientes antigos.
-- Adicionamos SOMENTE se nao existirem (idempotente).
-- =============================================

-- feature e NOT NULL no schema padrao; garantir DEFAULT para linhas antigas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'feature'
      AND is_nullable = 'NO'
  ) THEN
    -- Ja existe e NOT NULL — nada a fazer
    NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'feature'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN feature TEXT NOT NULL DEFAULT 'legacy';
  END IF;
END$$;

-- prompt_tokens (alias de input_tokens legado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'prompt_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN prompt_tokens INT DEFAULT 0;
  END IF;
END$$;

-- completion_tokens (alias de output_tokens legado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'completion_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN completion_tokens INT DEFAULT 0;
  END IF;
END$$;

-- cost_usd (substitui estimated_cost_cents)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'cost_usd'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN cost_usd NUMERIC(10,6) DEFAULT 0;
  END IF;
END$$;

-- metadata JSONB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END$$;

-- Indice por mes (para queries de budget mensal)
CREATE INDEX IF NOT EXISTS ai_usage_logs_org_month_idx
  ON ai_usage_logs (organization_id, date_trunc('month', created_at) DESC);
