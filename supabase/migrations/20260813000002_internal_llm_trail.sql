-- ============================================================================
-- 20260813000002_internal_llm_trail.sql
-- A trilha de plataforma do runtime (fork do motor, e2 adaptada):
--   internal.scenarios · internal.eval_runs · internal.judge_scores ·
--   internal.tool_calls · internal.llm_calls
--
-- Duas trilhas convivem por desenho (doc Parte V): agent_traces (public) é a
-- do lojista; estas são a trilha de plataforma — custo, latência, veredito —
-- ligadas pelo trace_id nos spans. PII nunca sai do Postgres.
--
-- Adaptações declaradas (runtime/FORK.md): organization_id;
-- eval_runs.agent_version_id aponta para ai_agent_versions (a tabela local);
-- agent_versions/knowledge_chunks/alerts do motor NÃO são criadas aqui — o
-- runtime usa ai_agents/ai_agent_versions, ai_agent_chunks e a alerts da
-- Etapa 2.
-- ============================================================================

create table internal.scenarios (
    id              uuid primary key default gen_random_uuid(),
    -- NULL = pack base global mantido pela plataforma.
    organization_id uuid        references public.organizations (id) on delete cascade,
    origin          text        not null check (origin in ('base_pack', 'ai_variation', 'manual')),
    occasion        text        not null,
    title           text,
    script          jsonb       not null,
    expected        jsonb       not null default '{}'::jsonb,
    active          boolean     not null default true,
    created_at      timestamptz not null default now()
);

create table internal.eval_runs (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid        not null references public.organizations (id) on delete cascade,
    agent_version_id uuid        not null references public.ai_agent_versions (id) on delete cascade,
    trigger          text        not null
                         check (trigger in ('onboarding', 'manual', 'seasonal', 'flywheel')),
    status           text        not null default 'running'
                         check (status in ('running', 'done', 'failed')),
    aggregate_score  numeric(5, 2),
    summary          jsonb       not null default '{}'::jsonb,
    started_at       timestamptz not null default now(),
    finished_at      timestamptz
);

-- Logs de alto volume: cascateiam da conversa — o purge de TTL e o de
-- lojista cancelado arrastam os derivados junto.
create table internal.judge_scores (
    id              bigint primary key generated always as identity,
    organization_id uuid        not null references public.organizations (id) on delete cascade,
    kind            text        not null check (kind in ('pre_send', 'post_hoc')),
    conversation_id uuid        references public.conversations (id) on delete cascade,
    message_id      uuid        references public.messages (id) on delete cascade,
    eval_run_id     uuid        references internal.eval_runs (id) on delete cascade,
    scenario_id     uuid        references internal.scenarios (id) on delete set null,
    judge_model     text        not null,
    score           numeric(5, 2),
    verdict         text        not null check (verdict in ('pass', 'fail', 'critical')),
    rationale       text,
    created_at      timestamptz not null default now()
);

create index judge_scores_conversation_idx on internal.judge_scores (conversation_id);
create index judge_scores_eval_run_idx on internal.judge_scores (eval_run_id);

create table internal.tool_calls (
    id              bigint primary key generated always as identity,
    organization_id uuid        not null references public.organizations (id) on delete cascade,
    conversation_id uuid        not null references public.conversations (id) on delete cascade,
    message_id      uuid        references public.messages (id) on delete cascade,
    tool_name       text        not null,
    input           jsonb       not null default '{}'::jsonb,
    output          jsonb,
    success         boolean     not null,
    error           text,
    latency_ms      integer,
    created_at      timestamptz not null default now()
);

create index tool_calls_conversation_idx on internal.tool_calls (conversation_id);

create table internal.llm_calls (
    id              bigint primary key generated always as identity,
    -- NULL em chamada de plataforma (sem org por trás).
    organization_id uuid        references public.organizations (id) on delete cascade,
    purpose         text        not null
                        check (purpose in ('agent_reply', 'judge_pre', 'judge_async',
                                           'prompt_generator', 'copy_variation', 'embedding')),
    conversation_id uuid        references public.conversations (id) on delete cascade,
    eval_run_id     uuid        references internal.eval_runs (id) on delete cascade,
    -- Rota E modelo gravados: a trilha de custo tem que dizer o que foi
    -- faturado de verdade (cascata D4: provider varia por org).
    provider        text        not null,
    model           text        not null,
    input_tokens    integer,
    output_tokens   integer,
    cost_usd        numeric(10, 6),
    latency_ms      integer,
    created_at      timestamptz not null default now()
);

create index llm_calls_conversation_idx on internal.llm_calls (conversation_id);
create index llm_calls_eval_run_idx on internal.llm_calls (eval_run_id);

-- ----------------------------------------------------------------------------
-- Privilégios: worker escreve a trilha; sender nada; Data API nada.
-- ----------------------------------------------------------------------------
grant select                 on internal.scenarios    to worker_role;
grant select, insert, update on internal.eval_runs    to worker_role;
grant select, insert         on internal.judge_scores to worker_role;
grant select, insert         on internal.tool_calls   to worker_role;
grant select, insert         on internal.llm_calls    to worker_role;

revoke all on all tables in schema internal from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS na mesma migration que cria as tabelas
-- ----------------------------------------------------------------------------
alter table internal.scenarios    enable row level security;
alter table internal.eval_runs    enable row level security;
alter table internal.judge_scores enable row level security;
alter table internal.tool_calls   enable row level security;
alter table internal.llm_calls    enable row level security;

-- Pack base (org NULL) é visível a qualquer worker escopado — é o pack da
-- plataforma; cenários da org só para ela.
create policy scenarios_worker_read on internal.scenarios
    for select to worker_role
    using (organization_id is null
           or organization_id = public.current_app_organization_id());

create policy eval_runs_worker_scoped on internal.eval_runs
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy judge_scores_worker_scoped on internal.judge_scores
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy tool_calls_worker_scoped on internal.tool_calls
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy llm_calls_worker_scoped on internal.llm_calls
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

-- ----------------------------------------------------------------------------
-- RAG do runtime lê ai_agent_chunks (a base que o lojista já alimenta pela
-- SourcesTab) — grant desta etapa; a query chega com o rewire do responder.
-- ----------------------------------------------------------------------------
grant select on public.ai_agent_chunks to worker_role;
grant select on public.ai_agents, public.ai_agent_versions to worker_role;
