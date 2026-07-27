-- =====================================================
-- Fix — stale_pending_templates: unambiguous IDs
-- =====================================================
-- Problema: o RPC retornava a PK de whatsapp_templates numa coluna
-- chamada template_id, mas a TABELA whatsapp_templates também tem uma
-- coluna template_id (TEXT, ID da Meta). O mesmo nome significa coisas
-- diferentes dependendo do contexto — receita para o cron
-- /api/cron/whatsapp-resync-templates virar no-op silencioso se alguém
-- "corrigir" o RPC para retornar t.template_id.
--
-- Diagnóstico (Task 1): [PENDENTE — preencher no deploy com a definição deployada do RPC + baseline de stale_count. A DDL abaixo é correta e idempotente independentemente do diagnóstico: mantém template_id (=t.id) legado, adiciona row_id (=t.id) e meta_template_id (=COALESCE(t.meta_template_id, t.template_id)).]
--
-- Fix: retornar as tres colunas —
--   template_id      UUID  (legado, = t.id; mantém o route antigo vivo
--                           durante o rollout)
--   row_id           UUID  (= t.id, nome inequívoco — novo route usa este)
--   meta_template_id TEXT  (= COALESCE(t.meta_template_id, t.template_id);
--                           elimina o SELECT extra por template no route)
--
-- CREATE OR REPLACE não permite mudar o RETURNS TABLE, então é preciso
-- DROP + CREATE. Rodar no Supabase SQL Editor ANTES do deploy do route.

BEGIN;

DROP FUNCTION IF EXISTS stale_pending_templates(INTEGER);

CREATE FUNCTION stale_pending_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id       UUID,
  name              TEXT,
  language          TEXT,
  waba_id           UUID,
  created_at        TIMESTAMPTZ,
  age_minutes       DOUBLE PRECISION,
  row_id            UUID,
  meta_template_id  TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.waba_id,
    t.created_at,
    (EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0)::DOUBLE PRECISION,
    t.id,
    COALESCE(t.meta_template_id, t.template_id)
  FROM whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION stale_pending_templates(INTEGER) TO service_role;

COMMIT;

-- Smoke test (read-only):
-- SELECT * FROM stale_pending_templates(60) LIMIT 5;
