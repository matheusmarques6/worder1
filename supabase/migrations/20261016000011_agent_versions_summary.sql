-- ============================================================================
-- 20261016000011_agent_versions_summary.sql
-- Plano de implementação IA (2026-10-15), M4 passo 25 — painel Versões.
--
-- O protótipo mostra cada versão com o resumo do que mudou por área
-- ("Ferramentas: ligou Consultar produtos"), a nota da avaliação automática
-- (passo 26) e de qual versão ela foi restaurada. Colunas novas, todas
-- nulas para as versões antigas (a tela mostra "sem resumo").
--
-- Reversão: alter table public.ai_agent_versions drop column change_summary,
-- drop column restored_from, drop column eval_score, drop column eval_grave;
-- ============================================================================
alter table public.ai_agent_versions
    add column if not exists change_summary jsonb,
    add column if not exists restored_from  uuid references public.ai_agent_versions (id) on delete set null,
    add column if not exists eval_score     numeric(5,2),
    add column if not exists eval_grave     integer;

comment on column public.ai_agent_versions.change_summary is
    'Resumo por area do que mudou em relacao a versao anterior: {"lines": ["Ferramentas: ligou X", ...]}.';
comment on column public.ai_agent_versions.restored_from is
    'Versao de origem quando esta foi criada por "restaurar".';
comment on column public.ai_agent_versions.eval_score is
    'Nota (0-100) da avaliacao automatica desta versao (passo 26).';
comment on column public.ai_agent_versions.eval_grave is
    'Quantos casos graves a avaliacao automatica encontrou.';
