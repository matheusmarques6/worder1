-- =====================================================
-- Onda 5 fix — RPC stale_pending_templates type mismatch
-- =====================================================
-- Postgres error 42804: "Returned type numeric does not match expected type
-- double precision in column 6"
--
-- EXTRACT(EPOCH FROM ...) retorna NUMERIC em Postgres. Dividir por 60.0
-- mantém NUMERIC. Mas a função declara age_minutes DOUBLE PRECISION (coluna
-- 6 do RETURNS TABLE). Mismatch quebra a função inteira — cron
-- /api/cron/whatsapp-resync-templates retorna 500 e templates pending
-- nunca são re-sincronizados com Meta.
--
-- Fix: cast explicito ::DOUBLE PRECISION na coluna age_minutes. Tudo
-- mais (assinatura, SECURITY DEFINER, ORDER BY, GRANT) preservado.
--
-- Idempotente — CREATE OR REPLACE. Rodar no Supabase SQL Editor.

CREATE OR REPLACE FUNCTION stale_pending_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id  UUID,
  name         TEXT,
  language     TEXT,
  waba_id      UUID,
  created_at   TIMESTAMPTZ,
  age_minutes  DOUBLE PRECISION
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.waba_id,
    t.created_at,
    (EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0)::DOUBLE PRECISION AS age_minutes
  FROM whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION stale_pending_templates(INTEGER) TO service_role;

-- Smoke test (opcional, read-only):
-- SELECT * FROM stale_pending_templates(60) LIMIT 5;
