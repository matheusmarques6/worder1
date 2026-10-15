-- ============================================================================
-- 20261016000012_eval_writes_by_worker.sql
-- Plano de implementação IA (2026-10-15), M4 passo 26 — avaliação automática.
--
-- O runtime roda o pack de avaliação contra uma versão do agente e grava a
-- nota NA versão (ai_agent_versions.eval_score / eval_grave, alteração 11).
-- O worker_role só tinha SELECT em ai_agent_versions: ganha UPDATE apenas
-- dessas duas colunas, escopado pela org da conexão. internal.eval_runs e
-- internal.judge_scores já eram escritos por ele (20260813000002).
--
-- Reversão: revoke update (eval_score, eval_grave) on public.ai_agent_versions
-- from worker_role; drop policy ai_agent_versions_worker_eval_update ...;
-- ============================================================================
grant update (eval_score, eval_grave) on public.ai_agent_versions to worker_role;

drop policy if exists ai_agent_versions_worker_eval_update on public.ai_agent_versions;
create policy ai_agent_versions_worker_eval_update on public.ai_agent_versions
    as permissive for update to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());
