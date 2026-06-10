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
-- NOTA: monthly_limit_usd DEFAULT 50 USD.
-- Orgs sem linha própria em ai_budgets usam o limite padrão
-- definido por DEFAULT_MONTHLY_LIMIT_USD (env) ou $50/mês.
-- Orgs que legitimamente gastam mais de $50/mês precisam de
-- linha própria nesta tabela (deploy checklist obrigatório).
--
-- alert_threshold_pct e soft_block são reservados para uso futuro.
-- Atualmente não são lidos pelo código de produção; apenas
-- monthly_limit_usd é consumido por checkAiBudget em budget.ts.

CREATE TABLE IF NOT EXISTS ai_budgets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL,
  -- Limite mensal em USD (DEFAULT 50 — orgs sem linha usam env DEFAULT_MONTHLY_LIMIT_USD)
  monthly_limit_usd  NUMERIC(10,4) NOT NULL DEFAULT 50,
  -- RESERVADO PARA USO FUTURO: percentual do limite (0-100) que dispara notificacao
  alert_threshold_pct INT DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 0 AND 100),
  -- RESERVADO PARA USO FUTURO: soft-block (bloqueia LLM quando orcamento excedido)
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

-- duration_ms — tempo de resposta do LLM em ms (inserido por trackAiUsage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'duration_ms'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN duration_ms INTEGER;
  END IF;
END$$;

-- error — mensagem de erro quando a chamada LLM falhou (inserido por trackAiUsage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'error'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN error TEXT;
  END IF;
END$$;

-- Backfill: estimated_cost_cents → cost_usd para linhas do mês de transição.
-- Só executa se a coluna estimated_cost_cents ainda existir (schema legado).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'estimated_cost_cents'
  ) THEN
    UPDATE ai_usage_logs
    SET cost_usd = estimated_cost_cents / 100.0
    WHERE cost_usd = 0 AND estimated_cost_cents > 0;
  END IF;
END$$;

-- Indice por mes (para queries de budget mensal via RPC e fallback)
CREATE INDEX IF NOT EXISTS ai_usage_logs_org_month_idx
  ON ai_usage_logs (organization_id, date_trunc('month', created_at) DESC);

-- =============================================
-- 3. RPC ai_monthly_cost_usd — soma server-side sem truncar em 1000 linhas
-- =============================================
-- Segurança P0:
--   SECURITY DEFINER + search_path = public (evita search-path injection)
--   GRANT apenas para service_role (nunca anon/authenticated)
--   REVOKE PUBLIC garante que criação padrão não expõe a função
--
-- alert_threshold_pct e soft_block na tabela ai_budgets são reservados
-- para uso futuro; esta função não os lê.

CREATE OR REPLACE FUNCTION ai_monthly_cost_usd(
  p_organization_id UUID,
  p_month_start     TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM   ai_usage_logs
  WHERE  organization_id = p_organization_id
    AND  created_at >= p_month_start;
$$;

-- Revogar acesso público (criação de função concede EXECUTE para PUBLIC por padrão)
REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(UUID, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION ai_monthly_cost_usd(UUID, TIMESTAMPTZ) FROM authenticated;

-- Conceder apenas para service_role (usado por supabaseAdmin no backend)
GRANT EXECUTE ON FUNCTION ai_monthly_cost_usd(UUID, TIMESTAMPTZ) TO service_role;
