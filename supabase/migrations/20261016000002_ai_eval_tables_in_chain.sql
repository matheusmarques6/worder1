-- 20261016000002_ai_eval_tables_in_chain.sql
--
-- Plano de implementação IA (15/10/2026), M0 passo 1 (parte 2).
--
-- Sete tabelas usadas pelo código (evals.ts, proposals.ts, test-runner.ts,
-- integrations sync) existem em produção mas só estavam definidas em
-- supabase/migrations-archive/2026061{2,3,4}_*.sql e em
-- sql/ai-agents-complete-migration.sql. Um banco limpo (CI do runtime,
-- bancada) não as reproduzia. As definições abaixo são as colunas vivas de
-- produção em 15/10/2026, todas `create table if not exists`, com RLS e a
-- política padrão por organização. Nenhuma coluna é alterada em produção.
--
-- down: drop table if exists ai_eval_results, ai_eval_cases, ai_eval_criteria,
--       ai_scenario_runs, ai_test_scenarios, ai_prompt_proposals,
--       ai_agent_integrations;

create table if not exists public.ai_test_scenarios (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  agent_id          uuid not null references public.ai_agents(id) on delete cascade,
  title             text not null,
  persona           text,
  user_turns        jsonb not null default '[]'::jsonb,
  expected_behavior text,
  tags              text[] not null default '{}'::text[],
  is_active         boolean not null default true,
  created_by        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists idx_test_scenarios_agent on public.ai_test_scenarios (agent_id);

create table if not exists public.ai_scenario_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null references public.ai_agents(id) on delete cascade,
  scenario_id     uuid not null references public.ai_test_scenarios(id) on delete cascade,
  version_id      uuid references public.ai_agent_versions(id) on delete set null,
  transcript      jsonb not null default '[]'::jsonb,
  score           integer,
  status          text,
  note            text,
  judge_model     text,
  tokens          integer,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists idx_scenario_runs_scenario on public.ai_scenario_runs (scenario_id);
create index if not exists idx_scenario_runs_agent on public.ai_scenario_runs (agent_id);

create table if not exists public.ai_eval_criteria (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null references public.ai_agents(id) on delete cascade,
  label           text not null,
  description     text,
  position        integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_eval_criteria_agent on public.ai_eval_criteria (agent_id);

create table if not exists public.ai_eval_cases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null references public.ai_agents(id) on delete cascade,
  title           text not null,
  input           text,
  expected        text,
  source          text,
  source_id       uuid,
  tags            text[] not null default '{}'::text[],
  created_at      timestamptz not null default now()
);
create index if not exists idx_eval_cases_agent on public.ai_eval_cases (agent_id);

create table if not exists public.ai_eval_results (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         uuid not null references public.ai_agents(id) on delete cascade,
  case_id          uuid references public.ai_eval_cases(id) on delete cascade,
  version_id       uuid references public.ai_agent_versions(id) on delete set null,
  verdict          text,
  score            integer,
  criteria_results jsonb,
  judge_model      text,
  judged_output    text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_eval_results_agent on public.ai_eval_results (agent_id);

create table if not exists public.ai_prompt_proposals (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  agent_id           uuid not null references public.ai_agents(id) on delete cascade,
  title              text not null,
  reason             text,
  impact             text,
  proposed_prompt    text not null,
  status             text not null default 'pending',
  source_trace_ids   uuid[] not null default '{}'::uuid[],
  applied_version_id uuid,
  created_at         timestamptz not null default now()
);
create index if not exists idx_prompt_proposals_agent on public.ai_prompt_proposals (agent_id);

create table if not exists public.ai_agent_integrations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         uuid not null references public.ai_agents(id) on delete cascade,
  integration_id   uuid,
  integration_type text not null,
  sync_products    boolean default true,
  sync_orders      boolean default true,
  allow_price_info boolean default true,
  allow_stock_info boolean default true,
  source_id        uuid,
  last_sync_at     timestamptz,
  products_synced  integer default 0,
  sync_status      text default 'pending',
  sync_error       text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_agent_integrations_agent on public.ai_agent_integrations (agent_id);

-- RLS: a cerca genérica (20260909100000) só cobriu as tabelas que existiam
-- naquele momento; num banco limpo estas nascem aqui, então a política vem
-- junto. Em produção o `drop policy if exists` + `create` apenas realinha.
do $$
declare t text;
begin
  foreach t in array array[
    'ai_test_scenarios','ai_scenario_runs','ai_eval_criteria','ai_eval_cases',
    'ai_eval_results','ai_prompt_proposals','ai_agent_integrations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format(
      'create policy %I on public.%I for all using (organization_id = public.get_user_organization_id()) with check (organization_id = public.get_user_organization_id())',
      t || '_org_isolation', t
    );
  end loop;
end $$;
