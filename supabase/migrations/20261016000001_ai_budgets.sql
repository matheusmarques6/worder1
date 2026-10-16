-- 20261016000001_ai_budgets.sql
--
-- Plano de implementação IA (15/10/2026), M0 passo 1.
--
-- `ai_budgets` é lida por `checkAiBudget` (src/lib/ai/budget.ts) em TODO
-- caminho pago do Next.js (embeddings, ingestão de documentos, motor legado,
-- evals, propostas), mas a única definição vivia em
-- supabase/migrations-archive/20260616_ai_budgets.sql e a tabela NÃO existe
-- em produção (to_regclass devolve nulo). Como o erro de leitura era tratado
-- como bloqueio, nenhuma fonte de conhecimento chegava a `ready`.
--
-- Esta migration traz a tabela e a RPC `ai_monthly_cost_usd` para a cadeia
-- ativa, idempotente. A política de leitura usa o mesmo predicado da cerca
-- genérica (20260909100000) em vez de `organization_members`, para não
-- depender de uma tabela que a cerca não garante. `worker_role` ganha SELECT
-- porque o runtime passa a ler o teto mensal no M1 passo 7.
--
-- down: drop function if exists public.ai_monthly_cost_usd(uuid, timestamptz);
--       drop table if exists public.ai_budgets;

create table if not exists public.ai_budgets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  monthly_limit_usd   numeric(10,4) not null default 50,
  alert_threshold_pct int default 80 check (alert_threshold_pct between 0 and 100),
  soft_block          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ai_budgets_org_unique unique (organization_id)
);

create index if not exists ai_budgets_org_idx on public.ai_budgets (organization_id);

alter table public.ai_budgets enable row level security;

drop policy if exists "ai_budgets service write" on public.ai_budgets;
drop policy if exists "ai_budgets org read" on public.ai_budgets;
create policy "ai_budgets org read" on public.ai_budgets
  for select using (organization_id = public.get_user_organization_id());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant select on public.ai_budgets to worker_role;
  end if;
end $$;

-- Índice de apoio à soma mensal (idempotente; pode já existir).
create index if not exists ai_usage_logs_org_created_idx
  on public.ai_usage_logs (organization_id, created_at desc);

-- Mesma forma de 20260902000003 / 20260910040001 (que rodam antes na
-- cadeia): tabela com `has_unknown_cost` e só o que é cobrável. Era
-- `returns numeric`, e o CREATE OR REPLACE falhava com 42P13 ("cannot
-- change return type") no ensaio de produção de 16/10/2026. `checkAiBudget`
-- lê exatamente estas duas colunas.
create or replace function public.ai_monthly_cost_usd(
  p_organization_id uuid,
  p_month_start     timestamptz
)
returns table (spent_usd numeric, has_unknown_cost boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)                  as spent_usd,
         coalesce(bool_or(cost_usd is null), false) as has_unknown_cost
    from public.ai_usage_logs
   where organization_id = p_organization_id
     and created_at >= p_month_start
     and (metadata ->> 'billable') is distinct from 'false';
$$;

revoke execute on function public.ai_monthly_cost_usd(uuid, timestamptz) from public;
revoke execute on function public.ai_monthly_cost_usd(uuid, timestamptz) from anon;
revoke execute on function public.ai_monthly_cost_usd(uuid, timestamptz) from authenticated;
grant execute on function public.ai_monthly_cost_usd(uuid, timestamptz) to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'worker_role') then
    grant execute on function public.ai_monthly_cost_usd(uuid, timestamptz) to worker_role;
  end if;
end $$;
