-- ============================================================================
-- 20261016000013_ai_outcomes_and_events.sql
-- Plano de implementação IA (2026-10-15), M5 passo 27 — telemetria de negócio.
--
-- A aba Atividade do protótipo mostra resolvidas sem humano, transferências
-- e motivos, pedidos e receita atribuída, 1ª resposta, assuntos, incentivos.
-- Nada disso sai da trilha técnica (llm_calls/tool_calls/judge_scores) sem
-- uma camada de DESFECHO por conversa:
--
--   ai_conversation_outcomes — uma linha por conversa atendida por agente,
--     mantida pelo runtime a cada turno (passo 28) e pela atribuição de
--     pedido (abaixo);
--   ai_activity_events — o registro de atividade (venda, resolvida,
--     transferida, incentivo, bloqueada, lacuna) que a tela lista.
--
-- attribute_ai_conversation: um pedido pago do contato dentro da janela
-- credita a conversa mais recente que um agente atendeu (order_id, revenue)
-- e registra o evento "sale". Idempotente por (org, pedido).
--
-- Reversão: drop function public.attribute_ai_conversation(uuid, uuid, text, numeric, integer);
-- drop table public.ai_activity_events; drop table public.ai_conversation_outcomes;
-- ============================================================================

create table if not exists public.ai_conversation_outcomes (
    conversation_id        uuid primary key references public.conversations (id) on delete cascade,
    organization_id        uuid not null references public.organizations (id) on delete cascade,
    agent_id               uuid references public.ai_agents (id) on delete set null,
    entry_id               uuid,
    contact_id             uuid,
    started_at             timestamptz not null default now(),
    first_inbound_at       timestamptz,
    first_response_ms      integer,
    messages_sent          integer not null default 0,
    resolved_without_human boolean,
    transferred            boolean not null default false,
    handoff_reason         text,
    order_id               text,
    revenue                numeric(12, 2),
    topic                  text,
    incentives_offered     integer not null default 0,
    incentives_used        integer not null default 0,
    discount_total         numeric(12, 2) not null default 0,
    blocked_count          integer not null default 0,
    gap                    boolean not null default false,
    cost_usd               numeric(12, 6) not null default 0,
    cost_unknown           boolean not null default false,
    tokens                 integer not null default 0,
    closed_at              timestamptz,
    updated_at             timestamptz not null default now()
);

create index if not exists ai_conversation_outcomes_org_started
    on public.ai_conversation_outcomes (organization_id, started_at desc);
create index if not exists ai_conversation_outcomes_agent
    on public.ai_conversation_outcomes (organization_id, agent_id, started_at desc);

create table if not exists public.ai_activity_events (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    agent_id        uuid references public.ai_agents (id) on delete set null,
    conversation_id uuid references public.conversations (id) on delete set null,
    contact_id      uuid,
    kind            text not null check (kind in ('sale', 'solved', 'handoff', 'incentive', 'blocked', 'gap')),
    text            text,
    amount          numeric(12, 2),
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists ai_activity_events_org_created
    on public.ai_activity_events (organization_id, created_at desc);
create index if not exists ai_activity_events_org_kind
    on public.ai_activity_events (organization_id, kind, created_at desc);
create unique index if not exists ai_activity_events_sale_once
    on public.ai_activity_events (organization_id, (metadata->>'order_id'))
    where kind = 'sale';

alter table public.ai_conversation_outcomes enable row level security;
alter table public.ai_activity_events enable row level security;

create policy ai_conversation_outcomes_member_read on public.ai_conversation_outcomes
    for select to authenticated using (public.user_belongs_to_org(organization_id));
create policy ai_conversation_outcomes_worker_scoped on public.ai_conversation_outcomes
    for all to worker_role
    using (organization_id = public.current_app_organization_id())
    with check (organization_id = public.current_app_organization_id());

create policy ai_activity_events_member_read on public.ai_activity_events
    for select to authenticated using (public.user_belongs_to_org(organization_id));
create policy ai_activity_events_worker_insert on public.ai_activity_events
    for insert to worker_role
    with check (organization_id = public.current_app_organization_id());
create policy ai_activity_events_worker_read on public.ai_activity_events
    for select to worker_role
    using (organization_id = public.current_app_organization_id());

grant select                 on public.ai_conversation_outcomes to authenticated;
grant select, insert, update on public.ai_conversation_outcomes to worker_role;
grant all                    on public.ai_conversation_outcomes to service_role;
grant select                 on public.ai_activity_events to authenticated;
grant select, insert         on public.ai_activity_events to worker_role;
grant all                    on public.ai_activity_events to service_role;

create or replace function public.attribute_ai_conversation(
    p_organization_id uuid,
    p_contact_id      uuid,
    p_order_id        text,
    p_value           numeric,
    p_window_days     integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conversation uuid;
    v_agent        uuid;
begin
    if p_order_id is null or p_contact_id is null then
        return null;
    end if;

    -- Já creditado: idempotente (o mesmo pedido chega em create e em paid).
    select conversation_id into v_conversation
      from public.ai_conversation_outcomes
     where organization_id = p_organization_id and order_id = p_order_id
     limit 1;
    if found then
        return v_conversation;
    end if;

    select c.id, c.agent_id into v_conversation, v_agent
      from public.conversations c
     where c.organization_id = p_organization_id
       and c.contact_id = p_contact_id
       and c.agent_id is not null
       and coalesce(c.last_inbound_at, c.created_at) >= now() - make_interval(days => greatest(p_window_days, 1))
     order by coalesce(c.last_inbound_at, c.created_at) desc
     limit 1;
    if v_conversation is null then
        return null;
    end if;

    insert into public.ai_conversation_outcomes
        (conversation_id, organization_id, agent_id, contact_id, order_id, revenue)
    values (v_conversation, p_organization_id, v_agent, p_contact_id, p_order_id, p_value)
    on conflict (conversation_id) do update
       set order_id = excluded.order_id,
           revenue = excluded.revenue,
           updated_at = now()
     where public.ai_conversation_outcomes.order_id is null;

    insert into public.ai_activity_events
        (organization_id, agent_id, conversation_id, contact_id, kind, text, amount, metadata)
    values (p_organization_id, v_agent, v_conversation, p_contact_id, 'sale',
            'Pedido pago após conversa com o agente', p_value,
            jsonb_build_object('order_id', p_order_id))
    on conflict do nothing;

    return v_conversation;
end;
$$;

revoke execute on function public.attribute_ai_conversation(uuid, uuid, text, numeric, integer) from public, anon, authenticated;
grant execute on function public.attribute_ai_conversation(uuid, uuid, text, numeric, integer) to service_role;
