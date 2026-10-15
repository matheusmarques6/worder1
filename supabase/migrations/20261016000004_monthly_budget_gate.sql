-- 20261016000004_monthly_budget_gate.sql
--
-- Plano IA (15/10/2026), M1 passo 7 — runtime/docs/alteracoes/2026-10-15-04.
--
-- O runtime não tinha teto mensal de gasto (FORK.md item 25): só o teto de 8
-- chamadas por turno. O motor legado lia `ai_budgets` por org. Aqui entram:
--
--   1. `ai_agents.monthly_cap_usd` — teto por AGENTE (o protótipo mostra
--      "R$ 212 de R$ 400" no nó do agente); nulo = sem teto próprio.
--   2. `internal.monthly_ai_spend(org, agent)` — UMA leitura, SECURITY DEFINER,
--      que devolve gasto e limite da org e do agente no mês corrente (UTC),
--      para o worker_role não precisar de SELECT em ai_usage_logs/ai_budgets.
--      O gasto da org vem de `ai_usage_logs` (os dois motores espelham ali);
--      o do agente, de `internal.llm_calls` por `agent_id`.
--   3. `budget_exceeded` no CHECK de `alerts.type`.
--
-- Limite padrão da org sem linha em ai_budgets: 50 USD, o mesmo de
-- `src/lib/ai/budget.ts::_defaultBudgetUsd`.
--
-- down: drop function internal.monthly_ai_spend(uuid, uuid);
--       alter table public.ai_agents drop column monthly_cap_usd;
--       recriar alerts_type_check sem 'budget_exceeded'.

alter table public.ai_agents add column if not exists monthly_cap_usd numeric(10,4);

create or replace function internal.monthly_ai_spend(
  p_organization_id uuid,
  p_agent_id        uuid
)
returns table (
  org_spent_usd    numeric,
  org_limit_usd    numeric,
  agent_spent_usd  numeric,
  agent_cap_usd    numeric,
  has_unknown_cost boolean
)
language sql
stable
security definer
set search_path = public, internal
as $$
  with month as (
    select date_trunc('month', now() at time zone 'utc') at time zone 'utc' as start_at
  ),
  org as (
    select coalesce(sum(u.cost_usd), 0)                 as spent,
           coalesce(bool_or(u.cost_usd is null), false) as unknown
      from public.ai_usage_logs u, month m
     where u.organization_id = p_organization_id
       and u.created_at >= m.start_at
       and coalesce((u.metadata ->> 'billable')::boolean, true)
  ),
  agent as (
    select coalesce(sum(l.cost_usd), 0) as spent
      from internal.llm_calls l, month m
     where l.organization_id = p_organization_id
       and p_agent_id is not null
       and l.agent_id = p_agent_id
       and l.created_at >= m.start_at
  )
  select org.spent,
         coalesce((select b.monthly_limit_usd from public.ai_budgets b
                    where b.organization_id = p_organization_id), 50),
         agent.spent,
         (select a.monthly_cap_usd from public.ai_agents a where a.id = p_agent_id),
         org.unknown
    from org, agent;
$$;

revoke execute on function internal.monthly_ai_spend(uuid, uuid) from public;
grant execute on function internal.monthly_ai_spend(uuid, uuid) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant execute on function internal.monthly_ai_spend(uuid, uuid) to worker_role;
  end if;
end $$;

alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
    type in ('critical_violation', 'no_active_mission', 'no_org_llm_key',
             'window_closed_no_template', 'moment_template_not_ready',
             'judge_blocked', 'send_failed', 'mission_touch_failed', 'handoff',
             'coupon_code_conflict', 'budget_exceeded')
);
