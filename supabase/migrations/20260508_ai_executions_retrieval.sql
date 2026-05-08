-- =============================================
-- F2 — Adiciona retrieval_calls em ai_executions para tracing de RAG.
-- Cada execução grava os chunks usados como contexto: [{chunk_id, source_id, layer, similarity}]
-- =============================================

ALTER TABLE public.ai_executions
  ADD COLUMN IF NOT EXISTS retrieval_calls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ai_executions.retrieval_calls IS
  'Lista de chunks recuperados via RAG nesta execução: [{chunk_id, source_id, layer, similarity}]';
